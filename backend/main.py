import os
import shutil
import tempfile
import io
import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.shared import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
import pymupdf as fitz
from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import pytesseract
import arabic_reshaper

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

def set_rtl_run(run):
    rPr = run._r.get_or_add_rPr()
    rtl = OxmlElement('w:rtl')
    rtl.set(qn('w:val'), '1')
    rPr.append(rtl)

def set_bidi_paragraph(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    bidi = OxmlElement('w:bidi')
    bidi.set(qn('w:val'), '1')
    pPr.append(bidi)

def get_unsafe_fonts(doc, page_num):
    unsafe = set()
    for f in doc.get_page_fonts(page_num):
        xref = f[0]
        basefont = f[3]
        if not basefont:
            continue
        
        # Clean subset prefixes (e.g., ABCDEF+FontName)
        clean_basefont = basefont.split('+')[-1] if '+' in basefont else basefont
        
        try:
            font_dict = doc.xref_object(xref)
            if "/ToUnicode" not in font_dict:
                unsafe.add(basefont)
                unsafe.add(clean_basefont)
        except Exception:
            pass
    return unsafe

def block_has_unsafe_font(block, unsafe_fonts):
    if block["type"] != 0:
        return False
    for line in block["lines"]:
        for span in line["spans"]:
            if span["font"] in unsafe_fonts:
                return True
    return False

def extract_images_from_block(doc, block, output_dir):
    """Save image block to disk and return path."""
    try:
        image_bytes = block["image"]
        ext = block["ext"]
        img_filename = f"img_{block['number']}.{ext}"
        img_path = os.path.join(output_dir, img_filename)
        with open(img_path, "wb") as f:
            f.write(image_bytes)
        return img_path
    except Exception as e:
        print(f"Failed to extract image: {e}")
        return None

def process_pdf(pdf_path: str, docx_path: str, temp_dir: str):
    doc = fitz.open(pdf_path)
    word_doc = docx.Document()
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        unsafe_fonts = get_unsafe_fonts(doc, page_num)
        
        blocks = page.get_text("dict")["blocks"]
        # Sort blocks logically: Top-to-bottom (Y), then Left-to-right (X)
        blocks.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))
        
        for block in blocks:
            # Handle Image Block
            if block["type"] == 1:
                img_path = extract_images_from_block(doc, block, temp_dir)
                if img_path:
                    word_doc.add_picture(img_path)
                continue
                
            # Handle Text Block
            if block["type"] == 0:
                is_unsafe = block_has_unsafe_font(block, unsafe_fonts)
                
                # --- FALLBACK PATH: OCR ---
                if is_unsafe:
                    print(f"Unsafe font detected on page {page_num+1}. OCRing block region...")
                    bbox = block["bbox"]
                    # Render high-res image of the block
                    pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=bbox)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    
                    try:
                        ocr_text = pytesseract.image_to_string(img, lang='ara+eng').strip()
                        if not ocr_text:
                            continue
                            
                        # Reconstruct OCR text as paragraphs
                        for line_text in ocr_text.split('\n'):
                            if not line_text.strip(): continue
                            
                            p = word_doc.add_paragraph()
                            
                            if has_arabic(line_text):
                                reshaped = arabic_reshaper.reshape(line_text)
                                run = p.add_run(reshaped)
                                set_rtl_run(run)
                                set_bidi_paragraph(p)
                                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                            else:
                                p.add_run(line_text)
                    except Exception as e:
                        print(f"OCR Failed for block: {e}. Degrading to image insertion.")
                        try:
                            # Save the image to disk temporarily and insert it
                            fallback_img_path = os.path.join(temp_dir, f"fallback_{page_num}_{block['number']}.png")
                            img.save(fallback_img_path)
                            word_doc.add_picture(fallback_img_path)
                        except Exception as img_e:
                            print(f"Failed to insert fallback image: {img_e}")
                    continue
                
                # --- RELIABLE PATH: Normal Extraction ---
                p = word_doc.add_paragraph()
                paragraph_has_arabic = False
                
                # We sort lines top-to-bottom
                lines = block["lines"]
                lines.sort(key=lambda l: l["bbox"][1])
                
                for line in lines:
                    # Sort spans horizontally (L-to-R). 
                    # If it's heavily RTL, Word will reorder it visually if we apply tags properly.
                    spans = line["spans"]
                    spans.sort(key=lambda s: s["bbox"][0])
                    
                    for span in spans:
                        text = span["text"].strip()
                        if not text:
                            continue
                            
                        is_arabic_span = has_arabic(text)
                        if is_arabic_span:
                            text = arabic_reshaper.reshape(text)
                            paragraph_has_arabic = True
                            
                        run = p.add_run(text + " ") # Add trailing space to prevent run merging issues
                        
                        # Apply font styles
                        font_name = span["font"]
                        if font_name and not font_name.startswith("CID"):
                            run.font.name = font_name
                        run.font.size = Pt(span["size"])
                        
                        # Apply OOXML tags for Arabic runs
                        if is_arabic_span:
                            set_rtl_run(run)
                            
                # Apply Paragraph-level RTL if any Arabic exists
                if paragraph_has_arabic:
                    set_bidi_paragraph(p)
                    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

        word_doc.add_page_break()
        
    word_doc.save(docx_path)
    doc.close()

@app.post("/api/convert-pdf")
async def convert_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    temp_dir = tempfile.mkdtemp()
    input_pdf_path = os.path.join(temp_dir, "input.pdf")
    output_docx_path = os.path.join(temp_dir, "output.docx")
    
    try:
        with open(input_pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print(f"Starting conversion of {file.filename}...")
        process_pdf(input_pdf_path, output_docx_path, temp_dir)
        print("Conversion complete.")
        
        background_tasks.add_task(cleanup_temp_dir, temp_dir)
        
        return FileResponse(
            output_docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=file.filename.replace(".pdf", ".docx")
        )
        
    except Exception as e:
        cleanup_temp_dir(temp_dir)
        print(f"Error during conversion: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
