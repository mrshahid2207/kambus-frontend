import urllib.request
import urllib.error

req = urllib.request.Request(
    'https://kambus-backend.onrender.com/auth/login',
    headers={
        'Origin': 'https://appassets.androidplatform.net',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
    },
    method='OPTIONS'
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
