import base64

with open('app/src/main/assets/brand/kitsw-crest.png', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('ascii')

with open('app/src/main/assets/brand/login-lockup-template.svg', 'r', encoding='utf-8') as f:
    svg = f.read()

# Replace the dashed placeholder rect with the image
placeholder = '<!-- KITSW logo: place at x=396, height 64 (same optical height as the tile). Do not recolor. --><rect x="396" y="0" width="180" height="64" fill="none" stroke="#E3E8E8" stroke-dasharray="4 4"/>'
img_tag = f'<image x="396" y="0" width="64" height="64" href="data:image/png;base64,{b64}"/>'

new_svg = svg.replace(placeholder, img_tag)
new_svg = new_svg.replace('viewBox="0 0 578 64" width="578"', 'viewBox="0 0 470 64" width="470"')

with open('app/src/main/assets/brand/login-lockup.svg', 'w', encoding='utf-8') as f:
    f.write(new_svg)

with open('app/src/main/assets/brand/login-lockup-template.svg', 'w', encoding='utf-8') as f:
    f.write(new_svg)

print('Updated login lockups successfully.')
