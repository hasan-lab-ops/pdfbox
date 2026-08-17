import fitz

doc = fitz.open()
page = doc.new_page()

# Insert English text
page.insert_text((50, 50), "This is an English title.", fontsize=14)

# Create a dummy image (e.g., a simple colored rectangle)
import urllib.request
try:
    urllib.request.urlretrieve("https://via.placeholder.com/150", "dummy.jpg")
    page.insert_image(fitz.Rect(50, 70, 200, 220), filename="dummy.jpg")
except:
    pass

# Insert Arabic/English mixed text
arabic_text = "البرمجة ممتعة وسهلة التعلم Python"
# Note: PyMuPDF doesn't natively shape Arabic, so it might just appear visually reversed in the PDF, 
# but that's perfect for testing our extraction which expects logical or visual text.
page.insert_text((50, 250), arabic_text, fontsize=12, fontname="helv", encoding=0)

doc.save("test_arabic_images.pdf")
print("test_arabic_images.pdf created.")
