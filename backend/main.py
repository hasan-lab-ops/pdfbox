import os
import shutil
import tempfile
import io
from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pdf2docx import Converter

app = FastAPI(title="PDF BOX Backend API")

# Allow CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def cleanup_temp_dir(temp_dir: str):
    """Remove the temporary directory after sending the response."""
    try:
        shutil.rmtree(temp_dir)
    except Exception as e:
        print(f"Error cleaning up {temp_dir}: {e}")

@app.post("/api/convert-pdf")
async def convert_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...), quality: str = Form("balanced")):
    temp_dir = tempfile.mkdtemp()
    input_pdf_path = os.path.join(temp_dir, "input.pdf")
    output_docx_path = os.path.join(temp_dir, "output.docx")
    
    try:
        with open(input_pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # If High Accuracy is chosen, process with OCR first
        if quality == "high":
            try:
                from pdf2image import convert_from_path
                import pytesseract
                import PyPDF2
                
                print("Running OCR on PDF...")
                images = convert_from_path(input_pdf_path)
                ocr_pdf_path = os.path.join(temp_dir, "ocr_input.pdf")
                
                pdf_writer = PyPDF2.PdfWriter()
                for img in images:
                    # Output a searchable PDF page
                    pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, extension='pdf', lang='ara+eng')
                    pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
                    pdf_writer.add_page(pdf_reader.pages[0])
                
                with open(ocr_pdf_path, "wb") as f:
                    pdf_writer.write(f)
                    
                input_pdf_path = ocr_pdf_path
                print("OCR Complete. Proceeding to DOCX conversion.")
            except Exception as e:
                print(f"OCR Pipeline failed: {e}. Falling back to standard conversion.")
                
        # --- CONVERT TO DOCX ---
        import docx
        import pymupdf as fitz
        import arabic_reshaper
        from bidi.algorithm import get_display
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        
        def has_arabic(text):
            return any('\u0600' <= c <= '\u06FF' for c in text)
            
        def fix_arabic(text):
            reshaped = arabic_reshaper.reshape(text)
            return get_display(reshaped)

        print(f"Converting {input_pdf_path} to DOCX using block extraction...")
        
        pdf = fitz.open(input_pdf_path)
        doc = docx.Document()
        
        import io
        from docx.oxml.shared import OxmlElement
        from docx.oxml.ns import qn
        
        def set_rtl(paragraph):
            pPr = paragraph._p.get_or_add_pPr()
            bidi = OxmlElement('w:bidi')
            bidi.set(qn('w:val'), '1')
            pPr.append(bidi)
            
        for page in pdf:
            # get_text("dict") extracts both text and images with coordinates
            blocks = page.get_text("dict")["blocks"]
            
            # Sort blocks by Y position to preserve document flow
            blocks.sort(key=lambda b: (b['bbox'][1], b['bbox'][0]))
            
            for block in blocks:
                # IMAGE BLOCK
                if block['type'] == 1:
                    try:
                        image_bytes = block['image']
                        image_stream = io.BytesIO(image_bytes)
                        doc.add_picture(image_stream)
                    except Exception as e:
                        print(f"Skipped image: {e}")
                    continue
                    
                # TEXT BLOCK
                if block['type'] == 0:
                    for line in block['lines']:
                        spans = line['spans']
                        
                        # Check if the line has Arabic to determine X-sort direction
                        line_has_arabic = any(has_arabic(span['text']) for span in spans)
                        
                        # Rebuild Line Correctly using Coordinates (X-axis)
                        if line_has_arabic:
                            spans.sort(key=lambda s: s['bbox'][0], reverse=True)
                        else:
                            spans.sort(key=lambda s: s['bbox'][0])
                        
                        line_text = " ".join(span['text'].strip() for span in spans if span['text'].strip())
                        if not line_text:
                            continue
                            
                        # Fix Encodings & Symbols
                        line_text = line_text.replace('\uf0b7', '•')
                        line_text = line_text.encode('utf-8', errors='ignore').decode('utf-8')
                        
                        p = doc.add_paragraph()
                        
                        if line_has_arabic:
                            line_text = fix_arabic(line_text)
                            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                            set_rtl(p) # <--- CRITICAL OOXML INJECTION FOR WORD
                        else:
                            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                        
                        run = p.add_run(line_text)
                        run.font.name = 'Arial'
                        
            # Add page break after each page (except maybe the last)
            doc.add_page_break()
            
        doc.save(output_docx_path)
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
