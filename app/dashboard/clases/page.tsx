import {redirect} from 'next/navigation'
import {familyOnly,auxiliaryOnly} from '@/lib/school/navigation'
import Link from 'next/link'
import { schoolContext } from '@/lib/school/context'
import { validUuid } from '@/lib/school/validation'
import { limaDate,formatGateTime } from '@/lib/school/gate'
import { validClassDate,classStatuses,type ClassDetail } from '@/lib/school/classes'
import { ClassSetup,ClassRegister } from './class-forms'
export const dynamic='force-dynamic'
type SessionRow={id:string;session_date:string;starts_at:string;ends_at:string;state:string;course:{name:string}|null;classroom:{academic_year:number;level:string;grade:string;section:string}|null}
export default async function ClassesPage({searchParams}:{searchParams:Promise<{school?:string;date?:string;session?:string;page?:string;scan?:string}>}){
 const params=await searchParams
 const {supabase,user,school,roles,setupError}=await schoolContext(params.school)
 const back=<Link href={school?'/dashboard?school='+school:'/dashboard'}>← Volver al panel</Link>
 if(setupError||!school)return <>{back}<h1>Asistencia por clase</h1><p className="notice">Primero debes estar vinculado a una institución configurada.</p></>
 if(familyOnly(roles))redirect('/dashboard/asistencia?'+new URLSearchParams({school,...(params.date?{date:params.date}:{})}))
 if(auxiliaryOnly(roles))return <div className="workspace">{back}<h1>Asistencia al colegio</h1><p>Registra ingresos y salidas desde portería y consulta tus reportes por salón.</p><Link className="button-link" href={'/dashboard?school='+school}>Escanear QR en portería</Link></div>
 const manager=roles.some(r=>['administrador','director'].includes(r)),teacher=roles.includes('docente')
 const date=params.date&&validClassDate(params.date)?params.date:limaDate()
 const page=Math.max(1,Math.min(100000,Math.trunc(Number(params.page))||1))
 const result=await supabase.from('class_sessions').select('id,session_date,starts_at,ends_at,state,course:school_courses(name),classroom:classrooms(academic_year,level,grade,section)',{count:'exact'}).eq('institution_id',school).eq('session_date',date).order('starts_at').order('id').range((page-1)*50,page*50-1)
 if(result.error)return <div className="workspace">{back}<h1>Asistencia por clase</h1><p role="alert" className="notice">No se pudo cargar el módulo. Si es la primera vez, ejecuta únicamente la migración 202611050004_class_attendance.sql en Supabase. No repitas las anteriores.</p></div>
 const rows=(result.data??[])as unknown as SessionRow[]
 const courses:{id:string;name:string}[]=[],rooms:{id:string;label:string}[]=[],assignments:{classroom_id:string;user_id:string;label:string}[]=[]
 let optionsError=false
 if(manager||teacher){
  const members=manager?await supabase.rpc('list_school_members',{school}):{data:[],error:null}
  if(members.error)optionsError=true
  for(const table of ['school_courses','classrooms','teacher_assignments']as const){
   for(let offset=0;;offset+=500){
    const columns=table==='school_courses'?'id,name':table==='classrooms'?'id,academic_year,level,grade,section':'classroom_id,user_id'
    let request=supabase.from(table).select(columns).eq('institution_id',school)
    if(table==='teacher_assignments'&&!manager)request=request.eq('user_id',user.id)
    const response=await request.order(table==='teacher_assignments'?'classroom_id':'id').range(offset,offset+499)
    if(response.error){optionsError=true;break}
    const values=response.data as unknown as Record<string,string|number>[]
    for(const row of values??[]){
     if(table==='school_courses')courses.push({id:String(row.id),name:String(row.name)})
     else if(table==='classrooms')rooms.push({id:String(row.id),label:`${row.academic_year} · ${row.level} ${row.grade} ${row.section}`})
     else assignments.push({classroom_id:String(row.classroom_id),user_id:String(row.user_id),label:(members.data as {user_id:string;email:string}[]|null)?.find(m=>m.user_id===row.user_id)?.email??'Tu cuenta docente'})
    }
    if((values?.length??0)<500)break
   }
  }
 }
 let detail:ClassDetail|null=null,detailError=false
 if(params.session&&validUuid(params.session)){
  const selected=await supabase.rpc('class_session_detail',{school,lesson:params.session})
  if(selected.error)detailError=true;else detail=selected.data
 }
 let changes:{id:string;student_id:string;old_status:string|null;new_status:string;reason:string|null;changed_at:string}[]=[]
 let logs:{id:string;action:string;reason:string|null;happened_at:string}[]=[]
 let auditError=false
 if(detail&&(manager||teacher)){
  const [history,sessionLogs]=await Promise.all([
   supabase.from('class_attendance_changes').select('id,student_id,old_status,new_status,reason,changed_at').eq('session_id',detail.id).eq('institution_id',school).order('changed_at',{ascending:false}).limit(50),
   supabase.from('class_session_logs').select('id,action,reason,happened_at').eq('session_id',detail.id).eq('institution_id',school).order('happened_at',{ascending:false}).limit(50),
  ])
  auditError=!!history.error||!!sessionLogs.error
  changes=history.data??[];logs=sessionLogs.data??[]
 }
 const href=(p:number)=>'/dashboard/clases?'+new URLSearchParams({school,date,page:String(p)})
 return <div className="workspace">{back}<h1>Asistencia por clase</h1><p>El ingreso al colegio no marca asistencia a cada curso. Los apoderados consultan aquí solo las sesiones cerradas de sus hijos.</p>
  {optionsError?<p className="notice" role="alert">No se pudieron cargar las opciones para crear sesiones. Recarga la página antes de continuar.</p>:(manager||teacher)&&<ClassSetup key={school} school={school} user={user.id} manager={manager} rooms={manager?rooms:rooms.filter(r=>assignments.some(a=>a.classroom_id===r.id))} courses={courses.sort((a,b)=>a.name.localeCompare(b.name,'es'))} assignments={assignments} date={date}/>}
  <section><h2>Sesiones por fecha</h2><form className="search" method="get"><input name="school" type="hidden" value={school}/><label>Fecha<input type="date" name="date" defaultValue={date} required/></label><button>Consultar</button><Link href={'/dashboard/clases?school='+school}>Hoy</Link></form><p>{result.count??0} sesiones visibles. Página {page}.</p><div className="table-scroll"><table><thead><tr><th>Horario</th><th>Aula</th><th>Curso</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>{rows.map(s=><tr key={s.id}><td>{s.starts_at.slice(0,5)}–{s.ends_at.slice(0,5)}</td><td>{s.classroom?`${s.classroom.academic_year} · ${s.classroom.level} ${s.classroom.grade} ${s.classroom.section}`:'Aula de la sesión'}</td><td>{s.course?.name??'Curso'}</td><td>{s.state==='closed'?'Cerrada / publicada':'Borrador / pendiente de cierre'}</td><td><Link href={'/dashboard/clases?'+new URLSearchParams({school,date,session:s.id,scan:'1'})+'#attendance'}>Abrir sesión</Link></td></tr>)}</tbody></table></div>{!rows.length&&<p className="empty">No hay sesiones para esta fecha y tus permisos. Si eres apoderado, el docente debe cerrar y publicar la sesión para que aparezca.</p>}<nav className="school-nav" aria-label="Páginas de sesiones">{page>1&&<Link href={href(page-1)}>Anterior</Link>}{page*50<(result.count??0)&&<Link href={href(page+1)}>Siguiente</Link>}</nav></section>
  {detailError&&<p className="notice" role="alert">La sesión no está disponible o no tienes permiso para consultarla.</p>}
  {detail&&<ClassRegister key={school+detail.id} school={school} initial={detail} autoScan={params.scan==='1'}/>}
  {detail&&(manager||teacher)&&<details><summary>Historial de registro y correcciones</summary>{auditError?<p>No se pudo cargar el historial.</p>:<><p>Últimos 50 cambios y 50 eventos de esta sesión. El responsable de cada operación queda registrado en la base de datos.</p><ul>{logs.map(l=><li key={l.id}>{formatGateTime(l.happened_at)} · {({created:'Sesión creada',closed:'Sesión cerrada',reopened:'Sesión reabierta'}as Record<string,string>)[l.action]}{l.reason?' · '+l.reason:''}</li>)}</ul><ul>{changes.map(c=><li key={c.id}>{formatGateTime(c.changed_at)} · {detail.students.find(s=>s.id===c.student_id)?.last_names??'Estudiante'}: {c.old_status?classStatuses[c.old_status]:'Pendiente'} → {classStatuses[c.new_status]}{c.reason?' · '+c.reason:''}</li>)}</ul></>}</details>}
 </div>
}
