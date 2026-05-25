from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    author = Column(String, default="")
    tags = Column(JSON, default=[])
    popularity = Column(Integer, default=0)
    views = Column(Integer, default=0)
    desc = Column(Text, default="")
    chapter_count = Column(Integer, default=0)
    cover = Column(String, default="")
    file = Column(String, default="")
    seo_url = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    chapters = relationship("Chapter", back_populates="book", cascade="all, delete")


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), index=True)
    chapter_number = Column(Integer, index=True)
    title = Column(String, default="")
    content = Column(JSON, default=[])
    audio_url = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    book = relationship("Book", back_populates="chapters")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    book_id = Column(Integer, ForeignKey("books.id"), index=True)
    chapter_number = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

class ReadingProgress(Base):
    __tablename__ = "reading_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    book_id = Column(Integer, ForeignKey("books.id"), index=True)
    chapter_number = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.utcnow)

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    book_id = Column(Integer, ForeignKey("books.id"), index=True)

    content = Column(Text)
    likes = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)

