import os
import json
import logging
from html import escape
from pathlib import Path
from fastapi import Header, Request, Response
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from models import User, Bookmark
from schemas import UserCreate, UserLogin, TokenResponse, BookmarkCreate
from models import ReadingProgress
from schemas import ReadingProgressCreate
from sqlalchemy import func, desc
from models import AnalyticsVisit, Comment, Notification
from schemas import CommentCreate

from database import SessionLocal, engine, get_db
from schemas import BookCreate, ChapterCreate
from models import Base, Book, Chapter
from cache import (
    CACHE_HOMEPAGE_TTL,
    CACHE_RECENT_TTL,
    CACHE_RELATED_TTL,
    CACHE_SEARCH_TTL,
    CACHE_TRENDING_TTL,
    get_or_set_json,
    invalidate_public_book_cache,
    make_cache_key,
)
from rate_limit import (
    BOOKMARK_RATE_LIMIT,
    COMMENT_RATE_LIMIT,
    LOGIN_RATE_LIMIT,
    REGISTER_RATE_LIMIT,
    limiter,
    setup_rate_limiting,
)
from security import get_client_ip, security_middleware
from schemas import (
    BookResponse,
    BookDetailResponse,
    ChapterResponse,
    BookCreate,
    ChapterCreate,
    BookUpdate,
    ChapterUpdate,
    NotificationResponse,
    SearchSuggestionResponse,
)

Base.metadata.create_all(bind=engine)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("truyenfullvn")

app = FastAPI(title="TruyenFullvn API")
setup_rate_limiting(app)
app.middleware("http")(security_middleware)


def should_track_visit(path: str, method: str) -> bool:
    if method != "GET":
        return False

    ignored_prefixes = (
        "/api",
        "/admin",
        "/frontend",
        "/images",
        "/data",
        "/static",
    )
    ignored_exact = {
        "/favicon.ico",
        "/robots.txt",
        "/sitemap.xml",
        "/script.js",
        "/style.css",
    }
    ignored_suffixes = (
        ".css",
        ".js",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".ico",
        ".svg",
        ".webp",
        ".avif",
        ".xml",
    )

    return (
        path not in ignored_exact
        and not path.startswith(ignored_prefixes)
        and not path.lower().endswith(ignored_suffixes)
    )


@app.middleware("http")
async def track_page_visits(request: Request, call_next):
    response = await call_next(request)

    if response.status_code < 400 and should_track_visit(request.url.path, request.method):
        db = SessionLocal()
        try:
            forwarded_for = request.headers.get("x-forwarded-for", "")
            client_ip = forwarded_for.split(",", 1)[0].strip()
            if not client_ip and request.client:
                client_ip = request.client.host

            db.add(AnalyticsVisit(
                path=request.url.path[:500],
                user_agent=(request.headers.get("user-agent") or "")[:500],
                ip=client_ip[:80],
            ))
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("Could not track analytics visit: %s", exc)
        finally:
            db.close()

    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://truyenfullvn.org",
        "https://www.truyenfullvn.org",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== FRONTEND STATIC FILES FOR HYBRID SSR =====
BACKEND_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BACKEND_DIR.parent

SITE_URL = os.getenv("SITE_URL", "http://127.0.0.1:8000").rstrip("/")
LEGACY_AUDIO_BASE_URL = "https://audio.truyenfullvn.org/"
AUDIO_BASE_URL = "https://audio.novel-space.com/"


def normalize_audio_url(url: str) -> str:
    if not url:
        return ""

    return str(url).strip().replace(LEGACY_AUDIO_BASE_URL, AUDIO_BASE_URL)

if (FRONTEND_DIR / "images").exists():
    app.mount("/images", StaticFiles(directory=str(FRONTEND_DIR / "images")), name="images")

if (FRONTEND_DIR / "data").exists():
    app.mount("/data", StaticFiles(directory=str(FRONTEND_DIR / "data")), name="data")

if (FRONTEND_DIR / "frontend").exists():
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR / "frontend")), name="frontend")


@app.get("/script.js", include_in_schema=False)
def serve_frontend_script():
    path = FRONTEND_DIR / "script.js"
    if not path.exists():
        raise HTTPException(status_code=404, detail="script.js not found")
    return FileResponse(path, media_type="application/javascript; charset=utf-8")


@app.get("/style.css", include_in_schema=False)
def serve_frontend_style():
    path = FRONTEND_DIR / "style.css"
    if not path.exists():
        raise HTTPException(status_code=404, detail="style.css not found")
    return FileResponse(path, media_type="text/css; charset=utf-8")


@app.get("/favicon.ico", include_in_schema=False)
def serve_favicon():
    path = FRONTEND_DIR / "favicon.ico"
    if not path.exists():
        raise HTTPException(status_code=404, detail="favicon.ico not found")
    return FileResponse(path)


@app.get("/admin-analytics.html", include_in_schema=False)
def serve_admin_analytics():
    path = FRONTEND_DIR / "admin-analytics.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="admin-analytics.html not found")
    return FileResponse(path, media_type="text/html; charset=utf-8")


def serve_sitemap_file(filename: str):
    path = FRONTEND_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=f"{filename} not found")
    return FileResponse(path, media_type="application/xml; charset=utf-8")


@app.get("/sitemap.xml", include_in_schema=False)
def serve_sitemap_index():
    return serve_sitemap_file("sitemap.xml")


@app.get("/sitemap-books.xml", include_in_schema=False)
def serve_sitemap_books():
    return serve_sitemap_file("sitemap-books.xml")


@app.get("/sitemap-chapters.xml", include_in_schema=False)
def serve_sitemap_chapters():
    return serve_sitemap_file("sitemap-chapters.xml")


@app.get("/sitemap-books-{chunk_number}.xml", include_in_schema=False)
def serve_sitemap_books_chunk(chunk_number: int):
    return serve_sitemap_file(f"sitemap-books-{chunk_number}.xml")


@app.get("/sitemap-chapters-{chunk_number}.xml", include_in_schema=False)
def serve_sitemap_chapters_chunk(chunk_number: int):
    return serve_sitemap_file(f"sitemap-chapters-{chunk_number}.xml")


load_dotenv()

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")

SECRET_KEY = os.getenv("SECRET_KEY", "truyenfullvn_secret_local")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(30 * 24 * 60)))
JWT_ISSUER = os.getenv("JWT_ISSUER", "").strip()
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "").strip()

if SECRET_KEY == "truyenfullvn_secret_local":
    logger.warning("Using local default SECRET_KEY. Set SECRET_KEY in production.")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str):
    return pwd_context.verify(password, password_hash)


