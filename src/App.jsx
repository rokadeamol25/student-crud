import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [students, setStudents] = useState([])
  const [student, setStudent] = useState({ name: '', age: '', course: '' })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    fetchStudents()
  }, [])

  const fetchStudents = async () => {
    const { data, error } = await supabase.from('students').select('*')
    if (error) console.log('Error fetching:', error)
    else setStudents(data)
  }

  const addStudent = async () => {
    if (!student.name || !student.age) return alert('Please fill name and age')
    const { error } = await supabase.from('students').insert([student])
    if (error) console.log('Error adding:', error)
    else {
      setStudent({ name: '', age: '', course: '' })
      fetchStudents()
    }
  }

  const deleteStudent = async (id) => {
    const { error } = await supabase.from('students').delete().eq('id', id)
    if (error) console.log('Error deleting:', error)
    else fetchStudents()
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
    if (error) console.log('Error updating:', error)
    else {
      setStudent({ name: '', age: '', course: '' })
      setEditingId(null)
      fetchStudents()
    }
  }

  const cancelEdit = () => {
    setStudent({ name: '', age: '', course: '' })
    setEditingId(null)
  }

  return (
    <main className="app">
      <div className="app__inner">
        <header className="app__header">
          <h1 className="app__title">Student Management</h1>
          <p className="app__subtitle">Add, edit, and manage student records</p>
        </header>

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
          <h2 id="list-heading" className="list-section__heading">
            Students <span className="list-section__count">{students.length}</span>
          </h2>
          {students.length === 0 ? (
            <p className="list-section__empty">No students yet. Add one above.</p>
          ) : (
            <ul className="student-list">
              {students.map((s) => (
                <li key={s.id} className="student-card">
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
                      onClick={() => deleteStudent(s.id)}
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
    </main>
  )
}

export default App
