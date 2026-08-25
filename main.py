#!/usr/bin/env python3
"""
============================================================================
PDFBox.online — Production-Grade PDF to Word (.docx) Microservice
================================================================
FastAPI + pdf2docx conversion engine.

Design goals (zero-crash hardening):
  * The heavy conversion NEVER runs on the async event loop (sync endpoint,
    executed in FastAPI's thread pool) so /health and other requests stay
    responsive during long conversions.
  * Strict per-request timeout -> clean 504 instead of a hung request.
  * Bounded concurrency -> clean 503 instead of memory exhaustion/OOM.
  * Isolated UUID temp workspaces, guaranteed cleanup on success AND error.
  * Validation: .pdf extension, PDF MIME types, %PDF- magic bytes, 20 MB cap.
  * Graceful HTTP errors for encrypted, empty, oversized and corrupted files.
  * CORS locked to the two production origins by default (override for local
    development via the ALLOWED_ORIGINS environment variable).

Run (development):
    python -m uvicorn main:app --host 127.0.0.1 --port 8000

Run (production): see deploy/pdfbox.service (systemd) and deploy/*.conf (nginx)
============================================================================
"""

import logging
import os
import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from pathlib import Path
from tempfile import mkdtemp

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pdf2docx import Converter

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pdfbox-pdf2word")

# ---------------------------------------------------------------------------
# Configuration (environment-overridable, safe production defaults)
# ---------------------------------------------------------------------------
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "20"))
MAX_FILE_SIZE_BYTES = MAX_UPLOAD_MB * 1024 * 1024
CHUNK_SIZE_BYTES = 64 * 1024  # streaming buffer for the upload
PDF_MAGIC_BYTES = b"%PDF-"
PDF_CONTENT_TYPES = {"application/pdf", "application/octet-stream", "application/x-pdf"}
CONVERSION_TIMEOUT_SECONDS = int(os.environ.get("CONVERSION_TIMEOUT_SECONDS", "120"))
MAX_CONCURRENT_CONVERSIONS = int(os.environ.get("MAX_CONCURRENT_CONVERSIONS", "2"))

# Strict by default: only the production origins. Local development overrides
# this via the ALLOWED_ORIGINS environment variable (see start_dev.bat).
DEFAULT_ALLOWED_ORIGINS = ["https://pdfbox.online", "https://www.pdfbox.online"]
_env_origins = os.environ.get("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _env_origins.split(",") if o.strip()] or DEFAULT_ALLOWED_ORIGINS


class PasswordProtectedPDFError(Exception):
    """Raised when the uploaded PDF requires a password to open."""


class EmptyPDFError(Exception):
    """Raised when the uploaded PDF contains no pages."""


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="PDFBox PDF-to-Word API",
    version="3.0.0",
    docs_url=None,  # disabled in production
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
    max_age=86400,
)

# Conversion pool: each conversion runs in its own thread (CPU/IO bound).
_conversion_pool = ThreadPoolExecutor(
    max_workers=MAX_CONCURRENT_CONVERSIONS, thread_name_prefix="pdf2docx"
)
# Admission control: reject (503) instead of queueing unbounded work.
_concurrency_slots = threading.BoundedSemaphore(MAX_CONCURRENT_CONVERSIONS)


# ---------------------------------------------------------------------------
# Core conversion engine
# ---------------------------------------------------------------------------
def run_pdf2docx_conversion(pdf_path: Path, docx_path: Path) -> None:
    """
    Convert one PDF to DOCX with pdf2docx.Converter.

    Runs OUTSIDE the event loop (called from a thread). Raises
    PasswordProtectedPDFError / EmptyPDFError for specific user-facing
    conditions; anything else propagates as a generic conversion failure.
    """
    converter = Converter(str(pdf_path))
    try:
        doc = converter.fitz_doc

        if doc.needs_pass:
            raise PasswordProtectedPDFError("Password required to open this PDF.")
        if doc.page_count == 0:
            raise EmptyPDFError("PDF contains no pages.")

        # Conservative, battle-tested settings (all values valid for the
        # installed pdf2docx). Table parsing on, no fork-based multi
        # processing inside a threaded server.
        converter.convert(
            docx_filename=str(docx_path),
            parse_lattice_table=True,
            parse_stream_table=True,
        )
    finally:
        # Always release the underlying PyMuPDF document handles.
        try:
            converter.close()
        except Exception as close_error:  # noqa: BLE001 - cleanup must never mask the real error
            logger.warning("Non-critical error while closing converter: %s", close_error)


