'use server'
import { revalidatePath } from 'next/cache'
import { schoolContext } from '@/lib/school/context'
import { validUuid } from '@/lib/school/validation'
import { classStatuses,validClassDate,validClassTime,type ClassResult } from '@/lib/school/classes'
function errorMessage(error:{code?:string;message?:string}):string{
 if(['PGRST202','42P01','42883'].includes(error.code??''))return 'Falta activar asistencia por clase: ejecuta la migración 202611050004_class_attendance.sql en Supabase.'
 const known:Record<string,string>={CLASS_FORBIDDEN:'No tienes permiso para esta sesión o ya no estás asignado al aula.',CLASS_TEACHER_NOT_ASSIGNED:'El docente debe tener esta aula asignada en Personas y vínculos.',CLASS_INVALID_CLASSROOM:'Revisa el aula: su año escolar debe coincidir con la fecha de la clase.',CLASS_OVERLAP:'El aula o el docente ya tienen una sesión que coincide con ese horario.',CLASS_EMPTY_ROSTER:'El aula debe tener entre 1 y 1000 estudiantes activos.',CLASS_CLOSED:'La sesión está cerrada. Dirección debe reabrirla antes de corregir.',CLASS_STALE:'La sesión cambió desde que la abriste. Recárgala antes de guardar; el intento anterior podría estar guardado.',CLASS_FUTURE:'Todavía no comienza esta sesión según la hora de Lima.',CLASS_CORRECTION_REQUIRED:'Escribe el motivo de la corrección o reapertura.',CLASS_INCOMPLETE:'Falta marcar estudiantes. Guarda todas las asistencias antes de cerrar.',CLASS_NOT_FOUND:'No se encontró la sesión en esta institución.',CLASS_STUDENT_NOT_IN_ROSTER:'Uno de los estudiantes no pertenece a la lista de esta sesión.',CLASS_INVALID_INPUT:'Revisa los campos, estados y observaciones. Una ausencia justificada necesita una explicación.'}
 if(known[error.message??''])return known[error.message!]
 if(error.code==='23505')return 'Ya existe ese curso o sesión. Revisa el listado.'
 if(error.code==='42501')return 'No tienes permiso para realizar esta acción.'
 return 'No se pudo completar la operación. Recarga la sesión y revisa lo guardado antes de reintentar.'
}
async function context(school:string){const c=await schoolContext(school);return{...c,valid:validUuid(school)&&c.school===school,manager:c.roles.some(r=>['administrador','director'].includes(r))}}
export async function loadClass(school:string,lesson:string):Promise<ClassResult>{
 const{valid,supabase}=await context(school)
 if(!valid||!validUuid(lesson))return{error:'Sesión no válida.'}
 const result=await supabase.rpc('class_session_detail',{school,lesson})
 return result.error?{error:errorMessage(result.error)}:{detail:result.data}
}
export async function createCourse(form:FormData):Promise<ClassResult>{
 const school=String(form.get('school')??''),name=String(form.get('name')??'').trim()
 const{valid,manager,supabase}=await context(school)
 if(!valid||!manager)return{error:'Solo dirección y administración pueden crear cursos.'}
 if(name.length<2||name.length>100)return{error:'El nombre del curso debe tener de 2 a 100 caracteres.'}
 const result=await supabase.rpc('create_school_course',{school,course_name:name})
 if(result.error)return{error:errorMessage(result.error)}
 revalidatePath('/dashboard/clases');return{message:'Curso registrado.'}
}
export async function createSession(form:FormData):Promise<ClassResult>{
 const get=(key:string)=>String(form.get(key)??'').trim()
 const school=get('school'),{valid,manager,user,roles,supabase}=await context(school)
 if(!valid||(!manager&&!roles.includes('docente')))return{error:'No tienes permiso para crear sesiones.'}
 const teacher=manager?get('teacher'):user.id
 if(!validUuid(get('classroom'))||!validUuid(get('course'))||!validUuid(teacher)||!validClassDate(get('date'))||!validClassTime(get('start'))||!validClassTime(get('end'))||get('end')<=get('start')||get('topic').length>160)return{error:'Revisa aula, curso, docente, fecha y horario de la sesión.'}
 const result=await supabase.rpc('create_class_session',{school,classroom:get('classroom'),course:get('course'),teacher,day:get('date'),start_time:get('start'),end_time:get('end'),subject:get('topic')||null})
 if(result.error)return{error:errorMessage(result.error)}
 revalidatePath('/dashboard/clases');return{sessionId:result.data,message:'Sesión creada con la lista de estudiantes activos del aula.'}
}
export async function saveAttendance(school:string,lesson:string,revision:number,marks:{student_id:string;status:string;note:string}[],correction:string):Promise<ClassResult>{
 const {valid,supabase}=await context(school)
 if(!valid||!validUuid(lesson)||!Number.isInteger(revision)||revision<0||!Array.isArray(marks)||marks.length<1||marks.length>1000||typeof correction!=='string'||correction.length>500)return{error:'Revisa los datos de la sesión.'}
 if(marks.some(m=>!m||!validUuid(m.student_id)||!Object.hasOwn(classStatuses,m.status)||typeof m.note!=='string'||m.note.length>500||(m.status==='justified'&&!m.note.trim())))return{error:'Revisa los estados. Las ausencias justificadas necesitan una explicación.'}
 const result=await supabase.rpc('save_class_attendance',{school,lesson,expected_revision:revision,marks,correction:correction.trim()||null})
 if(result.error)return{error:errorMessage(result.error)}
 revalidatePath('/dashboard/clases');const refreshed=await loadClass(school,lesson)
 return{...refreshed,message:'Asistencia guardada. Cierra la sesión al terminar para publicarla a los apoderados.'}
}
export async function changeSessionState(school:string,lesson:string,revision:number,state:string,reason:string):Promise<ClassResult>{
 const {valid,supabase}=await context(school)
 if(!valid||!validUuid(lesson)||!Number.isInteger(revision)||revision<0||!['draft','closed'].includes(state)||typeof reason!=='string'||reason.length>500)return{error:'Revisa la sesión y el motivo.'}
 const result=await supabase.rpc('change_class_session_state',{school,lesson,expected_revision:revision,new_state:state,reason:reason.trim()||null})
 if(result.error)return{error:errorMessage(result.error)}
 revalidatePath('/dashboard/clases');const refreshed=await loadClass(school,lesson)
 return{...refreshed,message:state==='closed'?'Sesión cerrada. Los apoderados vinculados pueden consultar la asistencia de sus hijos.':'Sesión reabierta. Las correcciones necesitan un motivo y quedarán registradas.'}
}
