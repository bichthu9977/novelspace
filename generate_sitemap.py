import json
from datetime import datetime

# Load books index
with open('books-index-seo.json', 'r', encoding='utf-8') as f:
    books = json.load(f)

# Generate sitemap.xml
sitemap_lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <!-- Home page -->',
    '  <url>',
    '    <loc>https://truyenfullvn.org/</loc>',
    f'    <lastmod>{datetime.now().strftime("%Y-%m-%d")}</lastmod>',
    '    <priority>1.0</priority>',
    '    <changefreq>daily</changefreq>',
    '  </url>',
]

# Add book pages
for book in books:
    seo_url = book.get('seoUrl', f"book-{book.get('id')}")
    url = f"https://truyenfullvn.org/truyen/{seo_url}/chuong-1"

    sitemap_lines.append('  <url>')
    sitemap_lines.append(f'    <loc>{url}</loc>')
    sitemap_lines.append(f'    <lastmod>{datetime.now().strftime("%Y-%m-%d")}</lastmod>')
    sitemap_lines.append('    <priority>0.8</priority>')
    sitemap_lines.append('    <changefreq>weekly</changefreq>')
    sitemap_lines.append('  </url>')

sitemap_lines.append('</urlset>')

# Write sitemap
with open('sitemap.xml', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sitemap_lines))

print(f"✅ Created sitemap.xml with {len(books)} books")
print(f"📁 Total URLs: {len(books) + 1} (home + books)")
