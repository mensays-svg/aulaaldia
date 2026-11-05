'use client'
import { useEffect,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCourse,createSession,loadClass,saveAttendance,changeSessionState } from './actions'
import { classStatuses,type ClassDetail,type ClassResult } from '@/lib/school/classes'
import { formatGateTime,movements,reasons } from '@/lib/school/gate'

type Room={id:string;label:string}
type Course={id:string;name:string}
type Assignment={classroom_id:string;user_id:string;label:string}
export function ClassSetup({school,user,manager,rooms,courses,assignments,date}:{school:string;user:string;manager:boolean;rooms:Room[];courses:Course[];assignments:Assignment[];date:string}){
 const router=useRouter(),[pending,startTransition]=useTransition()
 const [room,setRoom]=useState(''),[message,setMessage]=useState('')
 const teachers=assignments.filter(a=>a.classroom_id===room)
 async function submit(form:HTMLFormElement,course:boolean){
  const data=new FormData(form);data.set('school',school)
  startTransition(async()=>{try{
   const result=course?await createCourse(data):await createSession(data)
   setMessage(result.error??result.message??'')
   if(!result.error){form.reset();setRoom('');if(result.sessionId)router.push('/dashboard/clases?'+new URLSearchParams({school,date:String(data.get('date')),session:result.sessionId}));else router.refresh()}
  }catch{setMessage('No se pudo completar la solicitud. Revisa el listado antes de reintentar.')}})
 }
 return <section><h2>Preparar una clase</h2><p>La sesión toma la lista de estudiantes activos del aula en ese momento. No se marca asistencia automáticamente.</p>
  {manager&&<details><summary>Registrar curso</summary><form onSubmit={e=>{e.preventDefault();void submit(e.currentTarget,true)}}><label>Nombre del curso<input name="name" minLength={2} maxLength={100} required disabled={pending} placeholder="Ej.: Matemática"/></label><button disabled={pending}>Registrar curso</button></form></details>}
  <details><summary>Crear sesión de clase</summary><form className="grid-form" onSubmit={e=>{e.preventDefault();void submit(e.currentTarget,false)}}>
   <label>Aula<select name="classroom" value={room} onChange={e=>setRoom(e.target.value)} required disabled={pending}><option value="">Seleccionar aula</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
   <label>Curso<select name="course" required disabled={pending}><option value="">Seleccionar curso</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   {manager?<label>Docente responsable<select name="teacher" required disabled={pending||!room} key={room}><option value="">Seleccionar docente asignado</option>{teachers.map(t=><option key={t.user_id} value={t.user_id}>{t.label}</option>)}</select></label>:<input type="hidden" name="teacher" value={user}/>}
   <label>Fecha de la clase<input name="date" type="date" defaultValue={date} required disabled={pending}/></label>
   <label>Inicio (Lima)<input name="start" type="time" required disabled={pending}/></label><label>Fin (Lima)<input name="end" type="time" required disabled={pending}/></label>
   <label>Tema (opcional)<input name="topic" maxLength={160} disabled={pending}/></label><button disabled={pending||!courses.length||!rooms.length}>Crear sesión</button>
  </form>{manager&&room&&!teachers.length&&<p className="notice">Primero asigna un docente a esta aula en Personas y vínculos.</p>}{!courses.length&&<p>Dirección o administración debe registrar al menos un curso.</p>}{!rooms.length&&<p>No tienes aulas disponibles. Revisa la asignación del docente.</p>}</details>
  {message&&<p className="notice" role="status">{message}</p>}
 </section>
}
function initialMarks(detail:ClassDetail){return Object.fromEntries(detail.students.map(s=>[s.id,{status:s.status??'',note:s.note??''}]))}
export function ClassRegister({school,initial}:{school:string;initial:ClassDetail}){
 const router=useRouter(),[pending,startTransition]=useTransition()
 const [detail,setDetail]=useState(initial),[marks,setMarks]=useState(initialMarks(initial)),[dirty,setDirty]=useState(false)
 const [reason,setReason]=useState(''),[message,setMessage]=useState('')
 useEffect(()=>{setDetail(initial);setMarks(initialMarks(initial));setDirty(false)},[initial])
 const editable=detail.can_edit&&detail.state==='draft'
 const marked=Object.values(marks).filter(m=>m.status).length
 function accept(result:ClassResult){
  setMessage(result.error??result.message??'')
  if(result.detail){setDetail(result.detail);setMarks(initialMarks(result.detail));setDirty(false);setReason('')}
  if(!result.error)router.refresh()
 }
 function save(){
  if(pending)return
  if(Object.values(marks).some(mark=>!mark.status&&mark.note.trim())){setMessage('Selecciona un estado para cada estudiante que tenga una observación antes de guardar.');return}
  const payload=Object.entries(marks).filter(([,mark])=>mark.status).map(([student_id,mark])=>({student_id,...mark}))
  startTransition(async()=>{try{accept(await saveAttendance(school,detail.id,detail.revision,payload,reason))}catch{setMessage('No se recibió la confirmación. Recarga la sesión para revisar lo guardado antes de reintentar.')}})
 }
 function changeState(state:string){
  if(pending||dirty)return
  startTransition(async()=>{try{accept(await changeSessionState(school,detail.id,detail.revision,state,reason))}catch{setMessage('No se recibió la confirmación. Recarga la sesión antes de reintentar.')}})
 }
 function reload(){
  if(dirty&&!window.confirm('Se descartarán los cambios sin guardar. ¿Recargar la sesión?'))return
  startTransition(async()=>{try{accept(await loadClass(school,detail.id))}catch{setMessage('No se pudo recargar la sesión.')}})
 }
 function markPending(){
  setMarks(current=>Object.fromEntries(Object.entries(current).map(([id,m])=>{const student=detail.students.find(s=>s.id===id);return[id,!m.status&&student?.gate_kind!=='exit'&&student?.gate_kind!=='early_exit'?{...m,status:'present'}:m]})))
  setDirty(true)
 }
 return <section id="attendance"><h2>{detail.course} · {detail.classroom}</h2><p>{detail.date} · {detail.starts_at.slice(0,5)}–{detail.ends_at.slice(0,5)} · <strong>{detail.state==='closed'?'Cerrada / publicada':'Borrador'}</strong></p>{detail.topic&&<p>Tema: {detail.topic}</p>}
  <p>{marked} de {detail.students.length} estudiantes visibles con marcación. La información de portería es una referencia hasta {formatGateTime(detail.gate_cutoff)}; no decide la asistencia a clase.</p>
  {editable&&<><button type="button" className="secondary" disabled={pending} onClick={markPending}>Marcar pendientes como presentes</button><p>Esta acción no cambia filas ya marcadas ni estudiantes que figuran fuera en portería. Revisa cada caso antes de guardar.</p></>}
  {message&&<p className="notice" role="status">{message}</p>}
  <div className="table-scroll"><table className="class-register"><thead><tr><th>Estudiante</th><th>Portería</th><th>Asistencia a clase</th><th>Observación / justificación</th></tr></thead><tbody>{detail.students.map(s=><tr key={s.id}><td>{s.last_names}, {s.first_names}<br/>{s.dni??'Sin DNI'}</td><td>{s.gate_kind?<><strong>{movements[s.gate_kind]}</strong><br/>{s.gate_at&&formatGateTime(s.gate_at)}{s.gate_reason&&<p>{reasons[s.gate_reason]}{s.gate_expects_return?' · Retorno previsto':''}</p>}</>:'Sin movimiento registrado para esta referencia'}</td><td>{editable?<select aria-label={'Asistencia de '+s.last_names+' '+s.first_names} value={marks[s.id]?.status??''} disabled={pending} onChange={e=>{setMarks({...marks,[s.id]:{...marks[s.id],status:e.target.value}});setDirty(true)}}><option value="" disabled={!!s.status}>Pendiente</option>{Object.entries(classStatuses).map(([status,label])=><option value={status} key={status}>{label}</option>)}</select>:classStatuses[s.status??'']??'Pendiente'}</td><td>{editable?<textarea aria-label={'Observación de '+s.last_names+' '+s.first_names} rows={2} maxLength={500} value={marks[s.id]?.note??''} disabled={pending} onChange={e=>{setMarks({...marks,[s.id]:{...marks[s.id],note:e.target.value}});setDirty(true)}}/>:s.note??'—'}</td></tr>)}</tbody></table></div>
  {editable&&<><label>Motivo de corrección (si cambias una marcación ya guardada)<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} rows={2} disabled={pending}/></label><p>Las ausencias justificadas requieren una explicación en la fila del estudiante. No incluyas diagnósticos médicos.</p></>}
  <div className="import-controls">{editable&&<><button disabled={pending||!marked} onClick={save}>{pending?'Procesando…':'Guardar asistencia'}</button><button className="secondary" disabled={pending||dirty||marked!==detail.students.length} onClick={()=>changeState('closed')}>Cerrar y publicar sesión</button></>}<button className="secondary" disabled={pending} onClick={reload}>Recargar sesión</button></div>
  {editable&&dirty&&<p className="notice">Hay cambios sin guardar. Guarda antes de cerrar la sesión.</p>}
  {detail.state==='closed'&&detail.can_manage&&<details><summary>Reabrir sesión para corregir</summary><p>Se ocultará temporalmente a los apoderados hasta volver a cerrarla. Quedará constancia de la reapertura.</p><label>Motivo obligatorio<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} disabled={pending}/></label><button disabled={pending||!reason.trim()} onClick={()=>changeState('draft')}>Reabrir sesión</button></details>}
 </section>
}
