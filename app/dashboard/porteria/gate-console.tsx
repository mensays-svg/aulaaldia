'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { searchGateStudent,loadGateStudent,markGateEvent,generateGateQr,saveGateSchedule } from './actions'
import { movements,reasons,stateLabels,formatGateTime,gateQrToken,type GateStudent,type GateResult } from '@/lib/school/gate'
import Scanner from './scanner'

type Room={id:string;label:string}
function defaultMovement(s:GateStudent){return s.state==='inside'?'exit':s.state==='awaiting_return'?'return':'entry'}
export default function GateConsole({school,schoolName,rooms,manager}:{school:string;schoolName:string;rooms:Room[];manager:boolean}){
 const router=useRouter()
 const [pending,startTransition]=useTransition()
 const [query,setQuery]=useState('')
 const [candidates,setCandidates]=useState<NonNullable<GateResult['students']>>([])
 const [selected,setSelected]=useState<GateStudent|null>(null)
 const [feedback,setFeedback]=useState('')
 const [error,setError]=useState('')
 const [camera,setCamera]=useState(false)
 const [movement,setMovement]=useState('entry')
 const [method,setMethod]=useState('apellidos')
 const [scanned,setScanned]=useState('')
 const [qrImage,setQrImage]=useState('')
 const [scheduleMessage,setScheduleMessage]=useState('')
 const request=useRef<string|null>(null)
 function apply(student:GateStudent){setSelected(student);setMovement(defaultMovement(student));request.current=null}
 function clearMessages(){setError('');setFeedback('')}
 function search(text:string){
  if(pending)return
  setCamera(false);clearMessages();setSelected(null);setQrImage('');setCandidates([])
  const fromQr=gateQrToken(text)
  const source=fromQr?'qr':/^\d{8}$/.test(text.trim())?'dni':'apellidos'
  setMethod(source);setScanned(fromQr?text:'');setQuery(text)
  startTransition(async()=>{
   try{const result=await searchGateStudent(school,text)
    if(result.error)setError(result.error)
    else if(result.student)apply(result.student)
    else{setCandidates(result.students??[]);setFeedback(result.students?.length?'Selecciona al estudiante y comprueba su identidad antes de marcar.':'No se encontraron estudiantes. Revisa el DNI o los apellidos.')}
   }catch{setError('No se pudo buscar. Revisa la conexión e inténtalo de nuevo.')}
  })
 }
 function choose(id:string){
  clearMessages();setQrImage('')
  startTransition(async()=>{try{const result=await loadGateStudent(school,id);if(result.error)setError(result.error);else if(result.student){apply(result.student);setCandidates([])}}catch{setError('No se pudo cargar al estudiante.')}})
 }
 function mark(form:HTMLFormElement){
  if(!selected || pending || !form.reportValidity())return
  const data=new FormData(form)
  request.current??=crypto.randomUUID()
  data.set('request',request.current);data.set('school',school);data.set('student',selected.id);data.set('method',method);data.set('qr',scanned)
  clearMessages()
  startTransition(async()=>{try{
   const result=await markGateEvent(data)
   if(result.error)setError(result.error)
   else{
    setFeedback(result.message??'Movimiento registrado.')
    if(result.student)apply(result.student);else setSelected(null)
    request.current=null;form.reset();router.refresh()
   }
  }catch{setError('No se recibió la confirmación. Puedes reintentar el mismo movimiento sin cambiar los datos; el identificador del intento evita duplicarlo. Revisa también el historial.')}})
 }
 function makeQr(rotate:boolean){
  if(!selected || pending)return
  if(rotate && !window.confirm('El QR anterior dejará de funcionar. ¿Generar uno nuevo?'))return
  clearMessages()
  startTransition(async()=>{try{
   const result=await generateGateQr(school,selected.id,rotate)
   if(result.error)setError(result.error)
   else if(result.qr){const QRCode=await import('qrcode');setQrImage(await QRCode.toDataURL(result.qr,{width:320,margin:3,errorCorrectionLevel:'M'}));if(rotate){setMethod('apellidos');setScanned('')}setFeedback(rotate?'Nuevo QR generado; el anterior quedó invalidado.':'Carnet QR listo. El escaneo identifica al estudiante; debes confirmar el movimiento.')}
  }catch{setError('No se pudo generar el QR. Vuelve a intentarlo.')}})
 }
 return <>
  <section><h2>Registrar movimiento</h2><p>Busca al estudiante o escanea su carnet. Comprueba el nombre y el aula antes de confirmar. Todas las horas corresponden a Lima.</p>
   <form className="search" onSubmit={e=>{e.preventDefault();search(query)}}><label>DNI, apellidos, nombres o lectura QR<input value={query} maxLength={160} onChange={e=>setQuery(e.target.value)} placeholder="Escribe el DNI o los apellidos" disabled={pending} required /></label><button disabled={pending}>{pending?'Procesando…':'Buscar'}</button><button className="secondary" type="button" disabled={pending} onClick={()=>setCamera(true)}>Abrir cámara QR</button></form>
   {camera && <Scanner onScan={text=>{if(gateQrToken(text))search(text);else{setCamera(false);setError('Ese QR no es un carnet de Aula al Día. Usa el carnet generado por la institución.')}}} onClose={()=>setCamera(false)} />}
   {!!candidates.length && <div className="gate-candidates">{candidates.map(s=><button className="secondary" disabled={pending} key={s.id} onClick={()=>choose(s.id)}>{s.last_names}, {s.first_names} · DNI {s.dni??'sin registrar'}{!s.active?' · Inactivo':''}</button>)}{candidates.length===20 && <p>Se muestran hasta 20 coincidencias. Afina la búsqueda para encontrar al estudiante.</p>}</div>}
   {error && <p role="alert" className="notice error">{error}</p>}{feedback && <p role="status" className="notice">{feedback}</p>}
   {selected && <div className="gate-selected"><h3>{selected.last_names}, {selected.first_names}</h3><p>DNI: {selected.dni??'Sin DNI'} · {selected.classroom}</p><p className="gate-state"><strong>{stateLabels[selected.state]}</strong> · {selected.day}</p>{selected.last_at && <p>Último movimiento: {movements[selected.last_kind??'']} · {formatGateTime(selected.last_at)}</p>}
    <p>{selected.starts_at?`Ingreso: ${selected.starts_at.slice(0,5)} · tolerancia: ${selected.grace_minutes} min.`:'Sin horario configurado: el ingreso se registrará sin clasificar puntualidad.'}</p>
    {!selected.active?<p className="notice">El estudiante está inactivo. Revisa su ficha antes de marcar.</p>:<form key={selected.id+selected.last_at} onChange={()=>{request.current=null}} onSubmit={e=>{e.preventDefault();mark(e.currentTarget)}}>
     <label>Movimiento<select name="movement" value={movement} disabled={pending} onChange={e=>setMovement(e.target.value)}>{selected.state==='inside'?<><option value="exit">Salida de jornada</option><option value="early_exit">Salida anticipada</option></>:selected.state==='awaiting_return'?<option value="return">Retorno autorizado</option>:<option value="entry">Entrada{selected.state==='outside'?' / reingreso':''}</option>}</select></label>
     {movement==='early_exit' && <><div className="grid-form"><label>Motivo<select name="reason" required disabled={pending}><option value="">Seleccionar motivo</option>{Object.entries(reasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Autorizado por<input name="authorization" maxLength={120} required disabled={pending} placeholder="Nombre de quien autorizó" /></label><label>Persona que recoge (si corresponde)<input name="companion" maxLength={120} disabled={pending} /></label><label>¿Se espera su retorno hoy?<select name="will_return" disabled={pending}><option value="false">No</option><option value="true">Sí</option></select></label></div><p>Registra solo la información necesaria; no incluyas diagnósticos médicos. La autorización debe verificarse según el procedimiento del colegio.</p></>}
     <label>Observación (opcional)<textarea name="note" rows={2} maxLength={500} disabled={pending} /></label><button disabled={pending}>{pending?'Guardando…':`Confirmar ${movements[movement]?.toLowerCase()}`}</button>
    </form>}
    <div className="import-controls"><button type="button" className="secondary" disabled={pending} onClick={()=>choose(selected.id)}>Actualizar estado</button><button type="button" className="secondary" disabled={pending||!selected.active} onClick={()=>makeQr(false)}>Ver / generar carnet QR</button>{qrImage && <button type="button" className="secondary" disabled={pending} onClick={()=>makeQr(true)}>Reemplazar QR</button>}</div>
    {qrImage && <><article className="gate-card"><strong>{schoolName}</strong><h3>{selected.last_names}, {selected.first_names}</h3><p>{selected.classroom}</p>{/* The QR contains only a random identifier, not the DNI. */}<img src={qrImage} width={240} height={240} alt="Carnet QR del estudiante seleccionado" /><p>Carnet de identificación · Aula al Día</p></article><div className="import-controls"><button className="secondary" type="button" onClick={()=>window.print()}>Imprimir carnet</button><a href={qrImage} download="carnet-qr.png">Descargar QR</a></div><p>El QR no es una autorización de salida. Si se pierde o copia, reemplázalo.</p></>}
   </div>}
  </section>
  {manager && <section><details><summary>Configurar horario de ingreso por aula</summary><p>El primer ingreso del día será tardanza si supera la hora más la tolerancia. No se impide el ingreso y no se modifica la nota de conducta.</p><form className="grid-form" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);data.set('school',school);startTransition(async()=>{try{const result=await saveGateSchedule(data);setScheduleMessage(result.error??result.message??'');if(!result.error){if(selected){const refreshed=await loadGateStudent(school,selected.id);if(refreshed.student)apply(refreshed.student)}router.refresh()}}catch{setScheduleMessage('No se pudo guardar el horario.')}})}}><label>Aula<select name="classroom" required disabled={pending}><option value="">Seleccionar aula</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label>Hora de ingreso (Lima)<input name="start" type="time" required disabled={pending} /></label><label>Tolerancia en minutos<input name="tolerance" type="number" min={0} max={120} defaultValue={0} required disabled={pending} /></label><button disabled={pending}>Guardar horario</button></form>{scheduleMessage && <p role="status">{scheduleMessage}</p>}</details></section>}
 </>
}
