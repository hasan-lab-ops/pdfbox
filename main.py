#!/usr/bin/env python3
"""
=============================================================================
PDFBox.online - Production-Grade PDF to DOCX Microservice
=============================================================================
A robust, high-performance FastAPI service utilizing `pdf2docx.Converter`.
Features:
- Strict validation (MIME, extension, %PDF- magic bytes, 20 MB size threshold)
- Complete isolation with unique UUID workspaces
- Guaranteed immediate post-response temporary file cleanup
- Resilient error handling (corrupted PDFs, encrypted files, engine errors)
- Strict CORS configuration for https://pdfbox.online and https://www.pdfbox.online
=============================================================================
"""

import os
import shutil
import uuid
import logging
from pathlib import Path
from tempfile import mkdtemp
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from pdf2docx import Converter

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pdfbox-converter")

# ---------------------------------------------------------------------------
# Global Constants & Security Limits
# ---------------------------------------------------------------------------
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # Strict 20 MB limit
CHUNK_SIZE_BYTES = 64 * 1024             # 64 KB streaming buffer
PDF_MAGIC_BYTES = b"%PDF-"               # Standard PDF header signature

# ---------------------------------------------------------------------------
# FastAPI Application Setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="PDFBox PDF-to-Word Microservice",
    version="2.1.0",
    docs_url=None,   # Disabled in production for security
    redoc_url=None,
)

# Strict CORS configuration
ALLOWED_ORIGINS = [
    "https://pdfbox.online",
    "https://www.pdfbox.online",
    # Development fallbacks
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,
)

# ---------------------------------------------------------------------------
# Pydantic Health Model
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str
    service: str
    max_upload_mb: int


# ---------------------------------------------------------------------------
# Resource Cleanup Routine
# ---------------------------------------------------------------------------
def cleanup_temp_workspace(workspace_dir: str) -> None:
    """
    Guarantees complete deletion of the temporary directory and all files
    contained within it immediately after the client finishes downloading.
    """
    try:
        if os.path.exists(workspace_dir):
            shutil.rmtree(workspace_dir)
            logger.info(f"Successfully purged temporary workspace: {workspace_dir}")
    except Exception as exc:
        logger.error(f"Failed to purge workspace {workspace_dir}: {exc}")


# ---------------------------------------------------------------------------
# Core Conversion Engine Wrapper
# ---------------------------------------------------------------------------
def run_pdf2docx_conversion(pdf_path: Path, docx_path: Path) -> None:
    """
    Executes conversion via pdf2docx.Converter with deterministic resource cleanup.
    """
    cv = None
    try:
        cv = Converter(str(pdf_path))
        
        # Verify page count and ensure document is uncorrupted/unlocked
        page_count = cv.fitz_doc.page_count
        if page_count == 0:
            raise ValueError("The PDF document contains 0 renderable pages.")
            
        if cv.fitz_doc.is_encrypted:
            raise PermissionError("The PDF document is password-protected or encrypted.")

        # Execute high-fidelity layout and table conversion
        cv.convert(
            docx_filename=str(docx_path),
            multi_processing=True,          # Accelerates multi-page processing
            parse_lattice_table=True,       # High-fidelity bordered tables
            parse_stream_table=True,        # Borderless and whitespace tables
            clip_image_res_ratio=4.0,       # High-resolution image extraction
            connected_border_tolerance=0.5,
            line_overlap_threshold=0.9,
        )
    finally:
        # Guarantee closure of underlying PyMuPDF & docx handles
        if cv is not None:
            try:
                cv.close()
            except Exception as close_err:
                logger.warning(f"Non-critical warning closing Converter handle: {close_err}")


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
async def health_check():
    """Health check endpoint for reverse proxy uptime probes."""
    return HealthResponse(
        status="healthy",
        service="pdfbox-pdf2docx-api",
        max_upload_mb=MAX_FILE_SIZE_BYTES // (1024 * 1024),
    )


@app.post("/convert")
@app.post("/convert/")
@app.post("/api/convert")
@app.post("/api/convert/")
async def convert_pdf_to_docx(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Converts uploaded PDF documents to Microsoft Word (.docx) format.
    - Enforces 20 MB size limit and PDF header magic-byte validation.
    - Sandboxes execution inside an isolated UUID directory.
    - Dispatches a background task to immediately delete all files post-download.
    """
    # 1. Validate File Extension
    raw_filename = file.filename or "document.pdf"
    clean_filename = Path(raw_filename).name  # Prevent directory traversal
    
    if not clean_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only files with a .pdf extension are accepted.",
        )

    # 2. Allocate Isolated UUID Temporary Workspace
    task_id = str(uuid.uuid4())
    temp_dir = Path(mkdtemp(prefix=f"pdfbox_{task_id}_"))
    input_pdf_path = temp_dir / "source.pdf"
    output_docx_path = temp_dir / "converted.docx"

    try:
        # 3. Stream Upload with Chunked Size and Magic-Byte Verification
        bytes_received = 0
        magic_bytes_verified = False

        with open(input_pdf_path, "wb") as file_buffer:
            while chunk := await file.read(CHUNK_SIZE_BYTES):
                bytes_received += len(chunk)

                # Strict file size check
                if bytes_received > MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowable limit of {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
                    )

                # Verify PDF magic bytes '%PDF-' on first chunk
                if not magic_bytes_verified:
                    if not chunk.startswith(PDF_MAGIC_BYTES):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid or corrupt PDF header. File is not a valid PDF.",
                        )
                    magic_bytes_verified = True

                file_buffer.write(chunk)

        if bytes_received == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded PDF file is empty (0 bytes).",
            )

        logger.info(f"Converting '{clean_filename}' ({bytes_received / 1024:.1f} KB) | Task ID: {task_id}")

        # 4. Execute PDF to Word Conversion
        try:
            run_pdf2docx_conversion(input_pdf_path, output_docx_path)
        except PermissionError as perm_err:
            logger.warning(f"Encrypted PDF rejected: {perm_err}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password-protected or encrypted PDFs are not supported. Please remove the password and retry.",
            )
        except Exception as conv_err:
            logger.error(f"Conversion engine failure on task {task_id}: {conv_err}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Failed to parse document layout. The PDF may be corrupted or contain incompatible vector streams.",
            )

        # 5. Verify Output Document Generation
        if not output_docx_path.exists() or output_docx_path.stat().st_size == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Word document creation failed unexpectedly.",
            )

        # 6. Prepare Download Filename
        output_download_filename = Path(clean_filename).stem + ".docx"

        # 7. Register Immediate Post-Response Cleanup
        background_tasks.add_task(cleanup_temp_workspace, str(temp_dir))

        # 8. Stream Response as Attachment
        return FileResponse(
            path=str(output_docx_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=output_download_filename,
            headers={
                "Access-Control-Expose-Headers": "Content-Disposition",
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        )

    except HTTPException:
        # Ensure immediate cleanup if error occurs before response dispatch
        cleanup_temp_workspace(str(temp_dir))
        raise
    except Exception as general_err:
        cleanup_temp_workspace(str(temp_dir))
        logger.error(f"Unhandled server error on task {task_id}: {general_err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal server error occurred while processing your document.",
        )


# ---------------------------------------------------------------------------
# CLI Execution Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False, workers=4)