def create_access_token(data: dict):
    to_encode = data.copy()
    now = datetime.utcnow()
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,
        "iat": now,
        "typ": "access",
    })
    if JWT_ISSUER:
        to_encode["iss"] = JWT_ISSUER
    if JWT_AUDIENCE:
        to_encode["aud"] = JWT_AUDIENCE
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        decode_kwargs = {
            "key": SECRET_KEY,
            "algorithms": [ALGORITHM],
            "options": {
                "verify_aud": bool(JWT_AUDIENCE),
                "verify_iss": bool(JWT_ISSUER),
            },
        }
        if JWT_AUDIENCE:
            decode_kwargs["audience"] = JWT_AUDIENCE
        if JWT_ISSUER:
            decode_kwargs["issuer"] = JWT_ISSUER

        payload = jwt.decode(token, **decode_kwargs)
        if payload.get("typ") and payload.get("typ") != "access":
            raise JWTError("Invalid token type")
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user

def verify_admin_token(x_admin_token: str = Header(None)):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=500, detail="ADMIN_TOKEN is not configured")

    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")

    return True


def serialize_book(book: Book) -> dict:
    return BookResponse.model_validate(book).model_dump(mode="json")


def serialize_books(books: list[Book]) -> list[dict]:
    return [serialize_book(book) for book in books]


def query_ranked_books(db: Session, limit: int):
    return db.query(Book).order_by(
        Book.views.desc(),
        Book.popularity.desc(),
        Book.id.desc()
    ).limit(limit).all()


def query_search_books(db: Session, keyword: str, limit: int):
    if not keyword:
        return query_ranked_books(db, limit)

    search_text = func.unaccent(
        func.concat(
            func.coalesce(Book.title, ""),
            " ",
            func.coalesce(Book.author, ""),
            " ",
            func.coalesce(Book.desc, "")
        )
    )

    query = func.plainto_tsquery("simple", func.unaccent(keyword))
    vector = func.to_tsvector("simple", search_text)
    rank = func.ts_rank_cd(vector, query)

    results = db.query(Book).filter(
        vector.op("@@")(query)
    ).order_by(
        rank.desc(),
        Book.views.desc(),
        Book.popularity.desc(),
        Book.id.desc()
    ).limit(limit).all()

    if results:
        return results

    fallback = f"%{keyword}%"

    return db.query(Book).filter(
        or_(
            Book.title.ilike(fallback),
            Book.author.ilike(fallback),
            Book.desc.ilike(fallback),
        )
    ).order_by(
        Book.views.desc(),
        Book.popularity.desc(),
        Book.id.desc()
    ).limit(limit).all()


def query_search_suggestions(db: Session, keyword: str, limit: int):
    safe_limit = min(max(int(limit or 8), 1), 12)
    keyword = (keyword or "").strip()

    if len(keyword) < 2:
        return []

    search_text = func.unaccent(
        func.concat(
            func.coalesce(Book.title, ""),
            " ",
            func.coalesce(Book.author, ""),
            " ",
            func.coalesce(Book.desc, "")
        )
    )
    query = func.plainto_tsquery("simple", func.unaccent(keyword))
    vector = func.to_tsvector("simple", search_text)
    rank = func.ts_rank_cd(vector, query)
    like_keyword = f"%{keyword}%"

    results = db.query(Book).filter(
        or_(
            vector.op("@@")(query),
            Book.title.ilike(like_keyword),
            Book.author.ilike(like_keyword),
        )
    ).order_by(
        rank.desc(),
        Book.views.desc(),
        Book.popularity.desc(),
        Book.id.desc()
    ).limit(safe_limit).all()

    suggestions = []
    keyword_lower = keyword.lower()
    for book in results:
        author = book.author or ""
        matched_field = "author" if keyword_lower in author.lower() else "title"
        suggestions.append({
            "id": book.id,
            "title": book.title or "",
            "author": author,
            "seo_url": book.seo_url or f"book-{book.id}",
            "cover": book.cover or "",
            "chapter_count": book.chapter_count or 0,
            "matched_field": matched_field,
        })

    return suggestions


def query_related_books(db: Session, book: Book, limit: int):
    tags = set(book.tags or [])
    candidates = query_ranked_books(db, max(limit * 8, 80))
    candidates = [item for item in candidates if item.id != book.id]

    if tags:
        candidates.sort(
            key=lambda item: (
                len(tags.intersection(set(item.tags or []))),
                item.views or 0,
                item.popularity or 0,
                item.id or 0,
            ),
            reverse=True,
        )

    return candidates[:limit]


def query_recently_updated_books(db: Session, page: int, limit: int):
    safe_page = max(int(page or 1), 1)
    safe_limit = min(max(int(limit or 12), 1), 50)
    offset = (safe_page - 1) * safe_limit

    latest_chapters = db.query(
        Chapter.book_id.label("book_id"),
        func.max(Chapter.created_at).label("latest_chapter_at"),
    ).group_by(Chapter.book_id).subquery()

    return db.query(Book).outerjoin(
        latest_chapters,
        Book.id == latest_chapters.c.book_id,
    ).order_by(
        latest_chapters.c.latest_chapter_at.desc().nullslast(),
        Book.created_at.desc(),
        Book.id.desc(),
    ).offset(offset).limit(safe_limit).all()


def create_notification(
    db: Session,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    payload: dict | None = None,
):
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        payload=payload or {},
    )
    db.add(notification)
    return notification


def notify_bookmark_users_about_new_chapter(db: Session, book: Book, chapter: Chapter):
    user_ids = [
        user_id for (user_id,) in db.query(Bookmark.user_id)
        .filter(Bookmark.book_id == book.id)
        .distinct()
        .all()
    ]

    for user_id in user_ids:
        create_notification(
            db,
            user_id=user_id,
            notification_type="new_chapter",
            title="Truyện bạn lưu có chương mới",
            message=f"{book.title or 'Truyện'} vừa cập nhật chương {chapter.chapter_number}.",
            payload={
                "book_id": book.id,
                "book_title": book.title,
                "chapter_number": chapter.chapter_number,
                "seo_url": book.seo_url or f"book-{book.id}",
            },
        )


def notify_comment_participants(db: Session, book: Book, comment: Comment, current_user: User):
    user_ids = [
        user_id for (user_id,) in db.query(Comment.user_id)
        .filter(
            Comment.book_id == book.id,
            Comment.user_id != current_user.id,
        )
        .distinct()
        .all()
    ]

    for user_id in user_ids:
        create_notification(
            db,
            user_id=user_id,
            notification_type="comment_reply",
            title="Có bình luận mới",
            message=f"{current_user.email} vừa bình luận trong {book.title or 'truyện bạn theo dõi'}.",
            payload={
                "book_id": book.id,
                "book_title": book.title,
                "comment_id": comment.id,
                "seo_url": book.seo_url or f"book-{book.id}",
            },
        )


