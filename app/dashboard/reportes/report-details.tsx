'use client'
import {useEffect,useRef} from 'react'
import type {ReportSection} from '@/lib/school/reports'
export default function ReportDetails({sections}:{sections:ReportSection[]}){
 const root=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  let previous:{element:HTMLDetailsElement;open:boolean}[]=[]
  const before=()=>{if(previous.length)return;previous=Array.from(root.current?.querySelectorAll('details')??[]).map(element=>({element,open:element.open}));previous.forEach(({element})=>{element.open=true})}
  const after=()=>{previous.forEach(({element,open})=>{element.open=open});previous=[]}
  window.addEventListener('beforeprint',before);window.addEventListener('afterprint',after)
  return()=>{window.removeEventListener('beforeprint',before);window.removeEventListener('afterprint',after);after()}
 },[])
 const empty=sections.filter(s=>s.columns&&!s.rows?.length)
 const available=sections.filter(s=>!s.columns||!!s.rows?.length)
 function expand(open:boolean){root.current?.querySelectorAll('details').forEach(d=>{d.open=open})}
 return <div className="compact-report-details" ref={root}><div className="section-heading"><div><p className="eyebrow">CONSULTA SOLO LO QUE NECESITAS</p><h2>Detalle del reporte</h2></div><div className="detail-controls"><button type="button" className="secondary" onClick={()=>expand(true)}>Abrir todo</button><button type="button" className="secondary" onClick={()=>expand(false)}>Cerrar todo</button></div></div>
 <p className="detail-hint">Abre una sección para ver sus registros. El PDF descargable conserva el reporte completo.</p>
 {available.map(s=><details className="report-disclosure" key={s.heading}><summary><span>{s.heading}</span><span className="detail-count">{s.rows?.length?`${s.rows.length} registros`:'Ver información'}</span></summary><div className="report-disclosure-content">{s.columns&&s.rows?.length?<div className="table-scroll"><table><thead><tr>{s.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{s.rows.map((row,i)=><tr key={i}>{row.map((value,j)=><td className="preserve-lines" key={j}>{value}</td>)}</tr>)}</tbody></table></div>:null}{s.paragraphs?.map((p,i)=><p key={i} className="preserve-lines">{p}</p>)}</div></details>)}
 {!!empty.length&&<details className="report-disclosure empty-disclosure"><summary><span>Secciones sin registros</span><span className="detail-count">{empty.length} secciones</span></summary><div className="report-disclosure-content"><p>No hay registros disponibles en estas secciones para el periodo y los permisos de tu cuenta.</p><ul>{empty.map(s=><li key={s.heading}><strong>{s.heading}</strong><p>{s.empty}</p>{s.paragraphs?.map((p,i)=><p key={i}>{p}</p>)}</li>)}</ul></div></details>}
 </div>
}
