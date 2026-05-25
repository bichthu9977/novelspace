import json
import re
from pathlib import Path

from database import SessionLocal
from models import Book, Chapter, Base
from database import engine

PROJECT_ROOT = Path(__file__).resolve().parent.parent

INDEX_FILES = [
    "books-index.json",
    "books-index-1.json",
    "books-index-2.json",
    "books-index-3.json",
    "books-index-4.json",
    "books-index-5.json",
    "books-index-6.json",
    "books-index-7.json",
    "books-index-8.json",
    "books-index-9.json",
    "books-index-10.json",
]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def chapter_number_from_title(title: str, fallback: int) -> int:
    if not title:
        return fallback

    match = re.search(r"\d+", title)
    if match:
        return int(match.group())

    return fallback


def import_books():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    imported_books = 0
    imported_chapters = 0
    skipped_books = 0
    errors = 0

    try:
        for index_name in INDEX_FILES:
            index_path = PROJECT_ROOT / index_name

            if not index_path.exists():
                print(f"➖ Bỏ qua, không thấy: {index_name}")
                continue

            print(f"\n📚 Đang đọc: {index_name}")
            books = load_json(index_path)

            if not isinstance(books, list):
                print(f"❌ File không phải array: {index_name}")
                continue

            for item in books:
                try:
                    book_id = int(item.get("id"))
                    old_book = db.query(Book).filter(Book.id == book_id).first()

                    if old_book:
                        skipped_books += 1
                        continue

                    book = Book(
                        id=book_id,
                        title=item.get("title", ""),
                        author=item.get("author", ""),
                        tags=item.get("tags", []),
                        popularity=int(item.get("popularity", 0) or 0),
                        desc=item.get("desc", ""),
                        chapter_count=int(item.get("chapterCount", 0) or 0),
                        cover=item.get("cover", ""),
                        file=item.get("file", ""),
                        seo_url=item.get("seoUrl", f"book-{book_id}"),
                    )

                    db.add(book)
                    db.commit()
                    imported_books += 1

                    book_file = item.get("file", "")
                    if not book_file:
                        continue

                    book_path = PROJECT_ROOT / book_file

                    if not book_path.exists():
                        print(f"⚠️ Không thấy file truyện: {book_file}")
                        continue

                    full_book = load_json(book_path)
                    chapters = full_book.get("chapters", [])

                    if not isinstance(chapters, list):
                        continue

                    for idx, ch in enumerate(chapters, start=1):
                        title = ch.get("title", f"Chương {idx}")
                        chapter_number = chapter_number_from_title(title, idx)

                        chapter = Chapter(
                            book_id=book_id,
                            chapter_number=chapter_number,
                            title=title,
                            content=ch.get("content", []),
                            audio_url=ch.get("audio", "") or ch.get("audio_url", "") or ch.get("audioUrl", ""),
                        )

                        db.add(chapter)
                        imported_chapters += 1

                    db.commit()

                except Exception as e:
                    db.rollback()
                    errors += 1
                    print(f"❌ Lỗi book {item.get('id')}: {e}")

        print("\n=== HOÀN TẤT IMPORT ===")
        print(f"✔ Books imported: {imported_books}")
        print(f"✔ Chapters imported: {imported_chapters}")
        print(f"➖ Books skipped: {skipped_books}")
        print(f"✘ Errors: {errors}")

    finally:
        db.close()


if __name__ == "__main__":
    import_books()