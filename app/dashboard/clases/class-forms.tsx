'use client'
import { useEffect,useRef,useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCourse,createSession,loadClass,saveAttendance,changeSessionState,scanClassQr } from './actions'
import { classStatuses,type ClassDetail,type ClassResult } from '@/lib/school/classes'
import { formatGateTime,movements,reasons,gateQrToken } from '@/lib/school/gate'

import Scanner from '../porteria/scanner'
import Icon from '@/app/components/ui-icon'

type Room={id:string;label:string}
type Course={id:string;name:string}
type Assignment={classroom_id:string;user_id:string;label:string}
export function ClassSetup({school,user,manager,rooms,courses,assignments,date,primary=false}:{primary?:boolean;school:string;user:string;manager:boolean;rooms:Room[];courses:Course[];assignments:Assignment[];date:string}){
 const router=useRouter(),[pending,startTransition]=useTransition()
 const [room,setRoom]=useState(rooms.length===1?rooms[0].id:''),[message,setMessage]=useState('')
 const teachers=assignments.filter(a=>a.classroom_id===room)
 async function submit(form:HTMLFormElement,course:boolean){
  const data=new FormData(form);data.set('school',school)
  startTransition(async()=>{try{
   const result=course?await createCourse(data):await createSession(data)
   setMessage(result.error??result.message??'')
   if(!result.error){form.reset();setRoom(rooms.length===1?rooms[0].id:'');if(result.sessionId)router.push('/dashboard/clases?'+new URLSearchParams({school,date:String(data.get('date')),session:result.sessionId,scan:'1'})+'#attendance');else router.refresh()}
  }catch{setMessage('No se pudo completar la solicitud. Revisa el listado antes de reintentar.')}})
 }
 return <section className={primary?'teacher-open-session':undefined}><h2>{primary?'Abrir sesión y llamar asistencia':'Preparar una clase'}</h2><p>La sesión toma la lista de estudiantes activos del aula en ese momento. No se marca asistencia automáticamente.</p>
  {manager&&<details><summary>Registrar curso</summary><form onSubmit={e=>{e.preventDefault();void submit(e.currentTarget,true)}}><label>Nombre del curso<input name="name" minLength={2} maxLength={100} required disabled={pending} placeholder="Ej.: Matemática"/></label><button disabled={pending}>Registrar curso</button></form></details>}
  <details open={primary}><summary>Abrir o continuar una sesión</summary><form className="grid-form" onSubmit={e=>{e.preventDefault();void submit(e.currentTarget,false)}}>
   <label>Aula<select name="classroom" value={room} onChange={e=>setRoom(e.target.value)} required disabled={pending}><option value="">Seleccionar aula</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
   <label>Curso<select name="course" defaultValue={courses.length===1?courses[0].id:''} required disabled={pending}><option value="">Seleccionar curso</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   {manager?<label>Docente responsable<select name="teacher" defaultValue={teachers.length===1?teachers[0].user_id:''} required disabled={pending||!room} key={room}><option value="">Seleccionar docente asignado</option>{teachers.map(t=><option key={t.user_id} value={t.user_id}>{t.label}</option>)}</select></label>:<input type="hidden" name="teacher" value={user}/>}
   <label>Fecha de la clase<input name="date" type="date" defaultValue={date} required disabled={pending}/></label>
   <label>Inicio (Lima)<input name="start" type="time" required disabled={pending}/></label><label>Fin (Lima)<input name="end" type="time" required disabled={pending}/></label>
   <label>Tema (opcional)<input name="topic" maxLength={160} disabled={pending}/></label><button disabled={pending||!courses.length||!rooms.length}>Abrir sesión e iniciar QR</button>
  </form>{manager&&room&&!teachers.length&&<p className="notice">Primero asigna un docente a esta aula en Personas y vínculos.</p>}{!courses.length&&<p>Dirección o administración debe registrar al menos un curso.</p>}{!rooms.length&&<p>No tienes aulas disponibles. Revisa la asignación del docente.</p>}</details>
  {message&&<p className="notice" role="status">{message}</p>}
 </section>
}
function initialMarks(detail:ClassDetail){return Object.fromEntries(detail.students.map(s=>[s.id,{status:s.status??'',note:s.note??''}]))}
export function ClassRegister({school,initial,autoScan=false}:{school:string;initial:ClassDetail;autoScan?:boolean}){
 const router=useRouter(),[pending,startTransition]=useTransition()
 const [detail,setDetail]=useState(initial),[marks,setMarks]=useState(initialMarks(initial)),[dirty,setDirty]=useState(false)
 const [reason,setReason]=useState(''),[message,setMessage]=useState('')
 const [camera,setCamera]=useState(autoScan),[qrText,setQrText]=useState(''),[query,setQuery]=useState(''),[onlyPending,setOnlyPending]=useState(false),[highlight,setHighlight]=useState('')
 const attempt=useRef<{text:string;id:string}|null>(null),lastCode=useRef(''),qrInput=useRef<HTMLInputElement>(null),focusQr=useRef(false)
 useEffect(()=>{if(!pending&&focusQr.current){focusQr.current=false;qrInput.current?.focus()}},[pending])

 useEffect(()=>{setDetail(initial);setMarks(initialMarks(initial));setDirty(false)},[initial])
 const editable=detail.can_edit&&detail.state==='draft'
 const marked=Object.values(marks).filter(m=>m.status).length
 function accept(result:ClassResult){
  setMessage(result.error??result.message??'')
  if(result.detail){setDetail(result.detail);setMarks(initialMarks(result.detail));setDirty(false);setReason('')}
  if(!result.error)router.refresh()
 }
 function save(publish=false){
  if(pending)return
  if(publish&&marked!==detail.students.length){setMessage('Revisa las marcaciones pendientes antes de publicar.');return}
  if(Object.values(marks).some(mark=>!mark.status&&mark.note.trim())){setMessage('Selecciona un estado para cada estudiante que tenga una observación antes de guardar.');return}
  const payload=Object.entries(marks).filter(([,mark])=>mark.status).map(([student_id,mark])=>({student_id,...mark}))
  startTransition(async()=>{try{accept(await saveAttendance(school,detail.id,detail.revision,payload,reason,publish))}catch{setMessage('No se recibió la confirmación. Recarga la sesión para revisar lo guardado antes de reintentar.')}})
 }
 function changeState(state:string){
  if(pending||dirty)return
  startTransition(async()=>{try{accept(await changeSessionState(school,detail.id,detail.revision,state,reason))}catch{setMessage('No se recibió la confirmación. Recarga la sesión antes de reintentar.')}})
 }
 function reload(){
  if(dirty&&!window.confirm('Se descartarán los cambios sin guardar. ¿Recargar la sesión?'))return
  startTransition(async()=>{try{accept(await loadClass(school,detail.id))}catch{setMessage('No se pudo recargar la sesión.')}})
 }
 function scan(text:string,fromCamera=false){
  if(pending)return
  if(dirty){setCamera(false);setMessage('Guarda el borrador antes de escanear para conservar tus cambios manuales.');return}
  if(!gateQrToken(text)){setMessage('El código no corresponde a un carnet QR de Aula al Día.');setCamera(false);return}
  if(attempt.current?.text!==text)attempt.current={text,id:crypto.randomUUID()}
  const request=attempt.current.id
  startTransition(async()=>{try{
   const result=await scanClassQr(school,detail.id,detail.revision,text,request)
   if(result.error){setMessage(result.error);setCamera(false);return}
   if(!result.student_id||result.revision===undefined){setMessage('No se recibió una respuesta válida. Recarga para revisar lo guardado.');setCamera(false);return}
   lastCode.current=text;attempt.current=null;setQrText('');setHighlight(result.student_id)
   if(result.needs_review){setDetail(current=>({...current,students:current.students.map(s=>s.id===result.student_id?{...s,gate_kind:result.gate_kind??s.gate_kind,gate_at:result.gate_at??s.gate_at,gate_reason:result.gate_reason??s.gate_reason,gate_expects_return:result.gate_expects_return??s.gate_expects_return}:s)}));setMessage(result.name+' figura fuera en portería. No se marcó asistencia; revisa su fila antes de publicar.')}
   else{
    setDetail(current=>({...current,revision:result.revision!,students:current.students.map(s=>s.id===result.student_id?{...s,status:result.status??s.status}:s)}))
    setMarks(current=>({...current,[result.student_id!]:{...current[result.student_id!],status:result.status??current[result.student_id!]?.status??''}}))
    setMessage(result.name+(result.repeated?' ya tenía marcación; se conservó su estado.':' · Presente guardado en el borrador.'))
   }
   if(!fromCamera)focusQr.current=true
  }catch{setCamera(false);setMessage('No se recibió confirmación. Reintenta el mismo carnet o recarga para revisar lo guardado; el intento evita duplicados.')}})
 }
 const visible=detail.students.filter(s=>(!onlyPending||!marks[s.id]?.status)&&(!query||`${s.last_names} ${s.first_names} ${s.dni??''}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))))
 const corrections=detail.students.some(s=>s.status!==null&&(marks[s.id]?.status!==s.status||marks[s.id]?.note!==(s.note??'')))
 function markPending(){
  const outside=new Set(detail.students.filter(s=>s.gate_kind==='exit'||s.gate_kind==='early_exit').map(s=>s.id)),next={...marks}
  let changed=false
  for(const [id,m] of Object.entries(marks))if(!m.status&&!outside.has(id)){next[id]={...m,status:'present'};changed=true}
  if(changed){setMarks(next);setDirty(true)}else setMessage('No hay pendientes elegibles para marcar en bloque. Revisa los casos de salida individualmente.')
 }

 return <section id="attendance"><h2>{detail.course} · {detail.classroom}</h2><p>{detail.date} · {detail.starts_at.slice(0,5)}–{detail.ends_at.slice(0,5)} · <strong>{detail.state==='closed'?'Cerrada / publicada':'Borrador'}</strong></p>{detail.topic&&<p>Tema: {detail.topic}</p>}
  <div className="class-live-counts"><span><strong>{Object.values(marks).filter(m=>m.status==='present').length}</strong> Presentes</span><span><strong>{detail.students.length-marked}</strong> Pendientes</span><span><strong>{Object.values(marks).filter(m=>m.status==='late').length}</strong> Tardanzas</span><span><strong>{Object.values(marks).filter(m=>m.status==='justified').length}</strong> Justificados</span></div>
  {editable&&<div className="class-qr-panel"><p className="eyebrow">SESIÓN ABIERTA · QR DE TU LISTA</p><h3>Escanear asistencia de clase</h3><p>Cada lectura válida guarda un presente en el borrador, solo durante el horario de esta sesión. Publica después de revisar los pendientes.</p><button type="button" disabled={pending||dirty} onClick={()=>{lastCode.current='';setCamera(true)}}><Icon name="scan"/> Escanear con cámara</button><form className="search" onSubmit={e=>{e.preventDefault();scan(qrText)}}><label>Lector QR externo<input ref={qrInput} inputMode="none" value={qrText} onChange={e=>setQrText(e.target.value)} maxLength={160} disabled={pending||dirty} placeholder="Lee el carnet con tu lector"/></label><button disabled={pending||dirty||!qrText.trim()}>Leer QR</button></form>{dirty&&<p className="notice">Hay cambios manuales sin guardar. Guarda el borrador para continuar con QR.</p>}{camera&&!pending&&!dirty&&<Scanner ignoredText={lastCode.current} onScan={text=>scan(text,true)} onClose={()=>setCamera(false)}/>}</div>}
  <p>{marked} de {detail.students.length} estudiantes visibles con marcación. Referencia inicial de portería: {formatGateTime(detail.gate_cutoff)}. El QR actualiza las alertas de salida; la asistencia a clase la decide el docente.</p>
  <div className="class-roster-tools"><label>Sin QR: buscar por DNI o apellidos y nombres<input value={query} onChange={e=>setQuery(e.target.value)} maxLength={120} placeholder="Busca únicamente en esta lista"/></label><button type="button" className="secondary" aria-pressed={onlyPending} onClick={()=>setOnlyPending(!onlyPending)}>{onlyPending?'Mostrar toda la lista':'Revisar solo pendientes'}</button></div>
  {editable&&<><button type="button" className="secondary" disabled={pending} onClick={markPending}>Marcar pendientes como presentes</button><p>Esta acción no cambia filas ya marcadas ni estudiantes que figuran fuera en portería. Revisa cada caso antes de guardar.</p></>}
  {message&&<p className="notice" role="status">{message}</p>}
  <div className="table-scroll"><table className="class-register"><thead><tr><th>Estudiante</th><th>Portería</th><th>Asistencia a clase</th><th>Observación / justificación</th></tr></thead><tbody>{visible.map(s=><tr key={s.id} className={highlight===s.id?'scan-highlight':undefined}><td>{s.last_names}, {s.first_names}<br/>{s.dni??'Sin DNI'}</td><td>{s.gate_kind?<><strong>{movements[s.gate_kind]}</strong><br/>{s.gate_at&&formatGateTime(s.gate_at)}{s.gate_reason&&<p>{reasons[s.gate_reason]}{s.gate_expects_return?' · Retorno previsto':''}</p>}</>:'Sin movimiento registrado para esta referencia'}</td><td>{editable?<select aria-label={'Asistencia de '+s.last_names+' '+s.first_names} value={marks[s.id]?.status??''} disabled={pending} onChange={e=>{setMarks({...marks,[s.id]:{...marks[s.id],status:e.target.value}});setDirty(true)}}><option value="" disabled={!!s.status}>Pendiente</option>{Object.entries(classStatuses).map(([status,label])=><option value={status} key={status}>{label}</option>)}</select>:classStatuses[s.status??'']??'Pendiente'}</td><td>{editable?<textarea aria-label={'Observación de '+s.last_names+' '+s.first_names} rows={2} maxLength={500} value={marks[s.id]?.note??''} disabled={pending} onChange={e=>{setMarks({...marks,[s.id]:{...marks[s.id],note:e.target.value}});setDirty(true)}}/>:s.note??'—'}</td></tr>)}</tbody></table></div>
  {editable&&<>{corrections&&<label>Motivo de corrección (si cambias una marcación ya guardada)<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} rows={2} disabled={pending}/></label>}<p>Las ausencias justificadas requieren una explicación en la fila del estudiante. No incluyas diagnósticos médicos.</p></>}
  <div className="import-controls">{editable&&<><button disabled={pending||!detail.students.length||marked!==detail.students.length} onClick={()=>dirty?save(true):changeState('closed')}>{pending?'Procesando…':'Guardar y publicar asistencia'}</button><button className="secondary" disabled={pending||!marked} onClick={()=>save(false)}>Guardar borrador</button></>}<button className="secondary" disabled={pending} onClick={reload}>Recargar sesión</button></div>
  {!visible.length&&<p className="empty">No hay estudiantes que coincidan con esta búsqueda o filtro.</p>}
  {editable&&dirty&&<p className="notice">Hay cambios sin guardar. Puedes guardarlos y publicarlos en una sola acción, después de revisar la lista.</p>}
  {detail.state==='closed'&&detail.can_manage&&<details><summary>Reabrir sesión para corregir</summary><p>Se ocultará temporalmente a los apoderados hasta volver a cerrarla. Quedará constancia de la reapertura.</p><label>Motivo obligatorio<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} disabled={pending}/></label><button disabled={pending||!reason.trim()} onClick={()=>changeState('draft')}>Reabrir sesión</button></details>}
 </section>
}
