import type {NextRequest} from 'next/server'
import {getTeacherReport} from '@/lib/school/report-data'
import {managementAnalytics} from '@/lib/school/report-analytics'
import {buildManagementSections} from '@/lib/school/management-reports'
import {renderDocumentPdf} from '@/lib/school/report-pdf'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams,result=await getTeacherReport(p.get('school')??'',p.get('period')??'',p.get('classroom')??'')
 if(!result.report)return Response.json({error:result.error},{status:result.status,headers})
 const r=result.report,view=new URL(request.url);view.pathname='/dashboard/reportes/docente'
 try{const bytes=await renderDocumentPdf({schoolName:r.school.name,documentTitle:'Reporte docente · '+r.period.name,title:'REPORTE DE MI GRADO Y SECCIÓN',context:r.classrooms[0]?.classroom??'Aula asignada',subject:r.period.name,issuedAt:r.issued_at,landscape:true,analytics:managementAnalytics(r),viewUrl:view.toString(),lines:['Periodo: '+r.period.name+' · '+r.period.starts_on+' al '+r.period.ends_on,'Solo aula asignada y estudiantes autorizados. Evaluaciones y asistencia publicadas.']},buildManagementSections(r));return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="reporte-docente-aula.pdf"'}})}catch{return Response.json({error:'No se pudo generar el PDF. Vuelve a consultar el reporte e inténtalo de nuevo.'},{status:503,headers})}
}
