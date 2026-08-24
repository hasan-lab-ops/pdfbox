#!/usr/bin/env python3
"""
=============================================================================
PDFBox.online - High Performance PDF to DOCX Backend Service
=============================================================================
A clean-slate, production-grade FastAPI microservice utilizing `pdf2docx`
for converting PDF files into Microsoft Word (.docx) documents with strict
security, file validation, isolated UUID sandboxing, and instant cleanup.
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
from pdf2docx import Converter

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pdfbox-backend")

# ---------------------------------------------------------------------------
# Configuration Constants
# ---------------------------------------------------------------------------
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
PDF_MAGIC_BYTES = b"%PDF-"

# ---------------------------------------------------------------------------
# FastAPI App Initialization
# ---------------------------------------------------------------------------
app = FastAPI(
    title="PDFBox PDF-to-Word API",
    version="2.0.0",
    docs_url=None,  # Disabled in production for security
    redoc_url=None,
)

# Strict CORS settings allowing only pdfbox.online origins
ALLOWED_ORIGINS = [
    "https://pdfbox.online",
    "https://www.pdfbox.online",
    # Development fallbacks:
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
# Background File Cleanup Routine
# ---------------------------------------------------------------------------
def purge_directory(directory_path: str) -> None:
    """
    Completely deletes the temporary workspace directory and its contents
    immediately after the file has finished downloading to the client.
    """
    try:
        if os.path.exists(directory_path):
            shutil.rmtree(directory_path)
            logger.info(f"Purged workspace: {directory_path}")
    except Exception as exc:
        logger.error(f"Failed to purge directory {directory_path}: {exc}")

# ---------------------------------------------------------------------------
# PDF to DOCX Engine Execution
# ---------------------------------------------------------------------------
def execute_pdf_to_docx(pdf_input: Path, docx_output: Path) -> None:
    """
    Executes conversion using pdf2docx with optimized layout retention,
    table extraction (lattice & stream), and high-resolution images.
    """
    cv = Converter(str(pdf_input))
    try:
        cv.convert(
            docx_filename=str(docx_output),
            multi_processing=True,          # Parallel page processing for speed
            parse_lattice_table=True,       # Accurate bordered tables
            parse_stream_table=True,        # Borderless/whitespace tables
            clip_image_res_ratio=4.0,       # High-resolution image quality
            connected_border_tolerance=0.5,
            line_overlap_threshold=0.9,
        )
    finally:
        cv.close()

# ---------------------------------------------------------------------------
# Service Endpoints
# ---------------------------------------------------------------------------
@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """Health check endpoint for reverse proxy monitoring."""
    return {"status": "healthy", "service": "pdfbox-conversion-api"}


@app.post("/convert")
async def convert_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Converts an uploaded PDF to a Word (.docx) document.
    - Validates file extension and PDF magic bytes.
    - Enforces 50MB upload limits.
    - Processes inside an isolated UUID temporary directory.
    - Dispatches a background task to instantly purge all files post-download.
    """
    # 1. Validate File Extension
    original_filename = file.filename or "document.pdf"
    if not original_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only files with a .pdf extension are accepted.",
        )

    # 2. Allocate Isolated UUID Temporary Workspace
    task_uuid = str(uuid.uuid4())
    temp_dir = Path(mkdtemp(prefix=f"pdfbox_{task_uuid}_"))
    pdf_path = temp_dir / "input.pdf"
    docx_path = temp_dir / "output.docx"

    try:
        # 3. Stream Upload with Chunked Size & Header Verification
        file_size = 0
        header_checked = False

        with open(pdf_path, "wb") as buffer:
            while chunk := await file.read(1024 * 64):  # 64 KB chunks
                file_size += len(chunk)
                
                # Check maximum file size threshold
                if file_size > MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowable size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
                    )

                # Verify PDF magic bytes '%PDF-' on first chunk
                if not header_checked:
                    if not chunk.startswith(PDF_MAGIC_BYTES):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid or corrupt PDF file header.",
                        )
                    header_checked = True

                buffer.write(chunk)

        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded file is empty.",
            )

        logger.info(f"Processing '{original_filename}' ({file_size / 1024:.1f} KB) | Task ID: {task_uuid}")

        # 4. Perform Conversion
        try:
            execute_pdf_to_docx(pdf_path, docx_path)
        except Exception as conv_err:
            logger.error(f"Conversion engine failed for task {task_uuid}: {conv_err}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Failed to parse and convert PDF layout. Ensure the document is uncorrupted and not password-protected.",
            )

        if not docx_path.exists() or docx_path.stat().st_size == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Output Word document could not be generated.",
            )

        # 5. Format Output Download Filename
        output_download_name = Path(original_filename).stem + ".docx"

        # 6. Schedule Immediate Post-Response Cleanup
        background_tasks.add_task(purge_directory, str(temp_dir))

        # 7. Return Word File as Download Attachment
        return FileResponse(
            path=str(docx_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=output_download_name,
            headers={
                "Access-Control-Expose-Headers": "Content-Disposition",
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        )

    except HTTPException:
        # Immediate cleanup on error
        purge_directory(str(temp_dir))
        raise
    except Exception as unexpected_exc:
        purge_directory(str(temp_dir))
        logger.error(f"Unexpected server error in task {task_uuid}: {unexpected_exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected internal server error occurred while processing your document.",
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False, workers=4)
