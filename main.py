from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import shutil
import os
from converter import pdf_to_docx

app = FastAPI()

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.post("/convert")
async def convert_pdf(file: UploadFile = File(...)):
    input_path = os.path.join(UPLOAD_DIR, file.filename)
    output_path = os.path.join(OUTPUT_DIR, file.filename.replace(".pdf", ".docx"))

    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    pdf_to_docx(input_path, output_path)

    return FileResponse(output_path, filename=os.path.basename(output_path))
