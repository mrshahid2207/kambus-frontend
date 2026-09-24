import re

with open('app/src/main/assets/admin.html', 'r', encoding='utf-8') as f:
    text = f.read()

sections = re.findall(r'id=["\']section-([^"\']+)["\']', text)
print('Sections:', sections)

# check for emojis
import unicodedata
emojis = [c for c in text if unicodedata.category(c) in ('So', 'Sm', 'Sk') or ord(c) > 0x1F000]
print('Emojis found in admin.html:', [hex(ord(c)) for c in set(emojis)])

# check for kamlogo
print('kamlogo occurrences:', text.count('kamlogo'))

# check for rounded-xl/2xl/3xl, shadow-2xl
print('rounded-xl:', text.count('rounded-xl'))
print('rounded-2xl:', text.count('rounded-2xl'))
print('rounded-3xl:', text.count('rounded-3xl'))
print('shadow-2xl:', text.count('shadow-2xl'))
print('shadow-xl:', text.count('shadow-xl'))
print('shadow-lg:', text.count('shadow-lg'))
