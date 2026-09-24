import re

with open("app/src/main/assets/admin.html", "r", encoding="utf-8") as f:
    text = f.read()

# Mapping of FA classes in admin.html to icons.svg symbols
# In admin.html, icons are inside buttons, headers, or nav items.
# Let's inspect all <i class="fa-..."></i> occurrences.

fa_icon_map = {
    'fa-bars': 'icon-bars',
    'fa-bell': 'icon-bell',
    'fa-bullhorn': 'icon-bullhorn',
    'fa-bus': 'icon-bus',
    'fa-bus-slash': 'icon-bus-slash',
    'fa-calendar-day': 'icon-calendar',
    'fa-chart-pie': 'icon-chart-pie',
    'fa-check': 'icon-check',
    'fa-circle-check': 'icon-check',
    'fa-circle-notch': 'icon-spinner',
    'fa-clipboard-question': 'icon-clipboard-question',
    'fa-forward-step': 'icon-forward-step',
    'fa-hourglass-start': 'icon-hourglass',
    'fa-list-check': 'icon-list-check',
    'fa-location-dot': 'icon-map-pin',
    'fa-lock': 'icon-lock',
    'fa-magnifying-glass': 'icon-search',
    'fa-map-location-dot': 'icon-route',
    'fa-map-pin': 'icon-map-pin',
    'fa-paper-plane': 'icon-paper-plane',
    'fa-pen-to-square': 'icon-pen',
    'fa-play': 'icon-play',
    'fa-plus': 'icon-plus',
    'fa-right-from-bracket': 'icon-logout',
    'fa-right-to-bracket': 'icon-logout',
    'fa-rotate': 'icon-refresh',
    'fa-route': 'icon-route',
    'fa-trash-can': 'icon-trash',
    'fa-triangle-exclamation': 'icon-alert',
    'fa-user-graduate': 'icon-user-graduate',
    'fa-user-plus': 'icon-user-plus',
    'fa-user-shield': 'icon-user-shield',
    'fa-user-slash': 'icon-user-slash',
    'fa-user-tie': 'icon-user-tie',
    'fa-wand-magic-sparkles': 'icon-wand',
    'fa-xmark': 'icon-xmark'
}

def replace_i_tag(match):
    full = match.group(0)
    classes = match.group(1).split()
    
    # Extract specific icon class
    icon_class = None
    extra_classes = []
    spin = False
    
    for c in classes:
        if c in ('fa-solid', 'fa-regular'):
            continue
        elif c == 'fa-spin':
            spin = True
        elif c.startswith('fa-'):
            icon_class = c
        else:
            # e.g. text-sm, text-amber-500, w-4, text-center
            if c not in ('text-center', 'w-4', 'text-sm', 'text-xs', 'text-base'):
                extra_classes.append(c)
            elif 'text-' in c and not c.startswith('text-center'):
                extra_classes.append(c)

    if not icon_class or icon_class not in fa_icon_map:
        print(f"UNKNOWN ICON: {full}")
        return full

    symbol = fa_icon_map[icon_class]
    cls = "w-4 h-4 shrink-0"
    if spin:
        cls += " animate-spin"
    if extra_classes:
        cls += " " + " ".join(extra_classes)
        
    return f'<svg class="{cls}" aria-hidden="true"><use href="icons.svg#{symbol}"/></svg>'

# Match <i class="..."></i>
new_text = re.sub(r'<i\s+class=["\']([^"\']+)["\']>\s*</i>', replace_i_tag, text)

# Check remaining
remaining = re.findall(r'fa-[a-z0-9-]+', new_text)
print(f"Replaced! Remaining fa-* in admin.html: {len(remaining)}")

with open("app/src/main/assets/admin.html", "w", encoding="utf-8") as f:
    f.write(new_text)

print("admin.html written successfully.")
