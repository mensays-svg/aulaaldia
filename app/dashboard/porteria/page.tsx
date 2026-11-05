import Link from 'next/link'
import { schoolContext } from '@/lib/school/context'
import { limaDate,formatGateTime,movements,reasons } from '@/lib/school/gate'
import GateConsole from './gate-console'
export const dynamic='force-dynamic'
type EventRow={id:string;occurred_at:string;kind:string;method:string;reason:string|null;note:string|null;authorized_by:string|null;accompanied_by:string|null;expects_return:boolean;first_entry:boolean;is_late:boolean|null;student:{first_names:string;last_names:string;dni:string|null}|null}
export default async function GatePage({searchParams}:{searchParams:Promise<{school?:string;date?:string;page?:string}>}){
 const params=await searchParams
 const {supabase,school,roles,setupError}=await schoolContext(params.school)
 const back=<Link href={school?'/dashboard?school='+school:'/dashboard'}>← Volver al panel</Link>
 if(setupError||!school)return <>{back}<h1>Entrada y salida</h1><p className="notice">Debes estar vinculado a una institución configurada.</p></>
 const registrar=roles.some(r=>['administrador','director','auxiliar'].includes(r)),manager=roles.some(r=>['administrador','director'].includes(r))
 const validDate=params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && !Number.isNaN(Date.parse(params.date)) && params.date===new Date(params.date).toISOString().slice(0,10)
 const date=validDate?params.date!:limaDate()
 const page=Math.max(1,Math.min(100000,Math.trunc(Number(params.page))||1))
 const [history,schoolResult]=await Promise.all([
  supabase.from('gate_events').select('id,occurred_at,kind,method,reason,note,authorized_by,accompanied_by,expects_return,first_entry,is_late,student:students!gate_events_student_fk(first_names,last_names,dni)',{count:'exact'}).eq('institution_id',school).eq('school_date',date).order('sequence_no',{ascending:false}).range((page-1)*50,page*50-1),
  supabase.from('institutions').select('name').eq('id',school).single(),
 ])
 const classrooms:{id:string;label:string}[]=[]
 if(manager && !history.error){
  for(let offset=0;;offset+=500){
   const result=await supabase.from('classrooms').select('id,academic_year,level,grade,section').eq('institution_id',school).order('id').range(offset,offset+499)
   if(result.error)break
   classrooms.push(...(result.data??[]).map(c=>({id:c.id,label:`${c.academic_year} · ${c.level} ${c.grade} ${c.section}`})))
   if((result.data?.length??0)<500)break
  }
 }
 const rows=(history.data??[]) as unknown as EventRow[]
 const href=(p:number)=>'/dashboard/porteria?'+new URLSearchParams({school,date,page:String(p)})
 return <div className="workspace">{back}<header><p className="eyebrow">{schoolResult.data?.name??'AULA AL DÍA'}</p><h1>Entrada y salida del colegio</h1><p>Control de portería. La asistencia de cada clase se registrará por separado.</p></header>
  {history.error?<p className="notice" role="alert">No se pudo cargar portería. Si es la primera vez, el administrador debe ejecutar la migración 202611050003_gate_attendance.sql en Supabase. No repitas las migraciones anteriores.</p>:<>
   {registrar?<GateConsole key={school} school={school} schoolName={schoolResult.data?.name??'Aula al Día'} rooms={classrooms} manager={manager}/>:<p className="notice">Consulta de movimientos de los estudiantes que tienes autorizados. Solo el auxiliar, dirección y administración pueden registrar entradas o salidas.</p>}
   <section><h2>Historial de movimientos</h2><form method="get" className="search"><input type="hidden" name="school" value={school}/><label>Fecha (Lima)<input type="date" name="date" defaultValue={date} required /></label><button>Consultar</button><Link href={'/dashboard/porteria?school='+school}>Hoy</Link></form><p>{history.count??0} movimientos visibles para esta fecha. Página {page}. Las primeras entradas muestran puntualidad; los retornos no generan otra tardanza.</p>
    <div className="table-scroll"><table><thead><tr><th>Hora</th><th>Estudiante</th><th>Movimiento</th><th>Puntualidad</th><th>Registro</th><th>Detalle</th></tr></thead><tbody>{rows.map(e=><tr key={e.id}><td>{formatGateTime(e.occurred_at)}</td><td>{e.student?`${e.student.last_names}, ${e.student.first_names}`:'Estudiante'}<br/>{e.student?.dni}</td><td>{movements[e.kind]}</td><td>{e.first_entry?(e.is_late===null?'Sin horario':e.is_late?'Tardanza':'A tiempo'):'—'}</td><td>{e.method==='qr'?'QR':e.method==='dni'?'DNI':'Apellidos'}</td><td>{e.reason && <p>{reasons[e.reason]} · {e.expects_return?'Retorno previsto':'Sin retorno previsto'}</p>}{e.authorized_by&&<p>Autorizó: {e.authorized_by}</p>}{e.accompanied_by&&<p>Recogió: {e.accompanied_by}</p>}{e.note&&<p>{e.note}</p>}</td></tr>)}</tbody></table></div>{!rows.length&&<p className="empty">No hay movimientos para mostrar con esta fecha y tus permisos.</p>}
    <nav className="school-nav" aria-label="Páginas del historial">{page>1&&<Link href={href(page-1)}>Anterior</Link>}{page*50<(history.count??0)&&<Link href={href(page+1)}>Siguiente</Link>}</nav>
   </section>
  </>}
 </div>
}
