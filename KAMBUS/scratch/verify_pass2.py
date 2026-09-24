import os
import re
import unicodedata

assets_dir = 'app/src/main/assets'
html_files = [f for f in os.listdir(assets_dir) if f.endswith('.html')]
js_files = [f for f in os.listdir(assets_dir) if f.endswith('.js')]
all_files = [os.path.join(assets_dir, f) for f in html_files + js_files]

print("=== 1. CHECKING FOR FONTAWESOME CLASSES ===")
fa_errors = 0
for path in all_files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    fa_matches = re.findall(r'fa-[a-z0-9-]+', content)
    if fa_matches:
        print(f"FAIL: {path} has {len(fa_matches)} fa-* matches: {set(fa_matches)}")
        fa_errors += len(fa_matches)
    else:
        print(f"PASS: 0 fa-* in {os.path.basename(path)}")

print(f"\nTotal FontAwesome errors: {fa_errors}")

print("\n=== 2. CHECKING FOR USER-FACING EMOJIS ===")
def is_emoji(c):
    return ord(c) > 0x1F000 or (unicodedata.category(c) in ('So', 'Sk') and ord(c) not in (0x24, 0x2b, 0x3c, 0x3d, 0x3e, 0x5e, 0x60, 0x7c, 0x7e))

emoji_errors = 0
for path in all_files:
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    file_emojis = []
    for idx, line in enumerate(lines, 1):
        stripped = line.strip()
        # ignore pure comments
        if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            continue
        found = [c for c in line if is_emoji(c)]
        if found:
            file_emojis.append((idx, "".join(set(found)), stripped))
    if file_emojis:
        print(f"FAIL: {os.path.basename(path)} has {len(file_emojis)} lines with emojis:")
        for idx, ems, text in file_emojis[:20]:
            safe_ems = ems.encode('ascii', 'backslashreplace').decode('ascii')
            print(f"   Line {idx}: {safe_ems} -> {text[:80].encode('ascii', 'backslashreplace').decode('ascii')}")
        emoji_errors += len(file_emojis)
    else:
        print(f"PASS: 0 emojis in {os.path.basename(path)}")

print(f"\nTotal Emoji errors: {emoji_errors}")

print("\n=== 3. CHECKING DISALLOWED PURPLE/AMBER/INDIGO/ROSE TAILWIND UTILITIES ===")
disallowed_patterns = [r'bg-indigo-\d+', r'bg-purple-\d+', r'bg-amber-\d+', r'bg-rose-\d+', r'bg-emerald-\d+',
                       r'text-indigo-\d+', r'text-purple-\d+', r'text-amber-\d+', r'text-rose-\d+', r'text-emerald-\d+']
disallowed_errors = 0
for path in all_files:
    if 'leaflet' in path: continue
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for dp in disallowed_patterns:
        matches = re.findall(dp, content)
        if matches:
            print(f"WARN: {os.path.basename(path)} contains {dp}: {set(matches)}")
            disallowed_errors += len(matches)

print(f"\nTotal non-token color class warnings: {disallowed_errors}")

print("\n=== 4. CHECKING FOR ROUNDED-XL / 2XL / 3XL ===")
rounded_errors = 0
for path in all_files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    matches = re.findall(r'rounded-(?:xl|2xl|3xl)', content)
    if matches:
        print(f"WARN: {os.path.basename(path)} contains: {set(matches)}")
        rounded_errors += len(matches)

print(f"\nTotal rounded-xl/2xl/3xl occurrences: {rounded_errors}")
