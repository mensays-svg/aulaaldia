'use client'
import Link from 'next/link'
import Icon from '@/app/components/ui-icon'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { searchGateStudent,loadGateStudent,markGateEvent,generateGateQr,saveGateSchedule } from './actions'
import { movements,reasons,stateLabels,formatGateTime,gateQrToken,limaDate,type GateStudent,type GateResult } from '@/lib/school/gate'
import Scanner from './scanner'

type Room={id:string;label:string}
function defaultMovement(s:GateStudent){return s.state==='inside'?'exit':s.state==='awaiting_return'?'return':'entry'}
export default function GateConsole({school,schoolName,rooms,manager,periods=[]}:{school:string;schoolName:string;rooms:Room[];manager:boolean;periods?:{id:string;name:string;academic_year:number;starts_on:string;ends_on:string}[]}){
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
 const [qrRead,setQrRead]=useState(''),[manual,setManual]=useState(false),[lastRegistered,setLastRegistered]=useState<{id:string;name:string}|null>(null)
 const qrInput=useRef<HTMLInputElement>(null),cameraSource=useRef(false),lastCameraCode=useRef('')
 const today=limaDate(),period=periods.find(p=>p.starts_on<=today&&p.ends_on>=today)??periods.find(p=>p.starts_on<=today)??periods[0]
 const pdfHref=(id:string)=>period?'/dashboard/reportes/pdf?'+new URLSearchParams({school,student:id,period:period.id}):null
 const request=useRef<string|null>(null)
 const searchInput=useRef<HTMLInputElement>(null),focusNext=useRef(false)
 useEffect(()=>{if(!pending&&focusNext.current){focusNext.current=false;if(method==='qr'){qrInput.current?.focus();qrInput.current?.select()}else{searchInput.current?.focus();searchInput.current?.select()}}},[pending,method])
 function apply(student:GateStudent){setSelected(student);setMovement(defaultMovement(student));request.current=null}
 function clearMessages(){setError('');setFeedback('')}
 function search(text:string,fromCamera=false){
  if(pending)return
  cameraSource.current=fromCamera
  setCamera(false);clearMessages();setSelected(null);setQrImage('');setCandidates([])
  const fromQr=gateQrToken(text)
  const source=fromQr?'qr':/^\d{8}$/.test(text.trim())?'dni':'apellidos'
  setMethod(source);setScanned(fromQr?text:'');setQuery(fromQr?'':text)
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
    setFeedback((result.message??'Movimiento registrado.')+' · '+selected.last_names+', '+selected.first_names)
    setLastRegistered({id:selected.id,name:selected.last_names+', '+selected.first_names})
    if(result.student)apply(result.student);else setSelected(null)
    request.current=null;form.reset();setQrRead('');setQrImage('');if(cameraSource.current){lastCameraCode.current=scanned;setSelected(null);setCamera(true)}else focusNext.current=true;router.refresh()
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
  <section className="gate-priority"><div className="qr-priority-panel"><span className="qr-priority-symbol"><Icon name="scan"/></span><div><p className="eyebrow">ACCESO PRINCIPAL</p><h2>Escanear carnet QR</h2><p>Lee el QR del estudiante y confirma su identidad antes de registrar la entrada o salida.</p></div><button type="button" className="qr-camera-button" disabled={pending} onClick={()=>{lastCameraCode.current='';setCamera(true);setManual(false)}}><Icon name="scan"/> Escanear con cámara</button>
   <form className="qr-reader-form" onSubmit={e=>{e.preventDefault();if(!gateQrToken(qrRead)){setError('La lectura no corresponde a un carnet de Aula al Día. Si no tiene QR, utiliza la búsqueda por DNI o nombres.');return}search(qrRead)}}><label>Lector QR externo<input ref={qrInput} value={qrRead} autoFocus inputMode="none" autoComplete="off" onChange={e=>setQrRead(e.target.value)} placeholder="Escanea con tu lector y pulsa Enter" maxLength={160} disabled={pending}/></label><button disabled={pending||!qrRead.trim()}>Leer QR</button></form></div>
   {camera&&<Scanner ignoredText={lastCameraCode.current} onScan={text=>{if(gateQrToken(text))search(text,true);else{setCamera(false);setError('Ese QR no es un carnet de Aula al Día. Usa la búsqueda por DNI o nombres.')}}} onClose={()=>setCamera(false)}/>}
   <details className="gate-manual-search" open={manual} onToggle={e=>setManual(e.currentTarget.open)}><summary>¿No trae QR? Buscar por DNI o apellidos y nombres</summary><form className="search" onSubmit={e=>{e.preventDefault();search(query)}}><label>DNI, apellidos o nombres<input ref={searchInput} value={query} maxLength={160} onChange={e=>setQuery(e.target.value)} placeholder="Pide el DNI y verifica los nombres" disabled={pending} required/></label><button disabled={pending}>{pending?'Buscando…':'Buscar estudiante'}</button></form><p>Si no recuerda su DNI, busca sus apellidos y nombres. Verifica también el salón antes de confirmar.</p></details>
   {!!candidates.length && <div className="gate-candidates">{candidates.map(s=><button className="secondary" disabled={pending} key={s.id} onClick={()=>choose(s.id)}>{s.last_names}, {s.first_names} · DNI {s.dni??'sin registrar'}{!s.active?' · Inactivo':''}</button>)}{candidates.length===20 && <p>Se muestran hasta 20 coincidencias. Afina la búsqueda para encontrar al estudiante.</p>}</div>}
   {error && <p role="alert" className="notice error">{error}</p>}{feedback && <div role="status" className="notice"><p>{feedback}</p>{lastRegistered&&pdfHref(lastRegistered.id)&&<a href={pdfHref(lastRegistered.id)!}>Descargar PDF individual · {lastRegistered.name}</a>}</div>}
   {selected && <div className="gate-selected"><h3>{selected.last_names}, {selected.first_names}</h3><p>DNI: {selected.dni??'Sin DNI'} · {selected.classroom}</p><p className="gate-state"><strong>{stateLabels[selected.state]}</strong> · {selected.day}</p>{selected.last_at && <p>Último movimiento: {movements[selected.last_kind??'']} · {formatGateTime(selected.last_at)}</p>}
    <p>{selected.starts_at?`Ingreso: ${selected.starts_at.slice(0,5)} · tolerancia: ${selected.grace_minutes} min.`:'Sin horario configurado: el ingreso se registrará sin clasificar puntualidad.'}</p>
    {!selected.active?<p className="notice">El estudiante está inactivo. Revisa su ficha antes de marcar.</p>:<form key={selected.id+selected.last_at} onChange={()=>{request.current=null}} onSubmit={e=>{e.preventDefault();mark(e.currentTarget)}}>
     <label>Movimiento<select name="movement" value={movement} disabled={pending} onChange={e=>setMovement(e.target.value)}>{selected.state==='inside'?<><option value="exit">Salida de jornada</option><option value="early_exit">Salida anticipada</option></>:selected.state==='awaiting_return'?<option value="return">Retorno autorizado</option>:<option value="entry">Entrada{selected.state==='outside'?' / reingreso':''}</option>}</select></label>
     {movement==='early_exit' && <><div className="grid-form"><label>Motivo<select name="reason" required disabled={pending}><option value="">Seleccionar motivo</option>{Object.entries(reasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Autorizado por<input name="authorization" maxLength={120} required disabled={pending} placeholder="Nombre de quien autorizó" /></label><label>Persona que recoge (si corresponde)<input name="companion" maxLength={120} disabled={pending} /></label><label>¿Se espera su retorno hoy?<select name="will_return" disabled={pending}><option value="false">No</option><option value="true">Sí</option></select></label></div><p>Registra solo la información necesaria; no incluyas diagnósticos médicos. La autorización debe verificarse según el procedimiento del colegio.</p></>}
     <details><summary>Agregar observación (opcional)</summary><label>Observación<textarea name="note" rows={2} maxLength={500} disabled={pending} /></label></details><button disabled={pending}>{pending?'Guardando…':`Confirmar ${movements[movement]?.toLowerCase()}`}</button>
    </form>}
    <div className="import-controls"><Link href={'/dashboard/reportes?'+new URLSearchParams({school,student:selected.id,...(period?{period:period.id}:{})})}>Ver reporte individual</Link>{pdfHref(selected.id)&&<a className="import-link" href={pdfHref(selected.id)!}>Descargar PDF individual</a>}</div>
    <div className="import-controls"><button type="button" className="secondary" disabled={pending} onClick={()=>choose(selected.id)}>Actualizar estado</button>{manager&&<button type="button" className="secondary" disabled={pending||!selected.active} onClick={()=>makeQr(false)}>Ver / generar carnet QR</button>}{manager&&qrImage && <button type="button" className="secondary" disabled={pending} onClick={()=>makeQr(true)}>Reemplazar QR</button>}</div>
    {qrImage && <><article className="gate-card"><strong>{schoolName}</strong><h3>{selected.last_names}, {selected.first_names}</h3><p>{selected.classroom}</p>{/* The QR contains only a random identifier, not the DNI. */}<img src={qrImage} width={240} height={240} alt="Carnet QR del estudiante seleccionado" /><p>Carnet de identificación · Aula al Día</p></article><div className="import-controls"><button className="secondary" type="button" onClick={()=>window.print()}>Imprimir carnet</button><a href={qrImage} download="carnet-qr.png">Descargar QR</a></div><p>El QR no es una autorización de salida. Si se pierde o copia, reemplázalo.</p></>}
   </div>}
  </section>
  {manager && <section><details><summary>Configurar horario de ingreso por aula</summary><p>El primer ingreso del día será tardanza si supera la hora más la tolerancia. No se impide el ingreso y no se modifica la nota de conducta.</p><form className="grid-form" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);data.set('school',school);startTransition(async()=>{try{const result=await saveGateSchedule(data);setScheduleMessage(result.error??result.message??'');if(!result.error){if(selected){const refreshed=await loadGateStudent(school,selected.id);if(refreshed.student)apply(refreshed.student)}router.refresh()}}catch{setScheduleMessage('No se pudo guardar el horario.')}})}}><label>Aula<select name="classroom" required disabled={pending}><option value="">Seleccionar aula</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label>Hora de ingreso (Lima)<input name="start" type="time" required disabled={pending} /></label><label>Tolerancia en minutos<input name="tolerance" type="number" min={0} max={120} defaultValue={0} required disabled={pending} /></label><button disabled={pending}>Guardar horario</button></form>{scheduleMessage && <p role="status">{scheduleMessage}</p>}</details></section>}
 </>
}
