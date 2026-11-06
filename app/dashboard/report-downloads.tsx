'use client'
import Link from 'next/link'
import {useState} from 'react'
import Icon from '@/app/components/ui-icon'
type Period={id:string;name:string;academic_year:number;starts_on:string;ends_on:string}
type Student={id:string;first_names:string;last_names:string;dni:string|null}
export default function ReportDownloads({school,periods,students,manager,gateOnly,defaultPeriod,error}:{school:string;periods:Period[];students:Student[];manager:boolean;gateOnly:boolean;defaultPeriod:string;error:boolean}){
 const [selected,setSelected]=useState(defaultPeriod),[student,setStudent]=useState('')
 const period=periods.find(p=>p.id===selected)??periods.find(p=>p.id===defaultPeriod)??periods[0]
 const individual='/dashboard/reportes?'+new URLSearchParams({school,...(period?{period:period.id}:{}),...(students.some(s=>s.id===student)?{student}:{})})
 const general='/dashboard/reportes/direccion?'+new URLSearchParams({school,...(period?{period:period.id,year:String(period.academic_year)}:{})})
 return <section id="pdf-reports" className="dashboard-pdf"><div className="section-heading"><div><p className="eyebrow">CONSULTA Y DESCARGA</p><h2>Reportes PDF</h2></div><span>Descarga desde tu panel</span></div>
 <p>{gateOnly?'Descarga el reporte de entrada y salida de un estudiante.': 'Descarga la asistencia y el comportamiento publicado, según los permisos de tu cuenta.'}</p>
 {error?<p role="alert" className="notice">No se pudieron cargar los periodos. Recarga el panel para volver a intentarlo.</p>:!period?<p className="notice">Aún no hay periodos disponibles. Dirección o administración debe crear uno en Comportamiento.</p>:<>
 <label className="pdf-period">Periodo del reporte<select value={period.id} onChange={e=>setSelected(e.target.value)}>{periods.map(p=><option key={p.id} value={p.id}>{p.academic_year} · {p.name}</option>)}</select></label>
 <div className={'pdf-download-grid'+(!manager?' single':'')}><article className="pdf-download-card"><span className="quick-icon"><Icon name="users"/></span><h3>Reporte por estudiante</h3><p>{gateOnly?'Movimientos de portería del periodo elegido.':'Asistencia, evaluación de comportamiento y seguimiento compartido del periodo.'}</p>
 <form method="get" action="/dashboard/reportes/pdf"><input type="hidden" name="school" value={school}/><input type="hidden" name="period" value={period.id}/><label>Estudiante<select name="student" value={student} onChange={e=>setStudent(e.target.value)} required disabled={!students.length}><option value="">Selecciona un estudiante</option>{students.map(s=><option key={s.id} value={s.id}>{s.last_names}, {s.first_names}{s.dni?' · '+s.dni:''}</option>)}</select></label><button disabled={!students.length}><Icon name="folder"/> Descargar PDF individual</button></form>{!students.length&&<p>No tienes estudiantes disponibles para descargar según tus permisos.</p>}<Link href={individual}>Ver reporte antes de descargar →</Link></article>
 {manager&&<article className="pdf-download-card"><span className="quick-icon"><Icon name="chart"/></span><h3>Reporte general de la institución</h3><p>Resumen por aula y detalle de asistencia y comportamiento de todos los estudiantes del periodo.</p><form method="get" action="/dashboard/reportes/direccion/pdf"><input type="hidden" name="school" value={school}/><input type="hidden" name="period" value={period.id}/><input type="hidden" name="year" value={period.academic_year}/><input type="hidden" name="state" value="all"/><p className="pdf-scope">{period.academic_year} · Todas las aulas · Todos los estados de matrícula</p><button><Icon name="folder"/> Descargar PDF general</button></form><Link href={general}>Filtrar por nivel, grado o sección →</Link></article>}
 </div></>}
 </section>
}