def cleanup_temp_workspace(workspace_dir: str) -> None:
    """Remove a UUID temp workspace and everything inside it."""
    try:
        if workspace_dir and os.path.isdir(workspace_dir):
            shutil.rmtree(workspace_dir, ignore_errors=True)
            logger.info("Purged temporary workspace: %s", workspace_dir)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to purge workspace %s: %s", workspace_dir, exc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    """Liveness smoke endpoint (useful to verify the reverse proxy)."""
    return {
        "service": "pdfbox-pdf2word-api",
        "version": "3.0.0",
        "endpoints": ["GET /health", "POST /convert"],
        "max_upload_mb": MAX_UPLOAD_MB,
    }


@app.get("/health")
async def health():
    """Health check for reverse-proxy uptime probes and the frontend."""
    return {
        "status": "healthy",
        "service": "pdfbox-pdf2word-api",
        "version": "3.0.0",
        "max_upload_mb": MAX_UPLOAD_MB,
        "concurrent_slots": MAX_CONCURRENT_CONVERSIONS,
    }


@app.post("/convert")
@app.post("/convert/")
def convert_pdf_to_docx(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Convert an uploaded PDF to a .docx document and stream it back as an
    attachment.

    NOTE: this endpoint is intentionally a SYNC `def` so FastAPI runs the
    blocking pdf2docx work in its thread pool — the async event loop (and
    with it /health and every other request) stays fully responsive.

    Status codes:
        200 -> .docx file attachment
        400 -> not a PDF (extension / magic bytes / empty)
        413 -> file larger than the 20 MB limit
        415 -> non-PDF MIME type
        422 -> password-protected or corrupted/unparseable PDF
        500 -> output document missing after conversion
        503 -> too many conversions in progress, retry shortly
        504 -> conversion exceeded the time limit
    """
    # -- 1. Validate filename / extension -----------------------------------
    raw_filename = file.filename or "document.pdf"
    clean_filename = Path(raw_filename).name  # strip any directory components
    if not clean_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only files with a .pdf extension are accepted.",
        )

    # -- 2. Validate MIME type ----------------------------------------------
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type and content_type not in PDF_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported MIME type '{content_type}'. Please upload a PDF file.",
        )

    # -- 3. Allocate an isolated UUID workspace ------------------------------
    task_id = str(uuid.uuid4())
    temp_dir = Path(mkdtemp(prefix=f"pdfbox_{task_id[:12]}_"))
    input_pdf_path = temp_dir / "source.pdf"
    output_docx_path = temp_dir / "converted.docx"

    try:
        # -- 4. Stream the upload with size + magic-byte validation ----------
        # Sync endpoint: read from the underlying SpooledTemporaryFile handle
        # (UploadFile.read() is async and cannot be awaited here).
        upload_handle = file.file
        upload_handle.seek(0)
        bytes_received = 0
        magic_verified = False
        with open(input_pdf_path, "wb") as buffer:
            while chunk := upload_handle.read(CHUNK_SIZE_BYTES):
                bytes_received += len(chunk)
                if bytes_received > MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=413,  # Request Entity Too Large
                        detail=f"File exceeds the maximum allowed size of {MAX_UPLOAD_MB} MB.",
                    )
                if not magic_verified:
                    if not chunk.startswith(PDF_MAGIC_BYTES):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid or corrupt PDF header. The file is not a valid PDF.",
                        )
                    magic_verified = True
                buffer.write(chunk)

        if bytes_received == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded PDF is empty (0 bytes).",
            )

        # -- 5. Admit the job into the bounded concurrency pool --------------
        if not _concurrency_slots.acquire(blocking=False):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The conversion server is busy. Please try again in a few seconds.",
            )

        try:
            logger.info(
                "Converting '%s' (%.1f KB) | task %s",
                clean_filename, bytes_received / 1024, task_id,
            )
            future = _conversion_pool.submit(run_pdf2docx_conversion, input_pdf_path, output_docx_path)
            try:
                future.result(timeout=CONVERSION_TIMEOUT_SECONDS)
            except FutureTimeoutError:
                future.cancel()
                logger.error("Conversion timed out after %ss | task %s", CONVERSION_TIMEOUT_SECONDS, task_id)
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Conversion timed out. The PDF may be too large or too complex — please try a smaller file.",
                )
            except PasswordProtectedPDFError:
                logger.info("Rejected password-protected PDF | task %s", task_id)
                raise HTTPException(
                    status_code=422,  # Unprocessable Content (encrypted or corrupted PDF)
                    detail="This PDF is password-protected. Remove the password and try again.",
                )
            except EmptyPDFError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The PDF contains no pages.",
                )
            except HTTPException:
                raise
            except Exception as conv_error:  # noqa: BLE001
                logger.error("Conversion failed | task %s: %s", task_id, conv_error, exc_info=True)
                raise HTTPException(
                    status_code=422,  # Unprocessable Content (encrypted or corrupted PDF)
                    detail="Could not read this PDF. The file may be corrupted or contain unsupported content.",
                )
        finally:
            _concurrency_slots.release()

        # -- 6. Verify the output document -----------------------------------
        if not output_docx_path.exists() or output_docx_path.stat().st_size == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Word document creation failed unexpectedly. Please try again.",
            )

        # -- 7. Guarantee cleanup AFTER the response has been served ---------
        background_tasks.add_task(cleanup_temp_workspace, str(temp_dir))

        # -- 8. Stream the .docx back to the client ---------------------------
        return FileResponse(
            path=str(output_docx_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=Path(clean_filename).stem + ".docx",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
            },
        )

    except HTTPException:
        cleanup_temp_workspace(str(temp_dir))
        raise
    except Exception as error:  # noqa: BLE001
        cleanup_temp_workspace(str(temp_dir))
        logger.error("Unhandled error | task %s: %s", task_id, error, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal server error occurred while processing your document.",
        )


# ---------------------------------------------------------------------------
# Development entry point (production uses systemd — see deploy/pdfbox.service)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
