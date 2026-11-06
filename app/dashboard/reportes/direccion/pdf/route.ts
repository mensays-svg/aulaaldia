import type {NextRequest} from 'next/server'
import {getManagementReport} from '@/lib/school/report-data'
import {buildManagementSections,managementFilterLabel} from '@/lib/school/management-reports'
import {renderDocumentPdf} from '@/lib/school/report-pdf'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams
 const result=await getManagementReport(p.get('school')??'',p.get('period')??'',{year:Number(p.get('year')??''),level:p.get('level')||null,grade:p.get('grade')||null,section:p.get('section')||null,state:p.get('state')??'all'})
 if(!result.report)return Response.json({error:result.error},{status:result.status,headers})
 const report=result.report
 try{
  const bytes=await renderDocumentPdf({schoolName:report.school.name,documentTitle:'Reporte institucional · '+report.period.name,title:'REPORTE GENERAL PARA DIRECCIÓN',context:managementFilterLabel(report.filters),subject:report.period.name,issuedAt:report.issued_at,landscape:true,lines:['Periodo: '+report.period.name+' · '+report.period.starts_on.split('-').reverse().join('/')+' al '+report.period.ends_on.split('-').reverse().join('/'),managementFilterLabel(report.filters),'Uso institucional. La agrupación corresponde a las aulas actuales.']},buildManagementSections(report))
  return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="reporte-direccion-${report.filters.year}.pdf"`}})
 }catch{return Response.json({error:'No se pudo crear el PDF. Abre el reporte web y utiliza Imprimir / Guardar como PDF.'},{status:503,headers})}
}
