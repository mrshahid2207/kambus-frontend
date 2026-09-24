import os
import re
import unicodedata

assets_dir = 'app/src/main/assets'
html_files = [f for f in os.listdir(assets_dir) if f.endswith('.html')]

print("=== 1. CHECKING RUNTIME CDNs & EXTERNAL URLS IN HTML FILES ===")
cdn_patterns = [r'https?://cdnjs\.', r'https?://cdn\.', r'https?://fonts\.googleapis\.com', r'https?://fonts\.gstatic\.com', r'https?://unpkg\.com', r'https?://api\.qrserver\.com', r'https?://ka-f\.fontawesome\.com']
for hf in html_files:
    path = os.path.join(assets_dir, hf)
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    for cp in cdn_patterns:
        matches = re.findall(cp, text)
        if matches:
            print(f"FAIL: Found CDN match {cp} in {hf}")
print("Runtime CDN check finished.")

print("\n=== 2. CHECKING FOR EMOJIS IN HTML FILES ===")
def find_emojis(text):
    return [c for c in text if ord(c) > 0x1F000 or (unicodedata.category(c) in ('So', 'Sk') and ord(c) not in (0x24, 0x2b, 0x3c, 0x3d, 0x3e, 0x5e, 0x60, 0x7c, 0x7e))]

for hf in html_files:
    path = os.path.join(assets_dir, hf)
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    emojis = find_emojis(text)
    if emojis:
        print(f"FAIL: Found emojis in {hf}: {[hex(ord(c)) for c in set(emojis)]}")
    else:
        print(f"PASS: 0 emojis in {hf}")

print("\n=== 3. CHECKING FOR OLD BRAND FILES & OLD RES ===")
old_files = ['kamlogo.jpg', 'kambus_k.svg', 'kambus_k_white.svg', 'kambus_logo.svg']
for of in old_files:
    p = os.path.join(assets_dir, of)
    if os.path.exists(p):
        print(f"FAIL: {of} still exists in assets!")
    else:
        print(f"PASS: {of} removed.")

if os.path.exists('ziyad'):
    print("FAIL: ziyad folder still exists!")
else:
    print("PASS: ziyad folder completely removed.")

print("\n=== 4. CHECKING GRADLE BUILD RES FOR OLD WEBP LAUNCHER ===")
res_dir = 'app/src/main/res'
for root, dirs, files in os.walk(res_dir):
    for f in files:
        if 'ic_launcher' in f and f.endswith('.webp'):
            print(f"FAIL: Found webp launcher file: {os.path.join(root, f)}")
print("Res launcher check finished.")

print("\n=== 5. CHECKING FOR CONSOLE.LOG IN HTML FILES ===")
for hf in html_files:
    path = os.path.join(assets_dir, hf)
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    clogs = re.findall(r'console\.log\(', text)
    if clogs:
        print(f"FAIL: Found {len(clogs)} console.log in {hf}")
    else:
        print(f"PASS: 0 console.log in {hf}")