@app.get("/")
def home():
    return {"message": "TruyenFullvn API is running"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/search", response_model=list[BookResponse])
def search_books(
    q: str = "",
    limit: int = 50,
    db: Session = Depends(get_db)
):
    keyword = q.strip()
    cache_key = make_cache_key("search", q=keyword, limit=limit)

    return get_or_set_json(
        cache_key,
        CACHE_SEARCH_TTL,
        lambda: serialize_books(query_search_books(db, keyword, limit)),
    )


@app.get("/api/search/suggest", response_model=list[SearchSuggestionResponse])
def suggest_search_books(
    q: str = "",
    limit: int = 8,
    db: Session = Depends(get_db)
):
    keyword = q.strip()
    safe_limit = min(max(int(limit or 8), 1), 12)
    cache_key = make_cache_key("search", kind="suggest", q=keyword, limit=safe_limit)

    return get_or_set_json(
        cache_key,
        CACHE_SEARCH_TTL,
        lambda: query_search_suggestions(db, keyword, safe_limit),
    )


@app.get("/api/ranking", response_model=list[BookResponse])
def get_ranking(limit: int = 10, db: Session = Depends(get_db)):
    return db.query(Book).order_by(
        Book.views.desc(),
        Book.popularity.desc(),
        Book.id.desc()
    ).limit(limit).all()

@app.get("/api/trending", response_model=list[BookResponse])
def get_trending_books(limit: int = 20, db: Session = Depends(get_db)):
    cache_key = make_cache_key("trending", limit=limit)

    return get_or_set_json(
        cache_key,
        CACHE_TRENDING_TTL,
        lambda: serialize_books(query_ranked_books(db, limit)),
    )


@app.get("/api/recently-updated", response_model=list[BookResponse])
def get_recently_updated_books(
    page: int = 1,
    limit: int = 12,
    db: Session = Depends(get_db)
):
    safe_page = max(int(page or 1), 1)
    safe_limit = min(max(int(limit or 12), 1), 50)
    cache_key = make_cache_key("recent", page=safe_page, limit=safe_limit)

    return get_or_set_json(
        cache_key,
        CACHE_RECENT_TTL,
        lambda: serialize_books(query_recently_updated_books(db, safe_page, safe_limit)),
    )


@app.get("/api/books/{book_id}/related", response_model=list[BookResponse])
def get_related_books(book_id: int, limit: int = 12, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    cache_key = make_cache_key("related", book_id=book_id, limit=limit)

    return get_or_set_json(
        cache_key,
        CACHE_RELATED_TTL,
        lambda: serialize_books(query_related_books(db, book, limit)),
    )


@app.get("/api/homepage")
def get_homepage_data(db: Session = Depends(get_db)):
    cache_key = make_cache_key("homepage", version=2)

    return get_or_set_json(
        cache_key,
        CACHE_HOMEPAGE_TTL,
        lambda: {
            "trending": serialize_books(query_ranked_books(db, 20)),
            "ranking": serialize_books(query_ranked_books(db, 10)),
            "recently_updated": serialize_books(query_recently_updated_books(db, 1, 12)),
        },
    )


@app.get("/api/books/{book_id}", response_model=BookDetailResponse)
def get_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    book.views = (book.views or 0) + 1
    db.commit()
    db.refresh(book)

    return book

@app.get("/api/books/{book_id}/chapters/{chapter_number}", response_model=ChapterResponse)
def get_chapter(book_id: int, chapter_number: int, db: Session = Depends(get_db)):
    chapter = db.query(Chapter).filter(
        Chapter.book_id == book_id,
        Chapter.chapter_number == chapter_number
    ).first()

    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    return chapter

@app.post("/api/admin/books", response_model=BookResponse)
def create_book(
    book_data: BookCreate,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    old_book = db.query(Book).filter(Book.id == book_data.id).first()

    if old_book:
        raise HTTPException(status_code=400, detail="Book ID already exists")

    book = Book(
        id=book_data.id,
        title=book_data.title,
        author=book_data.author,
        tags=book_data.tags,
        popularity=book_data.popularity,
        desc=book_data.desc,
        chapter_count=book_data.chapter_count,
        cover=book_data.cover,
        file=book_data.file,
        seo_url=book_data.seo_url or f"book-{book_data.id}",
    )

    db.add(book)
    db.commit()
    db.refresh(book)
    invalidate_public_book_cache()

    return book

@app.post("/api/admin/books/{book_id}/chapters", response_model=ChapterResponse)
def create_chapter(
    book_id: int,
    chapter_data: ChapterCreate,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    book = db.query(Book).filter(Book.id == book_id).first()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    old_chapter = db.query(Chapter).filter(
        Chapter.book_id == book_id,
        Chapter.chapter_number == chapter_data.chapter_number
    ).first()

    if old_chapter:
        raise HTTPException(status_code=400, detail="Chapter already exists")

    chapter = Chapter(
        book_id=book_id,
        chapter_number=chapter_data.chapter_number,
        title=chapter_data.title,
        content=chapter_data.content,
        audio_url=chapter_data.audio_url,
    )

    db.add(chapter)

    book.chapter_count += 1
    notify_bookmark_users_about_new_chapter(db, book, chapter)

    db.commit()
    db.refresh(chapter)
    invalidate_public_book_cache()

    return chapter

@app.put("/api/admin/books/{book_id}", response_model=BookResponse)
def update_book(
    book_id: int,
    book_data: BookUpdate,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    book = db.query(Book).filter(Book.id == book_id).first()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    update_data = book_data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(book, key, value)

    db.commit()
    db.refresh(book)
    invalidate_public_book_cache()

    return book

@app.delete("/api/admin/books/{book_id}")
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    book = db.query(Book).filter(Book.id == book_id).first()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    db.delete(book)
    db.commit()
    invalidate_public_book_cache()

    return {"message": "Book deleted", "book_id": book_id}

@app.put("/api/admin/books/{book_id}/chapters/{chapter_number}", response_model=ChapterResponse)
def update_chapter(
    book_id: int,
    chapter_number: int,
    chapter_data: ChapterUpdate,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    chapter = db.query(Chapter).filter(
        Chapter.book_id == book_id,
        Chapter.chapter_number == chapter_number
    ).first()

    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    update_data = chapter_data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(chapter, key, value)

    db.commit()
    db.refresh(chapter)
    invalidate_public_book_cache()

    return chapter

@app.delete("/api/admin/books/{book_id}/chapters/{chapter_number}")
def delete_chapter(
    book_id: int,
    chapter_number: int,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    chapter = db.query(Chapter).filter(
        Chapter.book_id == book_id,
        Chapter.chapter_number == chapter_number
    ).first()

    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    book = db.query(Book).filter(Book.id == book_id).first()

    db.delete(chapter)

    if book and book.chapter_count > 0:
        book.chapter_count -= 1

    db.commit()
    invalidate_public_book_cache()

    return {
        "message": "Chapter deleted",
        "book_id": book_id,
        "chapter_number": chapter_number
    }

@app.post("/api/register", response_model=TokenResponse)
@limiter.limit(REGISTER_RATE_LIMIT)
def register(request: Request, response: Response, user_data: UserCreate, db: Session = Depends(get_db)):
    email = (user_data.email or "").strip().lower()

    if not email:
        logger.warning("Register rejected: missing email ip=%s", get_client_ip(request))
        raise HTTPException(status_code=400, detail="Vui lòng nhập email")

    old_user = db.query(User).filter(func.lower(User.email) == email).first()

    if old_user:
        logger.warning("Register rejected: duplicate email ip=%s email=%s", get_client_ip(request), email)
        raise HTTPException(status_code=400, detail="Email đã tồn tại")

    user = User(
        email=email,
        password_hash=hash_password(user_data.password)
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        logger.warning("Register rejected: duplicate email race ip=%s email=%s", get_client_ip(request), email)
        raise HTTPException(status_code=400, detail="Email đã tồn tại")
    except Exception:
        db.rollback()
        logger.exception("Register failed ip=%s email=%s", get_client_ip(request), email)
        raise HTTPException(status_code=500, detail="Không tạo được tài khoản, vui lòng thử lại")

    token = create_access_token({"sub": str(user.id)})

    return {"access_token": token, "token_type": "bearer"}


@app.post("/api/login", response_model=TokenResponse)
@limiter.limit(LOGIN_RATE_LIMIT)
def login(request: Request, response: Response, user_data: UserLogin, db: Session = Depends(get_db)):
    email = (user_data.email or "").strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(user_data.password, user.password_hash):
        logger.warning("Login failed ip=%s email=%s", get_client_ip(request), email)
        raise HTTPException(status_code=401, detail="Wrong email or password")

    token = create_access_token({"sub": str(user.id)})

    return {"access_token": token, "token_type": "bearer"}


@app.get("/api/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email
    }


@app.get("/api/notifications", response_model=list[NotificationResponse])
def get_notifications(
    limit: int = 20,
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    safe_limit = min(max(int(limit or 20), 1), 100)
    query = db.query(Notification).filter(Notification.user_id == current_user.id)

    if unread_only:
        query = query.filter(Notification.read_at.is_(None))

    return query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(safe_limit).all()


@app.get("/api/notifications/unread-count")
def get_notifications_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read_at.is_(None),
    ).count()

    return {"unread": count}


@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    if not notification.read_at:
        notification.read_at = datetime.utcnow()
        db.commit()

    return {"message": "Notification marked as read", "id": notification_id}


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    updated = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read_at.is_(None),
    ).update({Notification.read_at: datetime.utcnow()}, synchronize_session=False)

    db.commit()

    return {"message": "Notifications marked as read", "updated": updated}


@app.post("/api/bookmarks")
@limiter.limit(BOOKMARK_RATE_LIMIT)
def add_bookmark(
    request: Request,
    response: Response,
    bookmark_data: BookmarkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    book = db.query(Book).filter(Book.id == bookmark_data.book_id).first()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    old = db.query(Bookmark).filter(
        Bookmark.user_id == current_user.id,
        Bookmark.book_id == bookmark_data.book_id
    ).first()

    if old:
        old.chapter_number = bookmark_data.chapter_number
        create_notification(
            db,
            user_id=current_user.id,
            notification_type="bookmark_update",
            title="Tủ sách đã cập nhật",
            message=f"Đã cập nhật vị trí đọc của {book.title or 'truyện'} đến chương {bookmark_data.chapter_number}.",
            payload={
                "book_id": book.id,
                "book_title": book.title,
                "chapter_number": bookmark_data.chapter_number,
                "seo_url": book.seo_url or f"book-{book.id}",
            },
        )
        db.commit()
        return {"message": "Bookmark updated"}

    bookmark = Bookmark(
        user_id=current_user.id,
        book_id=bookmark_data.book_id,
        chapter_number=bookmark_data.chapter_number
    )

    db.add(bookmark)
    create_notification(
        db,
        user_id=current_user.id,
        notification_type="bookmark_update",
        title="Đã lưu truyện",
        message=f"{book.title or 'Truyện'} đã được thêm vào tủ sách.",
        payload={
            "book_id": book.id,
            "book_title": book.title,
            "chapter_number": bookmark_data.chapter_number,
            "seo_url": book.seo_url or f"book-{book.id}",
        },
    )
    db.commit()

    return {"message": "Bookmark added"}


@app.get("/api/bookmarks")
def get_bookmarks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    bookmarks = db.query(Bookmark).filter(
        Bookmark.user_id == current_user.id
    ).all()

    return bookmarks


@app.delete("/api/bookmarks/{book_id}")
@limiter.limit(BOOKMARK_RATE_LIMIT)
def delete_bookmark(
    request: Request,
    response: Response,
    book_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    bookmark = db.query(Bookmark).filter(
        Bookmark.user_id == current_user.id,
        Bookmark.book_id == book_id
    ).first()

    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    db.delete(bookmark)
    db.commit()

    return {"message": "Bookmark deleted"}

@app.post("/api/progress")
def save_progress(
    progress_data: ReadingProgressCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    book = db.query(Book).filter(Book.id == progress_data.book_id).first()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    progress = db.query(ReadingProgress).filter(
        ReadingProgress.user_id == current_user.id,
        ReadingProgress.book_id == progress_data.book_id
    ).first()

    if progress:
        progress.chapter_number = progress_data.chapter_number
        progress.updated_at = datetime.utcnow()
    else:
        progress = ReadingProgress(
            user_id=current_user.id,
            book_id=progress_data.book_id,
            chapter_number=progress_data.chapter_number
        )
        db.add(progress)

    db.commit()

    return {"message": "Progress saved"}


@app.get("/api/progress")
def get_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    progress_items = db.query(ReadingProgress).filter(
        ReadingProgress.user_id == current_user.id
    ).all()

    return progress_items


@app.get("/api/me/library")
def get_my_library(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    bookmarks = db.query(Bookmark).filter(
        Bookmark.user_id == current_user.id
    ).all()

    progress_items = db.query(ReadingProgress).filter(
        ReadingProgress.user_id == current_user.id
    ).all()

    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email
        },
        "bookmarks": bookmarks,
        "progress": progress_items
    }

@app.get("/api/books/{book_id}/comments")
def get_book_comments(
    book_id: int,
    db: Session = Depends(get_db)
):
    comments = db.query(Comment).filter(
        Comment.book_id == book_id
    ).order_by(Comment.created_at.desc()).limit(100).all()

    return comments


@app.post("/api/comments")
@limiter.limit(COMMENT_RATE_LIMIT)
def create_book_comment(
    request: Request,
    response: Response,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    content = comment_data.content.strip()

    if not content:
        raise HTTPException(status_code=400, detail="Comment is empty")

    if len(content) > 1000:
        raise HTTPException(status_code=400, detail="Comment too long")

    book = db.query(Book).filter(Book.id == comment_data.book_id).first()

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    comment = Comment(
        user_id=current_user.id,
        book_id=comment_data.book_id,
        content=content
    )

    db.add(comment)
    db.flush()
    notify_comment_participants(db, book, comment, current_user)
    db.commit()
    db.refresh(comment)

    return comment



# ===== ADMIN COMMENT MODERATION =====
@app.get("/api/admin/comments")
def admin_get_comments(
    skip: int = 0,
    limit: int = 50,
    book_id: int | None = None,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    query = db.query(Comment)
    if book_id:
        query = query.filter(Comment.book_id == book_id)

    total = query.count()
    comments = query.order_by(Comment.created_at.desc()).offset(skip).limit(min(max(limit, 1), 200)).all()

    items = []
    for comment in comments:
        book = db.query(Book).filter(Book.id == comment.book_id).first()
        user = db.query(User).filter(User.id == comment.user_id).first()
        items.append({
            "id": comment.id,
            "book_id": comment.book_id,
            "book_title": book.title if book else f"Book #{comment.book_id}",
            "user_id": comment.user_id,
            "user_email": user.email if user else f"user_{comment.user_id}",
            "content": comment.content,
            "likes": comment.likes or 0,
            "created_at": comment.created_at.isoformat() if comment.created_at else None
        })

    return {"total": total, "skip": skip, "limit": limit, "items": items}


@app.delete("/api/admin/comments/{comment_id}")
def admin_delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    db.delete(comment)
    db.commit()

    return {"message": "Comment deleted", "comment_id": comment_id}


# ===== ADMIN ANALYTICS =====
@app.get("/api/admin/analytics")
def admin_get_analytics(
    days: int = 14,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    safe_days = min(max(int(days or 14), 1), 90)
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=safe_days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time())

    visit_rows = db.query(
        func.date(AnalyticsVisit.created_at).label("day"),
        func.count(AnalyticsVisit.id).label("visits"),
    ).filter(
        AnalyticsVisit.created_at >= start_dt
    ).group_by(
        func.date(AnalyticsVisit.created_at)
    ).all()
    visits_by_day = {str(row.day): int(row.visits or 0) for row in visit_rows}

    registration_rows = db.query(
        func.date(User.created_at).label("day"),
        func.count(User.id).label("registrations"),
    ).filter(
        User.created_at >= start_dt
    ).group_by(
        func.date(User.created_at)
    ).all()
    registrations_by_day = {str(row.day): int(row.registrations or 0) for row in registration_rows}

    comment_rows = db.query(
        func.date(Comment.created_at).label("day"),
        func.count(Comment.id).label("comments"),
    ).filter(
        Comment.created_at >= start_dt
    ).group_by(
        func.date(Comment.created_at)
    ).all()
    comments_by_day = {str(row.day): int(row.comments or 0) for row in comment_rows}

    daily = []
    for offset in range(safe_days):
        day = start_date + timedelta(days=offset)
        key = day.isoformat()
        daily.append({
            "date": key,
            "visits": visits_by_day.get(key, 0),
            "registrations": registrations_by_day.get(key, 0),
            "comments": comments_by_day.get(key, 0),
        })

    top_books = db.query(Book).order_by(
        Book.views.desc(),
        Book.popularity.desc(),
        Book.id.desc()
    ).limit(10).all()

    top_chapter_rows = db.query(
        ReadingProgress.book_id.label("book_id"),
        ReadingProgress.chapter_number.label("chapter_number"),
        func.count(ReadingProgress.id).label("reads"),
    ).group_by(
        ReadingProgress.book_id,
        ReadingProgress.chapter_number,
    ).order_by(
        desc("reads")
    ).limit(10).all()

    top_chapters = []
    for row in top_chapter_rows:
        book = db.query(Book).filter(Book.id == row.book_id).first()
        chapter = db.query(Chapter).filter(
            Chapter.book_id == row.book_id,
            Chapter.chapter_number == row.chapter_number,
        ).first()
        top_chapters.append({
            "book_id": row.book_id,
            "book_title": book.title if book else f"Book #{row.book_id}",
            "chapter_number": row.chapter_number,
            "chapter_title": chapter.title if chapter else f"Chương {row.chapter_number}",
            "reads": int(row.reads or 0),
        })

    comment_stats = {
        "total": db.query(Comment).count(),
        "last_24h": db.query(Comment).filter(Comment.created_at >= datetime.utcnow() - timedelta(days=1)).count(),
        "last_7d": db.query(Comment).filter(Comment.created_at >= datetime.utcnow() - timedelta(days=7)).count(),
    }

    return {
        "range": {
            "days": safe_days,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
        "summary": {
            "total_visits": db.query(AnalyticsVisit).count(),
            "total_books": db.query(Book).count(),
            "total_chapters": db.query(Chapter).count(),
            "total_users": db.query(User).count(),
            "total_comments": comment_stats["total"],
        },
        "daily": daily,
        "top_books": [
            {
                "id": book.id,
                "title": book.title or "Không có tên",
                "author": book.author or "Chưa rõ",
                "views": book.views or 0,
                "popularity": book.popularity or 0,
                "chapter_count": book.chapter_count or 0,
            }
            for book in top_books
        ],
        "top_chapters": top_chapters,
        "comments": comment_stats,
    }


# ===== ADMIN USER MANAGEMENT =====
@app.get("/api/admin/users")
def admin_get_users(
    skip: int = 0,
    limit: int = 50,
    q: str = "",
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    query = db.query(User)

    keyword = (q or "").strip()
    if keyword:
        query = query.filter(User.email.ilike(f"%{keyword}%"))

    total = query.count()
    users = query.order_by(User.id.desc()).offset(skip).limit(min(max(limit, 1), 200)).all()

    items = []
    for user in users:
        comment_count = db.query(Comment).filter(Comment.user_id == user.id).count()
        bookmark_count = db.query(Bookmark).filter(Bookmark.user_id == user.id).count()

        progress_count = db.query(ReadingProgress).filter(ReadingProgress.user_id == user.id).count()

        items.append({
            "id": user.id,
            "email": user.email,
            "created_at": user.created_at.isoformat() if getattr(user, "created_at", None) else None,
            "comment_count": comment_count,
            "bookmark_count": bookmark_count,
            "progress_count": progress_count
        })

    return {"total": total, "skip": skip, "limit": limit, "items": items}


@app.get("/api/admin/users/{user_id}")
def admin_get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    def book_title(book_id):
        book = db.query(Book).filter(Book.id == book_id).first()
        return book.title if book else f"Book #{book_id}"

    comments = db.query(Comment).filter(Comment.user_id == user_id).order_by(Comment.created_at.desc()).limit(50).all()
    bookmarks = db.query(Bookmark).filter(Bookmark.user_id == user_id).order_by(Bookmark.created_at.desc()).limit(50).all()

    progress_items = db.query(ReadingProgress).filter(ReadingProgress.user_id == user_id).order_by(ReadingProgress.updated_at.desc()).limit(50).all()

    return {
        "id": user.id,
        "email": user.email,
        "created_at": user.created_at.isoformat() if getattr(user, "created_at", None) else None,
        "comments": [
            {
                "id": item.id,
                "book_id": item.book_id,
                "book_title": book_title(item.book_id),
                "content": item.content,
                "created_at": item.created_at.isoformat() if item.created_at else None
            }
            for item in comments
        ],
        "bookmarks": [
            {
                "id": item.id,
                "book_id": item.book_id,
                "book_title": book_title(item.book_id),
                "chapter_number": getattr(item, "chapter_number", 1),
                "created_at": item.created_at.isoformat() if getattr(item, "created_at", None) else None
            }
            for item in bookmarks
        ],
        "progress": [
            {
                "id": item.id,
                "book_id": item.book_id,
                "book_title": book_title(item.book_id),
                "chapter_number": item.chapter_number,
                "updated_at": item.updated_at.isoformat() if getattr(item, "updated_at", None) else None
            }
            for item in progress_items
        ]
    }


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    delete_content: bool = True,
    db: Session = Depends(get_db),
    admin_ok: bool = Depends(verify_admin_token)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    deleted = {"comments": 0, "bookmarks": 0, "progress": 0, "notifications": 0, "user": user_id}

    comments = db.query(Comment).filter(Comment.user_id == user_id).all()
    bookmarks = db.query(Bookmark).filter(Bookmark.user_id == user_id).all()
    progress_items = db.query(ReadingProgress).filter(ReadingProgress.user_id == user_id).all()
    notifications = db.query(Notification).filter(Notification.user_id == user_id).all()

    if delete_content:
        deleted["comments"] = len(comments)
        for item in comments:
            db.delete(item)

        deleted["bookmarks"] = len(bookmarks)
        for item in bookmarks:
            db.delete(item)

        deleted["progress"] = len(progress_items)
        for item in progress_items:
            db.delete(item)

    deleted["notifications"] = len(notifications)
    for item in notifications:
        db.delete(item)

    db.delete(user)
    db.commit()

    return {"message": "User deleted", "deleted": deleted}

def _safe_text(value, fallback=""):
    text = fallback if value is None else str(value)
    return escape(text, quote=True)


def _truncate_meta(value, limit=155):
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(".,;:") + "..."


def _absolute_asset_url(path):
    value = str(path or "").strip()
    if value.startswith(("http://", "https://")):
        return value
    return f"{SITE_URL}/{value.lstrip('/') or 'images/default.jpg'}"


def _chapter_content_html(content):
    if isinstance(content, list):
        paragraphs = [str(item).strip() for item in content if str(item).strip()]
    elif isinstance(content, str) and content.strip():
        paragraphs = [line.strip() for line in content.splitlines() if line.strip()]
    else:
        paragraphs = []

    if not paragraphs:
        return "<p>Chương này chưa có nội dung.</p>"

    return "\n".join(f"<p>{_safe_text(p)}</p>" for p in paragraphs)


def _book_tags_html(tags):
    if not isinstance(tags, list):
        return ""
    return "".join(f'<span class="tag">{_safe_text(tag)}</span>' for tag in tags[:8])


def _make_chapter_url(book, chapter_number: int):
    seo_url = book.seo_url or f"book-{book.id}"
    return f"/truyen/{seo_url}/chuong-{chapter_number}"


def _render_hybrid_chapter_html(book, chapter, chapter_number: int, total_chapters: int, page_kind="chapter"):
    title = book.title or "Không có tên"
    author = book.author or "Chưa rõ"
    chapter_title = chapter.title or f"Chương {chapter_number}"
    book_desc = book.desc or f"Đọc truyện {title} online tại TruyenFullvn."
    cover = book.cover or "images/default.jpg"
    cover_url = _absolute_asset_url(cover)
    book_url = f"/truyen/{book.seo_url or f'book-{book.id}'}"
    chapter_url = _make_chapter_url(book, chapter_number)
    canonical_path = book_url if page_kind == "book" else chapter_url
    canonical = f"{SITE_URL}{canonical_path}"
    prev_url = _make_chapter_url(book, chapter_number - 1) if chapter_number > 1 else ""
    next_url = _make_chapter_url(book, chapter_number + 1) if chapter_number < total_chapters else ""
    audio_url = normalize_audio_url(getattr(chapter, "audio_url", "") or "")
    content_html = _chapter_content_html(chapter.content)
    tags_html = _book_tags_html(book.tags)
    tags = book.tags if isinstance(book.tags, list) else []
    tags_text = ", ".join(str(tag) for tag in tags[:8])

    if page_kind == "book":
        meta_title = f"{title} - Đọc truyện online | TruyenFullvn"
        meta_description = _truncate_meta(
            book_desc or f"Đọc truyện {title} của {author} online, cập nhật nhanh tại TruyenFullvn."
        )
        og_type = "book"
        structured_data = {
            "@context": "https://schema.org",
            "@type": "Book",
            "name": title,
            "description": meta_description,
            "author": {"@type": "Person", "name": author},
            "image": cover_url,
            "url": canonical,
            "inLanguage": "vi",
            "numberOfPages": int(total_chapters or 0),
        }
    else:
        meta_title = f"{title} - {chapter_title} | TruyenFullvn"
        meta_description = _truncate_meta(
            f"{book_desc} Đọc {chapter_title} của truyện {title} online tại TruyenFullvn."
        )
        og_type = "article"
        structured_data = {
            "@context": "https://schema.org",
            "@type": "Chapter",
            "name": f"{title} - {chapter_title}",
            "isPartOf": {
                "@type": "Book",
                "name": title,
                "author": {"@type": "Person", "name": author},
                "url": f"{SITE_URL}{book_url}",
            },
            "position": int(chapter_number),
            "url": canonical,
            "inLanguage": "vi",
        }

    page_data = {
        "mode": page_kind,
        "bookId": int(book.id),
        "chapterNumber": int(chapter_number),
        "seoUrl": book.seo_url or f"book-{book.id}",
    }

    if audio_url:
        audio_html = f"""
        <section class="chapter-media has-media" id="chapterMedia">
          <div class="chapter-media-head">
            <div>
              <div class="chapter-media-kicker">🎧 Nghe audio</div>
              <div class="chapter-media-title">{_safe_text(title)} • {_safe_text(chapter_title)}</div>
            </div>
            <span class="chapter-media-badge">Audio</span>
          </div>
          <audio id="chapterAudio" class="chapter-audio" controls preload="metadata" src="{_safe_text(audio_url)}"></audio>
          <div class="audio-tools">
            <label>
              Tốc độ nghe
              <select id="audioSpeedSelect">
                <option value="0.75">0.75x</option>
                <option value="1">1x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
              </select>
            </label>
          </div>
        </section>
        """
    else:
        audio_html = f"""
        <section class="chapter-media is-demo" id="chapterMedia">
          <div class="chapter-media-head">
            <div>
              <div class="chapter-media-kicker">🎧 Nghe audio</div>
              <div class="chapter-media-title">{_safe_text(title)} • {_safe_text(chapter_title)}</div>
            </div>
            <span class="chapter-media-badge">Demo audio</span>
          </div>
          <audio id="chapterAudio" class="chapter-audio" controls preload="metadata"></audio>
          <div class="chapter-media-note">Audio đang trong quá trình xử lý</div>
        </section>
        """

    prev_button = (
        f'<a class="ghost-btn" id="prevChapterBtn" href="{prev_url}">← Chương trước</a>'
        if prev_url else
        '<button class="ghost-btn" id="prevChapterBtn" type="button" disabled>← Chương trước</button>'
    )
    next_button = (
        f'<a class="solid-btn" id="nextChapterBtn" href="{next_url}">Chương tiếp →</a>'
        if next_url else
        '<button class="solid-btn" id="nextChapterBtn" type="button" disabled>Chương tiếp →</button>'
    )

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{_safe_text(meta_title)}</title>
  <meta name="description" content="{_safe_text(meta_description)}" />
  <meta name="keywords" content="{_safe_text(tags_text)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="{_safe_text(canonical)}" />
  <meta property="og:site_name" content="TruyenFullvn" />
  <meta property="og:title" content="{_safe_text(meta_title)}" />
  <meta property="og:description" content="{_safe_text(meta_description)}" />
  <meta property="og:type" content="{_safe_text(og_type)}" />
  <meta property="og:url" content="{_safe_text(canonical)}" />
  <meta property="og:image" content="{_safe_text(cover_url)}" />
  <meta property="og:locale" content="vi_VN" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{_safe_text(meta_title)}" />
  <meta name="twitter:description" content="{_safe_text(meta_description)}" />
  <meta name="twitter:image" content="{_safe_text(cover_url)}" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="stylesheet" href="/style.css?v=20260528-tablet-width" />
  <script>window.TRUYENFULLVN_PAGE = {json.dumps(page_data, ensure_ascii=False)};</script>
  <script type="application/ld+json">{json.dumps(structured_data, ensure_ascii=False)}</script>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" id="homeBtn" href="/">TRUYENFULLVN</a>
      <div class="topbar-actions-mobile">
        <button id="mobileSearchToggle" class="icon-btn mobile-only" type="button" aria-label="Mở tìm kiếm" aria-expanded="false"></button>
        <button id="mobileMenuToggle" class="icon-btn mobile-only" type="button" aria-label="Mở menu" aria-expanded="false"></button>
      </div>
      <div class="search-wrap" id="searchWrap">
        <input id="searchInput" type="text" placeholder="Tìm truyện, tác giả, tag..." />
        <button id="searchBtn" type="button">Tìm</button>
      </div>
      <nav class="nav" id="mainNav">
        <a href="/" id="homeLink">Trang chủ</a>
        <a href="#" id="shelfLink">Tủ sách</a>
        <div class="notification-wrap hidden">
          <button id="notificationBell" class="notification-bell" type="button" aria-label="Thông báo" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span id="notificationBadge" class="notification-badge hidden">0</span>
          </button>
          <div id="notificationDropdown" class="notification-dropdown hidden" aria-hidden="true">
            <div class="notification-head">
              <strong>Thông báo</strong>
              <button id="notificationMarkAllBtn" type="button">Đã đọc hết</button>
            </div>
            <div id="notificationList" class="notification-list">
              <div class="notification-empty">Đăng nhập để xem thông báo.</div>
            </div>
          </div>
        </div>
        <a href="#" id="loginLink">Đăng nhập</a>
        <a href="#" id="logoutLink" class="hidden">Đăng xuất</a>
      </nav>
    </div>
  </header>
  <main>
    <section id="homeView" class="layout hidden">
      <section class="content">
        <div class="panel books-panel" id="booksSection">
          <div class="section-title section-title-main" id="booksPanelTitle">Kho truyện nổi bật</div>
          <div class="books-grid" id="booksGrid"></div>
          <div class="pagination" id="pagination"></div>
        </div>
        <section class="panel recent-updated-panel" id="recentUpdatedSection" aria-labelledby="recentUpdatedTitle">
          <div class="recent-updated-head">
            <div>
              <h2 class="section-title section-title-main" id="recentUpdatedTitle">Truyện mới cập nhật</h2>
              <p>Những truyện vừa có chương mới, sắp xếp theo lần cập nhật gần nhất.</p>
            </div>
            <button class="ghost-btn" id="recentUpdatedMoreBtn" type="button">Xem thêm</button>
          </div>
          <div class="recent-updated-scroll" id="recentUpdatedGrid"></div>
        </section>
      </section>
    </section>
    <section id="readerView" class="reader-shell active">
      <article class="reader-panel">
        <div class="reader-top">
          <div>
            <h1 class="reader-title" id="readerTitle">{_safe_text(title)}</h1>
            <div class="reader-sub" id="readerMeta">{_safe_text(author)} • {_safe_text(chapter_title)}</div>
          </div>
          <a class="ghost-btn" id="backBtn" href="/">← Quay lại danh sách</a>
        </div>
        <div class="reader-book-header">
          <img id="readerCover" class="reader-cover" src="/{_safe_text(cover).lstrip('/')}" alt="Bìa {_safe_text(title)}" />
          <div class="reader-book-info">
            <div class="reader-book-author" id="readerAuthor">Tác giả: {_safe_text(author)}</div>
            <div class="reader-book-tags" id="readerTags">{tags_html}</div>
            <div class="reader-book-desc" id="readerDesc">{_safe_text(book_desc)}</div>
          </div>
        </div>
        <div class="reader-controls">
          <label>Cỡ chữ <input id="fontSizeRange" type="range" min="16" max="28" value="20" /></label>
          <label>Độ rộng dòng <input id="readerWidthRange" type="range" min="680" max="980" value="860" /></label>
          <label>Màu nền
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
              <select id="chapterSelect" class="chapter-select"><option value="{chapter_number - 1}">{_safe_text(chapter_title)}</option></select>
            </div>
          </div>
          <div id="chapterList" class="chapter-list"><span class="chapter-chip active">{_safe_text(chapter_title)}</span></div>
        </div>
        <div class="reader-body" id="readerBody">{content_html}{audio_html}</div>
        <section id="commentsSection" class="comments-section">
          <div class="comments-head">
            <div><h2>Bình luận truyện</h2><p id="commentsHint">Bình luận hiển thị chung cho toàn bộ truyện.</p></div>
            <button id="commentsRefreshBtn" class="ghost-btn comments-refresh-btn" type="button">Tải lại</button>
          </div>
          <div id="commentForm" class="comment-form">
            <textarea id="commentInput" maxlength="1000" placeholder="Viết bình luận của bạn về truyện này..."></textarea>
            <div class="comment-form-footer">
              <span id="commentStatus" class="comment-status"></span>
              <button id="commentSubmitBtn" class="solid-btn" type="button">Gửi bình luận</button>
            </div>
          </div>
          <div id="commentsList" class="comments-list"><div class="comment-empty">Đang tải bình luận...</div></div>
        </section>
        <div class="reader-footer">{prev_button}{next_button}</div>
        <section id="relatedBooksSection" class="related-books-section hidden">
          <div class="related-books-head">
            <div><h2>Truyện cùng thể loại</h2><p>Gợi ý ngẫu nhiên dựa trên thể loại của truyện bạn đang đọc.</p></div>
            <button id="relatedMoreBtn" class="ghost-btn related-refresh-btn" type="button">Xem thêm</button>
          </div>
          <div id="relatedBooksGrid" class="related-books-grid"></div>
        </section>
      </article>
      <aside class="floating-tools">
        <button id="saveShelfBtn" type="button">♡ Lưu truyện này</button>
        <button id="scrollTopBtn" type="button">↑ Lên đầu trang</button>
        <div class="muted-note">Bạn có thể đọc truyện, đổi cỡ chữ, đổi nền và chuyển chương trực tiếp tại đây.</div>
      </aside>
    </section>
  </main>
  <div id="accountModal" class="account-modal hidden" aria-hidden="true">
    <div class="account-box" role="dialog" aria-modal="true" aria-labelledby="accountTitle">
      <button id="accountCloseBtn" class="account-close-btn" type="button" aria-label="Đóng">×</button>
      <div class="account-head"><div><h2 id="accountTitle">Tài khoản của tôi</h2><p id="accountEmail" class="account-email">Chưa đăng nhập</p></div><button id="accountLogoutBtn" class="ghost-btn account-logout-btn" type="button">Đăng xuất</button></div>
      <div class="account-tabs"><button class="account-tab-btn active" type="button" data-account-tab="accountShelfPanel">Tủ sách</button><button class="account-tab-btn" type="button" data-account-tab="accountProgressPanel">Đang đọc</button></div>
      <div id="accountShelfPanel" class="account-tab-panel active"><div id="accountShelfList" class="account-list"><div class="account-empty">Chưa có truyện trong tủ sách.</div></div></div>
      <div id="accountProgressPanel" class="account-tab-panel"><div id="accountProgressList" class="account-list"><div class="account-empty">Chưa có tiến độ đọc.</div></div></div>
    </div>
  </div>
  <div id="authModal" class="auth-modal hidden" aria-hidden="true">
    <div class="auth-box" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button id="authCloseBtn" class="auth-close-btn" type="button" aria-label="Đóng">×</button>
      <h2 id="authTitle">Đăng nhập TruyenFullvn</h2>
      <p class="auth-desc">Đăng nhập để lưu tủ sách và đồng bộ tiến độ đọc.</p>
      <label class="auth-label" for="authEmail">Email</label>
      <input id="authEmail" type="email" placeholder="email@example.com" autocomplete="email" />
      <label class="auth-label" for="authPassword">Mật khẩu</label>
      <input id="authPassword" type="password" placeholder="Mật khẩu" autocomplete="current-password" />
      <div id="authPasswordConfirmWrap" class="auth-confirm-wrap hidden">
        <label class="auth-label" for="authPasswordConfirm">Nhập lại mật khẩu</label>
        <input id="authPasswordConfirm" type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password" />
      </div>
      <button id="authLoginBtn" class="solid-btn auth-action-btn" type="button">Đăng nhập</button>
      <button id="authModeRegisterBtn" class="ghost-btn auth-action-btn" type="button">Đăng ký</button>
      <button id="authRegisterBtn" class="solid-btn auth-action-btn hidden" type="button">Tạo tài khoản</button>
      <button id="authBackLoginBtn" class="ghost-btn auth-action-btn hidden" type="button">Quay lại đăng nhập</button>
      <div id="authMessage" class="auth-message"></div>
    </div>
  </div>
  <script src="/script.js?v=20260531-continue-toggle-2"></script>
</body>
</html>"""


def _find_book_by_seo_url(db: Session, seo_url: str):
    book = db.query(Book).filter(Book.seo_url == seo_url).first()

    if not book and seo_url.startswith("book-"):
        raw_id = seo_url.replace("book-", "", 1)
        if raw_id.isdigit():
            book = db.query(Book).filter(Book.id == int(raw_id)).first()

    return book


def _render_chapter_page_response(book, chapter_number: int, db: Session, page_kind="chapter"):
    chapter = db.query(Chapter).filter(
        Chapter.book_id == book.id,
        Chapter.chapter_number == chapter_number
    ).first()

    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    total_chapters = book.chapter_count or db.query(Chapter).filter(Chapter.book_id == book.id).count()
    html = _render_hybrid_chapter_html(book, chapter, chapter_number, total_chapters, page_kind=page_kind)
    return HTMLResponse(content=html)


@app.get("/truyen/{seo_url}/chuong-{chapter_number}", response_class=HTMLResponse, include_in_schema=False)
@app.get("/truyen/{seo_url}/chuong-{chapter_number}/", response_class=HTMLResponse, include_in_schema=False)
def read_chapter_page(seo_url: str, chapter_number: int, db: Session = Depends(get_db)):
    book = _find_book_by_seo_url(db, seo_url)

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    return _render_chapter_page_response(book, chapter_number, db)


@app.get("/truyen/{seo_url}", response_class=HTMLResponse, include_in_schema=False)
@app.get("/truyen/{seo_url}/", response_class=HTMLResponse, include_in_schema=False)
def read_book_page(seo_url: str, db: Session = Depends(get_db)):
    book = _find_book_by_seo_url(db, seo_url)

    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    return _render_chapter_page_response(book, 1, db, page_kind="book")
