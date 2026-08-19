import os
import tempfile
import sys

# add current dir to path to import main
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
import main

temp_dir = tempfile.mkdtemp()
print(f"Temp dir: {temp_dir}")
main.convert_pdf_to_word_task("test-task", "test.pdf", "test_out.docx", temp_dir)
print("Done!")
