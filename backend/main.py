import os
import io
import base64
import tempfile
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, Form, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pdf2docx import Converter
import pytesseract
from pdf2image import convert_from_path
import docx

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def has_text(pdf_path: str) -> bool:
    try:
        doc = fitz.open(pdf_path)
        for page in doc:
            if page.get_text().strip():
                return True
        return False
    except Exception as e:
        print(f"Error checking text in PDF: {e}")
        return False

def ocr_pdf_to_docx(pdf_path: str, docx_path: str, lang='ara+eng'):
    # Convert PDF to images
    images = convert_from_path(pdf_path, dpi=300)
    
    # Create a new Word document
    doc = docx.Document()
    
    for i, image in enumerate(images):
        # Extract text using Tesseract
        text = pytesseract.image_to_string(image, lang=lang)
        
        # Add to docx
        doc.add_paragraph(text)
        if i < len(images) - 1:
            doc.add_page_break()
            
    doc.save(docx_path)

@app.post("/api/convert/pdf-to-word")
async def convert_pdf_to_word(
    file: UploadFile = File(...),
    quality: str = Form("balanced")
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_pdf:
        content = await file.read()
        tmp_pdf.write(content)
        tmp_pdf_path = tmp_pdf.name
        
    tmp_docx_path = tmp_pdf_path + ".docx"
    
    try:
        is_text_pdf = has_text(tmp_pdf_path)
        
        # Decide conversion method based on quality mode and text presence
        # quality modes: 'fast', 'balanced', 'high'
        
        if quality == 'high' or not is_text_pdf:
            # Force OCR or OCR fallback
            # 'ara+eng' to support Arabic and English
            try:
                ocr_pdf_to_docx(tmp_pdf_path, tmp_docx_path, lang='ara+eng')
            except Exception as e:
                print(f"OCR failed, falling back to basic conversion: {e}")
                cv = Converter(tmp_pdf_path)
                cv.convert(tmp_docx_path)
                cv.close()
        else:
            # 'fast' or 'balanced' on a text PDF
            cv = Converter(tmp_pdf_path)
            cv.convert(tmp_docx_path)
            cv.close()

        # Read the resulting docx
        with open(tmp_docx_path, "rb") as f:
            docx_bytes = f.read()
            
        # Extract preview text
        preview_text = ""
        try:
            doc = docx.Document(tmp_docx_path)
            for para in doc.paragraphs:
                if para.text.strip():
                    preview_text += para.text + "\n"
                if len(preview_text) > 500:
                    break
        except:
            preview_text = "Preview not available."
                
        preview_text = preview_text[:500] + ("..." if len(preview_text) >= 500 else "")

        # Return as JSON
        return JSONResponse({
            "filename": file.filename.replace(".pdf", ".docx"),
            "docx_base64": base64.b64encode(docx_bytes).decode('utf-8'),
            "preview_text": preview_text
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup
        if os.path.exists(tmp_pdf_path):
            os.remove(tmp_pdf_path)
        if os.path.exists(tmp_docx_path):
            os.remove(tmp_docx_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
