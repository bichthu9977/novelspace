#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate.py — Tạo trang chương riêng cho Truyện Full Vn (Hướng B SEO)

Cách dùng:
  python3 generate.py            # chỉ generate truyện mới / chưa đủ chương
  python3 generate.py --force    # generate lại toàn bộ
  python3 generate.py --id 106   # generate lại 1 truyện theo ID
"""

import json
import sys
from pathlib import Path
from datetime import date

# ── Cấu hình ──────────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent
BOOKS_INDEX   = BASE_DIR / "books-index-seo.json"
TRUYEN_DIR    = BASE_DIR / "truyen"
SITEMAP_PATH  = BASE_DIR / "sitemap.xml"
BASE_URL      = "https://truyenfullvn.org"
TODAY         = date.today().isoformat()
# ──────────────────────────────────────────────────────────────────────────────


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def esc(text):
    return (str(text or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def book_slug(seo_url):
    """'truyen/ten-truyen-1.html'  →  'ten-truyen-1'"""
    return seo_url.removeprefix("truyen/").removesuffix(".html")


# ── Template trang chương ─────────────────────────────────────────────────────

def render_chapter(book, chapter, idx, slug, total):
    num   = idx + 1
    title = chapter.get("title") or f"Chương {num}"
    paras = [str(p).strip() for p in (chapter.get("content") or []) if str(p).strip()]

    first     = paras[0] if paras else ""
    desc      = (first[:197] + "...") if len(first) > 200 else first
    content_html = "\n".join(f"    <p>{esc(p)}</p>" for p in paras) or "    <p>Chương này chưa có nội dung.</p>"

    book_title = book.get("title", "")
    author     = book.get("author", "") or "Chưa rõ"
    cover      = book.get("cover",  "images/default.jpg")
    book_id    = book.get("id", "")
    tags_str   = esc(", ".join(book.get("tags") or []))

    book_url    = f"{BASE_URL}/truyen/{slug}.html"
    chapter_url = f"{BASE_URL}/truyen/{slug}/chuong-{num}.html"
    reader_url  = f"{BASE_URL}/index.html#book-{book_id}-{num}"

    prev_btn = (f'<a class="nav-btn prev" href="chuong-{idx}.html">← Chương trước</a>'
                if idx > 0 else "<span></span>")
    next_btn = (f'<a class="nav-btn next" href="chuong-{num+1}.html">Chương tiếp →</a>'
                if idx < total - 1 else "<span></span>")

    return f'''<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(title)} | {esc(book_title)} | TruyenFullVn</title>
  <meta name="description" content="{esc(desc)}">
  <meta name="keywords" content="{tags_str}, đọc truyện online, TruyenFullVn">
  <link rel="canonical" href="{chapter_url}">
  <meta property="og:title" content="{esc(title)} | {esc(book_title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:image" content="{BASE_URL}/{esc(cover)}">
  <meta property="og:url" content="{chapter_url}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)} | {esc(book_title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <link rel="icon" href="../../favicon.ico">
  <script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{esc(title)}",
  "description": "{esc(desc)}",
  "author": {{"@type": "Person", "name": "{esc(author)}"}},
  "isPartOf": {{"@type": "Book", "name": "{esc(book_title)}", "url": "{book_url}"}},
  "url": "{chapter_url}",
  "inLanguage": "vi",
  "position": {num}
}}
  </script>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:Arial,Helvetica,sans-serif;background:#f5f1ea;color:#2d2d2d;line-height:1.6}}
    .page{{max-width:860px;margin:0 auto;padding:28px 18px 60px}}
    .breadcrumb{{font-size:14px;color:#777;margin-bottom:20px}}
    .breadcrumb a{{color:#8a3d2f;text-decoration:none}}
    .breadcrumb a:hover{{text-decoration:underline}}
    .ch-header{{margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e7ddd2}}
    .book-link{{font-size:15px;color:#8a3d2f;text-decoration:none;display:block;margin-bottom:8px}}
    .book-link:hover{{text-decoration:underline}}
    h1{{font-size:28px;color:#6d2d22;line-height:1.3;margin-bottom:8px}}
    .ch-meta{{font-size:14px;color:#777}}
    .ch-body{{font-size:18px;line-height:2;margin:32px 0 40px}}
    .ch-body p{{margin-bottom:18px}}
    .ch-nav{{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;margin-bottom:24px}}
    .nav-btn{{display:inline-block;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;transition:transform .2s}}
    .nav-btn:hover{{transform:translateY(-1px)}}
    .prev{{background:#fff5ee;color:#6d2d22;border:1px solid #f0d7c5}}
    .next{{background:#8a3d2f;color:#fff}}
    .reader-link{{display:block;text-align:center;margin:24px 0;padding:14px;background:#fff;border:1px solid #e7ddd2;border-radius:14px;color:#8a3d2f;text-decoration:none;font-weight:700;font-size:14px}}
    .reader-link:hover{{background:#faf0e8}}
    @media(max-width:640px){{h1{{font-size:22px}}.ch-body{{font-size:16px}}.ch-nav{{flex-direction:column}}.nav-btn{{text-align:center}}}}
  </style>
</head>
<body>
  <main class="page">
    <nav class="breadcrumb">
      <a href="../../index.html">Trang chủ</a> ›
      <a href="../{slug}.html">{esc(book_title)}</a> ›
      {esc(title)}
    </nav>
    <header class="ch-header">
      <a class="book-link" href="../{slug}.html">{esc(book_title)}</a>
      <h1>{esc(title)}</h1>
      <div class="ch-meta">Tác giả: {esc(author)} • Chương {num}/{total}</div>
    </header>
    <nav class="ch-nav">{prev_btn}{next_btn}</nav>
    <article class="ch-body">
{content_html}
    </article>
    <nav class="ch-nav">{prev_btn}{next_btn}</nav>
    <a class="reader-link" href="{reader_url}">Đọc trên TruyệnFull (chế độ reader đầy đủ) →</a>
  </main>
</body>
</html>'''


# ── Template trang tổng quan truyện ──────────────────────────────────────────

def render_overview(book, slug, chapters):
    book_title = book.get("title", "")
    author     = book.get("author", "") or "Chưa rõ"
    desc       = book.get("desc", "")
    tags       = book.get("tags") or []
    cover      = book.get("cover", "images/default.jpg")
    book_id    = book.get("id", "")
    total      = len(chapters)

    book_url   = f"{BASE_URL}/truyen/{slug}.html"
    reader_url = f"{BASE_URL}/index.html#book-{book_id}-1"
    tags_html  = "".join(f'<span class="tag">{esc(t)}</span>' for t in tags)
    tags_meta  = esc(", ".join(tags))

    ch_items = "".join(
        f'      <li><a href="{slug}/chuong-{i+1}.html">{esc(ch.get("title") or f"Chương {i+1}")}</a></li>\n'
        for i, ch in enumerate(chapters)
    )
    ch_list_block = ""
    if ch_items:
        ch_list_block = f'''  <section class="ch-list">
    <h2 class="ch-list-title">Danh sách chương ({total} chương)</h2>
    <ol class="ch-ol">
{ch_items}    </ol>
  </section>'''

    schema = f'''{{
  "@context": "https://schema.org",
  "@type": "Book",
  "name": "{esc(book_title)}",
  "author": {{"@type": "Person", "name": "{esc(author)}"}},
  "description": "{esc(desc)}",
  "image": "{BASE_URL}/{esc(cover)}",
  "url": "{book_url}",
  "inLanguage": "vi",
  "numberOfPages": {total}
}}'''

    return f'''<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(book_title)} | TruyenFullVn</title>
  <meta name="description" content="{esc(desc)}">
  <meta name="keywords" content="{tags_meta}, đọc truyện online, TruyenFullvn">
  <link rel="canonical" href="{book_url}">
  <meta property="og:title" content="{esc(book_title)} | TruyenFullVn">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:image" content="{BASE_URL}/{esc(cover)}">
  <meta property="og:url" content="{book_url}">
  <meta property="og:type" content="book">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(book_title)} | TruyenFullVn">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{BASE_URL}/{esc(cover)}">
  <link rel="icon" href="../favicon.ico">
  <script type="application/ld+json">
{schema}
  </script>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{background:#f5f1ea;color:#2d2d2d;font-family:Arial,Helvetica,sans-serif}}
    .page{{max-width:980px;margin:0 auto;padding:28px 18px 60px}}
    .back{{display:inline-block;margin-bottom:18px;color:#6d2d22;text-decoration:none;font-weight:700}}
    .card{{background:#fff;border:1px solid #e7ddd2;border-radius:18px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.06);display:grid;grid-template-columns:220px 1fr;gap:24px}}
    .cover{{width:220px;aspect-ratio:2/3;object-fit:cover;border-radius:14px;background:#eee}}
    h1{{font-size:32px;line-height:1.25;color:#6d2d22;margin-bottom:8px}}
    .meta{{color:#777;margin-bottom:14px}}
    .tags{{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}}
    .tag{{background:#f4ebe3;color:#6d2d22;border-radius:999px;padding:6px 12px;font-size:14px;font-weight:700}}
    .desc{{font-size:16px;line-height:1.75;margin-bottom:20px;color:#444}}
    .btns{{display:flex;gap:10px;flex-wrap:wrap}}
    .btn-p{{background:#8a3d2f;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700}}
    .btn-g{{background:#fff5ee;color:#6d2d22;border:1px solid #f0d7c5;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700}}
    .ch-list{{margin-top:28px;background:#fff;border:1px solid #e7ddd2;border-radius:18px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.06)}}
    .ch-list-title{{font-size:20px;color:#6d2d22;margin-bottom:16px}}
    .ch-ol{{list-style:decimal;padding-left:20px;display:grid;grid-template-columns:repeat(2,1fr);column-gap:24px;gap:6px}}
    .ch-ol li a{{color:#2d2d2d;text-decoration:none;padding:5px 0;display:block;font-size:15px}}
    .ch-ol li a:hover{{color:#8a3d2f}}
    @media(max-width:720px){{.card{{grid-template-columns:1fr}}.cover{{width:160px;margin:0 auto}}.ch-ol{{grid-template-columns:1fr}}h1{{font-size:24px}}}}
  </style>
</head>
<body>
  <main class="page">
    <a class="back" href="../index.html">← Về trang chủ</a>
    <article class="card">
      <img class="cover" src="../{esc(cover)}" alt="Bìa {esc(book_title)}" loading="eager" decoding="async" onerror="this.src='../images/default.jpg'">
      <section>
        <h1>{esc(book_title)}</h1>
        <div class="meta">Tác giả: {esc(author)} • {total} chương</div>
        <div class="tags">{tags_html}</div>
        <p class="desc">{esc(desc)}</p>
        <div class="btns">
          <a class="btn-p" href="{slug}/chuong-1.html">Đọc từ đầu</a>
          <a class="btn-g" href="{reader_url}">Đọc trên app</a>
        </div>
      </section>
    </article>
{ch_list_block}
  </main>
</body>
</html>'''


# ── Sitemap ───────────────────────────────────────────────────────────────────

def write_sitemap(urls):
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for url, priority, freq in urls:
        lines += [
            "  <url>",
            f"    <loc>{url}</loc>",
            f"    <lastmod>{TODAY}</lastmod>",
            f"    <changefreq>{freq}</changefreq>",
            f"    <priority>{priority}</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    SITEMAP_PATH.write_text("\n".join(lines), encoding="utf-8")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args       = sys.argv[1:]
    force      = "--force" in args
    target_id  = None
    if "--id" in args:
        idx = args.index("--id")
        try:
            target_id = int(args[idx + 1])
        except (IndexError, ValueError):
            print("Lỗi: --id cần kèm theo số ID, ví dụ: python3 generate.py --id 106")
            sys.exit(1)

    print("Đang đọc danh sách truyện...")
    index = load_json(BOOKS_INDEX)
    print(f"  → {len(index)} truyện trong index\n")

    sitemap_urls = [(f"{BASE_URL}/", "1.0", "daily")]
    created = skipped = errors = 0

    for i, entry in enumerate(index):
        seo_url = entry.get("seoUrl", "")
        if not seo_url:
            errors += 1
            continue

        # Lọc theo --id nếu có
        if target_id is not None and entry.get("id") != target_id:
            slug = book_slug(seo_url)
            sitemap_urls.append((f"{BASE_URL}/truyen/{slug}.html", "0.8", "weekly"))
            ch_dir = TRUYEN_DIR / slug
            for f in sorted(ch_dir.glob("chuong-*.html")) if ch_dir.exists() else []:
                j = f.stem.replace("chuong-", "")
                sitemap_urls.append((f"{BASE_URL}/truyen/{slug}/chuong-{j}.html", "0.7", "monthly"))
            continue

        slug     = book_slug(seo_url)
        book_url = f"{BASE_URL}/truyen/{slug}.html"
        sitemap_urls.append((book_url, "0.8", "weekly"))

        # Load JSON truyện
        file_path = entry.get("file", "")
        book_data = None
        if file_path:
            fp = BASE_DIR / file_path
            if fp.exists():
                try:
                    book_data = load_json(fp)
                except Exception as e:
                    print(f"  [!] Lỗi đọc {file_path}: {e}")

        if not book_data:
            errors += 1
            continue

        # Gộp metadata: index + JSON (ưu tiên index cho các trường cơ bản)
        book     = {**book_data, **{k: v for k, v in entry.items() if v}}
        chapters = book_data.get("chapters") or []

        if not chapters:
            skipped += 1
            continue

        ch_dir         = TRUYEN_DIR / slug
        existing_count = len(list(ch_dir.glob("chuong-*.html"))) if ch_dir.exists() else 0

        # Thêm URL chương vào sitemap
        for j in range(len(chapters)):
            sitemap_urls.append((
                f"{BASE_URL}/truyen/{slug}/chuong-{j+1}.html", "0.7", "monthly"
            ))

        if not force and target_id is None and existing_count == len(chapters):
            skipped += 1
            continue

        # Tạo thư mục chương
        ch_dir.mkdir(parents=True, exist_ok=True)

        # Tạo trang tổng quan truyện
        overview_path = TRUYEN_DIR / f"{slug}.html"
        overview_path.write_text(render_overview(book, slug, chapters), encoding="utf-8")

        # Tạo từng trang chương
        for j, ch in enumerate(chapters):
            ch_path = ch_dir / f"chuong-{j+1}.html"
            ch_path.write_text(render_chapter(book, ch, j, slug, len(chapters)), encoding="utf-8")

        created += 1

        # In tiến trình mỗi 200 truyện
        if (i + 1) % 200 == 0:
            print(f"  [{i+1}/{len(index)}] đang xử lý...")

    # Kết quả
    print(f"\nHoàn thành:")
    print(f"  ✓ {created} truyện được generate/cập nhật")
    print(f"  ✓ {skipped} truyện bỏ qua (đã có đủ chương)")
    print(f"  ✗ {errors} truyện thiếu file JSON (bỏ qua)")
    print(f"  ✓ Sitemap: {len(sitemap_urls)} URLs")

    write_sitemap(sitemap_urls)
    print("  ✓ Đã cập nhật sitemap.xml")

    if target_id:
        print(f"\nTip: chạy không có --id để generate toàn bộ truyện còn lại.")


if __name__ == "__main__":
    main()
