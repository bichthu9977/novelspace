import json
import glob
import os

print("🔧 Đang xử lý toàn bộ dữ liệu mới...")
print()

# 1. Fix tất cả data/books/*.json files
print("1️⃣  Fixing data/books/**/*.json files...")
book_files = glob.glob('data/books/**/*.json', recursive=True)

fixed_count = 0
for file_path in book_files:
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            book = json.load(f)

        book_id = book.get('id')
        if book_id:
            # Update cover to use new naming scheme
            book['cover'] = f'images/cover-{book_id}.webp'

            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(book, f, ensure_ascii=False, indent=2)

            fixed_count += 1
            if fixed_count % 1000 == 0:
                print(f"  ⏳ Processed {fixed_count} files...")
    except Exception as e:
        print(f"  ⚠️  Error with {file_path}: {e}")

print(f"  ✅ Fixed {fixed_count} book files")
print()

# 2. Regenerate books-index-seo.json từ tất cả book files
print("2️⃣  Regenerating books-index-seo.json...")

books_index = []
for file_path in sorted(book_files):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            book = json.load(f)

        # Create index entry
        index_entry = {
            'id': book.get('id'),
            'title': book.get('title', 'Unknown'),
            'author': book.get('author', ''),
            'tags': book.get('tags', []),
            'popularity': book.get('popularity', 0),
            'desc': book.get('desc', ''),
            'chapterCount': len(book.get('chapters', [])),
            'cover': f"images/cover-{book.get('id')}.webp",
            'file': file_path,
            'seoUrl': book.get('seoUrl', f"book-{book.get('id')}")
        }

        books_index.append(index_entry)
    except Exception as e:
        print(f"  ⚠️  Error reading {file_path}: {e}")

# Sort by ID
books_index.sort(key=lambda x: x['id'])

# Write new index
with open('books-index-seo.json', 'w', encoding='utf-8') as f:
    json.dump(books_index, f, ensure_ascii=False, indent=2)

print(f"  ✅ Created new books-index-seo.json with {len(books_index)} books")
print()

# Summary
print("=" * 50)
print("✅ HOÀN THÀNH!")
print("=" * 50)
print(f"📊 Thống kê:")
print(f"  • Books updated: {fixed_count}")
print(f"  • Books in index: {len(books_index)}")
print(f"  • Sample books:")
for book in books_index[:3]:
    print(f"    - ID {book['id']}: {book['title'][:50]}... → {book['cover']}")

print()
print("✨ Tất cả cover paths đã được fix!")
