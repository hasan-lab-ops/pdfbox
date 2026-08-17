import sys
sys.path.append('.')
import main, tempfile, uuid, os

task_id = str(uuid.uuid4())
temp_dir = tempfile.mkdtemp()
main.tasks[task_id] = {"status": "pending", "temp_dir": temp_dir}

print("Running convert_pdf_to_word_task...")
in_pdf = os.path.abspath('test.pdf')
out_docx = os.path.join(temp_dir, 'output.docx')
main.convert_pdf_to_word_task(task_id, in_pdf, out_docx, temp_dir)

print(main.tasks[task_id])
if os.path.exists(out_docx):
    print("Success! Output file created at:", out_docx)
else:
    print("Failed to create output file.")
