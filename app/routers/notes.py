from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud import create_note, delete_note, get_note, get_notes, update_note
from app.models import Category
from app.schemas import NoteCreate, NoteResponse, NoteUpdate

router = APIRouter(prefix="/notes", tags=["notes"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[NoteResponse])
def list_notes(db: DbSession, category: Category | None = None):
    """List all notes, optionally filtered by category."""
    return get_notes(db, category=category)


@router.get("/{note_id}", response_model=NoteResponse)
def read_note(note_id: int, db: DbSession):
    """Get a single note by ID."""
    note = get_note(db, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.post("", response_model=NoteResponse, status_code=201)
def create(note_in: NoteCreate, db: DbSession):
    """Create a new note."""
    return create_note(db, note_in)


@router.put("/{note_id}", response_model=NoteResponse)
def update(note_id: int, note_in: NoteUpdate, db: DbSession):
    """Update an existing note (partial update)."""
    note = get_note(db, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return update_note(db, note, note_in)


@router.delete("/{note_id}", status_code=204)
def delete(note_id: int, db: DbSession):
    """Delete a note."""
    note = get_note(db, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    delete_note(db, note)
