import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import {familyOnly} from '@/lib/school/navigation'
import {familyChildren,familySelection} from '@/lib/school/family-children'
import {getStudentReport} from '@/lib/school/report-data'
import {limaDate} from '@/lib/school/gate'
import {buildReportSections,type StudentReport} from '@/lib/school/reports'
import {individualAnalytics} from '@/lib/school/report-analytics'
import StudentReportView from './reportes/student-report-view'
import ReportCharts from './reportes/report-charts'
import ReportDetails from './reportes/report-details'
export default async function FamilyPeriodReport({school:requestedSchool,student:requestedStudent,period:requestedPeriod,view='reports'}:{school?:string;student?:string;period?:string;view?:'attendance'|'behavior'|'reports'}){
 const context=await schoolContext(requestedSchool),{supabase,school,roles}=context
 if(!school||context.setupError||!familyOnly(roles))return <section><h1>Consulta familiar no disponible</h1><Link href="/dashboard">Volver al panel</Link></section>
 const [family,periodsResult]=await Promise.all([familyChildren(context),supabase.from('behavior_periods').select('id,name,academic_year,starts_on,ends_on').eq('institution_id',school).order('academic_year',{ascending:false}).order('starts_on',{ascending:false}).limit(1000)])
 const periods=periodsResult.data??[],today=limaDate(),period=requestedPeriod?periods.find(p=>p.id===requestedPeriod):periods.find(p=>p.starts_on<=today&&p.ends_on>=today)??periods.find(p=>p.starts_on<=today)??periods[0]
 const child=familySelection(family.children,requestedStudent)
 let report:StudentReport|undefined,error:string|undefined
 if(family.error||periodsResult.error)error='No se pudieron cargar tus hijos o los bimestres. Intenta actualizar.'
 else if(requestedStudent&&!child)error='Este estudiante no está vinculado a tu cuenta.'
 else if(requestedPeriod&&!period)error='El bimestre seleccionado no está disponible.'
 else if(child&&period){const result=await getStudentReport(school,child.id,period.id);report=result.report;error=result.error}
 const title=view==='attendance'?'Asistencia por bimestre':view==='behavior'?'Comportamiento por bimestre':'Reportes de mis hijos por bimestre'
 const href=(path:string)=>path+'?'+new URLSearchParams({school,...(child?{student:child.id}:{}),...(period?{period:period.id}:{})})
 const sections=report?buildReportSections(report).filter(s=>view==='attendance'?/asistencia|Entrada y salida/i.test(s.heading):/Comportamiento|Reconocimientos/i.test(s.heading)):[]
 const analytics=report?individualAnalytics(report):undefined
 return <section className="workspace family-period"><Link href={'/dashboard?school='+school}>← Mi familia</Link><h1>{title}</h1><p>Solo tus hijos vinculados. Elige el bimestre para consultar asistencia y notas publicadas.</p>
 {!family.error&&family.children.length>0&&<form method="get" className="grid-form"><input type="hidden" name="school" value={school}/>{family.children.length===1?<><input type="hidden" name="student" value={family.children[0].id}/><p><strong>{family.children[0].last_names}, {family.children[0].first_names}</strong></p></>:<label>Mi hijo o hija<select name="student" defaultValue={child?.id??''} required><option value="" disabled>Selecciona a tu hijo</option>{family.children.map(c=><option key={c.id} value={c.id}>{c.last_names}, {c.first_names}</option>)}</select></label>}<label>Bimestre<select name="period" defaultValue={period?.id??''} required><option value="" disabled>Selecciona bimestre</option>{periods.map(p=><option key={p.id} value={p.id}>{p.academic_year} · {p.name}</option>)}</select></label><button disabled={!periods.length}>Ver bimestre</button></form>}
 {error&&<p className="notice" role="alert">{error}</p>}{!family.error&&!family.children.length&&<p className="notice">No hay hijos vinculados. Solicita la vinculación a la institución.</p>}{!periodsResult.error&&!periods.length&&<p className="notice">La institución aún no ha configurado los bimestres.</p>}
 {report&&<><nav className="row-actions" aria-label="Consultas del bimestre"><Link href={href('/dashboard/asistencia')}>Asistencia</Link><Link href={href('/dashboard/comportamiento')}>Comportamiento</Link><Link href={href('/dashboard/reportes')}>Reporte completo</Link><a className="button-link" href={href('/dashboard/reportes/pdf')}>Descargar PDF · {period!.name}</a></nav>{view==='reports'?<StudentReportView report={report}/>:<><h2>{report.student.name} · {report.period.name}</h2>{analytics&&<ReportCharts analytics={{...analytics,metrics:analytics.metrics.filter(m=>view==='behavior'?m.label.includes('Nota final'):!m.label.includes('Nota final')),charts:analytics.charts.filter(c=>view==='behavior'?/comportamiento|criterio/i.test(c.title):!/comportamiento|criterio/i.test(c.title))}}/>}<ReportDetails sections={sections}/></>}</>}
 </section>
}
