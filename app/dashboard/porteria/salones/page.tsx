import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import {limaDate,formatGateTime,stateLabels} from '@/lib/school/gate'
import {validClassDate} from '@/lib/school/classes'
import {getGateClassReport} from '@/lib/school/report-data'
import {gateClassAnalytics,type GateClassReport} from '@/lib/school/gate-reports'
import ReportCharts from '../../reportes/report-charts'
export const dynamic='force-dynamic'
export default async function GateRooms({searchParams}:{searchParams:Promise<{school?:string;classroom?:string;date?:string;period?:string}>}){
 const params=await searchParams,{supabase,school,roles,setupError}=await schoolContext(params.school)
 if(setupError||!school)return <h1>Debes estar vinculado a una institución.</h1>
 if(!roles.some(r=>['administrador','director','auxiliar'].includes(r)))return <div className="workspace"><h1>Acceso restringido</h1><p>Este reporte es para portería, dirección y administración.</p></div>
 const date=params.date&&validClassDate(params.date)?params.date:limaDate(),rooms:{id:string;label:string}[]=[]
 let optionsError=false
 for(let offset=0;;offset+=500){const result=await supabase.from('classrooms').select('id,academic_year,level,grade,section').eq('institution_id',school).order('academic_year',{ascending:false}).order('id').range(offset,offset+499);if(result.error){optionsError=true;break}rooms.push(...(result.data??[]).map(r=>({id:r.id,label:`${r.academic_year} · ${r.level} ${r.grade} ${r.section}`})));if((result.data?.length??0)<500)break}
 const selected=rooms.find(r=>r.id===params.classroom)??(!params.classroom&&rooms.length===1?rooms[0]:undefined)
 const periodsResult=await supabase.from('behavior_periods').select('id,name,academic_year,starts_on,ends_on').eq('institution_id',school).order('academic_year',{ascending:false}).order('starts_on',{ascending:false}).limit(1000)
 const periods=periodsResult.data??[],period=periods.find(p=>p.id===params.period)??periods.find(p=>p.starts_on<=date&&p.ends_on>=date)??periods.find(p=>p.starts_on<=date)??periods[0]
 let report:GateClassReport|undefined,error:string|undefined
 if(params.date&&!validClassDate(params.date))error='La fecha indicada no es válida.'
 else if(params.classroom&&!selected)error='El salón no está disponible para esta institución.'
 else if(selected&&!optionsError){const result=await getGateClassReport(school,selected.id,date);report=result.report;error=result.error}
 return <div className="workspace"><Link href={'/dashboard?school='+school}>← Inicio / Escanear QR</Link><h1>Reporte de portería por salón</h1><p>Consulta el ingreso al colegio, las tardanzas, salidas y retornos. La asistencia a cada curso se registra por separado.</p>
 {optionsError?<p role="alert" className="notice">No se pudieron cargar los salones. Recarga antes de continuar.</p>:<form method="get" className="grid-form"><input type="hidden" name="school" value={school}/><label>Salón<select name="classroom" required defaultValue={selected?.id??''}><option value="">Elige un salón</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label>Fecha de ingreso<input type="date" name="date" defaultValue={date} max={limaDate()} required/></label><label>Periodo para el PDF individual<select name="period" defaultValue={period?.id??''} disabled={!periods.length}><option value="">Sin periodo disponible</option>{periods.map(p=><option key={p.id} value={p.id}>{p.academic_year} · {p.name}</option>)}</select></label><button>Consultar salón</button></form>}
 {error&&<p role="alert" className="notice">{error}</p>}
 {report&&<><h2>{report.classroom.label} · {report.date.split('-').reverse().join('/')}</h2><a className="import-link" href={'/dashboard/porteria/salones/pdf?'+new URLSearchParams({school,classroom:report.classroom.id,date:report.date})}>Descargar PDF del salón</a><ReportCharts analytics={gateClassAnalytics(report)}/><p>{report.summary.inside} dentro del colegio · {report.summary.awaiting_return} con retorno pendiente · {report.summary.early_exits} salidas anticipadas · {report.summary.returns} retornos.</p><div className="table-scroll"><table><thead><tr><th>Estudiante</th><th>Primer ingreso</th><th>Puntualidad</th><th>Situación</th><th>Reporte individual</th></tr></thead><tbody>{report.students.map(s=><tr key={s.id}><td>{s.name}<br/>{s.dni??'Sin DNI'}{!s.active&&<p>Matrícula inactiva al corte</p>}</td><td>{s.first_entry_at?formatGateTime(s.first_entry_at):'Sin ingreso registrado'}</td><td>{s.first_entry_at?s.is_late===null?'Sin horario':s.is_late?'Tardanza':'A tiempo':'—'}</td><td>{stateLabels[s.state]??s.state}</td><td><Link href={'/dashboard/reportes?'+new URLSearchParams({school,student:s.id,...(period?{period:period.id}:{})})}>Ver reporte</Link>{period&&<><br/><a href={'/dashboard/reportes/pdf?'+new URLSearchParams({school,student:s.id,period:period.id})}>Descargar PDF individual</a></>}</td></tr>)}</tbody></table></div>{!report.students.length&&<p className="empty">No hay estudiantes en el padrón del salón para esta fecha.</p>}<p className="notice">Sin ingreso registrado no equivale a una falta. El padrón utiliza la matrícula de la fecha consultada; las fechas iniciales desconocidas no certifican una matrícula oficial.</p></>}
 {periodsResult.error&&<p className="notice">No se pudieron cargar los periodos para el PDF individual.</p>}
 </div>
}
