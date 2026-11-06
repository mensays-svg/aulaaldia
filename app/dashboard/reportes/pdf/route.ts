import {type NextRequest} from 'next/server'
import {getStudentReport} from '@/lib/school/report-data'
import {buildReportSections} from '@/lib/school/reports'
import {renderReportPdf} from '@/lib/school/report-pdf'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}
export async function GET(request:NextRequest){
 const params=request.nextUrl.searchParams
 const result=await getStudentReport(params.get('school')??'',params.get('student')??'',params.get('period')??'')
 if(!result.report)return Response.json({error:result.error},{status:result.status,headers})
 try{
  const viewUrl=new URL(request.url);viewUrl.pathname='/dashboard/reportes'
  const bytes=await renderReportPdf(result.report,buildReportSections(result.report),viewUrl.toString())
  return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="reporte-estudiante-${result.report.period.academic_year}.pdf"`}})
 }catch{return Response.json({error:'No se pudo crear el PDF. Puedes abrir el reporte web y usar Imprimir / Guardar como PDF.'},{status:503,headers})}
}
