import Link from 'next/link'
import {schoolContext} from '@/lib/school/context'
import GateConsole from './porteria/gate-console'
import Icon from '@/app/components/ui-icon'
export default async function AuxiliaryDashboard({school,message}:{school:string;message?:string}){
 const {supabase}=await schoolContext(school)
 const [institutions,periods]=await Promise.all([supabase.from('institutions').select('id,name'),supabase.from('behavior_periods').select('id,name,academic_year,starts_on,ends_on').eq('institution_id',school).order('academic_year',{ascending:false}).order('starts_on',{ascending:false}).limit(1000)])
 const name=institutions.data?.find(i=>i.id===school)?.name??'Mi institución'
 return <div className="workspace auxiliary-home"><header><p className="eyebrow">PORTERÍA · AUXILIAR</p><h1>{name}</h1><p>Escanea el carnet, comprueba la identidad y confirma el movimiento.</p></header>
 {message&&<p className="notice" role="status">{message}</p>}
 <GateConsole key={school} school={school} schoolName={name} rooms={[]} manager={false} periods={periods.data??[]}/>
 <div className="aux-report-shortcuts"><Link className="quick-card" href={'/dashboard/porteria/salones?school='+school}><Icon name="chart"/><h3>Reportes por salón</h3><p>Ingresos, tardanzas, salidas y retornos por fecha.</p></Link><Link className="quick-card" href={'/dashboard/reportes?school='+school}><Icon name="folder"/><h3>Reporte individual y PDF</h3><p>Busca por DNI o nombres y descarga el reporte del estudiante.</p></Link></div>
 {periods.error&&<p className="notice">No se pudieron cargar los periodos para la descarga directa. Puedes volver a consultar los reportes desde su módulo.</p>}
 </div>
}
