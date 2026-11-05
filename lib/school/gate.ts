export const movements: Record<string,string> = { entry:'Entrada', exit:'Salida de jornada', early_exit:'Salida anticipada', return:'Retorno autorizado' }
export const reasons: Record<string,string> = { salud:'Salud', urgencia_familiar:'Urgencia familiar', tramite:'Trámite', otro:'Otro' }
export const stateLabels: Record<string,string> = { inside:'Dentro del colegio', awaiting_return:'Fuera · retorno pendiente', unregistered:'Sin ingreso registrado hoy', outside:'Fuera del colegio' }
export type GateStudent = { id:string; first_names:string; last_names:string; dni:string|null; active:boolean; classroom_id:string; classroom:string; day:string; state:string; last_kind:string|null; last_at:string|null; starts_at:string|null; grace_minutes:number|null }
export type GateResult = { error?:string; students?:{id:string;first_names:string;last_names:string;dni:string|null;active:boolean}[]; student?:GateStudent; qr?:string; message?:string }
export function gateQrToken(text:string): string|null {
  const match=/^aulaaldia:student:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(text.trim())
  return match?.[1] ?? null
}
export function limaDate(date = new Date()):string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
}
export function formatGateTime(value:string):string {
  return new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'}).format(new Date(value))
}
