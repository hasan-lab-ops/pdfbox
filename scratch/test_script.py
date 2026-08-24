"""
Test script for verifying pdf2docx wrapper features
"""
import os
import sys
from pathlib import Path
from pdf2docx import Converter

def test_conversion(pdf_path: str, docx_path: str, pages=None):
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return False
    
    cv = Converter(pdf_path)
    try:
        total_pages = len(cv.pages)
        print(f"Total pages in {pdf_path}: {total_pages}")
        if pages:
            print(f"Converting pages: {pages}")
            cv.convert(docx_path, pages=pages)
        else:
            print("Converting all pages...")
            cv.convert(docx_path)
        print(f"Successfully created: {docx_path} ({os.path.getsize(docx_path)} bytes)")
        return True
    finally:
        cv.close()

if __name__ == "__main__":
    test_pdf = "test.pdf"
    if os.path.exists(test_pdf):
        test_conversion(test_pdf, "scratch/test_verify.docx", pages=[0, 1])
    else:
        print("test.pdf not found")
