'use client'
import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { importStudents, type ImportResult } from './actions'

type Room = { id: string; label: string }
export default function ImportForm({ school, rooms }: { school: string; rooms: Room[] }) {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [classroom, setClassroom] = useState('')
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const selectionRef = useRef(0)
  const reset = () => { selectionRef.current++; setResult(null) }
  function submit(stage: 'preview' | 'confirm') {
    const form = formRef.current
    if (!form || !form.reportValidity() || pending) return
    const data = new FormData(form)
    data.set('stage', stage)
    const selection = selectionRef.current
    startTransition(async () => {
      try {
        const next = await importStudents(data)
        if (selection === selectionRef.current) setResult(next)
      } catch {
        if (selection === selectionRef.current) setResult({ status: 'error', message: 'No se pudo completar la solicitud. Comprueba tu sesión y revisa el listado antes de reintentar.', issues: [], students: [] })
      }
    })
  }
  return <>
    <p>Importa un aula por archivo, hasta <strong>500 estudiantes</strong> y <strong>256 KB</strong>. Todos se registrarán como activos en el aula seleccionada.</p>
    <ol><li>Descarga la <a href="/plantilla-estudiantes.csv" download>plantilla CSV</a>.</li><li>Completa las columnas <strong>dni, nombres, apellidos</strong>. El DNI es obligatorio en la carga masiva; conserva sus ocho dígitos usando formato Texto en Excel.</li><li>Guarda como <strong>CSV UTF-8</strong>. Se aceptan separadores de coma, punto y coma o tabulación.</li></ol>
    <p>No incluyas filas de ejemplo. Los estudiantes sin DNI se pueden registrar individualmente. Si hay un error o DNI repetido, tendrás que corregir el archivo; no se reemplazan registros existentes.</p>
    <form ref={formRef} onSubmit={event => { event.preventDefault(); submit('preview') }}>
      <input name="school" value={school} type="hidden" />
      <label>Aula de destino<select name="classroom" required value={classroom} disabled={pending || result?.status === 'success'} onChange={e => { setClassroom(e.target.value); reset() }}><option value="">Seleccionar aula</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <label>Archivo de estudiantes<input name="file" type="file" accept=".csv,text/csv" required disabled={pending || result?.status === 'success'} onChange={reset} /></label>
      {result?.status !== 'success' && <button type="submit" disabled={pending || !rooms.length}>{pending ? 'Procesando…' : 'Revisar archivo'}</button>}
    </form>
    {!rooms.length && <p className="notice">Primero crea un aula desde el panel.</p>}
    {result && <div role="status" aria-live="polite"><p className="notice">{result.message}</p>{result.issues.length > 0 && <ul className="import-errors">{result.issues.map((issue, index) => <li key={index}>{issue.row ? `Registro ${issue.row}: ` : ''}{issue.message}</li>)}</ul>}</div>}
    {result?.status === 'preview' && <section><h2>Vista previa: {result.students.length} estudiantes</h2><p><strong>Aula: {rooms.find(r => r.id === classroom)?.label}</strong></p><p>Aún no se ha guardado ningún estudiante. Al confirmar se volverán a comprobar el archivo, tus permisos y los DNI existentes.</p><div className="table-scroll import-preview"><table><thead><tr><th>Registro</th><th>DNI</th><th>Apellidos</th><th>Nombres</th></tr></thead><tbody>{result.students.map(s => <tr key={s.row}><td>{s.row}</td><td>{s.dni}</td><td>{s.last_names}</td><td>{s.first_names}</td></tr>)}</tbody></table></div><div className="import-controls"><button type="button" disabled={pending} onClick={() => submit('confirm')}>{pending ? 'Guardando…' : `Confirmar carga de ${result.students.length} estudiantes`}</button><button type="button" className="secondary" disabled={pending} onClick={reset}>Cancelar vista previa</button></div></section>}
    {result?.status === 'success' && <div className="import-controls"><Link href={'/dashboard?school=' + school}>Ver estudiantes registrados</Link><button type="button" className="secondary" onClick={() => { formRef.current?.reset(); setClassroom(''); reset() }}>Cargar otro archivo</button></div>}
  </>
}
