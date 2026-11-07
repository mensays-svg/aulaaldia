import type {NextRequest} from 'next/server'
import {getGateClassReport} from '@/lib/school/report-data'
import {gateClassAnalytics,gateClassSections} from '@/lib/school/gate-reports'
import {renderDocumentPdf} from '@/lib/school/report-pdf'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'}
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams,result=await getGateClassReport(p.get('school')??'',p.get('classroom')??'',p.get('date')??'')
 if(!result.report)return Response.json({error:result.error},{status:result.status,headers})
 const r=result.report,view=new URL(request.url);view.pathname='/dashboard/porteria/salones'
 try{const bytes=await renderDocumentPdf({schoolName:r.school.name,documentTitle:'Portería · '+r.classroom.label,title:'REPORTE DE PORTERÍA POR SALÓN',context:r.classroom.label,subject:r.date,issuedAt:r.issued_at,landscape:true,analytics:gateClassAnalytics(r),viewUrl:view.toString(),lines:['Fecha: '+r.date.split('-').reverse().join('/'),'Sin ingreso registrado no equivale a falta. Asistencia al colegio; no sustituye la asistencia de clase.']},gateClassSections(r));return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="reporte-porteria-salon.pdf"'}})}catch{return Response.json({error:'No se pudo generar el PDF. Revisa el reporte en pantalla e inténtalo de nuevo.'},{status:503,headers})}
}
