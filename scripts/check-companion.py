"""Exercise the actual loopback HTTP boundary; never invoke model inference."""
from pathlib import Path
import json
import re
import subprocess
import urllib.request
import urllib.error

root = Path(__file__).resolve().parent.parent
binary = root / 'companion' / 'target' / 'debug' / 'frame-companion'
process = subprocess.Popen([str(binary)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    token = None
    for _ in range(5):
        line = process.stdout.readline().strip()
        if re.fullmatch(r'[a-f0-9]{64}', line):
            token = line
            break
        if not line and process.poll() is not None:
            raise RuntimeError('Companion did not start; port 4319 may already be in use.')
    assert token, 'Companion did not issue a startup token'

    def request(path, origin, token_value=None, method='GET', body=None, extra=None):
        headers = {'Origin': origin}
        if token_value:
            headers['Authorization'] = 'Bearer ' + token_value
        if body is not None:
            headers['Content-Type'] = 'application/json'
        headers.update(extra or {})
        req = urllib.request.Request('http://127.0.0.1:4319' + path, headers=headers, method=method, data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=4) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as response:
            return response.code, response.headers, response.read()

    assert request('/health', 'https://unlisted.example', token)[0] == 403
    assert request('/health', 'http://localhost:5173', 'wrong-token')[0] == 401
    status, headers, body = request('/health', 'http://localhost:5173', token)
    assert status == 200 and json.loads(body)['authenticated'] is True
    assert headers['Access-Control-Allow-Origin'] == 'http://localhost:5173'
    status, headers, _ = request('/generate', 'http://localhost:5173', method='OPTIONS', extra={'Access-Control-Request-Method':'POST', 'Access-Control-Request-Headers':'authorization,content-type'})
    assert status == 204 and headers['Access-Control-Allow-Private-Network'] == 'true'
    assert request('/generate', 'http://localhost:5173', token, 'POST', {'provider':'unsupported','model':'','messages':[{'role':'user','content':'Do not run'}]})[0] == 400
    print('PASS: live loopback health, origin rejection, token rejection, CORS preflight, and provider allowlist. No inference called.')
finally:
    process.terminate()
    try:
        process.wait(timeout=4)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
