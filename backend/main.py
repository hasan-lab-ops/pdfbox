import os
import shutil
import tempfile
import uuid
from typing import Dict, Optional
from fastapi import FastAPI, File, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pymupdf as fitz
import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.shared import OxmlElement
from docx.oxml.ns import qn

app = FastAPI(title="PDF BOX Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory task queue
tasks: Dict[str, dict] = {}

def cleanup_temp_dir(temp_dir: str):
    try:
        shutil.rmtree(temp_dir)
    except Exception as e:
        print(f"Error cleaning up {temp_dir}: {e}")

def has_arabic(text: str) -> bool:
    return any('\u0600' <= c <= '\u06FF' for c in text)

def set_rtl_run(run):
    rPr = run._r.get_or_add_rPr()
    rtl = OxmlElement('w:rtl')
    rtl.set(qn('w:val'), '1')
    rPr.append(rtl)

def convert_pdf_to_word_task(task_id: str, input_pdf_path: str, output_docx_path: str, temp_dir: str):
    tasks[task_id]["status"] = "processing"
    
    try:
        doc = fitz.open(input_pdf_path)
        word_doc = docx.Document()
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            blocks = page.get_text("dict")["blocks"]
            blocks.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))
            
            for block in blocks:
                if block["type"] == 0:
                    lines = block["lines"]
                    lines.sort(key=lambda l: l["bbox"][1])
                    
                    for line in lines:
                        # Extract logical Unicode directly
                        words = []
                        for span in line["spans"]:
                            text = span["text"].strip()
                            if text:
                                words.append(text)
                                
                        if not words:
                            continue
                            
                        # Join words cleanly. Logical Unicode requires NO reshaping for Office!
                        line_text = " ".join(words)
                        is_arabic_line = has_arabic(line_text)
                        
                        p = word_doc.add_paragraph()
                        if is_arabic_line:
                            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                        else:
                            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            
                        run = p.add_run(line_text)
                        
                        # Apply RTL XML flag natively
                        if is_arabic_line:
                            set_rtl_run(run)
                            
                        # Embed custom font for safety
                        run.font.name = "Arial"
                        
            word_doc.add_page_break()
            
        word_doc.save(output_docx_path)
        doc.close()
        
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["download_url"] = f"/api/download/{task_id}"
        
    except Exception as e:
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
        cleanup_temp_dir(temp_dir)

@app.post("/api/convert/pdf-to-word")
async def start_pdf_to_word(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    task_id = str(uuid.uuid4())
    temp_dir = tempfile.mkdtemp()
    input_pdf_path = os.path.join(temp_dir, "input.pdf")
    output_docx_path = os.path.join(temp_dir, "output.docx")
    
    with open(input_pdf_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    tasks[task_id] = {
        "status": "pending",
        "temp_dir": temp_dir,
        "output_path": output_docx_path,
        "filename": file.filename.replace(".pdf", ".docx")
    }
    
    background_tasks.add_task(convert_pdf_to_word_task, task_id, input_pdf_path, output_docx_path, temp_dir)
    return {"task_id": task_id}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in tasks:
        return JSONResponse(status_code=404, content={"error": "Task not found"})
    return tasks[task_id]

@app.get("/api/download/{task_id}")
async def download_file(background_tasks: BackgroundTasks, task_id: str):
    if task_id not in tasks or tasks[task_id]["status"] != "completed":
        return JSONResponse(status_code=404, content={"error": "File not ready or task not found"})
        
    task_info = tasks[task_id]
    background_tasks.add_task(cleanup_temp_dir, task_info["temp_dir"])
    # Delete from dict to prevent memory leak
    del tasks[task_id]
    
    return FileResponse(
        task_info["output_path"],
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=task_info["filename"]
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
