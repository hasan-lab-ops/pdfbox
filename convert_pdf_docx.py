#!/usr/bin/env python3
"""
=============================================================================
PDF to DOCX Converter (Production Ready)
=============================================================================
An optimized, robust Python script using `pdf2docx` to convert PDF documents
into Microsoft Word (.docx) files while preserving layout, fonts, text styling,
colors, images, vector shapes, and complex tables.

Features:
- High-fidelity layout and formatting retention (fonts, styles, colors, alignments)
- Accurate image and table extraction (lattice & stream/borderless tables)
- Flexible 1-based page range control (e.g. "1-5", "1,3,5-7", "2-", "-4", or all)
- Multiprocessing support for fast multi-page document conversions
- Encrypted/password-protected PDF support
- Comprehensive error handling and status logging
- Reusable OOP class, functional wrapper, and full CLI interface
=============================================================================
"""

import os
import sys
import time
import logging
import argparse
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Union, Dict, Any

from pdf2docx import Converter


# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
def setup_logger(verbose: bool = False) -> logging.Logger:
    """Configures and returns a styled console logger."""
    logger = logging.getLogger("PDF2DOCX")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    logger.propagate = False  # Avoid duplicate messages when root logger is active
    
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.DEBUG if verbose else logging.INFO)
        formatter = logging.Formatter(
            fmt="[%(asctime)s] [%(levelname)s] %(message)s",
            datefmt="%H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
    return logger

logger = setup_logger()


# ---------------------------------------------------------------------------
# Conversion Configuration Dataclass
# ---------------------------------------------------------------------------
@dataclass
class ConversionConfig:
    """
    Configuration parameters for layout retention, tables, images, and performance.
    """
    # Multiprocessing options
    multi_processing: bool = False
    cpu_count: int = 0  # 0 means auto-detect all available CPU cores
    
    # Table extraction options
    parse_lattice_table: bool = True     # Parse tables with explicit borders
    parse_stream_table: bool = True      # Parse tables without explicit borders
    extract_stream_table: bool = False   # Strict stream table extraction
    
    # Text and Layout fidelity options
    connected_border_tolerance: float = 0.5
    max_border_width: float = 6.0
    min_border_clearance: float = 2.0
    float_image_ignorable_gap: float = 5.0
    clip_image_res_ratio: float = 4.0    # Resolution multiplier for clipped images
    delete_end_line_hyphen: bool = False # Join hyphenated words across lines
    line_overlap_threshold: float = 0.9
    
    # OCR settings (0 = disabled, 1 = OCR if needed, 2 = force OCR)
    ocr: int = 0
    
    # Error handling
    ignore_page_error: bool = True
    debug: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Converts settings to a dictionary suitable for pdf2docx Converter."""
        return {
            "multi_processing": self.multi_processing,
            "cpu_count": self.cpu_count,
            "parse_lattice_table": self.parse_lattice_table,
            "parse_stream_table": self.parse_stream_table,
            "extract_stream_table": self.extract_stream_table,
            "connected_border_tolerance": self.connected_border_tolerance,
            "max_border_width": self.max_border_width,
            "min_border_clearance": self.min_border_clearance,
            "float_image_ignorable_gap": self.float_image_ignorable_gap,
            "clip_image_res_ratio": self.clip_image_res_ratio,
            "delete_end_line_hyphen": self.delete_end_line_hyphen,
            "line_overlap_threshold": self.line_overlap_threshold,
            "ocr": self.ocr,
            "ignore_page_error": self.ignore_page_error,
            "debug": self.debug,
        }


# ---------------------------------------------------------------------------
# Page Range Helper
# ---------------------------------------------------------------------------
def parse_page_range(range_str: Optional[str], total_pages: int) -> Optional[List[int]]:
    """
    Parses a human-friendly, 1-based page range string into a 0-based list of page indices.

    Examples:
        - "1-5"        -> [0, 1, 2, 3, 4]
        - "1,3,5"      -> [0, 2, 4]
        - "1-3, 5, 7"  -> [0, 1, 2, 4, 6]
        - "3-"         -> [2, 3, ..., total_pages - 1]
        - "-3"         -> [0, 1, 2]
        - "all" / None -> None (converts all pages)

    Args:
        range_str: Page range specification string.
        total_pages: Total number of pages in the PDF document.

    Returns:
        Sorted list of 0-based page index integers, or None if all pages should be converted.

    Raises:
        ValueError: If range string is invalid or pages are out of bounds.
    """
    if not range_str or range_str.strip().lower() in ("all", "*", ""):
        return None

    selected_pages = set()
    parts = [p.strip() for p in range_str.split(",") if p.strip()]

    for part in parts:
        if "-" in part:
            subparts = part.split("-")
            if len(subparts) != 2:
                raise ValueError(f"Invalid range segment '{part}' in '{range_str}'")
            
            start_str, end_str = subparts[0].strip(), subparts[1].strip()
            
            # "-N" means 1 to N
            start = 1 if start_str == "" else int(start_str)
            # "N-" means N to total_pages
            end = total_pages if end_str == "" else int(end_str)

            if start < 1 or end > total_pages or start > end:
                raise ValueError(
                    f"Page range '{part}' is out of bounds for document with {total_pages} pages (allowed: 1-{total_pages})"
                )
            for p in range(start, end + 1):
                selected_pages.add(p - 1)  # Convert to 0-based index
        else:
            try:
                page_num = int(part)
            except ValueError:
                raise ValueError(f"Invalid page number '{part}' in '{range_str}'")

            if page_num < 1 or page_num > total_pages:
                raise ValueError(
                    f"Page {page_num} is out of bounds for document with {total_pages} pages (allowed: 1-{total_pages})"
                )
            selected_pages.add(page_num - 1)

    if not selected_pages:
        return None

    return sorted(list(selected_pages))


# ---------------------------------------------------------------------------
# PDF to DOCX Converter Class
# ---------------------------------------------------------------------------
class PDFToWordConverter:
    """
    Production-grade wrapper around `pdf2docx.Converter` providing robust
    validation, layout optimization, page filtering, and lifecycle management.
    """

    def __init__(
        self,
        pdf_path: Union[str, Path],
        password: Optional[str] = None,
        config: Optional[ConversionConfig] = None,
    ):
        """
        Initializes the converter and validates input files.

        Args:
            pdf_path: Path to the input PDF file.
            password: Optional password for encrypted PDFs.
            config: Optional ConversionConfig instance with layout & performance tuning.
        """
        self.pdf_path = Path(pdf_path).resolve()
        self.password = password
        self.config = config or ConversionConfig()
        self._validate_input()
        self.converter: Optional[Converter] = None

    def _validate_input(self) -> None:
        """Validates that the source file exists and has a .pdf extension."""
        if not self.pdf_path.exists():
            raise FileNotFoundError(f"Input PDF file not found: {self.pdf_path}")
        if not self.pdf_path.is_file():
            raise ValueError(f"Path is not a valid file: {self.pdf_path}")
        if self.pdf_path.suffix.lower() != ".pdf":
            raise ValueError(f"Expected a .pdf file, but received: '{self.pdf_path.name}'")

    def get_page_count(self) -> int:
        """Returns the total number of pages in the PDF."""
        cv = Converter(str(self.pdf_path), password=self.password)
        try:
            return cv.fitz_doc.page_count
        finally:
            cv.close()

    def convert(
        self,
        output_path: Optional[Union[str, Path]] = None,
        pages: Optional[Union[str, List[int]]] = None,
        start_page: Optional[int] = None,
        end_page: Optional[int] = None,
        overwrite: bool = True,
    ) -> Path:
        """
        Converts the PDF to a Word document (.docx) with the configured settings.

        Args:
            output_path: Destination path for .docx file (defaults to input_name.docx).
            pages: 1-based page range string (e.g. "1-5", "1,3,7") or 0-based page list.
            start_page: Optional 1-based starting page (used if `pages` is not provided).
            end_page: Optional 1-based ending page (used if `pages` is not provided).
            overwrite: Whether to overwrite existing destination files.

        Returns:
            Path object pointing to the created .docx file.
        """
        # Determine output file path
        if output_path is None:
            output_docx = self.pdf_path.with_suffix(".docx")
        else:
            output_docx = Path(output_path).resolve()

        # Ensure parent output directory exists
        output_docx.parent.mkdir(parents=True, exist_ok=True)

        if output_docx.exists() and not overwrite:
            raise FileExistsError(
                f"Output file '{output_docx}' already exists and overwrite=False."
            )

        start_time = time.time()
        logger.info(f"Starting conversion: '{self.pdf_path.name}' -> '{output_docx.name}'")

        # Initialize the underlying pdf2docx Converter
        self.converter = Converter(str(self.pdf_path), password=self.password)

        try:
            total_pages = self.converter.fitz_doc.page_count
            logger.info(f"Document verified | Total Pages: {total_pages}")

            # Resolve page list
            target_pages: Optional[List[int]] = None

            if isinstance(pages, str):
                target_pages = parse_page_range(pages, total_pages)
            elif isinstance(pages, list):
                # Validate 0-based list
                target_pages = sorted(list(set(pages)))
                for p in target_pages:
                    if p < 0 or p >= total_pages:
                        raise ValueError(f"Page index {p} is out of bounds (0-{total_pages - 1})")
            elif start_page is not None or end_page is not None:
                s = start_page if start_page is not None else 1
                e = end_page if end_page is not None else total_pages
                range_str = f"{s}-{e}"
                target_pages = parse_page_range(range_str, total_pages)

            if target_pages:
                display_pages = [p + 1 for p in target_pages]
                logger.info(f"Target Pages ({len(target_pages)} selected): {display_pages}")
            else:
                logger.info(f"Converting all {total_pages} pages...")

            # Prepare settings kwargs
            settings = self.config.to_dict()

            # Execute conversion
            self.converter.convert(
                docx_filename=str(output_docx),
                pages=target_pages,
                **settings
            )

            elapsed = time.time() - start_time
            file_size_kb = output_docx.stat().st_size / 1024.0

            logger.info(
                f"Conversion completed successfully in {elapsed:.2f}s | "
                f"Output: '{output_docx}' ({file_size_kb:.1f} KB)"
            )
            return output_docx

        except Exception as e:
            logger.error(f"Conversion failed: {e}", exc_info=self.config.debug)
            raise
        finally:
            if self.converter:
                self.converter.close()
                self.converter = None


# ---------------------------------------------------------------------------
# High-Level Functional API
# ---------------------------------------------------------------------------
def convert_pdf_to_docx(
    input_pdf: Union[str, Path],
    output_docx: Optional[Union[str, Path]] = None,
    pages: Optional[str] = None,
    start_page: Optional[int] = None,
    end_page: Optional[int] = None,
    password: Optional[str] = None,
    multi_processing: bool = False,
    cpu_count: int = 0,
    ocr: int = 0,
    verbose: bool = False,
) -> Path:
    """
    Convenience function to convert a PDF file to DOCX with a single call.

    Args:
        input_pdf: Path to source PDF.
        output_docx: Optional path to output DOCX. Defaults to same name as PDF.
        pages: Optional 1-based page range string (e.g. "1-5", "1,3,7-10").
        start_page: Optional 1-based start page.
        end_page: Optional 1-based end page.
        password: Password for encrypted PDF.
        multi_processing: Enable multi-core parallel page processing.
        cpu_count: Number of CPU cores (0 = all available).
        ocr: OCR mode (0 = off, 1 = auto, 2 = force).
        verbose: Enable debug-level logs.

    Returns:
        Path to the generated .docx file.
    """
    config = ConversionConfig(
        multi_processing=multi_processing,
        cpu_count=cpu_count,
        ocr=ocr,
        debug=verbose
    )
    converter = PDFToWordConverter(pdf_path=input_pdf, password=password, config=config)
    return converter.convert(
        output_path=output_docx,
        pages=pages,
        start_page=start_page,
        end_page=end_page
    )


# ---------------------------------------------------------------------------
# Command-Line Interface (CLI)
# ---------------------------------------------------------------------------
def build_cli_parser() -> argparse.ArgumentParser:
    """Constructs the command-line argument parser."""
    parser = argparse.ArgumentParser(
        description="High-precision PDF to Word (.docx) converter powered by pdf2docx.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    parser.add_argument(
        "input",
        type=str,
        help="Path to the input PDF file to convert."
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        default=None,
        help="Path to the output .docx file. (Defaults to <input_name>.docx)"
    )
    parser.add_argument(
        "-p", "--pages",
        type=str,
        default=None,
        help="1-based page range to convert (e.g. '1-5', '1,3,5-7', '3-', '-4', or 'all')."
    )
    parser.add_argument(
        "-s", "--start",
        type=int,
        default=None,
        help="1-based start page (alternative to --pages)."
    )
    parser.add_argument(
        "-e", "--end",
        type=int,
        default=None,
        help="1-based end page (alternative to --pages)."
    )
    parser.add_argument(
        "--password",
        type=str,
        default=None,
        help="Password for encrypted PDF files."
    )
    parser.add_argument(
        "-mp", "--multi-processing",
        action="store_true",
        help="Enable multiprocessing for multi-page documents (faster on multi-core CPUs)."
    )
    parser.add_argument(
        "--cpus",
        type=int,
        default=0,
        help="Number of CPU cores to allocate when --multi-processing is enabled (0 = auto)."
    )
    parser.add_argument(
        "--ocr",
        type=int,
        choices=[0, 1, 2],
        default=0,
        help="OCR mode: 0 = disabled (default), 1 = OCR when needed, 2 = force OCR."
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose and debug logging."
    )
    return parser


def main():
    """Main CLI entry point."""
    parser = build_cli_parser()
    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    try:
        out_file = convert_pdf_to_docx(
            input_pdf=args.input,
            output_docx=args.output,
            pages=args.pages,
            start_page=args.start,
            end_page=args.end,
            password=args.password,
            multi_processing=args.multi_processing,
            cpu_count=args.cpus,
            ocr=args.ocr,
            verbose=args.verbose,
        )
        print(f"\n[SUCCESS] Word document generated at: {out_file}")
        sys.exit(0)
    except Exception as err:
        print(f"\n[ERROR] Conversion failed: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
