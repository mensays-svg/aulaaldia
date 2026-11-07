import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import {familyOnly} from '@/lib/school/navigation'
import {limaDate,formatGateTime} from '@/lib/school/gate'
import {familyAttendance,type FamilyMovement} from '@/lib/school/family-attendance'
import FamilyRefresh from './family-refresh'
export default async function FamilyDashboard({school:schoolId,date:requestedDate,history=false}:{school?:string;date?:string;history?:boolean}){
 const {supabase,school,roles,user,memberships,setupError}=await schoolContext(schoolId)
 if(setupError||!school)return <div className="workspace"><h1>Mi familia</h1><p>No se pudo cargar la institución.</p></div>
 if(!familyOnly(roles))return <div className="workspace"><h1>Consulta familiar</h1><p>La asistencia familiar está disponible para las cuentas de apoderados. Usa los módulos correspondientes a tu rol.</p><Link href={'/dashboard?school='+school}>Volver a mi panel</Link></div>
 const today=limaDate(),valid=requestedDate&&/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)&&!Number.isNaN(Date.parse(requestedDate))&&new Date(requestedDate).toISOString().slice(0,10)===requestedDate&&requestedDate<=today
 const date=valid?requestedDate!:today
 // Explicit guardian links in addition to RLS; never derive family scope from classroom membership.
 const [institutionResult,periodResult]=await Promise.all([supabase.from('institutions').select('id,name').in('id',[...new Set(memberships.map(m=>m.institution_id))]),supabase.from('behavior_periods').select('id,name,starts_on,ends_on').eq('institution_id',school).order('starts_on',{ascending:false}).limit(1000)])
 const periods=periodResult.data??[],period=periods.find(p=>p.starts_on<=date&&p.ends_on>=date)??periods.find(p=>p.starts_on<=date)
 const ids:string[]=[];let failed=false
 for(let offset=0;;offset+=500){const result=await supabase.from('student_guardians').select('student_id').eq('institution_id',school).eq('user_id',user.id).order('student_id').range(offset,offset+499);if(result.error){failed=true;break}ids.push(...(result.data??[]).map(s=>s.student_id));if((result.data?.length??0)<500)break}
 const pupils=ids.length&&!failed?await supabase.from('students').select('id,first_names,last_names').eq('institution_id',school).in('id',ids).order('last_names'):{data:[],error:null}
 const cards=await Promise.all((pupils.data??[]).map(async student=>{
  const base=()=>supabase.from('gate_events').select('kind,occurred_at,is_late').eq('institution_id',school).eq('student_id',student.id).eq('school_date',date)
  const [entry,last]=await Promise.all([base().eq('kind','entry').order('sequence_no').limit(1),base().order('sequence_no',{ascending:false}).limit(1)])
  const first=(entry.data?.[0]??null) as FamilyMovement|null,latest=(last.data?.[0]??null) as FamilyMovement|null
  return{student,first,latest,status:familyAttendance(first,latest,!!entry.error||!!last.error,date!==today)}
 }))
 const query={school},reportQuery={school,...(period?{period:period.id}:{})},dateLabel=new Intl.DateTimeFormat('es-PE',{dateStyle:'full',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))
 return <div className="workspace family-home"><header><p className="eyebrow">{institutionResult.data?.find(i=>i.id===school)?.name??'MI FAMILIA'}</p><h1>{history?'Asistencia de mis hijos':'¿Mi hijo asistió al colegio?'}</h1><p>{date===today?'Hoy · ':''}{dateLabel} · hora de Lima</p><FamilyRefresh/><p><small>La pantalla se actualiza cada minuto mientras está abierta. Refleja las marcaciones registradas por el colegio.</small></p></header>
 {new Set(memberships.map(m=>m.institution_id)).size>1&&<form method="get" className="search"><label>Institución<select name="school" defaultValue={school}>{institutionResult.data?.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><button>Consultar</button></form>}
 {history&&<form method="get" className="search"><input type="hidden" name="school" value={school}/><label>Fecha<input name="date" type="date" max={today} defaultValue={date} required/></label><button>Consultar asistencia</button><Link href={'/dashboard/asistencia?'+new URLSearchParams(query)}>Hoy</Link></form>}
 {requestedDate&&!valid&&<p className="notice" role="alert">Fecha no válida. Se muestra la asistencia de hoy.</p>}
 {(failed||pupils.error)?<p className="notice" role="alert">No se pudieron comprobar los vínculos familiares. Intenta actualizar.</p>:<div className="family-students">{cards.map(({student,first,latest,status})=><section className={'family-student '+status.state} key={student.id}><h2>{student.last_names}, {student.first_names}</h2><p className="family-attendance-status" role="status">{status.title}</p><p>{status.detail}</p>{status.state!=='unknown'&&<dl><div><dt>Primer ingreso</dt><dd>{first?formatGateTime(first.occurred_at):'Sin registro'}</dd></div><div><dt>Último movimiento</dt><dd>{latest?formatGateTime(latest.occurred_at):'Sin registro'}</dd></div></dl>}{first&&status.state!=='unknown'&&<p>{first.is_late===null?'Horario de ingreso sin configurar':first.is_late?'Ingreso con tardanza':'Ingreso a tiempo'}</p>}<div className="row-actions"><Link href={'/dashboard/comportamiento?'+new URLSearchParams({...query,student:student.id})}>Ver comportamiento</Link><Link className="button-link" href={'/dashboard/reportes?'+new URLSearchParams({...reportQuery,student:student.id})}>Asistencia y nota</Link>{period&&<a className="import-link" href={'/dashboard/reportes/pdf?'+new URLSearchParams({...reportQuery,student:student.id})}>Descargar PDF</a>}</div></section>)}</div>}
 {!failed&&!pupils.error&&!cards.length&&<p className="notice">Aún no hay hijos vinculados a tu cuenta. Solicita la vinculación a la institución.</p>}
 <nav className="aux-report-shortcuts" aria-label="Consultas familiares"><Link className="quick-card" href={'/dashboard/asistencia?'+new URLSearchParams(query)}><h3>Asistencia al colegio</h3><p>Consulta ingresos y salidas por fecha.</p></Link><Link className="quick-card" href={'/dashboard/comportamiento?'+new URLSearchParams(query)}><h3>Comportamiento</h3><p>Revisa las evaluaciones publicadas de tus hijos.</p></Link><Link className="quick-card" href={'/dashboard/reportes?'+new URLSearchParams(query)}><h3>Reportes y PDF</h3><p>Asistencia y nota de comportamiento por periodo.</p></Link></nav></div>
}
