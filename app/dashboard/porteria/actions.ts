'use server'
import { revalidatePath } from 'next/cache'
import { schoolContext } from '@/lib/school/context'
import { validUuid } from '@/lib/school/validation'
import { gateQrToken, movements, reasons, formatGateTime, type GateResult } from '@/lib/school/gate'

function errorMessage(error: { code?:string; message?:string }):string {
  if (error.code === 'PGRST202' || error.code === '42P01' || error.code === '42883') return 'Falta activar el módulo de portería: ejecuta la migración 202611050003_gate_attendance.sql en Supabase.'
  const messages: Record<string,string> = {
    ENROLLMENT_CURRENT_YEAR_REQUIRED:'Falta una matrícula vigente para este año y aula. Dirección debe revisar o activar la matrícula antes de marcar.',
    GATE_INVALID_TRANSITION:'El estado cambió o el movimiento no corresponde. Actualiza el estudiante y revisa su último movimiento.',
    GATE_EXIT_DETAILS_REQUIRED:'Indica el motivo y quién autorizó la salida anticipada.',
    GATE_QR_INVALID:'El QR no es válido para esta institución o fue reemplazado. Busca al estudiante por DNI o apellidos.',
    GATE_INACTIVE_STUDENT:'El estudiante está inactivo. Revisa su ficha antes de registrar movimientos.',
    GATE_STUDENT_NOT_FOUND:'No se encontró el estudiante o aula en esta institución.',
    GATE_REQUEST_CONFLICT:'Este intento ya se utilizó con otros datos. Actualiza el estudiante antes de continuar.',
  }
  if (error.code === '42501') return 'No tienes permiso para esta operación.'
  return messages[error.message ?? ''] ?? 'No se pudo completar la operación. Revisa el historial antes de reintentar; si se perdió la conexión, el movimiento podría haberse guardado.'
}
async function staff(school:string) {
  const context=await schoolContext(school)
  return {...context, allowed:validUuid(school) && context.school===school && context.roles.some(r=>['administrador','director','auxiliar'].includes(r))}
}
export async function searchGateStudent(school:string, query:string):Promise<GateResult> {
  const {supabase,allowed}=await staff(school)
  if (!allowed) return {error:'No tienes permiso para registrar movimientos.'}
  if (typeof query!=='string' || query.length>160) return {error:'Revisa el texto de búsqueda.'}
  const token=gateQrToken(query)
  if (token) {
    const lookup=await supabase.rpc('find_gate_qr',{school,code:token})
    if (lookup.error) return {error:errorMessage(lookup.error)}
    return loadGateStudent(school,String(lookup.data))
  }
  const normalized=query.replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').trim()
  if (normalized.length<2) return {error:'Escribe un DNI o al menos dos letras del nombre o apellido.'}
  let request=supabase.from('students').select('id,first_names,last_names,dni,active').eq('institution_id',school)
  if (/^\d{8}$/.test(normalized)) request=request.eq('dni',normalized)
  else for (const term of normalized.split(/\s+/).slice(0,8)) request=request.or(`first_names.ilike.%${term}%,last_names.ilike.%${term}%`)
  const result=await request.order('last_names').order('id').limit(20)
  if (result.error) return {error:errorMessage(result.error)}
  return {students:result.data ?? []}
}
export async function loadGateStudent(school:string, student:string):Promise<GateResult> {
  const {supabase,allowed}=await staff(school)
  if (!allowed || !validUuid(student)) return {error:'No tienes permiso o el estudiante no es válido.'}
  const result=await supabase.rpc('gate_student_status',{school,student})
  if (result.error) return {error:errorMessage(result.error)}
  return {student:result.data}
}
export async function markGateEvent(form:FormData):Promise<GateResult> {
  const get=(key:string)=>String(form.get(key) ?? '').trim()
  const school=get('school'),student=get('student')
  const {supabase,allowed}=await staff(school)
  if (!allowed) return {error:'No tienes permiso para registrar movimientos.'}
  const movement=get('movement'), source=get('method'), request=get('request')
  if (!validUuid(student) || !validUuid(request) || !Object.hasOwn(movements,movement) || !['dni','apellidos','qr'].includes(source)) return {error:'Revisa el movimiento y vuelve a intentarlo.'}
  const early=movement==='early_exit'
  if (early && (!Object.hasOwn(reasons,get('reason')) || !get('authorization'))) return {error:'Indica el motivo y quién autorizó la salida.'}
  if (get('note').length>500 || get('authorization').length>120 || get('companion').length>120) return {error:'Las observaciones admiten 500 caracteres y los nombres 120.'}
  const result=await supabase.rpc('record_gate_event',{
    school,student,movement,source,request,exit_reason:early?get('reason'):null,observation:get('note')||null,
    authorized_name:early?get('authorization'):null,companion:early?(get('companion')||null):null,
    will_return:early && get('will_return')==='true',qr_code:source==='qr'?gateQrToken(get('qr')):null,
  })
  if (result.error) return {error:errorMessage(result.error)}
  revalidatePath('/dashboard/porteria')
  const refreshed=await loadGateStudent(school,student)
  return {student:refreshed.student,message:`${movements[movement]} registrada: ${formatGateTime(result.data.occurred_at)}.${result.data.repeated?' El intento ya estaba guardado; no se duplicó.':''}${result.data.is_late===true?' Ingreso con tardanza.':''}${refreshed.error?' Actualiza la ficha para consultar el estado.':''}`}
}
export async function generateGateQr(school:string,student:string,rotate:boolean):Promise<GateResult> {
  const {supabase,allowed}=await staff(school)
  if (!allowed || !validUuid(student) || typeof rotate!=='boolean') return {error:'No tienes permiso para generar el carnet.'}
  const result=await supabase.rpc('get_student_gate_code',{school,student,rotate})
  if (result.error) return {error:errorMessage(result.error)}
  return {qr:`aulaaldia:student:${result.data}`}
}
export async function saveGateSchedule(form:FormData):Promise<GateResult> {
  const school=String(form.get('school') ?? ''),classroom=String(form.get('classroom') ?? '')
  const {supabase,allowed,roles}=await staff(school)
  if (!allowed || !roles.some(r=>['administrador','director'].includes(r))) return {error:'Solo dirección o administración pueden configurar horarios.'}
  const start=String(form.get('start') ?? ''), tolerance=Number(form.get('tolerance'))
  if (!validUuid(classroom) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !Number.isInteger(tolerance) || tolerance<0 || tolerance>120) return {error:'Revisa el aula, la hora y la tolerancia (0 a 120 minutos).'}
  const result=await supabase.rpc('set_gate_schedule',{school,classroom,start_time:start,tolerance})
  if (result.error) return {error:errorMessage(result.error)}
  revalidatePath('/dashboard/porteria')
  return {message:'Horario guardado. Se aplicará a los próximos primeros ingresos; no cambia las marcaciones anteriores.'}
}
