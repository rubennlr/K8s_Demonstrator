from datetime import datetime

from pydantic import BaseModel, Field

from app.models.note import Category


class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str | None = None
    category: Category = Category.GENERAL


class NoteUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    content: str | None = None
    category: Category | None = None


class NoteResponse(BaseModel):
    id: int
    title: str
    content: str | None
    category: Category
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
