import type {ManagementReport} from './management-reports'

// Per-section RPCs authorize every source. Never average classroom averages.
export function combineTeacherReports(reports:ManagementReport[]):ManagementReport{
 if(!reports.length)throw new Error('No hay secciones seleccionadas.')
 const first=reports[0],students=reports.flatMap(r=>r.students),classrooms=reports.flatMap(r=>r.classrooms)
 if(reports.some(r=>r.school.id!==first.school.id||r.period.id!==first.period.id)||new Set(classrooms.map(r=>r.id)).size!==classrooms.length||new Set(students.map(s=>s.id)).size!==students.length)throw new Error('La selección no puede combinarse. Recarga el reporte.')
 const summary={...first.summary},sessions={...first.sessions}
 for(const key of Object.keys(summary) as (keyof typeof summary)[])if(key!=='average_behavior')summary[key]=reports.reduce((sum,r)=>sum+(r.summary[key]??0),0)
 for(const key of Object.keys(sessions) as (keyof typeof sessions)[])sessions[key]=reports.reduce((sum,r)=>sum+r.sessions[key],0)
 const scores=students.flatMap(s=>s.final_score===null?[]:[s.final_score])
 summary.average_behavior=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100:null
 return {...first,teacher_scope:true,filters:{...first.filters,level:first.classrooms[0]?.level??first.filters.level,grade:first.classrooms[0]?.grade??first.filters.grade,section:null},issued_at:new Date().toISOString(),unknown_enrollment_dates:reports.reduce((sum,r)=>sum+(r.unknown_enrollment_dates??0),0),summary,sessions,classrooms,students:students.sort((a,b)=>a.name.localeCompare(b.name,'es'))}
}
