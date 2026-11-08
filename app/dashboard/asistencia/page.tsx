import FamilyPeriodReport from '../family-period-report'
import FamilyDashboard from '../family-dashboard'
export const dynamic='force-dynamic'
export default async function Attendance({searchParams}:{searchParams:Promise<{school?:string;date?:string;student?:string;period?:string}>}){
 const p=await searchParams
 return <><FamilyPeriodReport school={p.school} student={p.student} period={p.period} view='attendance'/><details><summary>Consultar marcaciones de un día</summary><FamilyDashboard school={p.school} date={p.date} period={p.period} history/></details></>
}
