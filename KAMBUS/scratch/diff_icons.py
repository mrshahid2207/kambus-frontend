import re

with open("app/src/main/assets/icons.svg", "r", encoding="utf-8") as f:
    svg = f.read()

existing_symbols = set(re.findall(r'id="(icon-[^"]+)"', svg))
print(f"Existing symbols ({len(existing_symbols)}):")
for s in sorted(existing_symbols):
    print(" ", s)

def get_fa_icons(filename):
    with open(filename, "r", encoding="utf-8") as f:
        content = f.read()
    classes = re.findall(r'fa-[a-z0-9-]+', content)
    return [c for c in classes if c not in ('fa-solid', 'fa-regular', 'fa-spin', 'fa-2x', 'fa-sm', 'fa-lg', 'fa-fw', 'fa-fade')]

files = [
    'app/src/main/assets/admin.html',
    'app/src/main/assets/admin.js',
    'app/src/main/assets/student.js',
    'app/src/main/assets/driver.js'
]

fa_map = {
    'fa-bars': 'icon-bars',
    'fa-bell': 'icon-bell',
    'fa-bullhorn': 'icon-bullhorn',
    'fa-bus': 'icon-bus',
    'fa-bus-slash': 'icon-bus-slash',
    'fa-check': 'icon-check',
    'fa-circle-check': 'icon-check',
    'fa-circle-notch': 'icon-spinner',
    'fa-forward-step': 'icon-forward-step',
    'fa-lock': 'icon-lock',
    'fa-magnifying-glass': 'icon-search',
    'fa-map-pin': 'icon-map-pin',
    'fa-location-dot': 'icon-map-pin',
    'fa-map-location-dot': 'icon-route',
    'fa-pen-to-square': 'icon-pen',
    'fa-play': 'icon-play',
    'fa-plus': 'icon-plus',
    'fa-right-from-bracket': 'icon-logout',
    'fa-right-to-bracket': 'icon-logout', # or icon-arrow-right
    'fa-rotate': 'icon-refresh',
    'fa-route': 'icon-route',
    'fa-trash-can': 'icon-trash',
    'fa-triangle-exclamation': 'icon-alert',
    'fa-xmark': 'icon-xmark',
}

all_fa = set()
for f in files:
    icons = get_fa_icons(f)
    all_fa.update(icons)

print("\n--- FA icons and their mapping ---")
missing_symbols = set()
for icon in sorted(all_fa):
    target = fa_map.get(icon)
    if not target or target not in existing_symbols:
        missing_symbols.add(icon)
        print(f"MISSING: {icon} -> mapped to {target}")
    else:
        print(f"OK: {icon} -> {target}")

print(f"\nTotal missing: {len(missing_symbols)}")
