import urllib.request, json, time

print("Starting test...")
req = urllib.request.Request('http://127.0.0.1:8000/api/convert/pdf-to-word', method='POST')
# We need to send multipart/form-data. This is tedious in urllib.
# Let's just use the backend code directly instead of making an HTTP request!
import main, tempfile, uuid

task_id = str(uuid.uuid4())
temp_dir = tempfile.mkdtemp()
main.tasks[task_id] = {"status": "pending", "temp_dir": temp_dir}
main.convert_pdf_to_word_task(task_id, 'test.pdf', 'test_out.docx', temp_dir)
print('Success', main.tasks[task_id])
