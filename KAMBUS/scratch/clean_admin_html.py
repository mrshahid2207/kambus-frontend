with open("app/src/main/assets/admin.html", "r", encoding="utf-8") as f:
    c = f.read()

replacements = [
    ('text-emerald-500', 'text-ok'),
    ('text-amber-500', 'text-warn'),
    ('text-indigo-500', 'text-brand'),
    ('text-rose-500', 'text-danger'),
    ('text-indigo-400', 'text-brand'),
    ('bg-emerald-500', 'bg-ok'),
    ('bg-emerald-100 text-emerald-800 rounded-full', 'bg-ok/10 text-ok rounded-full border border-ok/20'),
    ('text-indigo-700', 'text-ink-muted'),
    ('text-indigo-950', 'text-navy'),
    ('bg-purple-100 text-purple-800', 'bg-brand/10 text-brand'),
    ('bg-amber-100 text-amber-900', 'bg-warn/10 text-warn border border-warn/20'),
    ('text-emerald-800', 'text-ok'),
    ('text-indigo-800', 'text-ink'),
]

for old, new in replacements:
    c = c.replace(old, new)

with open("app/src/main/assets/admin.html", "w", encoding="utf-8") as f:
    f.write(c)

print("admin.html updated successfully")
