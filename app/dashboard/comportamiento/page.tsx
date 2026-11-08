import FamilyPeriodReport from '../family-period-report'
import {familyOnly,auxiliaryOnly} from '@/lib/school/navigation'
import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import {validUuid} from '@/lib/school/validation'
import {limaDate,formatGateTime} from '@/lib/school/gate'
import {BehaviorSetup,BehaviorFile} from './behavior-forms'
import type {BehaviorPeriod,BehaviorRubric,BehaviorDetail} from '@/lib/school/behavior'
export const dynamic='force-dynamic'
export default async function BehaviorPage({searchParams}:{searchParams:Promise<{school?:string;period?:string;student?:string;q?:string}>}){
 const params=await searchParams
 const {supabase,school,roles,setupError}=await schoolContext(params.school)
 const back=<Link href={school?'/dashboard?school='+school:'/dashboard'}>← Volver al panel</Link>
 if(setupError||!school)return <>{back}<h1>Comportamiento</h1><p className="notice">Debes estar vinculado a una institución configurada.</p></>
 if(familyOnly(roles))return <FamilyPeriodReport school={school} student={params.student} period={params.period} view='behavior'/>
 if(auxiliaryOnly(roles))return <div className="workspace">{back}<h1>Consulta de reportes</h1><p>El auxiliar consulta la asistencia y los reportes individuales publicados desde portería.</p><Link className="button-link" href={'/dashboard/reportes?school='+school}>Ver reportes individuales</Link></div>
 const manager=roles.some(r=>['administrador','director'].includes(r))
 const [periodsResult,rubricsResult]=await Promise.all([
  supabase.from('behavior_periods').select('id,name,academic_year,starts_on,ends_on').eq('institution_id',school).order('academic_year',{ascending:false}).order('starts_on',{ascending:false}).limit(1000),
  supabase.from('behavior_rubrics').select('id,name,reference,criteria').eq('institution_id',school).order('registered_at',{ascending:false}).limit(1000),
 ])
 if(periodsResult.error||rubricsResult.error)return <div className="workspace">{back}<h1>Comportamiento</h1><p role="alert" className="notice">No se pudo cargar el módulo. Si aún no está instalado, ejecuta únicamente la migración 202611050005_behavior.sql en Supabase. No repitas las anteriores.</p></div>
 const periods=(periodsResult.data??[])as BehaviorPeriod[],rubrics=(rubricsResult.data??[])as BehaviorRubric[]
 const period=periods.find(p=>p.id===params.period)??periods[0]
 const query=(params.q??'').slice(0,120).replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').trim()
 let students:{id:string;first_names:string;last_names:string;dni:string|null}[]=[],searchError=false
 if(period){
  let request=supabase.from('students').select('id,first_names,last_names,dni').eq('institution_id',school)
  if(/^\d{8}$/.test(query))request=request.eq('dni',query)
  else for(const term of query.split(/\s+/).filter(Boolean).slice(0,8))request=request.or(`first_names.ilike.%${term}%,last_names.ilike.%${term}%`)
  const result=await request.order('last_names').order('id').limit(20)
  searchError=!!result.error;students=result.data??[]
 }
 let detail:BehaviorDetail|null=null,detailError=false
 if(period&&params.student&&validUuid(params.student)){
  const result=await supabase.rpc('behavior_student_detail',{school,student:params.student,period:period.id})
  if(result.error)detailError=true;else detail=result.data
 }
 let audit:{id:string;action:string;reason:string|null;created_at:string}[]=[]
 let auditError=false
 if(detail?.can_grade){
  const result=await supabase.from('behavior_audit').select('id,action,reason,created_at').eq('institution_id',school).eq('student_id',detail.student_id).order('created_at',{ascending:false}).limit(50)
  auditError=!!result.error;audit=result.data??[]
 }
 const localNow=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T')
 return <div className="workspace">{back}<h1>Comportamiento y seguimiento</h1><p>Presentación personal, puntualidad, convivencia y responsabilidad. Nota final de conducta de 0 a 20; menos de 11 es desaprobatoria. Los criterios y la rúbrica son institucionales.</p>
  {manager&&<BehaviorSetup school={school} year={Number(limaDate().slice(0,4))}/>}
  {!period?<p className="notice">Dirección o administración debe crear el periodo de evaluación. Se puede registrar evidencia sin una rúbrica, pero publicarla como nota exige la rúbrica institucional.</p>:<section><h2>Seleccionar estudiante y periodo</h2><form method="get" className="grid-form"><input name="school" value={school} type="hidden"/><label>Periodo<select name="period" defaultValue={period.id}>{periods.map(p=><option key={p.id} value={p.id}>{p.academic_year} · {p.name}</option>)}</select></label><label>DNI, apellidos o nombres<input name="q" defaultValue={params.q??''} maxLength={120}/></label><button>Buscar</button></form>{searchError?<p role="alert">No se pudieron cargar los estudiantes.</p>:<><p>Hasta 20 coincidencias según tus permisos. Afina la búsqueda si es necesario.</p><ul className="student-links">{students.map(s=><li key={s.id}><Link href={'/dashboard/comportamiento?'+new URLSearchParams({school,period:period.id,student:s.id,q:params.q?.slice(0,120)??''})+'#behavior-file'}>{s.last_names}, {s.first_names} · {s.dni??'Sin DNI'}</Link></li>)}</ul>{!students.length&&<p>No hay estudiantes para mostrar. Si eres apoderado, revisa la vinculación de tus hijos con la institución.</p>}</>}</section>}
  {detailError&&<p role="alert" className="notice">No se pudo cargar la ficha o no tienes acceso a este estudiante y periodo.</p>}
  {detail&&<BehaviorFile key={school+detail.student_id+detail.period.id} school={school} initial={detail} rubrics={rubrics} localNow={localNow}/>}
  {detail?.can_grade&&<details><summary>Historial interno de operaciones</summary>{auditError?<p>No se pudo cargar el historial.</p>:<><p>Últimas 50 operaciones del estudiante. Las identidades responsables y las versiones previas quedan guardadas en la base de datos.</p><ul>{audit.map(a=><li key={a.id}>{formatGateTime(a.created_at)} · {({record_created:'Registro interno creado',record_communicated:'Resumen comunicado',record_hidden:'Resumen retirado de consulta familiar',followup_added:'Seguimiento añadido',evaluation_saved:'Borrador de evaluación guardado',evaluation_published:'Evaluación publicada',evaluation_reopened:'Evaluación reabierta'}as Record<string,string>)[a.action]??'Operación registrada'}{a.reason?' · '+a.reason:''}</li>)}</ul></>}</details>}
 </div>
}
