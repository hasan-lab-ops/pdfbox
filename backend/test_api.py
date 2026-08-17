import os
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_convert_pdf():
    pdf_path = "test_arabic_images.pdf"
    if not os.path.exists(pdf_path):
        print(f"Test file {pdf_path} not found.")
        return
        
    with open(pdf_path, "rb") as f:
        response = client.post(
            "/api/convert-pdf",
            files={"file": ("test_arabic_images.pdf", f, "application/pdf")},
            data={"quality": "balanced"}
        )
        
    if response.status_code == 200:
        with open("test_output.docx", "wb") as f:
            f.write(response.content)
        print("Test passed! Saved output to test_output.docx")
    else:
        print(f"Test failed: {response.status_code} - {response.text}")

if __name__ == "__main__":
    test_convert_pdf()
