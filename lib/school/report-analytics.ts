import type {StudentReport} from './reports'
import type {ManagementReport} from './management-reports'
export type ChartDatum={label:string;value:number|null;color:string}
export type ReportChart={title:string;note:string;unit:string;maximum?:number;percent?:boolean;data:ChartDatum[]}
export type ReportAnalytics={metrics:{label:string;value:string;note:string}[];charts:ReportChart[]}
const teal='#087f78',amber='#bd8121',red='#c45b5b',slate='#738694',purple='#8073b3'
const number=(n:number)=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:2}).format(n)
const percent=(n:number,total:number)=>total>0?number(100*n/total)+' %':'Sin datos'
function gateChart(onTime:number,late:number,unknown:number):ReportChart{return{title:'Puntualidad de ingreso al colegio',unit:'primeros ingresos',percent:true,note:'Base: primeros ingresos registrados. Sin horario no equivale a tardanza; los días sin marcación no se cuentan como faltas.',data:[{label:'A tiempo',value:onTime,color:teal},{label:'Con tardanza',value:late,color:amber},{label:'Sin horario',value:unknown,color:slate}]}}
function classChart(present:number,late:number,absent:number,justified:number):ReportChart{return{title:'Asistencia a clases publicadas',unit:'marcaciones',percent:true,note:'Base: marcaciones de sesiones cerradas. No incluye borradores ni sesiones sin registro publicado.',data:[{label:'Presente',value:present,color:teal},{label:'Tardanza',value:late,color:amber},{label:'Falta',value:absent,color:red},{label:'Ausencia justificada',value:justified,color:purple}]}}
export function individualAnalytics(r:StudentReport):ReportAnalytics{
 const g=r.gate_summary,c=r.can_classes?r.class_summary:null,e=r.can_behavior?r.evaluation:null,classified=g.on_time_entries+g.late_entries
 const metrics:ReportAnalytics['metrics']=[{label:'Ingresos registrados',value:number(g.first_entries),note:'Días con primer ingreso al colegio.'},{label:'Ingresos a tiempo',value:percent(g.on_time_entries,classified),note:`Base: ${number(classified)} ingresos con horario; excluye ${number(g.unclassified_entries)} sin horario.`}]
 if(c)metrics.push({label:'Clases con registro',value:number(c.sessions),note:'Solo asistencia publicada y permitida para tu cuenta.'})
 if(r.can_behavior)metrics.push({label:'Nota final publicada',value:e?number(e.final_score)+' / 20':'Sin publicar',note:'Nota consignada por el evaluador. Sin descuentos automáticos.'})
 const charts=[gateChart(g.on_time_entries,g.late_entries,g.unclassified_entries)]
 if(c)charts.push(classChart(c.present,c.late,c.absent,c.justified))
 if(r.can_behavior)charts.push({title:'Comportamiento por criterio',unit:'nota sobre 20',maximum:20,note:'Evaluación publicada. Sin publicar no equivale a cero. La nota final es independiente y no se recalcula.',data:[{label:'Presentación personal',value:e?.presentation??null,color:teal},{label:'Puntualidad',value:e?.punctuality??null,color:teal},{label:'Convivencia',value:e?.coexistence??null,color:teal},{label:'Responsabilidad',value:e?.responsibility??null,color:teal},{label:'Nota final',value:e?.final_score??null,color:purple}]})
 return{metrics,charts}
}
export function managementAnalytics(r:ManagementReport):ReportAnalytics{
 const s=r.summary,classified=s.on_time+s.gate_late
 const metrics=[{label:'Estudiantes',value:number(s.students),note:'Padrón que coincide con los filtros del reporte.'},{label:'Ingresos a tiempo',value:percent(s.on_time,classified),note:`Base: ${number(classified)} primeros ingresos con horario.`},{label:'Conducta publicada',value:percent(s.published_behavior,s.students),note:`${number(s.published_behavior)} de ${number(s.students)} estudiantes de la selección.`},{label:'Promedio de conducta',value:s.average_behavior===null?'Sin publicar':number(s.average_behavior)+' / 20',note:'Solo notas finales publicadas; cada estudiante tiene el mismo peso.'}]
 const avg=(key:'presentation'|'punctuality'|'coexistence'|'responsibility'|'final_score')=>{const scores=r.students.map(p=>p[key]).filter((v):v is number=>v!==null);return scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null}
 return{metrics,charts:[gateChart(s.on_time,s.gate_late,s.unclassified),classChart(s.present,s.class_late,s.absent,s.justified),{title:'Cobertura de evaluación de comportamiento',unit:'estudiantes',percent:true,note:'Base: estudiantes del padrón seleccionado. Una evaluación sin publicar no se considera desaprobada.',data:[{label:'Evaluación publicada',value:s.published_behavior,color:teal},{label:'Sin evaluación publicada',value:s.missing_behavior,color:slate}]},{title:'Promedio publicado por criterio',unit:'nota sobre 20',maximum:20,note:'Promedios descriptivos de las notas publicadas. No se asignan notas ni se convierten pendientes en cero.',data:[{label:'Presentación personal',value:avg('presentation'),color:teal},{label:'Puntualidad',value:avg('punctuality'),color:teal},{label:'Convivencia',value:avg('coexistence'),color:teal},{label:'Responsabilidad',value:avg('responsibility'),color:teal},{label:'Nota final',value:avg('final_score'),color:purple}]}]}
}
export function chartValue(chart:ReportChart,value:number|null):string{
 if(value===null)return'Sin publicar'
 const total=chart.data.reduce((sum,d)=>sum+(d.value??0),0)
 return number(value)+(chart.maximum?' / '+chart.maximum:chart.percent&&total>0?' · '+percent(value,total):'')
}
