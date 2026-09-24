import re
import unicodedata

with open('app/src/main/assets/admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update <head> metadata
head_snippet = """    <title>KAMBUS</title>
    <meta name="theme-color" content="#173541">
    <meta name="description" content="KAMBUS, live bus tracking for KITSW.">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
    <link rel="icon" href="favicon.ico" sizes="48x48">
    <link rel="apple-touch-icon" href="apple-touch-icon.png">
    <link rel="manifest" href="site.webmanifest">
    <link rel="stylesheet" href="kambus.css">
    <link rel="stylesheet" href="vendor/leaflet/leaflet.css">
    <script src="vendor/leaflet/leaflet.js"></script>"""

content = re.sub(r'<title>.*?</script>', head_snippet, content, count=1, flags=re.DOTALL)

# 2. Clean up <style> tag
new_style = """    <style>
        html, body {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
            background-color: #FAFAF8;
        }

        *, *::before, *::after {
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
        }

        .admin-nav-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 9px 12px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            color: #52707A;
            background: transparent;
            transition: all 0.15s ease;
            text-align: left;
            border: 1px solid transparent;
        }

        .admin-nav-btn:hover {
            background: #E3E8E8;
            color: #173541;
        }

        .admin-nav-btn.active {
            background: #173541;
            color: #FFFFFF;
        }

        .admin-section {
            display: none;
        }

        .admin-section.active {
            display: block;
        }

        #adminSidebar {
            transition: transform 0.2s ease-in-out;
        }

        @media (max-width: 1023px) {
            #adminSidebar {
                position: fixed;
                top: 0;
                bottom: 0;
                left: 0;
                z-index: 100;
                width: 260px;
                transform: translateX(-100%);
            }
            #adminSidebar.open {
                transform: translateX(0);
            }
        }
    </style>"""

content = re.sub(r'<style>.*?</style>', new_style, content, count=1, flags=re.DOTALL)

# 3. Replace kamlogo.jpg with brand/mark-navy.svg
content = content.replace('kamlogo.jpg', 'brand/mark-navy.svg')

# 4. Strip emojis
emoji_patterns = [
    r'[\U00010000-\U0010ffff]',  # 4-byte astral symbols (most emojis)
    r'[\u2600-\u26FF]',          # misc symbols
    r'[\u2700-\u27BF]',          # dingbats
    r'[\u2300-\u23FF]',          # misc technical
    r'[\u2B50-\u2B55]',
    r'[\u25A0-\u25FF]',
    r'[\u200D\uFE0E\uFE0F]',
]
for ep in emoji_patterns:
    content = re.sub(ep, '', content)

# Specific emoji or unicode cleanup
unwanted_chars = ['🚨', '🚧', '📍', '⏳', '✓', '❌', '⚠️', '🚌', '🚗', '👥', '🏫', '🔧', '🚑', '💥', '🛡️', '✈️', '🏁', '📝', '🗺️', '🔍', '🔔', '👨', '🎯', '⚫', '🎓', '🛣️', '📋', '🟢', '📅', '📊', '✕']
for c in unwanted_chars:
    content = content.replace(c, '')

# 5. Replace corner radiuses with 4px (rounded)
content = re.sub(r'\brounded-(?:xl|2xl|3xl|lg)\b', 'rounded', content)

# 6. Remove excessive shadow utilities
content = re.sub(r'\bshadow-(?:2xl|xl|lg|md|sm|xs)\b', 'border border-line', content)

# 7. Restrict font weights to 400 and 600 only
content = re.sub(r'\bfont-(?:black|extrabold|bold)\b', 'font-semibold', content)
content = re.sub(r'\bfont-medium\b', 'font-normal', content)

# 8. Align colors with Palette C
color_map = [
    (r'\bbg-slate-50\b', 'bg-bg'),
    (r'\bbg-slate-100\b', 'bg-bg'),
    (r'\bbg-indigo-50\b', 'bg-bg'),
    (r'\bbg-white\b', 'bg-surface'),
    (r'\bborder-slate-200\b', 'border-line'),
    (r'\bborder-slate-300\b', 'border-line'),
    (r'\bborder-indigo-100\b', 'border-line'),
    (r'\bborder-indigo-200\b', 'border-line'),
    (r'\btext-slate-900\b', 'text-navy'),
    (r'\btext-slate-800\b', 'text-navy'),
    (r'\btext-indigo-900\b', 'text-navy'),
    (r'\btext-slate-700\b', 'text-navy'),
    (r'\btext-slate-600\b', 'text-ink-muted'),
    (r'\btext-slate-500\b', 'text-ink-muted'),
    (r'\btext-slate-400\b', 'text-ink-muted'),
    (r'\bbg-indigo-600\b', 'bg-navy'),
    (r'\bbg-indigo-700\b', 'bg-brand'),
    (r'\btext-indigo-600\b', 'text-navy'),
    (r'\bhover:bg-indigo-700\b', 'hover:bg-brand'),
    (r'\bhover:bg-indigo-500\b', 'hover:bg-brand'),
    (r'\bbg-emerald-600\b', 'bg-ok'),
    (r'\btext-emerald-700\b', 'text-ok'),
    (r'\btext-emerald-600\b', 'text-ok'),
    (r'\bbg-emerald-50\b', 'bg-ok/10'),
    (r'\bborder-emerald-200\b', 'border-ok/30'),
    (r'\bbg-amber-500\b', 'bg-warn'),
    (r'\bbg-amber-600\b', 'bg-warn'),
    (r'\btext-amber-700\b', 'text-warn'),
    (r'\btext-amber-600\b', 'text-warn'),
    (r'\bbg-amber-50\b', 'bg-warn/10'),
    (r'\bborder-amber-200\b', 'border-warn/30'),
    (r'\bbg-rose-600\b', 'bg-danger'),
    (r'\btext-rose-700\b', 'text-danger'),
    (r'\btext-rose-600\b', 'text-danger'),
    (r'\bbg-rose-50\b', 'bg-danger/10'),
    (r'\bborder-rose-200\b', 'border-danger/30'),
]
for pat, repl in color_map:
    content = re.sub(pat, repl, content)

# 9. Clean duplicate borders/classes
content = re.sub(r'border border-line border border-line', 'border border-line', content)

with open('app/src/main/assets/admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("admin.html successfully transformed!")
