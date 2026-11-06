export type StudentReport={
 issued_at:string
 school:{id:string;name:string}
 student:{id:string;name:string;dni:string|null;classroom:string;active:boolean}
 period:{id:string;name:string;academic_year:number;starts_on:string;ends_on:string}
 can_classes:boolean;can_behavior:boolean
 gate_summary:{movements:number;first_entries:number;late_entries:number;on_time_entries:number;unclassified_entries:number;early_exits:number}
 gate_events:{at:string;day:string;kind:string;method:string;first_entry:boolean;is_late:boolean|null;reason:string|null;authorized_by:string|null;accompanied_by:string|null;expects_return:boolean}[]
 class_summary:{sessions:number;present:number;late:number;absent:number;justified:number}|null
 classes:{date:string;starts_at:string;ends_at:string;course:string;classroom:string;status:string;note:string|null}[]
 evaluation:{presentation:number;punctuality:number;coexistence:number;responsibility:number;final_score:number;rationale:string;published_at:string;rubric_name:string;rubric_reference:string}|null
 records:{at:string;kind:string;criterion:string;summary:string;followups:{at:string;state:string;note:string}[]}[]
}
export type ReportSection={heading:string;paragraphs?:string[];columns?:string[];weights?:number[];rows?:string[][];empty?:string}
const criteria:Record<string,string>={presentation:'Presentación personal',punctuality:'Puntualidad',coexistence:'Convivencia',responsibility:'Responsabilidad'}
const kinds:Record<string,string>={entry:'Entrada',exit:'Salida de jornada',early_exit:'Salida anticipada',return:'Retorno autorizado'}
const reasons:Record<string,string>={salud:'Salud',urgencia_familiar:'Urgencia familiar',tramite:'Trámite',otro:'Otro'}
const statuses:Record<string,string>={present:'Presente',late:'Tardanza',absent:'Falta',justified:'Ausencia justificada'}
const progress:Record<string,string>={pending:'Pendiente',in_progress:'En seguimiento',completed:'Cumplido'}
export function reportTime(value:string):string{return new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'}).format(new Date(value))}
export function reportDate(value:string):string{const [year,month,day]=value.split('-');return `${day}/${month}/${year}`}
export function buildReportSections(report:StudentReport):ReportSection[]{
 const gate=report.gate_summary,classes=report.class_summary
 const summary=[`Colegio: ${gate.first_entries} días con primer ingreso registrado; ${gate.on_time_entries} a tiempo, ${gate.late_entries} con tardanza y ${gate.unclassified_entries} sin horario configurado.`,`${gate.movements} movimientos de portería; ${gate.early_exits} salidas anticipadas. No se deducen faltas de días sin marcación.`]
 if(report.can_classes&&classes)summary.push(`Clases cerradas con registro: ${classes.sessions}. Presentes: ${classes.present}; tardanzas: ${classes.late}; faltas: ${classes.absent}; ausencias justificadas: ${classes.justified}.`)
 const sections:ReportSection[]=[{heading:'Resumen de asistencia',paragraphs:summary},{heading:'Entrada y salida del colegio',columns:['Fecha y hora (Lima)','Movimiento','Puntualidad','Método','Detalle'],weights:[1.1,1.1,.9,.6,2],rows:report.gate_events.map(e=>[reportTime(e.at),kinds[e.kind]??e.kind,e.first_entry?(e.is_late===null?'Sin horario':e.is_late?'Tardanza':'A tiempo'):'—',e.method==='qr'?'QR':e.method==='dni'?'DNI':'Apellidos',[e.reason?reasons[e.reason]:null,e.authorized_by?'Autorizó: '+e.authorized_by:null,e.accompanied_by?'Recogió: '+e.accompanied_by:null,e.kind==='early_exit'?(e.expects_return?'Retorno previsto':'Sin retorno previsto'):null].filter(Boolean).join('\n')||'—']),empty:'No hay movimientos registrados en este periodo.'}]
 if(report.can_classes)sections.push({heading:'Asistencia por clase · sesiones cerradas',columns:['Fecha y horario','Curso y aula','Estado','Observación'],weights:[1.1,1.8,.9,2],rows:report.classes.map(c=>[reportDate(c.date)+'\n'+c.starts_at.slice(0,5)+'–'+c.ends_at.slice(0,5),c.course+'\n'+c.classroom,statuses[c.status]??c.status,c.note||'—']),empty:'No hay asistencias publicadas disponibles para este periodo y tus permisos. Una sesión sin publicar no se considera una falta.'})
 else sections.push({heading:'Asistencia por clase',paragraphs:['Esta sección no está disponible para tu perfil.']})
 const evaluation=report.evaluation
 if(report.can_behavior&&evaluation){
  sections.push({heading:'Comportamiento · evaluación publicada',columns:['Criterio','Nota (0 a 20)'],weights:[3,1],rows:[...Object.entries(criteria).map(([key,label])=>[label,String(evaluation[key as 'presentation'|'punctuality'|'coexistence'|'responsibility'])]),['Nota final',String(evaluation.final_score)]],paragraphs:[`Estado de la nota final: ${evaluation.final_score<11?'Desaprobatoria (menor a 11).':'Aprobatoria.'}`,`Sustento del evaluador: ${evaluation.rationale}`,`Rúbrica institucional: ${evaluation.rubric_name}. Referencia: ${evaluation.rubric_reference}.`,`Publicada: ${reportTime(evaluation.published_at)}. La nota fue consignada por el evaluador; este reporte no aplica una fórmula ni descuentos.`]})
 }else sections.push({heading:'Comportamiento · evaluación publicada',paragraphs:[report.can_behavior?'No hay una evaluación publicada para este estudiante y periodo. Los borradores no forman parte del reporte.':'Esta sección no está disponible para tu perfil.']})
 if(report.can_behavior)sections.push({heading:'Reconocimientos e incidencias comunicados',columns:['Fecha y hora (Lima)','Tipo y criterio','Resumen revisado y seguimiento familiar'],weights:[1,1.4,3],rows:report.records.map(r=>[reportTime(r.at),(r.kind==='recognition'?'Reconocimiento':'Incidencia')+'\n'+(criteria[r.criterion]??r.criterion),r.summary+(r.followups.length?'\n\nSeguimiento:\n'+r.followups.map(f=>`${reportTime(f.at)} · ${progress[f.state]??f.state}: ${f.note}`).join('\n'):'')]),empty:'No hay resúmenes comunicados a la familia en este periodo.'})
 sections.push({heading:'Alcance del reporte',paragraphs:['Se muestran los registros disponibles al momento de emisión y permitidos para la cuenta que consulta. El aula de cabecera es la actual; cada clase conserva el aula de su sesión.','La asistencia al colegio y a clases son registros separados. Las tardanzas de ambos módulos no se suman como una penalización. Las justificaciones y circunstancias requieren valoración del responsable.','Este es un reporte de seguimiento. No sustituye certificados oficiales, actas, firmas ni el procedimiento institucional correspondiente.']})
 return sections
}
