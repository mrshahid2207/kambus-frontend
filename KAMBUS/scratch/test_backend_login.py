import urllib.request
import urllib.error
import json

req = urllib.request.Request(
    'https://kambus-backend.onrender.com/auth/login',
    data=b'{"identifier":"test","password":"test","role":"student"}',
    headers={
        'Content-Type': 'application/json',
        'Origin': 'https://appassets.androidplatform.net'
    },
    method='POST'
)
try:
    with urllib.request.urlopen(req) as resp:
        print('Status:', resp.status)
        print('Headers:', dict(resp.headers))
        print('Body:', resp.read().decode())
except urllib.error.HTTPError as e:
    print('HTTPError Status:', e.code)
    print('Headers:', dict(e.headers))
    print('Body:', e.read().decode())
except Exception as ex:
    print('Error:', ex)
