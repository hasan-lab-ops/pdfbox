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
        
        def is_arabic(text):
            return any('\u0600' <= c <= '\u06FF' for c in text)

        print(f"Converting {input_pdf_path} to DOCX using block extraction...")
        
        pdf = fitz.open(input_pdf_path)
        doc = docx.Document()
        
        for page in pdf:
            blocks = page.get_text("blocks")
            # Sort by Y position primarily, then X position
            blocks.sort(key=lambda b: (b[1], b[0]))
            
            for b in blocks:
                if b[6] != 0: # 0 means text block, 1 means image block
                    continue
                    
                text = b[4].strip()
                if not text:
                    continue
                    
                # Clean up PDF manual line breaks to allow Word to flow text naturally
                text = text.replace('\n', ' ')
                
                p = doc.add_paragraph()
                
                if is_arabic(text):
                    # Shape and Bidi the ENTIRE block (paragraph)
                    reshaped = arabic_reshaper.reshape(text)
                    bidi_text = get_display(reshaped)
                    
                    run = p.add_run(bidi_text)
                    run.font.name = 'Arial'
                    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                else:
                    run = p.add_run(text)
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
