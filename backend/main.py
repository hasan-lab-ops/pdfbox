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
                
        # Convert to DOCX using pdf2docx
        print(f"Converting {input_pdf_path} to DOCX...")
        cv = Converter(input_pdf_path)
        cv.convert(output_docx_path, start=0, end=None)
        cv.close()
        
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
