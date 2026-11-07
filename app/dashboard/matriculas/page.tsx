import Link from'next/link'
import{schoolContext}from'@/lib/school/context'
import{validUuid}from'@/lib/school/validation'
import{limaDate}from'@/lib/school/gate'
import type{EnrollmentDetail}from'@/lib/school/enrollments'
import{EnrollmentFile,EnrollmentBatch}from'./enrollment-forms'
export const dynamic='force-dynamic'
export default async function EnrollmentsPage({searchParams}:{searchParams:Promise<{school?:string;student?:string;q?:string}>}){
 const params=await searchParams
 const{supabase,school,roles,setupError}=await schoolContext(params.school)
 const back=<Link href={school?'/dashboard?school='+school:'/dashboard'}>← Volver al panel</Link>
 if(setupError||!school)return <>{back}<h1>Matrículas e historial</h1><p className="notice">Debes estar vinculado a una institución.</p></>
 if(!roles.some(r=>['administrador','director','docente','apoderado'].includes(r)))return <div className="workspace">{back}<h1>Acceso restringido</h1><p>El auxiliar consulta el padrón y la asistencia desde los reportes de portería.</p></div>
 const manager=roles.some(r=>['administrador','director'].includes(r))
 const installation=await supabase.from('student_enrollments').select('id').eq('institution_id',school).limit(1)
 if(installation.error)return <div className="workspace">{back}<h1>Matrículas e historial</h1><p role="alert" className="notice">No se pudo cargar el módulo. Si aún no está instalado, ejecuta únicamente 202611050008_enrollment_history.sql en Supabase. No repitas scripts anteriores.</p></div>
 const rooms:{id:string;year:number;label:string}[]=[]
 let optionsError=false
 if(manager)for(let offset=0;;offset+=500){const result=await supabase.from('classrooms').select('id,academic_year,level,grade,section').eq('institution_id',school).order('academic_year',{ascending:false}).order('id').range(offset,offset+499);if(result.error){optionsError=true;break}rooms.push(...(result.data??[]).map(c=>({id:c.id,year:c.academic_year,label:`${c.academic_year} · ${c.level} ${c.grade} ${c.section}`})));if((result.data?.length??0)<500)break}
 const query=(params.q??'').slice(0,120).replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').trim()
 let request=supabase.from('students').select('id,first_names,last_names,dni').eq('institution_id',school)
 if(/^\d{8}$/.test(query))request=request.eq('dni',query)
 else for(const word of query.split(/\s+/).filter(Boolean).slice(0,8))request=request.or(`first_names.ilike.%${word}%,last_names.ilike.%${word}%`)
 const result=await request.order('last_names').order('id').limit(20)
 let detail:EnrollmentDetail|undefined,error:string|undefined
 if(params.student&&validUuid(params.student)){const selected=await supabase.rpc('student_enrollment_detail',{school,student:params.student});if(selected.error)error='No se pudo cargar la ficha o no tienes permiso para consultarla.';else detail=selected.data}
 const currentYear=Number(limaDate().slice(0,4))
 return <div className="workspace">{back}<h1>Matrículas por año escolar</h1><p>Conserva perfiles, vínculos familiares, aulas anteriores y registros. Solo dirección y administración pueden modificar la matrícula.</p>
 {optionsError&&<p role="alert" className="notice">No se pudieron cargar las aulas. Recarga antes de realizar cambios.</p>}
 {manager&&!optionsError&&<EnrollmentBatch school={school} rooms={rooms}/>}
 <section><h2>Buscar estudiante</h2><form method="get" className="search"><input name="school" value={school} type="hidden"/><label>DNI, apellidos o nombres<input name="q" defaultValue={params.q??''} maxLength={120}/></label><button>Buscar</button></form>{result.error?<p>No se pudieron cargar los estudiantes.</p>:<><p>Hasta 20 coincidencias según tus permisos.</p><ul className="student-links">{result.data?.map(s=><li key={s.id}><Link href={'/dashboard/matriculas?'+new URLSearchParams({school,student:s.id,q:params.q?.slice(0,120)??''})+'#enrollment-file'}>{s.last_names}, {s.first_names} · {s.dni??'Sin DNI'}</Link></li>)}</ul>{!result.data?.length&&<p>No hay estudiantes disponibles con esta búsqueda y tus permisos.</p>}</>}</section>
 {error&&<p className="notice" role="alert">{error}</p>}
 {detail&&!optionsError&&<EnrollmentFile key={school+detail.id+detail.revision} school={school} initial={detail} rooms={rooms} currentYear={currentYear}/>}
 </div>
}
