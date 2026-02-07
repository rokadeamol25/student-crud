import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'age-asc', label: 'Age (youngest)' },
  { value: 'age-desc', label: 'Age (oldest)' },
]

function useToasts() {
  const [toasts, setToasts] = useState([])
  const add = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  return [toasts, add]
}

function App() {
  const [students, setStudents] = useState([])
  const [student, setStudent] = useState({ name: '', age: '', course: '' })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('name-asc')
  const [viewMode, setViewMode] = useState('cards') // 'cards' | 'table'
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, name }
  const [toasts, addToast] = useToasts()

  useEffect(() => {
    fetchStudents()
  }, [])

  useEffect(() => {
    if (!deleteTarget) return
    const onKey = (e) => e.key === 'Escape' && setDeleteTarget(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteTarget])

  const fetchStudents = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('students').select('*')
    if (error) {
      console.error(error)
      addToast('Failed to load students', 'error')
    } else {
      setStudents(data ?? [])
    }
    setLoading(false)
  }

  const addStudent = async () => {
    if (!student.name?.trim() || !student.age) {
      addToast('Please fill name and age', 'error')
      return
    }
    const { error } = await supabase.from('students').insert([student])
    if (error) {
      console.error(error)
      addToast('Failed to add student', 'error')
      return
    }
    addToast('Student added')
    setStudent({ name: '', age: '', course: '' })
    fetchStudents()
  }

  const deleteStudent = async (id) => {
    const { error } = await supabase.from('students').delete().eq('id', id)
    if (error) {
      console.error(error)
      addToast('Failed to delete student', 'error')
      return
    }
    addToast('Student removed')
    setDeleteTarget(null)
    fetchStudents()
  }

  const editStudent = (s) => {
    setStudent({ name: s.name, age: s.age, course: s.course })
    setEditingId(s.id)
  }

  const updateStudent = async () => {
    const { error } = await supabase
      .from('students')
      .update(student)
      .eq('id', editingId)
    if (error) {
      console.error(error)
      addToast('Failed to update student', 'error')
      return
    }
    addToast('Student updated')
    setStudent({ name: '', age: '', course: '' })
    setEditingId(null)
    fetchStudents()
  }

  const cancelEdit = () => {
    setStudent({ name: '', age: '', course: '' })
    setEditingId(null)
  }

  const filteredAndSorted = useMemo(() => {
    let list = [...students]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.course?.toLowerCase().includes(q)
      )
    }
    const [field, dir] = sort.split('-')
    list.sort((a, b) => {
      const av = field === 'age' ? Number(a.age) : (a[field] ?? '').toString().toLowerCase()
      const bv = field === 'age' ? Number(b.age) : (b[field] ?? '').toString().toLowerCase()
      if (field === 'age') return dir === 'asc' ? av - bv : bv - av
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
    return list
  }, [students, search, sort])

  const stats = useMemo(() => {
    const total = students.length
    const ages = students.map((s) => Number(s.age)).filter((n) => !Number.isNaN(n))
    const avgAge = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : '—'
    const courses = new Set(students.map((s) => s.course).filter(Boolean))
    return { total, avgAge, courses: courses.size }
  }, [students])

  return (
    <main className="app">
      <div className="app__inner">
        <header className="app__header">
          <div className="app__header-content">
            <h1 className="app__title">Student Management</h1>
            <p className="app__subtitle">Add, edit, and manage student records</p>
          </div>
        </header>

        <section className="stats" aria-label="Overview">
          <div className="stat-card">
            <span className="stat-card__value">{stats.total}</span>
            <span className="stat-card__label">Students</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.avgAge}</span>
            <span className="stat-card__label">Avg. age</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.courses}</span>
            <span className="stat-card__label">Courses</span>
          </div>
        </section>

        <section className="form-card" aria-labelledby="form-heading">
          <h2 id="form-heading" className="form-card__heading">
            {editingId ? 'Edit student' : 'Add new student'}
          </h2>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault()
              editingId ? updateStudent() : addStudent()
            }}
          >
            <div className="form__grid">
              <label className="form__label">
                <span className="form__labelText">Name</span>
                <input
                  type="text"
                  className="form__input"
                  placeholder="Student name"
                  value={student.name}
                  onChange={(e) => setStudent({ ...student, name: e.target.value })}
                  autoComplete="name"
                />
              </label>
              <label className="form__label">
                <span className="form__labelText">Age</span>
                <input
                  type="number"
                  min="1"
                  max="120"
                  className="form__input"
                  placeholder="Age"
                  value={student.age}
                  onChange={(e) => setStudent({ ...student, age: e.target.value })}
                />
              </label>
              <label className="form__label form__label--full">
                <span className="form__labelText">Course</span>
                <input
                  type="text"
                  className="form__input"
                  placeholder="Course (optional)"
                  value={student.course}
                  onChange={(e) => setStudent({ ...student, course: e.target.value })}
                />
              </label>
            </div>
            <div className="form__actions">
              {editingId && (
                <button type="button" className="btn btn--secondary" onClick={cancelEdit}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn--primary">
                {editingId ? 'Update student' : 'Add student'}
              </button>
            </div>
          </form>
        </section>

        <section className="list-section" aria-labelledby="list-heading">
          <div className="list-section__toolbar">
            <h2 id="list-heading" className="list-section__heading">
              Students
            </h2>
            <div className="list-section__controls">
              <div className="search-wrap">
                <span className="search-wrap__icon" aria-hidden>⌕</span>
                <input
                  type="search"
                  className="search-wrap__input"
                  placeholder="Search name or course…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search students"
                />
              </div>
              <select
                className="sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sort by"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="view-toggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={`view-toggle__btn ${viewMode === 'cards' ? 'view-toggle__btn--active' : ''}`}
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                  title="Card view"
                >
                  Cards
                </button>
                <button
                  type="button"
                  className={`view-toggle__btn ${viewMode === 'table' ? 'view-toggle__btn--active' : ''}`}
                  onClick={() => setViewMode('table')}
                  aria-pressed={viewMode === 'table'}
                  title="Table view"
                >
                  Table
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="list-loading">
              <div className="list-loading__spinner" aria-hidden />
              <p className="list-loading__text">Loading students…</p>
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="list-section__empty">
              {students.length === 0
                ? 'No students yet. Add one above.'
                : 'No students match your search.'}
            </div>
          ) : viewMode === 'table' ? (
            <div className="table-wrap">
              <table className="student-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Age</th>
                    <th>Course</th>
                    <th className="student-table__actions-col" />
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((s, i) => (
                    <tr key={s.id} className="student-table__row" style={{ animationDelay: `${i * 0.03}s` }}>
                      <td className="student-table__name">{s.name}</td>
                      <td>{s.age}</td>
                      <td>{s.course || '—'}</td>
                      <td className="student-table__actions-col">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => editStudent(s)}
                          aria-label={`Edit ${s.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                          aria-label={`Delete ${s.name}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="student-list">
              {filteredAndSorted.map((s, i) => (
                <li
                  key={s.id}
                  className="student-card"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className="student-card__info">
                    <span className="student-card__name">{s.name}</span>
                    <span className="student-card__meta">
                      {s.age} years{s.course ? ` · ${s.course}` : ''}
                    </span>
                  </div>
                  <div className="student-card__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => editStudent(s)}
                      aria-label={`Edit ${s.name}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                      aria-label={`Delete ${s.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="modal-backdrop"
          onClick={() => setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-title" className="modal__title">Delete student?</h3>
            <p className="modal__body">
              <strong>{deleteTarget.name}</strong> will be removed. This can’t be undone.
            </p>
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => deleteStudent(deleteTarget.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} role="status">
            {t.message}
          </div>
        ))}
      </div>
    </main>
  )
}

export default App
