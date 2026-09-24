import re

for fn in ['app/src/main/assets/admin.html', 'app/src/main/assets/admin.js', 'app/src/main/assets/student.js', 'app/src/main/assets/driver.js']:
    with open(fn, 'r', encoding='utf-8') as f:
        content = f.read()
    # find any fa- occurrences
    fa_instances = re.findall(r'<i[^>]*class=["\'][^"\']*fa-[^"\']*["\'][^>]*>(?:</i>)?', content)
    raw_fa = re.findall(r'fa-[a-z0-9-]+', content)
    print(f"\n{fn}:")
    print(f"  Total raw fa-* tokens: {len(raw_fa)}")
    print(f"  Total <i class='fa-...'> elements: {len(fa_instances)}")
    unique_tags = set(fa_instances)
    print(f"  Unique elements ({len(unique_tags)}):")
    for u in sorted(unique_tags)[:10]:
        print("   ", u)
