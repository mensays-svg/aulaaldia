'use server'
import{revalidatePath}from'next/cache'
import{schoolContext}from'@/lib/school/context'
import{validUuid}from'@/lib/school/validation'
import type{EnrollmentResult}from'@/lib/school/enrollments'
function errorMessage(error:{code?:string;message?:string}):string{
 if(['PGRST202','42883','42P01','42703'].includes(error.code??''))return'Falta activar Matrículas: ejecuta la migración 202611050008_enrollment_history.sql en Supabase.'
 const known:Record<string,string>={ENROLLMENT_FORBIDDEN:'Solo dirección y administración pueden modificar las matrículas.',ENROLLMENT_INVALID_INPUT:'Revisa los campos y escribe un motivo de 10 a 1000 caracteres.',ENROLLMENT_NOT_FOUND:'No se encontró la matrícula o el estudiante.',ENROLLMENT_INVALID_CLASSROOM:'Revisa el aula y el año. El cambio de sección es dentro del mismo año; una nueva matrícula debe corresponder a un año posterior o al año actual sin matrícula previa.',ENROLLMENT_YEAR_EXISTS:'Ya existe una matrícula para ese estudiante y año. Revísala antes de preparar otra.',ENROLLMENT_INVALID_STATE:'La matrícula ya no tiene el estado requerido para esta operación.',ENROLLMENT_ACTIVATION_YEAR:'Solo se puede activar o reingresar una matrícula del año actual de Lima. Las futuras permanecen planificadas.',ENROLLMENT_STALE:'La matrícula cambió desde la vista previa. Recarga para revisar la versión actual antes de continuar.',ENROLLMENT_REQUEST_CONFLICT:'Este intento ya se usó con otros datos. Recarga la ficha antes de continuar.'}
 if(known[error.message??''])return known[error.message!]
 if(error.code==='42501')return'No tienes permiso para realizar esta operación.'
 if(['22023','22P02','23514'].includes(error.code??''))return'Revisa los datos de la matrícula y las aulas seleccionadas.'
 return'No se recibió una confirmación válida. Revisa el historial antes de reintentar.'
}
async function context(school:string){const c=await schoolContext(school);return{...c,valid:validUuid(school)&&c.school===school,manager:c.roles.some(r=>['administrador','director'].includes(r))}}
function refresh(){for(const path of ['/dashboard','/dashboard/matriculas','/dashboard/clases','/dashboard/porteria','/dashboard/reportes','/dashboard/reportes/direccion'])revalidatePath(path)}
export async function loadEnrollment(school:string,student:string):Promise<EnrollmentResult>{
 const{valid,supabase}=await context(school)
 if(!valid||!validUuid(student))return{error:'Selecciona un estudiante válido.'}
 const result=await supabase.rpc('student_enrollment_detail',{school,student})
 return result.error?{error:errorMessage(result.error)}:{detail:result.data}
}
export async function changeEnrollment(form:FormData):Promise<EnrollmentResult>{
 const get=(key:string)=>String(form.get(key)??'').trim(),school=get('school'),student=get('student')
 const{valid,manager,supabase}=await context(school),revision=Number(get('revision'))
 if(!valid||!manager)return{error:'Solo dirección y administración pueden modificar las matrículas.'}
 if(!validUuid(student)||!validUuid(get('request'))||!Number.isInteger(revision)||revision<0||!['plan','activate','transfer','withdraw','reactivate','cancel_plan'].includes(get('operation'))||get('reason').length<10||get('reason').length>1000||(get('target')&&!validUuid(get('target')))||(get('enrollment')&&!validUuid(get('enrollment'))))return{error:'Revisa los datos y el motivo de al menos 10 caracteres.'}
 const result=await supabase.rpc('change_student_enrollment',{school,student,operation:get('operation'),target_classroom:get('target')||null,enrollment:get('enrollment')||null,expected_revision:revision,request:get('request'),reason:get('reason')})
 if(result.error)return{error:errorMessage(result.error)}
 refresh();const detail=await loadEnrollment(school,student)
 return{...detail,message:result.data.repeated?'El intento ya estaba guardado. No se duplicó la operación.':'Matrícula actualizada. Los registros anteriores se conservaron.'}
}
export async function previewEnrollmentBatch(school:string,source:string,target:string):Promise<EnrollmentResult>{
 const{valid,manager,supabase}=await context(school)
 if(!valid||!manager)return{error:'Solo dirección y administración pueden preparar matrículas.'}
 if(!validUuid(source)||!validUuid(target))return{error:'Selecciona aula de origen y destino.'}
 const rooms=await supabase.from('classrooms').select('id,academic_year').eq('institution_id',school).in('id',[source,target])
 if(rooms.error)return{error:errorMessage(rooms.error)}
 const from=rooms.data?.find(c=>c.id===source),to=rooms.data?.find(c=>c.id===target)
 if(!from||!to||to.academic_year<=from.academic_year)return{error:'El destino debe ser un aula de un año posterior al origen.'}
 const result=await supabase.from('students').select('id,first_names,last_names,enrollment_revision').eq('institution_id',school).eq('classroom_id',source).eq('active',true).order('id').limit(501)
 if(result.error)return{error:errorMessage(result.error)}
 if(!result.data?.length)return{error:'No hay estudiantes activos en el aula de origen.'}
 if(result.data.length>500)return{error:'El máximo por lote es 500 estudiantes. Prepara las matrículas por grupos más pequeños.'}
 const ids=result.data.map(s=>s.id),existing=[]
 for(let offset=0;offset<ids.length;offset+=100){const check=await supabase.from('student_enrollments').select('student_id').eq('institution_id',school).eq('academic_year',to.academic_year).neq('state','cancelled').in('student_id',ids.slice(offset,offset+100));if(check.error)return{error:errorMessage(check.error)};existing.push(...check.data??[])}
 if(existing.length)return{error:`${existing.length} estudiantes ya tienen matrícula para el año destino. Revisa esas fichas antes de preparar el lote; no se sobrescriben matrículas.`}
 return{pupils:result.data.map(s=>({id:s.id,name:s.last_names+', '+s.first_names,revision:s.enrollment_revision,request:crypto.randomUUID()})),message:'Vista previa preparada. No se ha cambiado ninguna matrícula ni aula actual.'}
}
export async function confirmEnrollmentBatch(school:string,source:string,target:string,pupils:{id:string;revision:number;request:string}[],reason:string,confirmed:boolean):Promise<EnrollmentResult>{
 const{valid,manager,supabase}=await context(school)
 if(!valid||!manager)return{error:'No tienes permiso para preparar este lote.'}
 if(!confirmed||!validUuid(source)||!validUuid(target)||!Array.isArray(pupils)||pupils.length<1||pupils.length>500||pupils.some(s=>!s||!validUuid(s.id)||!validUuid(s.request)||!Number.isInteger(s.revision)||s.revision<0)||typeof reason!=='string'||reason.trim().length<10||reason.length>1000)return{error:'Revisa la lista y confirma que la renovación o promoción está autorizada por la institución.'}
 const result=await supabase.rpc('plan_enrollment_batch',{school,source_classroom:source,target_classroom:target,pupils:pupils.map(p=>({student_id:p.id,revision:p.revision,request:p.request})),reason:reason.trim()})
 if(result.error)return{error:errorMessage(result.error)}
 refresh();return{message:`Se prepararon ${result.data} matrículas. Las aulas actuales no cambiaron. Cada matrícula requiere activación en su año.`}
}
