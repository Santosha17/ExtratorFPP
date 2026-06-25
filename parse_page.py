from bs4 import BeautifulSoup

with open('page.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f, 'html.parser')

print("=== Select/Dropdowns ===")
selects = soup.find_all('select')
for s in selects:
    print(f"Dropdown ID: {s.get('id')}")
    options = s.find_all('option')
    if options:
        print(f"  First option: {options[0].text.strip()} (value: {options[0].get('value')})")
        print(f"  Number of options: {len(options)}")

print("\n=== Tables ===")
tables = soup.find_all('table')
for i, t in enumerate(tables):
    print(f"Table {i+1} ID: {t.get('id')}")
    headers = [th.text.strip() for th in t.find_all('th')]
    if headers:
        print(f"  Headers: {', '.join(headers)}")
    rows = t.find_all('tr')
    print(f"  Number of rows: {len(rows)}")
    if len(rows) > 1:
        first_row_cells = [td.text.strip() for td in rows[1].find_all('td')]
        print(f"  Sample row (1st): {', '.join(first_row_cells[:5])} ...")

print("\n=== Main Headings ===")
headings = soup.find_all(['h1', 'h2', 'h3'])
for h in headings:
    print(f"{h.name}: {h.text.strip()}")

print("\n=== Links (Sample) ===")
links = soup.find_all('a', href=True)
print(f"Total links: {len(links)}")
