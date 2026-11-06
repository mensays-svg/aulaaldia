import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import {limaDate} from '@/lib/school/gate'
import {getManagementReport} from '@/lib/school/report-data'
import {buildManagementSections,managementFilterLabel,type ManagementFilters,type ManagementReport} from '@/lib/school/management-reports'
import {reportDate,reportTime} from '@/lib/school/reports'
import PrintReport from '../print-button'
import ManagementFilterForm from './filters'
export const dynamic='force-dynamic'
export default async function ManagementReportsPage({searchParams}:{searchParams:Promise<{school?:string;period?:string;year?:string;level?:string;grade?:string;section?:string;state?:string}>}){
 const params=await searchParams
 const {supabase,school,roles,setupError}=await schoolContext(params.school)
 const back=<Link href={school?'/dashboard/reportes?school='+school:'/dashboard'}>← Reportes individuales</Link>
 if(setupError||!school)return <>{back}<h1>Reportes para dirección</h1><p className="notice">Tu cuenta debe estar vinculada a una institución.</p></>
 if(!roles.some(r=>['administrador','director'].includes(r)))return <>{back}<h1>Acceso restringido</h1><p className="notice">Los reportes generales son exclusivos de dirección y administración de la institución.</p></>
 const periodsResult=await supabase.from('behavior_periods').select('id,name,academic_year,starts_on,ends_on').eq('institution_id',school).order('academic_year',{ascending:false}).order('starts_on',{ascending:false}).limit(1000)
 if(periodsResult.error)return <>{back}<h1>Reportes para dirección</h1><p className="notice">No se pudieron cargar los periodos. Comprueba la configuración de los módulos escolares.</p></>
 const periods=periodsResult.data??[],today=limaDate(),specified=periods.find(p=>p.id===params.period)
 const year=params.year!==undefined?Number(params.year):specified?.academic_year??periods.find(p=>p.starts_on<=today&&p.ends_on>=today)?.academic_year??periods.find(p=>p.starts_on<=today)?.academic_year??periods[0]?.academic_year??Number(today.slice(0,4))
 const options=periods.filter(p=>p.academic_year===year)
 const period=specified??options.find(p=>p.starts_on<=today&&p.ends_on>=today)??options.find(p=>p.starts_on<=today)??options[0]
 const rooms:{academic_year:number;level:string;grade:string;section:string}[]=[]
 let optionsError=false
 for(let offset=0;;offset+=500){const result=await supabase.from('classrooms').select('academic_year,level,grade,section').eq('institution_id',school).order('id').range(offset,offset+499);if(result.error){optionsError=true;break}rooms.push(...result.data??[]);if((result.data?.length??0)<500)break}
 const filters:ManagementFilters={year,level:params.level?.trim()||null,grade:params.grade?.trim()||null,section:params.section?.trim()||null,state:params.state??'all'}
 let report:ManagementReport|undefined,error:string|undefined
 if(params.period&&!specified)error='El periodo indicado no está disponible en esta institución. Selecciona un periodo válido.'
 else if(period){const result=await getManagementReport(school,period.id,filters);report=result.report;error=result.error}
 else if(periods.length)error='No hay un periodo para el año seleccionado.'
 const exportParams=report?new URLSearchParams({school,period:report.period.id,year:String(report.filters.year),state:report.filters.state,...(report.filters.level?{level:report.filters.level}:{}),...(report.filters.grade?{grade:report.filters.grade}:{}),...(report.filters.section?{section:report.filters.section}:{})}):null
 const sections=report?buildManagementSections(report):[]
 return <div className="workspace"><div className="report-controls">{back}<h1>Reportes generales para dirección</h1><p>Resumen de asistencia y conducta publicada, agrupado por el aula actual de cada estudiante. Solo disponible para dirección y administración.</p>
 {!periods.length?<p className="notice">Primero crea un periodo en Comportamiento para definir las fechas del reporte.</p>:optionsError?<p role="alert" className="notice">No se pudieron cargar las aulas. Recarga antes de aplicar los filtros.</p>:<ManagementFilterForm key={JSON.stringify(params)} school={school} periods={periods} rooms={rooms} initial={filters} periodId={period?.id??''} today={today}/>}
 {error&&<p role="alert" className="notice">{error}</p>}
 {report&&<div className="import-controls"><a className="import-link" href={'/dashboard/reportes/direccion/pdf?'+exportParams}>Descargar PDF institucional</a><PrintReport/></div>}</div>
 {report&&<article className="student-report management-report"><header><p className="eyebrow">AULA AL DÍA · USO INSTITUCIONAL</p><h1>{report.school.name}</h1><h2>Reporte general de asistencia y comportamiento</h2><p>{report.period.name} · {reportDate(report.period.starts_on)} al {reportDate(report.period.ends_on)}</p><p><strong>{managementFilterLabel(report.filters)}</strong></p><p>Emitido: {reportTime(report.issued_at)} (hora de Lima).</p></header>
 {sections.map((section,index)=><section key={index}><h2>{section.heading}</h2>{section.columns&&<>{section.rows?.length?<div className="table-scroll"><table><thead><tr>{section.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{section.rows.map((row,i)=><tr key={i}>{row.map((value,j)=><td className="preserve-lines" key={j}>{value}</td>)}</tr>)}</tbody></table></div>:<p>{section.empty}</p>}</>}{section.paragraphs?.map((p,i)=><p key={i} className="preserve-lines">{p}</p>)}</section>)}
 </article>}
 </div>
}
