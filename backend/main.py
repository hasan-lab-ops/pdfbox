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
        
        for page in pdf:
            words = page.get_text("words")
            
            # Group words by block and line to preserve exact line structure
            from itertools import groupby
            # Sort by block_no, then line_no so groupby works correctly
            words.sort(key=lambda w: (w[5], w[6]))
            
            for (block_no, line_no), line_words_iter in groupby(words, key=lambda w: (w[5], w[6])):
                line_words = list(line_words_iter)
                
                # Check if this line has Arabic
                line_has_arabic = any(has_arabic(w[4]) for w in line_words)
                
                # Step 2 - Rebuild Lines Correctly using Coordinates
                if line_has_arabic:
                    # Reverse X order for Arabic
                    line_words.sort(key=lambda w: w[0], reverse=True)
                else:
                    # Normal X order for English
                    line_words.sort(key=lambda w: w[0])
                    
                # Step 3 - Build Line Text Properly
                line_text = " ".join(w[4] for w in line_words)
                
                # Fix Encoding Issues and weird symbols
                line_text = line_text.replace('\uf0b7', '•')
                line_text = line_text.encode('utf-8', errors='ignore').decode('utf-8')
                
                # Apply Arabic Fix ONLY ONCE
                if line_has_arabic:
                    line_text = fix_arabic(line_text)
                
                # Step 4 - Keep Each Line Separate
                p = doc.add_paragraph()
                if line_has_arabic:
                    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
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
