import FamilyDashboard from '../family-dashboard'
export const dynamic='force-dynamic'
export default async function Attendance({searchParams}:{searchParams:Promise<{school?:string;date?:string}>}){
 const p=await searchParams
 return <FamilyDashboard school={p.school} date={p.date} history/>
}
