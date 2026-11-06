import Link from 'next/link'
import { schoolContext, roleLabels } from '@/lib/school/context'
import { manageSchool } from './actions'
export const dynamic = 'force-dynamic'

type Classroom = { id: string; academic_year: number; level: string; grade: string; section: string }
type Student = { id: string; classroom_id: string; first_names: string; last_names: string; dni: string | null; active: boolean }
type Member = { user_id: string; email: string; role: string }
const label = (c: Classroom) => `${c.academic_year} · ${c.level} ${c.grade} ${c.section}`

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ school?: string; q?: string; message?: string }> }) {
  const params = await searchParams
  const { supabase, user, memberships, school, roles, setupError } = await schoolContext(params.school)
  const manager = roles.includes('administrador') || roles.includes('director')
  const registrar = manager || roles.includes('auxiliar')
  const session = <form action="/auth/signout" method="post" className="signout"><button className="secondary">Cerrar sesión</button></form>
  if (setupError) return <><h1>Mi panel</h1><p>Sesión iniciada como {user.email}.</p><p className="notice">No se pudo cargar la organización escolar. La base escolar debe estar instalada y disponible en Supabase.</p><p>El acceso a tu cuenta funciona. Contacta con el administrador para habilitar los módulos escolares.</p>{session}</>
  if (!school) return <><h1>Bienvenido a Aula al Día</h1><p>Sesión iniciada como {user.email}.</p><p className="notice">Tu cuenta está pendiente de vinculación. La institución debe asignarte un rol; si eres apoderado, también debe vincular a tus hijos.</p>{session}</>
  const [institutionsResult, classroomsResult, studentsResult, membersResult, teachersResult, guardiansResult] = await Promise.all([
    supabase.from('institutions').select('id,name'),
    supabase.from('classrooms').select('id,academic_year,level,grade,section').eq('institution_id', school).order('academic_year', { ascending: false }).order('grade').order('section'),
    supabase.from('students').select('id,classroom_id,first_names,last_names,dni,active').eq('institution_id', school).order('last_names'),
    manager ? supabase.rpc('list_school_members', { school }) : Promise.resolve({ data: [], error: null }),
    manager ? supabase.from('teacher_assignments').select('classroom_id,user_id').eq('institution_id', school) : Promise.resolve({ data: [], error: null }),
    manager ? supabase.from('student_guardians').select('student_id,user_id,relationship').eq('institution_id', school) : Promise.resolve({ data: [], error: null }),
  ])
  const failed = [institutionsResult, classroomsResult, studentsResult, membersResult, teachersResult, guardiansResult].some(r => r.error)
  const institutions = (institutionsResult.data ?? []) as { id: string; name: string }[]
  const classrooms = (classroomsResult.data ?? []) as Classroom[]
  const students = (studentsResult.data ?? []) as Student[]
  const members = (membersResult.data ?? []) as Member[]
  const q = (params.q ?? '').trim().toLocaleLowerCase('es')
  const visibleStudents = students.filter(s => !q || `${s.last_names} ${s.first_names} ${s.dni ?? ''}`.toLocaleLowerCase('es').includes(q))
  const classroomName = (id: string) => { const c = classrooms.find(c => c.id === id); return c ? label(c) : 'Aula no disponible' }
  const memberEmail = (id: string) => members.find(m => m.user_id === id)?.email ?? 'Cuenta no disponible'
  const studentName = (id: string) => { const s = students.find(s => s.id === id); return s ? `${s.last_names}, ${s.first_names}` : 'Estudiante no disponible' }
  function Fields({ intent }: { intent: string }) { return <><input type="hidden" name="school" value={school} /><input type="hidden" name="intent" value={intent} /></> }
  const classroomOptions = classrooms.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)
  const studentOptions = students.map(s => <option key={s.id} value={s.id}>{s.last_names}, {s.first_names}</option>)
  return <div className="workspace">
    <header className="school-header"><div><p className="eyebrow">AULA AL DÍA</p><h1>{institutions.find(i => i.id === school)?.name ?? 'Mi institución'}</h1><p>{roles.map(r => roleLabels[r]).join(' · ')} · {user.email}</p></div>{session}</header>
    {new Set(memberships.map(m => m.institution_id)).size > 1 && <form method="get"><label>Institución<select name="school" defaultValue={school}>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><button>Seleccionar institución</button></form>}
    <nav className="school-nav"><Link href={'/dashboard/reportes?school=' + school}>Reportes</Link><Link href={'/dashboard/comportamiento?school=' + school}>Comportamiento</Link>{roles.some(r=>['administrador','director','docente','apoderado'].includes(r)) && <Link href={'/dashboard/clases?school=' + school}>Asistencia por clase</Link>}<Link href={'/dashboard/porteria?school=' + school}>Entrada y salida</Link><a href="#students">{registrar ? 'Estudiantes' : 'Mis estudiantes'}</a><a href="#classrooms">Aulas</a>{manager && <a href="#people">Personas y vínculos</a>}</nav>
    {params.message && <p className="notice" role="status">{params.message}</p>}
    {failed && <p className="notice" role="alert">No se pudieron cargar todos los datos. Intenta recargar la página. Los totales pueden estar incompletos.</p>}
    <div className="metrics"><article><strong>{students.length}</strong><span>Estudiantes visibles</span></article><article><strong>{classrooms.length}</strong><span>Aulas visibles</span></article><article><strong>{students.filter(s => s.active).length}</strong><span>Estudiantes activos</span></article></div>
    <section id="students">{registrar && <Link className="import-link" href={'/dashboard/importar?school=' + school}>Cargar estudiantes en bloque</Link>}<h2>{registrar ? 'Estudiantes' : 'Mis estudiantes'}</h2><p>{roles.includes('apoderado') && !registrar && !roles.includes('docente') ? 'Solo puedes consultar los estudiantes vinculados a tu cuenta.' : 'Consulta estudiantes por DNI, apellidos o nombres.'}</p>
      <form method="get" className="search"><input type="hidden" name="school" value={school} /><label>Buscar estudiante<input name="q" defaultValue={params.q} maxLength={120} placeholder="DNI, apellidos o nombres" /></label><button>Buscar</button><Link href={'/dashboard?school=' + school}>Limpiar</Link></form>
      <div className="table-scroll"><table><thead><tr><th>Apellidos y nombres</th><th>DNI</th><th>Aula</th><th>Estado</th>{registrar && <th>Acción</th>}</tr></thead><tbody>{visibleStudents.map(s => <tr key={s.id}><td>{s.last_names}, {s.first_names}</td><td>{s.dni ?? 'Sin DNI'}</td><td>{classroomName(s.classroom_id)}</td><td>{s.active ? 'Activo' : 'Inactivo'}</td>{registrar && <td><form action={manageSchool} className="inline"><Fields intent="status" /><input type="hidden" name="student" value={s.id} /><input type="hidden" name="active" value={String(!s.active)} /><button className="secondary">{s.active ? 'Desactivar' : 'Reactivar'}</button></form></td>}</tr>)}</tbody></table></div>
      {!visibleStudents.length && <p className="empty">No hay estudiantes para mostrar con esta búsqueda y tus permisos.</p>}
      {registrar && <details><summary>Registrar estudiante</summary><form action={manageSchool} className="grid-form"><Fields intent="student" /><label>Nombres<input name="first_names" required maxLength={100} /></label><label>Apellidos<input name="last_names" required maxLength={120} /></label><label>DNI (opcional)<input name="dni" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} /></label><label>Aula<select name="classroom" required><option value="">Seleccionar aula</option>{classroomOptions}</select></label><button disabled={!classrooms.length}>Registrar estudiante</button></form>{!classrooms.length && <p>Primero registra un aula.</p>}</details>}
    </section>
    <section id="classrooms"><h2>Aulas</h2><ul className="room-list">{classrooms.map(c => <li key={c.id}>{label(c)}</li>)}</ul>{!classrooms.length && <p className="empty">Aún no tienes aulas disponibles.</p>}
      {manager && <details><summary>Crear aula</summary><form action={manageSchool} className="grid-form"><Fields intent="classroom" /><label>Año escolar<input type="number" name="year" min={2000} max={2100} defaultValue={Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Lima' }).format(new Date()))} required /></label><label>Nivel<select name="level"><option>Inicial</option><option>Primaria</option><option>Secundaria</option></select></label><label>Grado<input name="grade" placeholder="Ej.: 1.º" maxLength={40} required /></label><label>Sección<input name="section" placeholder="Ej.: A" maxLength={40} required /></label><button>Crear aula</button></form></details>}
    </section>
    {manager && <section id="people"><h2>Personas y vínculos</h2><p>Las personas deben crear su cuenta y confirmar su correo antes de recibir un rol. El registro público no concede acceso a datos escolares.</p>
      <div className="table-scroll"><table><thead><tr><th>Cuenta</th><th>Rol</th>{roles.includes('administrador') && <th>Acceso</th>}</tr></thead><tbody>{members.map(m => <tr key={m.user_id + m.role}><td>{m.email}</td><td>{roleLabels[m.role]}</td>{roles.includes('administrador') && <td><details><summary>Retirar rol</summary><p>También se retirarán sus vínculos de docente o apoderado asociados a este rol.</p><form action={manageSchool}><Fields intent="remove_role" /><input name="user" type="hidden" value={m.user_id} /><input name="role" type="hidden" value={m.role} /><button>Confirmar retiro</button></form></details></td>}</tr>)}</tbody></table></div>
      {roles.includes('administrador') && <details><summary>Asignar un rol</summary><p>El rol de administrador concede gestión de accesos de toda la institución.</p><form action={manageSchool} className="grid-form"><Fields intent="role" /><label>Correo de la cuenta<input name="email" type="email" maxLength={254} required /></label><label>Rol<select name="role" defaultValue="docente">{Object.entries(roleLabels).map(([role, name]) => <option key={role} value={role}>{name}</option>)}</select></label><button>Asignar rol</button></form></details>}
      <details><summary>Asignar aula a docente</summary><form action={manageSchool} className="grid-form"><Fields intent="teacher" /><label>Docente<select name="user" required><option value="">Seleccionar docente</option>{members.filter(m => m.role === 'docente').map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label><label>Aula<select name="classroom" required><option value="">Seleccionar aula</option>{classroomOptions}</select></label><button>Vincular docente</button></form></details>
      <ul className="links-list">{(teachersResult.data ?? []).map(t => <li key={t.classroom_id + t.user_id}><span>{memberEmail(t.user_id)} → {classroomName(t.classroom_id)}</span><form action={manageSchool} className="inline"><Fields intent="unlink_teacher" /><input name="user" type="hidden" value={t.user_id} /><input name="target" type="hidden" value={t.classroom_id} /><button className="secondary">Retirar vínculo</button></form></li>)}</ul>
      <details><summary>Vincular apoderado con estudiante</summary><p>Verifica la identidad y autorización del apoderado antes de vincularlo. Esta acción permite consultar los datos del estudiante.</p><form action={manageSchool} className="grid-form"><Fields intent="guardian" /><label>Apoderado<select name="user" required><option value="">Seleccionar apoderado</option>{members.filter(m => m.role === 'apoderado').map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label><label>Estudiante<select name="student" required><option value="">Seleccionar estudiante</option>{studentOptions}</select></label><label>Parentesco<select name="relationship"><option>Madre</option><option>Padre</option><option>Tutor/a</option><option>Otro apoderado</option></select></label><button>Vincular apoderado</button></form></details>
      <ul className="links-list">{(guardiansResult.data ?? []).map(g => <li key={g.student_id + g.user_id}><span>{memberEmail(g.user_id)} → {studentName(g.student_id)} ({g.relationship})</span><form action={manageSchool} className="inline"><Fields intent="unlink_guardian" /><input name="user" type="hidden" value={g.user_id} /><input name="target" type="hidden" value={g.student_id} /><button className="secondary">Retirar vínculo</button></form></li>)}</ul>
    </section>}
    <aside className="notice"><strong>Gestión escolar</strong><p>Usa el menú para gestionar asistencia y comportamiento. Las notas de conducta requieren una rúbrica institucional y revisión antes de publicarse.</p></aside>
  </div>
}
