import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import {getTeacherReport} from '@/lib/school/report-data'
import {managementAnalytics} from '@/lib/school/report-analytics'
import {buildManagementSections,type ManagementReport} from '@/lib/school/management-reports'
import {limaDate} from '@/lib/school/gate'
import ReportCharts from '../report-charts'
import ReportDetails from '../report-details'
export const dynamic='force-dynamic'
export default async function TeacherReports({searchParams}:{searchParams:Promise<{school?:string;classroom?:string;period?:string}>}){
 const p=await searchParams,{supabase,school,roles,user,setupError}=await schoolContext(p.school)
 if(setupError||!school)return <h1>Debes estar vinculado a una institución.</h1>
 const manager=roles.some(r=>['administrador','director'].includes(r))
 if(!manager&&!roles.includes('docente'))return <div className="workspace"><h1>Acceso restringido</h1><p>Este reporte es exclusivo de docentes, dirección y administración.</p></div>
 const [assignments,periodResult]=await Promise.all([manager?Promise.resolve({data:[],error:null}):supabase.from('teacher_assignments').select('classroom_id').eq('institution_id',school).eq('user_id',user.id),supabase.from('behavior_periods').select('id,name,academic_year,starts_on,ends_on').eq('institution_id',school).order('academic_year',{ascending:false}).order('starts_on',{ascending:false}).limit(1000)])
 const rooms:{id:string;year:number;label:string}[]=[];let roomsError=!!assignments.error
 for(let offset=0;;offset+=500){const result=await supabase.from('classrooms').select('id,academic_year,level,grade,section').eq('institution_id',school).order('academic_year',{ascending:false}).order('id').range(offset,offset+499);if(result.error){roomsError=true;break}rooms.push(...(result.data??[]).filter(c=>manager||assignments.data?.some(a=>a.classroom_id===c.id)).map(c=>({id:c.id,year:c.academic_year,label:`${c.academic_year} · ${c.level} ${c.grade} ${c.section}`})));if((result.data?.length??0)<500)break}
 const periods=periodResult.data??[],today=limaDate(),period=periods.find(v=>v.id===p.period)??(!p.period?(periods.find(v=>v.starts_on<=today&&v.ends_on>=today)??periods.find(v=>v.starts_on<=today)??periods[0]):undefined)
 const available=rooms.filter(r=>!period||r.year===period.academic_year),room=available.find(r=>r.id===p.classroom)??(!p.classroom&&available.length===1?available[0]:undefined)
 let report:ManagementReport|undefined,error:string|undefined
 if(p.period&&!period)error='El periodo no está disponible para esta institución.'
 else if(p.classroom&&!room)error='El aula no está asignada a tu cuenta o no coincide con el año del periodo.'
 else if(room&&period&&!roomsError&&!periodResult.error){const result=await getTeacherReport(school,period.id,room.id);report=result.report;error=result.error}
 return <div className="workspace"><Link href={'/dashboard?school='+school}>← Mi panel docente</Link><h1>Mis reportes por grado y sección</h1><p>Solo tus aulas asignadas y estudiantes que actualmente puedes consultar. Incluye asistencia publicada, comportamiento publicado y gráficas.</p>
 {(roomsError||periodResult.error)?<p className="notice" role="alert">No se pudieron cargar las opciones. Recarga antes de continuar.</p>:<form className="grid-form" method="get"><input name="school" type="hidden" value={school}/><label>Periodo<select name="period" defaultValue={period?.id??''} required><option value="">Selecciona periodo</option>{periods.map(v=><option key={v.id} value={v.id}>{v.academic_year} · {v.name}</option>)}</select></label><label>Grado y sección asignados<select name="classroom" defaultValue={room?.id??''} required><option value="">Selecciona aula</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label><button disabled={!rooms.length||!periods.length}>Ver reporte</button></form>}
 {!rooms.length&&!roomsError&&<p className="notice">Dirección debe asignarte un aula antes de consultar reportes.</p>}{error&&<p className="notice" role="alert">{error}</p>}
 {report&&<><h2>{report.classrooms[0]?.classroom} · {report.period.name}</h2><a className="import-link" href={'/dashboard/reportes/docente/pdf?'+new URLSearchParams({school,period:report.period.id,classroom:room!.id})}>Descargar PDF de mi aula</a><ReportCharts analytics={managementAnalytics(report)}/><ReportDetails sections={buildManagementSections(report)}/><p className="notice">Este reporte no amplía tu acceso a estudiantes trasladados a aulas que no tienes asignadas. No se muestran anotaciones internas ni borradores.</p><h3>PDF individual de mis estudiantes</h3><ul className="student-links">{report.students.map(s=><li key={s.id}>{s.name} · <Link href={'/dashboard/reportes?'+new URLSearchParams({school,student:s.id,period:report.period.id})}>Ver reporte</Link> · <a href={'/dashboard/reportes/pdf?'+new URLSearchParams({school,student:s.id,period:report.period.id})}>Descargar PDF</a></li>)}</ul></>}
 </div>
}
