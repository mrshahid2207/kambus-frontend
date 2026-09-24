import re

with open("app/src/main/assets/student.js", "r", encoding="utf-8") as f:
    content = f.read()

# Replace emojis in console logs
content = content.replace("❌", "[ERROR]")
content = content.replace("⚠️", "[WARN]")
content = content.replace("──", "--")

# Replace non-token classes and rounded-xl
content = content.replace('text-purple-600', 'text-brand')
content = content.replace('text-indigo-600', 'text-brand')
content = content.replace('text-indigo-700', 'text-ink-muted')
content = content.replace(
    'py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs',
    'py-2 rounded bg-navy text-white font-bold text-xs'
)
content = content.replace(
    'py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs',
    'py-2 rounded bg-surface border border-line text-ink font-bold text-xs'
)

with open("app/src/main/assets/student.js", "w", encoding="utf-8") as f:
    f.write(content)

print("student.js updated successfully")
