from pydantic import BaseModel
from typing import List, Optional


class ChapterResponse(BaseModel):
    id: int
    book_id: int
    chapter_number: int
    title: str
    content: List[str]
    audio_url: Optional[str] = ""

    class Config:
        from_attributes = True


class BookResponse(BaseModel):
    id: int
    title: str
    author: Optional[str] = ""
    tags: List[str] = []
    popularity: int = 0
    views: int = 0
    desc: Optional[str] = ""
    chapter_count: int = 0
    cover: Optional[str] = ""
    file: Optional[str] = ""
    seo_url: Optional[str] = ""

    class Config:
        from_attributes = True


class BookDetailResponse(BookResponse):
    chapters: List[ChapterResponse] = []


class BookCreate(BaseModel):
    id: int
    title: str
    author: Optional[str] = ""
    tags: List[str] = []
    popularity: int = 0
    desc: Optional[str] = ""
    chapter_count: int = 0
    cover: Optional[str] = ""
    file: Optional[str] = ""
    seo_url: Optional[str] = ""


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    tags: Optional[List[str]] = None
    popularity: Optional[int] = None
    views: Optional[int] = None
    desc: Optional[str] = None
    chapter_count: Optional[int] = None
    cover: Optional[str] = None
    file: Optional[str] = None
    seo_url: Optional[str] = None


class ChapterCreate(BaseModel):
    chapter_number: int
    title: str
    content: List[str]
    audio_url: Optional[str] = ""


class ChapterUpdate(BaseModel):
    chapter_number: Optional[int] = None
    title: Optional[str] = None
    content: Optional[List[str]] = None
    audio_url: Optional[str] = None


class UserCreate(BaseModel):
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class BookmarkCreate(BaseModel):
    book_id: int
    chapter_number: int = 1


class BookmarkResponse(BaseModel):
    id: int
    user_id: int
    book_id: int
    chapter_number: int

    class Config:
        from_attributes = True

class ReadingProgressCreate(BaseModel):
    book_id: int
    chapter_number: int = 1

class CommentCreate(BaseModel):
    book_id: int
    content: str