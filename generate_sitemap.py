import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import quote
from xml.sax.saxutils import escape


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
DEFAULT_INDEX_FILES = (
    ROOT_DIR / "books-index.json",
    ROOT_DIR / "books-index-seo.json",
    ROOT_DIR / "data" / "books-index.json",
)
MAX_URLS_PER_SITEMAP = 50_000

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(BACKEND_DIR / ".env")
except Exception:
    pass


@dataclass
class BookEntry:
    id: int
    seo_url: str
    chapter_count: int
    lastmod: date


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def to_date(value, fallback: date) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            return fallback
    return fallback


def file_lastmod(path: Path) -> date:
    if not path.exists():
        return utc_today()
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).date()


def clean_site_url(value: str) -> str:
    return (value or "https://truyenfullvn.org").strip().rstrip("/")


def make_slug(book_id: int, raw_slug: str | None) -> str:
    slug = str(raw_slug or "").strip().strip("/")
    return slug or f"book-{book_id}"


def url_join(site_url: str, path: str) -> str:
    safe_path = "/".join(quote(part, safe="") for part in path.strip("/").split("/") if part)
    return f"{site_url}/{safe_path}"


def iter_chunks(items: list[dict], size: int) -> Iterable[list[dict]]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def load_json_books(paths: Iterable[Path]) -> dict[int, BookEntry]:
    books: dict[int, BookEntry] = {}

    for path in paths:
        if not path.exists():
            continue

        source_lastmod = file_lastmod(path)

        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)

        if not isinstance(data, list):
            continue

        for item in data:
            try:
                book_id = int(item.get("id"))
            except (TypeError, ValueError):
                continue

            seo_url = make_slug(book_id, item.get("seoUrl") or item.get("seo_url"))
            chapter_count = int(item.get("chapterCount") or item.get("chapter_count") or 0)
            books[book_id] = BookEntry(
                id=book_id,
                seo_url=seo_url,
                chapter_count=max(chapter_count, 0),
                lastmod=source_lastmod,
            )

    return books


def load_db_books(existing: dict[int, BookEntry]) -> dict[int, BookEntry]:
    if not os.getenv("DATABASE_URL"):
        return existing

    sys.path.insert(0, str(BACKEND_DIR))

    try:
        from database import SessionLocal
        from models import Book, Chapter
        from sqlalchemy import func
    except Exception as exc:
        print(f"Warning: skipping PostgreSQL sitemap source: {exc}")
        return existing

    db = SessionLocal()

    try:
        chapter_stats = {
            int(book_id): {
                "count": int(count or 0),
                "lastmod": to_date(lastmod, utc_today()),
            }
            for book_id, count, lastmod in db.query(
                Chapter.book_id,
                func.count(Chapter.id),
                func.max(Chapter.created_at),
            ).group_by(Chapter.book_id).all()
        }

        for book in db.query(Book).yield_per(1000):
            book_id = int(book.id)
            stats = chapter_stats.get(book_id, {})
            chapter_count = int(book.chapter_count or stats.get("count") or 0)
            book_lastmod = to_date(getattr(book, "created_at", None), utc_today())
            chapter_lastmod = stats.get("lastmod", book_lastmod)
            lastmod = max(book_lastmod, chapter_lastmod)

            existing[book_id] = BookEntry(
                id=book_id,
                seo_url=make_slug(book_id, getattr(book, "seo_url", "")),
                chapter_count=max(chapter_count, 0),
                lastmod=lastmod,
            )
    except Exception as exc:
        print(f"Warning: skipping PostgreSQL sitemap source: {exc}")
    finally:
        db.close()

    return existing


