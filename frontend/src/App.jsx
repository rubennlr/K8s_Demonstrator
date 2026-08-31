import { useEffect, useState } from "react";
import { createNote, deleteNote, fetchNotes, updateNote } from "./api";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "work", label: "Work" },
  { value: "personal", label: "Personal" },
  { value: "ideas", label: "Ideas" },
];

function NoteForm({ onAdd }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), content: content.trim() || null, category });
    setTitle("");
    setContent("");
    setCategory("general");
  };

  return (
    <form className="note-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
      />
      <textarea
        placeholder="Content (optional)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
      />
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <button type="submit">Add</button>
    </form>
  );
}

function NoteCard({ note, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || "");

  const handleSave = () => {
    onEdit(note.id, { title, content: content || null });
    setEditing(false);
  };

  const categoryLabel =
    CATEGORIES.find((c) => c.value === note.category)?.label || note.category;

  return (
    <div className="note-card">
      {editing ? (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
          />
          <div className="note-actions">
            <button onClick={handleSave}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <h3>{note.title}</h3>
          {note.content && <p>{note.content}</p>}
          <span className="note-category">{categoryLabel}</span>
          <small>
            {new Date(note.created_at).toLocaleDateString("en-US", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
          <div className="note-actions">
            <button onClick={() => setEditing(true)}>Edit</button>
            <button className="delete" onClick={() => onDelete(note.id)}>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");

  const loadNotes = async () => {
    try {
      const filters = filter ? { category: filter } : {};
      setNotes(await fetchNotes(filters));
      setError(null);
    } catch {
      setError("Failed to connect to the API.");
    }
  };

  useEffect(() => {
    loadNotes();
  }, [filter]);

  const handleAdd = async (data) => {
    await createNote(data);
    loadNotes();
  };

  const handleEdit = async (id, data) => {
    await updateNote(id, data);
    loadNotes();
  };

  const handleDelete = async (id) => {
    await deleteNote(id);
    loadNotes();
  };

  return (
    <div className="app">
      <h1>Notes</h1>
      {error && <p className="error">{error}</p>}
      <NoteForm onAdd={handleAdd} />
      <div className="filter-bar">
        <label>Filter:</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="notes-list">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onDelete={handleDelete}
            onEdit={handleEdit}
          />
        ))}
        {notes.length === 0 && !error && (
          <p className="empty">No notes yet.</p>
        )}
      </div>
    </div>
  );
}
