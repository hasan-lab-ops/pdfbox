import pymupdf as fitz
import sys

def check_fonts(pdf_path):
    doc = fitz.open(pdf_path)
    for page_num in range(len(doc)):
        print(f"--- Page {page_num+1} ---")
        fonts = doc.get_page_fonts(page_num)
        for font in fonts:
            xref = font[0]
            name = font[3]
            font_dict = doc.xref_object(xref)
            has_unicode = "/ToUnicode" in font_dict
            
            # Simple heuristic: if it's a standard font (like Helvetica) without ToUnicode, it might be OK if it's English.
            # But we flag it anyway for our logic.
            status = "SAFE" if has_unicode else "UNSAFE (No ToUnicode)"
            print(f"Font: {name}, Xref: {xref} -> {status}")

if __name__ == "__main__":
    check_fonts("test_arabic_images.pdf")