def url_xml(urls: list[dict]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]

    for item in urls:
        lines.extend([
            "  <url>",
            f"    <loc>{escape(item['loc'])}</loc>",
            f"    <lastmod>{item['lastmod']}</lastmod>",
            f"    <changefreq>{item['changefreq']}</changefreq>",
            f"    <priority>{item['priority']}</priority>",
            "  </url>",
        ])

    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def sitemap_index_xml(sitemaps: list[dict]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]

    for item in sitemaps:
        lines.extend([
            "  <sitemap>",
            f"    <loc>{escape(item['loc'])}</loc>",
            f"    <lastmod>{item['lastmod']}</lastmod>",
            "  </sitemap>",
        ])

    lines.append("</sitemapindex>")
    return "\n".join(lines) + "\n"


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def write_url_sitemap(output_dir: Path, public_base: str, base_name: str, urls: list[dict]) -> dict:
    parent_name = f"{base_name}.xml"
    parent_path = output_dir / parent_name

    if len(urls) <= MAX_URLS_PER_SITEMAP:
        write_text(parent_path, url_xml(urls))
        return {
            "loc": f"{public_base}/{parent_name}",
            "lastmod": utc_today().isoformat(),
            "files": [parent_name],
        }

    child_sitemaps = []
    files = []

    for index, chunk in enumerate(iter_chunks(urls, MAX_URLS_PER_SITEMAP), start=1):
        child_name = f"{base_name}-{index}.xml"
        child_path = output_dir / child_name
        write_text(child_path, url_xml(chunk))
        files.append(child_name)
        child_sitemaps.append({
            "loc": f"{public_base}/{child_name}",
            "lastmod": utc_today().isoformat(),
        })

    write_text(parent_path, sitemap_index_xml(child_sitemaps))
    files.insert(0, parent_name)

    return {
        "loc": f"{public_base}/{parent_name}",
        "lastmod": utc_today().isoformat(),
        "files": files,
    }


def build_urls(site_url: str, books: list[BookEntry]) -> tuple[list[dict], list[dict]]:
    books_urls = [{
        "loc": f"{site_url}/",
        "lastmod": utc_today().isoformat(),
        "changefreq": "daily",
        "priority": "1.0",
    }]
    chapter_urls = []

    for book in books:
        books_urls.append({
            "loc": url_join(site_url, f"truyen/{book.seo_url}/"),
            "lastmod": book.lastmod.isoformat(),
            "changefreq": "weekly",
            "priority": "0.8",
        })

        for chapter_number in range(1, book.chapter_count + 1):
            chapter_urls.append({
                "loc": url_join(site_url, f"truyen/{book.seo_url}/chuong-{chapter_number}"),
                "lastmod": book.lastmod.isoformat(),
                "changefreq": "monthly",
                "priority": "0.7" if chapter_number == 1 else "0.6",
            })

    return books_urls, chapter_urls


def generate_sitemaps(site_url: str, output_dir: Path, index_paths: Iterable[Path]) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_books = load_json_books(index_paths)
    all_books = load_db_books(json_books)
    books = sorted(all_books.values(), key=lambda item: item.id)
    public_base = clean_site_url(site_url)

    books_urls, chapter_urls = build_urls(public_base, books)

    generated = []
    sitemap_groups = []

    books_result = write_url_sitemap(output_dir, public_base, "sitemap-books", books_urls)
    generated.extend(books_result["files"])
    sitemap_groups.append({
        "loc": books_result["loc"],
        "lastmod": books_result["lastmod"],
    })

    chapters_result = write_url_sitemap(output_dir, public_base, "sitemap-chapters", chapter_urls)
    generated.extend(chapters_result["files"])
    sitemap_groups.append({
        "loc": chapters_result["loc"],
        "lastmod": chapters_result["lastmod"],
    })

    write_text(output_dir / "sitemap.xml", sitemap_index_xml(sitemap_groups))
    generated.insert(0, "sitemap.xml")

    print(f"Generated {len(generated)} sitemap file(s)")
    print(f"Books: {len(books)}")
    print(f"Book URLs: {len(books_urls)}")
    print(f"Chapter URLs: {len(chapter_urls)}")

    return generated


def main():
    parser = argparse.ArgumentParser(description="Generate TruyenFullVn sitemap files.")
    parser.add_argument("--site-url", default=os.getenv("SITE_URL", "https://truyenfullvn.org"))
    parser.add_argument("--output-dir", default=str(ROOT_DIR))
    parser.add_argument(
        "--index-file",
        action="append",
        dest="index_files",
        help="Additional books-index JSON path. Can be passed multiple times.",
    )
    args = parser.parse_args()

    index_paths = list(DEFAULT_INDEX_FILES)

    if args.index_files:
        index_paths.extend(Path(path) for path in args.index_files)

    generate_sitemaps(
        site_url=args.site_url,
        output_dir=Path(args.output_dir),
        index_paths=index_paths,
    )


if __name__ == "__main__":
    main()
