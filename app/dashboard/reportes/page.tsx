import ReportDetails from './report-details'
import {individualAnalytics} from '@/lib/school/report-analytics'
import ReportCharts from './report-charts'
import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import {limaDate} from '@/lib/school/gate'
import {validUuid} from '@/lib/school/validation'
import {getStudentReport} from '@/lib/school/report-data'
import {buildReportSections,reportTime,reportDate,type StudentReport} from '@/lib/school/reports'
import PrintReport from './print-button'
export const dynamic='force-dynamic'
export default async function ReportsPage({searchParams}:{searchParams:Promise<{school?:string;student?:string;period?:string;q?:string}>}){
 const params=await searchParams
 const {supabase,school,roles,setupError}=await schoolContext(params.school)
 const back=<Link href={school?'/dashboard?school='+school:'/dashboard'}>← Volver al panel</Link>
 if(setupError||!school)return <>{back}<h1>Reportes</h1><p className="notice">Tu cuenta debe estar vinculada a una institución.</p></>
 const periodsResult=await supabase.from('behavior_periods').select('id,name,academic_year,starts_on,ends_on').eq('institution_id',school).order('academic_year',{ascending:false}).order('starts_on',{ascending:false}).limit(1000)
 if(periodsResult.error)return <div className="workspace">{back}<h1>Reportes</h1><p className="notice">No se pudieron cargar los periodos. Comprueba que los módulos escolares estén instalados.</p></div>
 const periods=periodsResult.data??[],today=limaDate()
 const defaultPeriod=periods.find(p=>p.starts_on<=today&&p.ends_on>=today)??periods.find(p=>p.starts_on<=today)??periods[0]
 const period=periods.find(p=>p.id===params.period)??defaultPeriod
 const query=(params.q??'').slice(0,120).replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').trim()
 let students:{id:string;first_names:string;last_names:string;dni:string|null}[]=[],searchError=false
 if(period){
  let request=supabase.from('students').select('id,first_names,last_names,dni').eq('institution_id',school)
  if(/^\d{8}$/.test(query))request=request.eq('dni',query)
  else for(const term of query.split(/\s+/).filter(Boolean).slice(0,8))request=request.or(`first_names.ilike.%${term}%,last_names.ilike.%${term}%`)
  const result=await request.order('last_names').order('id').limit(20);students=result.data??[];searchError=!!result.error
 }
 let report:StudentReport|undefined,error:string|undefined
 if(period&&params.student&&validUuid(params.student)){const result=await getStudentReport(school,params.student,period.id);report=result.report;error=result.error}
 const pdf=report?'/dashboard/reportes/pdf?'+new URLSearchParams({school,student:report.student.id,period:report.period.id}):''
 const sections=report?buildReportSections(report):[]
 return <div className="workspace"><div className="report-controls">{back}<h1>Reportes por estudiante</h1>{roles.some(r=>['administrador','director'].includes(r))&&<p><Link className="import-link" href={'/dashboard/reportes/direccion?school='+school}>Reportes generales para dirección</Link></p>}<p>Asistencia al colegio, clases cerradas y comportamiento publicado, según tus permisos. Los apoderados solo pueden consultar a sus hijos vinculados.</p>
 {!period?<p className="notice">Dirección debe crear un periodo en Comportamiento para delimitar las fechas del reporte.</p>:<details className="report-filter-disclosure" open={!report}><summary>Buscar o cambiar estudiante y periodo</summary><section><h2>Elegir estudiante y periodo</h2><form method="get" className="grid-form"><input name="school" value={school} type="hidden"/><label>Periodo<select name="period" defaultValue={period.id}>{periods.map(p=><option key={p.id} value={p.id}>{p.academic_year} · {p.name}</option>)}</select></label><label>DNI, apellidos o nombres<input name="q" defaultValue={params.q?.slice(0,120)??''} maxLength={120}/></label><button>Buscar</button></form>{searchError?<p role="alert">No se pudieron cargar los estudiantes.</p>:<><p>Hasta 20 coincidencias. Afina la búsqueda si es necesario.</p><ul className="student-links">{students.map(s=><li key={s.id}><Link href={'/dashboard/reportes?'+new URLSearchParams({school,student:s.id,period:period.id,q:params.q?.slice(0,120)??''})+'#student-report'}>{s.last_names}, {s.first_names} · {s.dni??'Sin DNI'}</Link></li>)}</ul>{!students.length&&<p>No hay estudiantes para mostrar según tus permisos.</p>}</>}</section></details>}
 {error&&<p role="alert" className="notice">{error}</p>}
 {report&&<div className="import-controls"><a className="import-link" href={pdf}>Descargar PDF</a><PrintReport/><Link href={'/dashboard/reportes?'+new URLSearchParams({school,student:report.student.id,period:report.period.id})}>Actualizar reporte</Link></div>}</div>
 {report&&<article id="student-report" className="student-report"><header><p className="eyebrow">AULA AL DÍA · REPORTE INDIVIDUAL</p><h1>{report.school.name}</h1><h2>{report.student.name}</h2><p>DNI: {report.student.dni??'Sin DNI'} · Aula actual: {report.student.classroom}</p>{report.student.period_classroom!==undefined&&<p>Aula del periodo: {report.student.period_classroom??'Sin matrícula registrada para este periodo'}{report.student.enrollment_dates_unknown?' · Fecha inicial no disponible.':''}</p>}<p><strong>{report.period.name} · {report.period.academic_year}</strong><br/>{reportDate(report.period.starts_on)} al {reportDate(report.period.ends_on)}</p><p>Emitido: {reportTime(report.issued_at)} (hora de Lima).</p></header>
 <ReportCharts analytics={individualAnalytics(report)}/><ReportDetails sections={sections}/>
 </article>}
 </div>
}
