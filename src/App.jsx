import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [students, setStudents] = useState([])
  const [student, setStudent] = useState({ name: '', age: '', course: '' })
  const [editingId, setEditingId] = useState(null)

  // READ: Fetch students on load
  useEffect(() => {
    fetchStudents()
  }, [])

  const fetchStudents = async () => {
    const { data, error } = await supabase.from('students').select('*')
    if (error) console.log('Error fetching:', error)
    else setStudents(data)
  }

  // CREATE: Add a new student
  const addStudent = async () => {
    if (!student.name || !student.age) return alert('Please fill details')

    const { error } = await supabase
      .from('students')
      .insert([student])

    if (error) console.log('Error adding:', error)
    else {
      setStudent({ name: '', age: '', course: '' })
      fetchStudents() // Refresh list
    }
  }

  // DELETE: Remove a student
  const deleteStudent = async (id) => {
    const { error } = await supabase.from('students').delete().eq('id', id)
    if (error) console.log('Error deleting:', error)
    else fetchStudents()
  }

  // PREPARE UPDATE: Fill form with student data
  const editStudent = (s) => {
    setStudent({ name: s.name, age: s.age, course: s.course })
    setEditingId(s.id)
  }

  // UPDATE: Save changes
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

  return (
    <div className="container">
      <h1>Student Management System</h1>

      <div className="form-group">
        <input 
          placeholder="Name" 
          value={student.name} 
          onChange={e => setStudent({...student, name: e.target.value})} 
        />
        <input 
          placeholder="Age" 
          type="number"
          value={student.age} 
          onChange={e => setStudent({...student, age: e.target.value})} 
        />
        <input 
          placeholder="Course" 
          value={student.course} 
          onChange={e => setStudent({...student, course: e.target.value})} 
        />

        {editingId ? (
          <button onClick={updateStudent}>Update Student</button>
        ) : (
          <button onClick={addStudent}>Add Student</button>
        )}
      </div>

      <ul>
        {students.map((s) => (
          <li key={s.id}>
            <span>{s.name} - {s.age} years - {s.course}</span>
            <div>
              <button onClick={() => editStudent(s)}>Edit</button>
              <button onClick={() => deleteStudent(s.id)} style={{marginLeft: '10px', background: 'red'}}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App