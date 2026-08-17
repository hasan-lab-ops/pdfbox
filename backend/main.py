import os
import shutil
import tempfile
import io
import docx
import pymupdf as fitz
from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pdf2docx import Converter

app = FastAPI(title="PDF BOX Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def cleanup_temp_dir(temp_dir: str):
    try:
        shutil.rmtree(temp_dir)
    except Exception as e:
        print(f"Error cleaning up {temp_dir}: {e}")

def has_arabic(text: str) -> bool:
    return any('\u0600' <= c <= '\u06FF' for c in text)

def is_scanned_pdf(pdf_path: str) -> bool:
    """Check if the PDF lacks a text layer (likely scanned)."""
    try:
        doc = fitz.open(pdf_path)
        total_text = ""
        # Check up to first 3 pages to be quick
        for i in range(min(3, len(doc))):
            total_text += doc[i].get_text("text").strip()
        
        # If very little text is extracted, it's likely scanned
        return len(total_text) < 50
    except Exception as e:
        print(f"Error checking PDF type: {e}")
        return False

def fix_arabic_in_docx(docx_path: str):
    """Post-processor to fix Arabic RTL, shaping, and alignment in the DOCX."""
    import arabic_reshaper
    from bidi.algorithm import get_display
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.shared import OxmlElement
    from docx.oxml.ns import qn

    doc = docx.Document(docx_path)
    
    def set_rtl(paragraph):
        pPr = paragraph._p.get_or_add_pPr()
        bidi = OxmlElement('w:bidi')
        bidi.set(qn('w:val'), '1')
        pPr.append(bidi)
        
    def process_paragraphs(paragraphs):
        for p in paragraphs:
            if not p.text.strip():
                continue
                
            if has_arabic(p.text):
                # Save dominant font from the first run (or default)
                font_name = 'Arial'
                font_size = None
                is_bold = False
                
                if p.runs:
                    for run in p.runs:
                        if run.text.strip():
                            if run.font.name:
                                font_name = run.font.name
                            if run.font.size:
                                font_size = run.font.size
                            is_bold = run.font.bold
                            break
                            
                reshaped = arabic_reshaper.reshape(p.text)
                bidi_text = get_display(reshaped)
                
                # Rebuild paragraph with corrected text
                p.clear()
                new_run = p.add_run(bidi_text)
                new_run.font.name = font_name
                if font_size:
                    new_run.font.size = font_size
                new_run.bold = is_bold
                
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                set_rtl(p)

    process_paragraphs(doc.paragraphs)
    
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                process_paragraphs(cell.paragraphs)

    doc.save(docx_path)

@app.post("/api/convert-pdf")
async def convert_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...), quality: str = Form("balanced")):
    temp_dir = tempfile.mkdtemp()
    input_pdf_path = os.path.join(temp_dir, "input.pdf")
    output_docx_path = os.path.join(temp_dir, "output.docx")
    
    try:
        with open(input_pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        needs_ocr = quality == "high" or is_scanned_pdf(input_pdf_path)
        
        if needs_ocr:
            try:
                from pdf2image import convert_from_path
                import pytesseract
                import PyPDF2
                
                print("Running OCR on PDF...")
                images = convert_from_path(input_pdf_path)
                ocr_pdf_path = os.path.join(temp_dir, "ocr_input.pdf")
                
                pdf_writer = PyPDF2.PdfWriter()
                for img in images:
                    pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, extension='pdf', lang='ara+eng')
                    pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
                    pdf_writer.add_page(pdf_reader.pages[0])
                
                with open(ocr_pdf_path, "wb") as f:
                    pdf_writer.write(f)
                    
                input_pdf_path = ocr_pdf_path
                print("OCR Complete.")
            except Exception as e:
                print(f"OCR Pipeline failed: {e}. Falling back to standard conversion.")
                
        # --- CONVERT TO DOCX WITH LAYOUT PRESERVATION ---
        print(f"Converting {input_pdf_path} to DOCX using pdf2docx...")
        try:
            cv = Converter(input_pdf_path)
            cv.convert(output_docx_path)
            cv.close()
        except Exception as e:
            print(f"pdf2docx failed: {e}")
            raise Exception("Failed to convert PDF layout to DOCX.")
            
        # --- FIX ARABIC SHAPING AND RTL ---
        print("Applying Arabic shaping and RTL fixes...")
        try:
            fix_arabic_in_docx(output_docx_path)
        except Exception as e:
            print(f"Arabic post-processing failed: {e}")
            
        print("Conversion complete.")
        
        background_tasks.add_task(cleanup_temp_dir, temp_dir)
        
        return FileResponse(
            output_docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=file.filename.replace(".pdf", ".docx")
        )
        
    except Exception as e:
        cleanup_temp_dir(temp_dir)
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
