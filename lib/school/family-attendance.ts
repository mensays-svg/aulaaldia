export type FamilyMovement={kind:string;occurred_at:string;is_late:boolean|null}
export function familyAttendance(first:FamilyMovement|null,last:FamilyMovement|null,failed=false,historical=false){
 if(failed)return{title:'No se pudo comprobar la asistencia',detail:'Intenta actualizar en unos momentos.',state:'unknown'}
 if(!first&&!last)return{title:'Sin ingreso registrado',detail:'No hay marcación de entrada. Esto no confirma una inasistencia.',state:'pending'}
 if(last?.kind==='early_exit')return{title:'Asistió · salió anticipadamente',detail:'Tiene una salida anticipada registrada.',state:'outside'}
 if(last?.kind==='exit')return{title:'Asistió · ya salió del colegio',detail:'Tiene una salida de jornada registrada.',state:'outside'}
 return{title:historical?'Asistió · sin salida registrada':'Asistió · dentro del colegio',detail:'Según la última marcación registrada en portería.',state:'inside'}
}
