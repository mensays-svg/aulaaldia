import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import {getTeacherReport,getTeacherGradeReport,getStudentReport} from '@/lib/school/report-data'
import {managementAnalytics} from '@/lib/school/report-analytics'
import {buildManagementSections,type ManagementReport} from '@/lib/school/management-reports'
import {limaDate} from '@/lib/school/gate'
import StudentReportView from '../student-report-view'
import {normalizeGrade} from '@/lib/school/student-import'
import type {StudentReport} from '@/lib/school/reports'
import ReportCharts from '../report-charts'
import ReportDetails from '../report-details'
export const dynamic='force-dynamic'
export default async function TeacherReports({searchParams}:{searchParams:Promise<{school?:string;classroom?:string;period?:string;mode?:string;student?:string;q?:string}>}){
 const p=await searchParams,{supabase,school,roles,user,setupError}=await schoolContext(p.school)
 if(setupError||!school)return <h1>Debes estar vinculado a una institución.</h1>
 const manager=roles.some(r=>['administrador','director'].includes(r))
 if(!manager&&!roles.includes('docente'))return <div className="workspace"><h1>Acceso restringido</h1><p>Este reporte es exclusivo de docentes, dirección y administración.</p></div>
 const [assignments,periodResult]=await Promise.all([manager?Promise.resolve({data:[],error:null}):supabase.from('teacher_assignments').select('classroom_id').eq('institution_id',school).eq('user_id',user.id),supabase.from('behavior_periods').select('id,name,academic_year,starts_on,ends_on').eq('institution_id',school).order('academic_year',{ascending:false}).order('starts_on',{ascending:false}).limit(1000)])
 const rooms:{id:string;year:number;label:string;level:string;grade:string}[]=[];let roomsError=!!assignments.error
 for(let offset=0;;offset+=500){const result=await supabase.from('classrooms').select('id,academic_year,level,grade,section').eq('institution_id',school).order('academic_year',{ascending:false}).order('id').range(offset,offset+499);if(result.error){roomsError=true;break}rooms.push(...(result.data??[]).filter(c=>manager||assignments.data?.some(a=>a.classroom_id===c.id)).map(c=>({id:c.id,year:c.academic_year,level:c.level,grade:normalizeGrade(c.grade),label:`${c.academic_year} · ${c.level} ${c.grade} ${c.section}`})));if((result.data?.length??0)<500)break}
 const periods=periodResult.data??[],today=limaDate(),period=periods.find(v=>v.id===p.period)??(!p.period?(periods.find(v=>v.starts_on<=today&&v.ends_on>=today)??periods.find(v=>v.starts_on<=today)??periods[0]):undefined)
 const available=rooms.filter(r=>!period||r.year===period.academic_year),room=available.find(r=>r.id===p.classroom)??(!p.classroom&&available.length===1?available[0]:undefined)
 const mode=p.mode==='grade'?'grade':p.mode==='individual'||p.student?'individual':'section'
 const gradeRooms=available.filter((r,i,all)=>all.findIndex(v=>v.level===r.level&&v.grade===r.grade)===i)
 const gradeRoom=room?gradeRooms.find(r=>r.level===room.level&&r.grade===room.grade):undefined
 let report:ManagementReport|undefined,error:string|undefined,individual:StudentReport|undefined
 let students:{id:string;first_names:string;last_names:string;dni:string|null}[]=[]
 if(p.period&&!period)error='El periodo no está disponible para esta institución.'
 else if(p.classroom&&!room)error='El aula no está asignada a tu cuenta o no coincide con el año del periodo.'
 else if(mode!=='individual'&&room&&period&&!roomsError&&!periodResult.error){const result=await (mode==='grade'?getTeacherGradeReport:getTeacherReport)(school,period.id,room.id);report=result.report;error=result.error}
 if(mode==='individual'&&period&&!roomsError&&!periodResult.error&&available.length){
  const query=(p.q??'').slice(0,120).replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').trim()
  let request=supabase.from('students').select('id,first_names,last_names,dni').eq('institution_id',school).in('classroom_id',available.map(r=>r.id))
  if(p.student)request=request.eq('id',p.student)
  else if(/^\d{8}$/.test(query))request=request.eq('dni',query)
  else for(const term of query.split(/\s+/).filter(Boolean).slice(0,8))request=request.or(`first_names.ilike.%${term}%,last_names.ilike.%${term}%`)
  const result=await request.order('last_names').order('id').limit(20)
  students=result.data??[]
  if(result.error)error='No se pudieron cargar los estudiantes.'
  else if(p.student){if(!students.some(v=>v.id===p.student))error='El estudiante no pertenece a tus aulas asignadas para este año.';else{const result=await getStudentReport(school,p.student,period.id);individual=result.report;error=result.error}}
 }
 const href=(values:Record<string,string>)=>'/dashboard/reportes/docente?'+new URLSearchParams({school,...(period?{period:period.id}:{}),...values})
 return <div className="workspace"><Link href={'/dashboard?school='+school}>← Mi panel docente</Link><h1>Mis grados y secciones</h1><p>Reportes por grado, sección y estudiante. Consulta gráficas y descarga el PDF desde un solo lugar.</p>
 <nav className="aux-report-shortcuts" aria-label="Tipo de reporte">{[['grade','Por grado'],['section','Por sección'],['individual','Individual']].map(([value,label])=><Link className="quick-card" aria-current={mode===value?'page':undefined} key={value} href={href({mode:value,...(room?{classroom:room.id}:{})})}><h3>{label}</h3><p>{value==='grade'?'Reúne tus secciones asignadas del mismo grado.':value==='section'?'Consulta el detalle de un salón.':'Busca al estudiante y descarga su reporte.'}</p></Link>)}</nav>
 {(roomsError||periodResult.error)?<p className="notice" role="alert">No se pudieron cargar las opciones. Recarga antes de continuar.</p>:<form className="grid-form" method="get"><input name="school" type="hidden" value={school}/><input name="mode" type="hidden" value={mode}/><label>Periodo<select name="period" defaultValue={period?.id??''} required><option value="">Selecciona periodo</option>{periods.map(v=><option key={v.id} value={v.id}>{v.academic_year} · {v.name}</option>)}</select></label>{mode==='individual'?<label>DNI, apellidos o nombres<input name="q" maxLength={120} defaultValue={p.q??''}/></label>:<label>{mode==='grade'?'Grado':'Grado y sección'}<select name="classroom" defaultValue={mode==='grade'?gradeRoom?.id??'':room?.id??''} required><option value="">Selecciona {mode==='grade'?'grado':'aula'}</option>{(mode==='grade'?rooms.filter((r,i,all)=>all.findIndex(v=>v.year===r.year&&v.level===r.level&&v.grade===r.grade)===i):rooms).map(r=><option key={r.id} value={r.id}>{mode==='grade'?`${r.year} · ${r.level} ${r.grade}`:r.label}</option>)}</select></label>}<button disabled={!rooms.length||!periods.length}>{mode==='individual'?'Buscar estudiante':'Ver reporte'}</button></form>}
 {!rooms.length&&!roomsError&&<p className="notice">Dirección debe asignarte un aula antes de consultar reportes.</p>}{error&&<p className="notice" role="alert">{error}</p>}
 {mode==='individual'&&!individual&&<><p>Hasta 20 coincidencias de tus aulas asignadas. Afina la búsqueda si es necesario.</p><ul className="student-links">{students.map(s=><li key={s.id}><Link href={href({mode:'individual',student:s.id})+'#student-report'}>{s.last_names}, {s.first_names} · {s.dni??'Sin DNI'}</Link></li>)}</ul>{!students.length&&!error&&<p>No hay estudiantes disponibles para esta selección.</p>}</>}
 {individual&&<><div className="import-controls"><a className="import-link" href={'/dashboard/reportes/pdf?'+new URLSearchParams({school,student:individual.student.id,period:individual.period.id})}>Descargar PDF individual</a><Link href={href({mode:'individual'})}>Cambiar estudiante</Link></div><StudentReportView report={individual}/></>}
 {report&&<><h2>{mode==='grade'?`${report.filters.level} · Grado ${report.filters.grade}`:report.classrooms[0]?.classroom} · {report.period.name}</h2><p>{report.classrooms.length} sección(es) asignada(s) en esta selección.</p><a className="import-link" href={'/dashboard/reportes/docente/pdf?'+new URLSearchParams({school,period:report.period.id,classroom:room!.id,mode})}>Descargar PDF {mode==='grade'?'del grado':'de la sección'}</a><ReportCharts analytics={managementAnalytics(report)}/><ReportDetails sections={buildManagementSections(report)}/><p className="notice">Solo tus secciones y estudiantes autorizados. No se muestran anotaciones internas ni borradores.</p><h3>Reportes de estudiantes de esta selección</h3><ul className="student-links">{report.students.map(s=><li key={s.id}>{s.name} · <Link href={href({mode:'individual',student:s.id})+'#student-report'}>Ver reporte individual</Link> · <a href={'/dashboard/reportes/pdf?'+new URLSearchParams({school,student:s.id,period:report.period.id})}>Descargar PDF</a></li>)}</ul></>}
 </div>
}
