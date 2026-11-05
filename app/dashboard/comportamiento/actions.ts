'use server'
import {revalidatePath} from 'next/cache'
import {schoolContext} from '@/lib/school/context'
import {validUuid} from '@/lib/school/validation'
import {validClassDate} from '@/lib/school/classes'
import {behaviorCriteria,behaviorKinds,followupStates,type BehaviorResult} from '@/lib/school/behavior'
function message(error:{code?:string;message?:string}):string{
 if(['PGRST202','42P01','42883'].includes(error.code??''))return 'Falta activar comportamiento: ejecuta la migración 202611050005_behavior.sql en Supabase.'
 const known:Record<string,string>={BEHAVIOR_FORBIDDEN:'No tienes permiso para este estudiante u operación.',BEHAVIOR_INVALID_INPUT:'Revisa los datos, las fechas y las notas de 0 a 20. La fecha del hecho debe pertenecer al periodo y no ser futura.',BEHAVIOR_INVALID_PERIOD:'El periodo no está disponible en esta institución.',BEHAVIOR_NOT_FOUND:'No se encontró el registro.',BEHAVIOR_STALE:'La evaluación cambió desde que la abriste. Recarga la ficha para revisar lo guardado antes de continuar.',BEHAVIOR_PUBLISHED:'La evaluación está publicada. Dirección debe reabrirla para corregir.',BEHAVIOR_REASON_REQUIRED:'Escribe un motivo para la corrección o reapertura.',BEHAVIOR_INCOMPLETE:'Completa los cuatro criterios, la nota final, un sustento de al menos 20 caracteres y una rúbrica institucional antes de publicar.',BEHAVIOR_FUTURE_PERIOD:'El periodo todavía no ha comenzado.'}
 if(known[error.message??''])return known[error.message!]
 if(error.code==='23505')return 'Ya existe ese periodo o evaluación. Recarga la ficha.'
 if(['22023','22P02','23514'].includes(error.code??''))return 'Revisa los campos, sus longitudes y las notas de 0 a 20.'
 return 'No se pudo completar la operación. Revisa el historial antes de reintentar; si hubo un corte de conexión, podría haberse guardado.'
}
export async function loadBehavior(school:string,student:string,period:string):Promise<BehaviorResult>{
 const c=await schoolContext(school)
 if(c.school!==school||![school,student,period].every(validUuid))return{error:'Revisa la institución, el estudiante y el periodo.'}
 const result=await c.supabase.rpc('behavior_student_detail',{school,student,period})
 return result.error?{error:message(result.error)}:{detail:result.data}
}
export async function manageBehavior(form:FormData):Promise<BehaviorResult>{
 const get=(key:string)=>String(form.get(key)??'').trim()
 const school=get('school'),student=get('student'),period=get('period'),intent=get('intent')
 const {supabase,school:currentSchool}=await schoolContext(school)
 if(!validUuid(school)||school!==currentSchool)return{error:'Institución no válida.'}
 let result:{error:{code?:string;message?:string}|null;data?:unknown}
 let success='Cambios guardados.'
 if(intent==='period'){
  const year=Number(get('year'))
  if(!Number.isInteger(year)||year<2000||year>2100||!validClassDate(get('start'))||!validClassDate(get('end'))||get('start')>get('end')||get('name').length<2||get('name').length>100)return{error:'Revisa el nombre, año y fechas del periodo.'}
  result=await supabase.rpc('create_behavior_period',{school,label:get('name'),year,start_date:get('start'),end_date:get('end')})
 }else if(intent==='rubric'){
  if(get('confirmed')!=='true'||get('name').length<2||get('name').length>120||get('reference').length<2||get('reference').length>200||get('criteria').length<40||get('criteria').length>5000)return{error:'Completa la rúbrica y su referencia de aprobación. Registra únicamente criterios ya aprobados por tu institución.'}
  result=await supabase.rpc('register_behavior_rubric',{school,label:get('name'),approval_reference:get('reference'),criteria_text:get('criteria'),confirmed:true})
 }else{
  if(!validUuid(student)||!validUuid(period))return{error:'Selecciona un estudiante y un periodo.'}
  if(intent==='record'){
   if(!Object.hasOwn(behaviorKinds,get('kind'))||!Object.hasOwn(behaviorCriteria,get('criterion'))||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(get('occurred_at'))||!validClassDate(get('occurred_at').slice(0,10))||get('location').length<1||get('location').length>120||get('description').length<10||get('description').length>2000||get('student_version').length>2000)return{error:'Revisa el tipo, criterio, fecha, lugar y descripción objetiva de al menos 10 caracteres.'}
   const instant=new Date(get('occurred_at')+'-05:00')
   if(Number.isNaN(instant.getTime()))return{error:'Fecha u hora no válida.'}
   result=await supabase.rpc('add_behavior_record',{school,student,period,record_kind:get('kind'),item:get('criterion'),happened_at:instant.toISOString(),place:get('location'),facts:get('description'),student_statement:get('student_version')||null})
   success='Registro guardado como anotación interna. No genera notas ni sanciones automáticas.'
  }else if(intent==='communicate'){
   if(!validUuid(get('record'))||get('review_reason').length<5||get('review_reason').length>1000||get('family_summary').length>1500||(get('visible')==='true'&&get('family_summary').length<10))return{error:'Completa el resumen revisado para la familia y el motivo de la revisión.'}
   result=await supabase.rpc('communicate_behavior_record',{school,record:get('record'),family_text:get('family_summary'),visible:get('visible')==='true',review_reason:get('review_reason')})
  }else if(intent==='followup'){
   if(!validUuid(get('record'))||get('note').length<5||get('note').length>1500||!Object.hasOwn(followupStates,get('state')))return{error:'Revisa el seguimiento y su estado.'}
   result=await supabase.rpc('add_behavior_followup',{school,record:get('record'),progress:get('note'),progress_state:get('state'),visible:get('family_visible')==='true'})
   success='Seguimiento añadido al historial.'
  }else if(intent==='evaluation'){
   const values:Record<string,string|number|null>={rubric_id:get('rubric')||null,rationale:get('rationale')||null}
   for(const criterion of [...Object.keys(behaviorCriteria),'final_score']){
    const value=get(criterion)===''?null:Number(get(criterion))
    if(value!==null&&(!Number.isFinite(value)||value<0||value>20))return{error:'Las notas deben estar entre 0 y 20.'}
    values[criterion]=value
   }
   const revision=Number(get('revision'))
   if(!Number.isInteger(revision)||revision< -1||get('rationale').length>2000||get('correction').length>1000||(get('rubric')&&!validUuid(get('rubric'))))return{error:'Revisa la evaluación y el motivo de corrección.'}
   result=await supabase.rpc('save_behavior_evaluation',{school,student,period,expected_revision:revision,values_json:values,correction:get('correction')||null})
   success='Borrador guardado. La nota final fue consignada por el evaluador; no se aplicó una fórmula automática.'
  }else if(intent==='publish'||intent==='reopen'){
   const revision=Number(get('revision'))
   if(!validUuid(get('evaluation'))||!Number.isInteger(revision)||revision<0||get('reason').length>1000)return{error:'Evaluación no válida.'}
   result=await supabase.rpc('publish_behavior_evaluation',{school,evaluation:get('evaluation'),expected_revision:revision,publish:intent==='publish',reason:get('reason')||null})
   success=intent==='publish'?'Evaluación publicada para los apoderados vinculados.':'Evaluación reabierta; la familia no verá el borrador hasta publicarlo de nuevo.'
  }else return{error:'Operación no válida.'}
 }
 if(result.error)return{error:message(result.error)}
 revalidatePath('/dashboard/comportamiento')
 if(validUuid(student)&&validUuid(period)){const refreshed=await loadBehavior(school,student,period);return{...refreshed,message:success}}
 return{message:success}
}
