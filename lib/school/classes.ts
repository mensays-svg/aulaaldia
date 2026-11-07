export const classStatuses:Record<string,string>={present:'Presente',late:'Tardanza',absent:'Falta',justified:'Ausencia justificada'}
export type ClassPupil={id:string;first_names:string;last_names:string;dni:string|null;status:string|null;note:string|null;gate_kind:string|null;gate_at:string|null;gate_reason:string|null;gate_expects_return:boolean|null}
export type ClassDetail={id:string;course:string;classroom:string;teacher_id:string;date:string;starts_at:string;ends_at:string;topic:string|null;state:string;revision:number;can_edit:boolean;can_manage:boolean;gate_cutoff:string;students:ClassPupil[]}
export type ClassResult={error?:string;message?:string;sessionId?:string;detail?:ClassDetail}
export function validClassDate(value:string):boolean{return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value}
export function validClassTime(value:string):boolean{return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)}

export type ClassQrResult={error?:string;student_id?:string;name?:string;status?:string|null;revision?:number;repeated?:boolean;needs_review?:boolean;gate_kind?:string;gate_at?:string;gate_reason?:string|null;gate_expects_return?:boolean}
