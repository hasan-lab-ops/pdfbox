import requests, time

res = requests.post('http://127.0.0.1:8000/api/convert/pdf-to-word', files={'file': open('test.pdf', 'rb')}).json()
task_id = res['task_id']

t0 = time.time()
status = 'pending'
while status in ('pending', 'processing'):
    time.sleep(1)
    status = requests.get(f'http://127.0.0.1:8000/api/status/{task_id}').json().get('status')
    print(status, "elapsed:", time.time()-t0)
