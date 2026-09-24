import re
import unicodedata

def is_emoji(c):
    return ord(c) > 0x1F000 or (unicodedata.category(c) in ('So', 'Sk') and ord(c) not in (0x24, 0x2b, 0x3c, 0x3d, 0x3e, 0x5e, 0x60, 0x7c, 0x7e))

files = [
    'app/src/main/assets/admin.html',
    'app/src/main/assets/admin.js',
    'app/src/main/assets/student.html',
    'app/src/main/assets/student.js',
    'app/src/main/assets/driver.html',
    'app/src/main/assets/driver.js',
    'app/src/main/assets/index.html'
]

for fn in files:
    with open(fn, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    emojis_found = []
    for line_idx, line in enumerate(lines, 1):
        found = [c for c in line if is_emoji(c)]
        if found:
            # hex codepoints
            cps = " ".join([f"U+{ord(c):04X}" for c in set(found)])
            safe_text = line.strip().encode('ascii', 'backslashreplace').decode('ascii')
            emojis_found.append((line_idx, cps, safe_text))
    print(f"\n{fn}: {len(emojis_found)} lines with emojis")
    for lno, cps, text in emojis_found:
        print(f"  Line {lno} [{cps}]: {text[:120]}")
