from sqlalchemy.orm import Session

from app.models.note import Category, Note
from app.schemas.note import NoteCreate, NoteUpdate


def get_notes(
    db: Session,
    category: Category | None = None,
) -> list[Note]:
    """List all notes, optionally filtered by category."""
    query = db.query(Note)
    if category is not None:
        query = query.filter(Note.category == category)
    return query.order_by(Note.created_at.desc()).all()


def get_note(db: Session, note_id: int) -> Note | None:
    """Get a single note by ID."""
    return db.query(Note).filter(Note.id == note_id).first()


def create_note(db: Session, note_in: NoteCreate) -> Note:
    """Create a new note."""
    note = Note(**note_in.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(db: Session, note: Note, note_in: NoteUpdate) -> Note:
    """Update an existing note (partial update)."""
    update_data = note_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, note: Note) -> None:
    """Delete a note."""
    db.delete(note)
    db.commit()
