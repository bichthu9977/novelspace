#!/usr/bin/env python3
import json
import os
from pathlib import Path

print("🚀 Generating static HTML files with unique meta tags for all books...")
print()

# Load books index
with open('books-index-seo.json', 'r', encoding='utf-8') as f:
    books = json.load(f)

print(f"📚 Total books to process: {len(books)}")
print()

def escape_html(text):
    """Escape HTML special characters"""
    if not text:
        return ""
    return (str(text)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&#039;'))

def generate_html_template(book):
    """Generate HTML with unique meta tags for each book"""

    book_id = book.get('id')
    book_title = escape_html(book.get('title', 'Truyện không tiêu đề'))
    book_author = escape_html(book.get('author', 'Tác giả không rõ'))
    book_desc = escape_html(book.get('desc', ''))
    book_cover = book.get('cover', 'images/default.jpg')
    book_tags = book.get('tags', [])
    seo_url = book.get('seoUrl', f'book-{book_id}')

    # Tạo meta description ngắn (155 ký tự)
    if book_desc:
        meta_desc = (book_desc[:152] + "...") if len(book_desc) > 152 else book_desc
    else:
        meta_desc = f"Đọc {book_title} bởi {book_author} trên TruyệnFullVn"

    # URL của book
    book_url = f"https://truyenfullvn.org/truyen/{seo_url}/chuong-1"

    # Tags JSON
    tags_json = json.dumps(book_tags) if book_tags else "[]"

    # JSON-LD structured data
    json_ld = {
        "@context": "https://schema.org",
        "@type": "Book",
        "name": book_title,
        "author": {
            "@type": "Person",
            "name": book_author
        },
        "description": book_desc[:200] if book_desc else "",
        "image": book_cover,
        "url": book_url,
        "genre": book_tags[:3] if book_tags else [],
        "isAccessibleForFree": True,
        "inLanguage": "vi"
    }

    json_ld_str = json.dumps(json_ld, ensure_ascii=False, indent=2)

    html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="/" />

  <!-- Unique Meta Tags for this Book -->
  <title>{book_title} - Chương 1 | TruyệnFullVn</title>
  <meta name="description" content="{meta_desc}" />
  <meta name="keywords" content="{escape_html(', '.join(book_tags))}, đọc truyện, TruyệnFullVn" />
  <meta name="author" content="{book_author}" />
  <meta name="robots" content="index, follow" />

  <!-- Canonical URL -->
  <link rel="canonical" href="{book_url}" />

  <!-- Open Graph Tags for Social Media -->
  <meta property="og:title" content="{book_title}" />
  <meta property="og:description" content="{meta_desc}" />
  <meta property="og:type" content="book" />
  <meta property="og:url" content="{book_url}" />
  <meta property="og:image" content="{book_cover}" />
  <meta property="og:site_name" content="TruyệnFullVn" />

  <!-- Twitter Card Tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{book_title}" />
  <meta name="twitter:description" content="{meta_desc}" />
  <meta name="twitter:image" content="{book_cover}" />

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
{json_ld_str}
  </script>

  <!-- Icons & Sitemap -->
  <link rel="icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/favicon_180.png" />
  <link rel="sitemap" href="/sitemap.xml" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand" id="homeBtn">TruyệnFullVn</div>
      <div class="topbar-actions-mobile">
        <button id="mobileSearchToggle" class="icon-btn mobile-only" type="button" aria-label="Mở tìm kiếm" aria-expanded="false"></button>
        <button id="mobileMenuToggle" class="icon-btn mobile-only" type="button" aria-label="Mở menu" aria-expanded="false"></button>
      </div>
      <div class="search-wrap" id="searchWrap">
        <input id="searchInput" type="text" placeholder="Tìm truyện, tác giả, tag..." />
        <button id="searchBtn" type="button">Tìm</button>
      </div>
      <nav class="nav" id="mainNav">
        <a href="#" id="homeLink">Trang chủ</a>
        <a href="#" id="shelfLink">Tủ sách</a>
      </nav>
    </div>
  </header>

  <main>
    <section id="homeView" class="layout hidden">
      <aside class="sidebar">
        <div class="sidebar-block" id="categorySection">
          <div class="section-title">Thể loại</div>
          <ul class="menu-list"></ul>
        </div>
        <div class="sidebar-block" id="rankingSection">
          <div class="section-title">Bảng xếp hạng</div>
          <ol class="ranking-list" id="rankingList"></ol>
        </div>
      </aside>
      <section class="content">
        <div class="panel hero">
          <div class="hero-copy">
            <h1>Kho truyện online theo phong cách cổ điển</h1>
            <p>Mở truyện. Đọc. Và quên mất thời gian.</p>
            <div class="hero-actions">
              <button class="solid-btn" id="scrollBooksBtn" type="button">Xem truyện nổi bật</button>
              <button class="ghost-btn" id="openFeaturedBtn" type="button">Đọc thử ngay</button>
            </div>
          </div>
          <div class="hero-card" id="featuredCard" role="button" tabindex="0">
            <span class="hero-badge">Truyện đề cử hôm nay</span>
            <div class="hero-book">
              <img class="cover cover-hero" id="featuredCover" src="" alt="Bìa truyện đề cử" />
              <div>
                <h3 id="featuredTitle">Đang tải truyện đề cử...</h3>
                <p id="featuredDesc">Một câu chuyện ngẫu nhiên đang chờ bạn khám phá.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="panel toolbar">
          <div class="filters">
            <select id="sortSelect">
              <option value="random">Sắp xếp: Ngẫu nhiên</option>
              <option value="popular">Sắp xếp: Phổ biến</option>
              <option value="title">Sắp xếp: A → Z</option>
              <option value="chapters">Sắp xếp: Tổng số chương</option>
            </select>
            <input
              id="authorFilter"
              name="novel_author_filter"
              type="search"
              placeholder="Lọc theo tác giả"
              autocomplete="new-password"
              autocapitalize="none"
              spellcheck="false"
              readonly
            />
          </div>
          <div class="chip-group" id="chipGroup"></div>
        </div>

        <div class="panel books-panel" id="booksSection">
          <div class="section-title section-title-main" id="booksPanelTitle">Kho truyện nổi bật</div>
          <div class="books-grid" id="booksGrid"></div>
          <div class="pagination" id="pagination"></div>
        </div>
      </section>
    </section>

    <section id="readerView" class="reader-shell">
      <article class="reader-panel">
        <div class="reader-top">
          <div>
            <h1 class="reader-title" id="readerTitle">Tên truyện</h1>
            <div class="reader-sub" id="readerMeta">Tác giả • Chương 1</div>
          </div>
          <button class="ghost-btn" id="backBtn" type="button">← Quay lại danh sách</button>
        </div>

        <div class="reader-book-header">
          <img id="readerCover" class="reader-cover" src="" alt="Bìa truyện" />
          <div class="reader-book-info">
            <div class="reader-book-author" id="readerAuthor"></div>
            <div class="reader-book-tags" id="readerTags"></div>
            <div class="reader-book-desc" id="readerDesc"></div>
          </div>
        </div>

        <div class="reader-controls">
          <label>
            Cỡ chữ
            <input id="fontSizeRange" type="range" min="16" max="28" value="20" />
          </label>
          <label>
            Độ rộng dòng
            <input id="readerWidthRange" type="range" min="680" max="980" value="860" />
          </label>
          <label>
            Màu nền
            <select id="themeSelect">
              <option value="paper">Sáng</option>
              <option value="sepia">Sepia</option>
              <option value="dark">Tối</option>
            </select>
          </label>
        </div>

        <div class="chapter-list-wrap">
          <div class="chapter-list-head">
            <div class="chapter-list-title">Danh sách chương</div>
            <div class="chapter-list-tools">
              <select id="chapterSelect" class="chapter-select"></select>
            </div>
          </div>
          <div id="chapterList" class="chapter-list"></div>
        </div>

        <div class="reader-body" id="readerBody"></div>

        <div class="reader-footer">
          <button class="ghost-btn" id="prevChapterBtn" type="button">← Chương trước</button>
          <button class="solid-btn" id="nextChapterBtn" type="button">Chương tiếp →</button>
        </div>
      </article>

      <aside class="floating-tools">
        <button id="saveShelfBtn" type="button">♡ Lưu truyện này</button>
        <button id="scrollTopBtn" type="button">↑ Lên đầu trang</button>
      </aside>
    </section>
  </main>

  <link rel="stylesheet" href="/style.css" />
  <script src="/script.js"></script>
</body>
</html>"""

    return html

# Create directories and HTML files
generated_count = 0
errors = []

for book in books:
    book_id = book.get('id')
    seo_url = book.get('seoUrl', f'book-{book_id}')

    if not book_id or not seo_url:
        continue

    try:
        # Create directory structure: truyen/seo_url/chuong-1/
        dir_path = Path(f'truyen/{seo_url}/chuong-1')
        dir_path.mkdir(parents=True, exist_ok=True)

        # Generate HTML with unique meta tags
        html_content = generate_html_template(book)

        # Write index.html
        file_path = dir_path / 'index.html'
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        generated_count += 1

        if generated_count % 500 == 0:
            print(f"⏳ Generated {generated_count} files...")

    except Exception as e:
        errors.append((book_id, str(e)))

print()
print("=" * 60)
print(f"✅ DONE! Generated {generated_count} HTML files")
print("=" * 60)
print()
print("📊 SEO Improvements:")
print("   ✅ Unique titles for each book")
print("   ✅ Unique meta descriptions")
print("   ✅ Unique Open Graph tags")
print("   ✅ Unique Twitter cards")
print("   ✅ JSON-LD structured data per book")
print("   ✅ Canonical URLs")
print()

if errors:
    print(f"⚠️  Errors: {len(errors)}")
    for book_id, error in errors[:5]:
        print(f"  - Book {book_id}: {error}")

print()
print("📁 File structure:")
print("   truyen/")
print("   ├── book-1/chuong-1/index.html (with unique meta tags)")
print("   ├── book-2/chuong-1/index.html (with unique meta tags)")
print("   └── ... (9,134 directories with SEO optimization)")
print()
print("🚀 Ready for Google indexing!")
