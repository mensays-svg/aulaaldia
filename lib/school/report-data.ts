import {createClient,configured} from '@/lib/supabase/server'
import {validUuid} from '@/lib/school/validation'
import type {StudentReport} from './reports'
export async function getStudentReport(school:string,student:string,period:string):Promise<{report?:StudentReport;error?:string;status:number}>{
 if(![school,student,period].every(validUuid))return{error:'Selecciona una institución, un estudiante y un periodo válidos.',status:400}
 if(!configured())return{error:'La aplicación no está conectada a Supabase.',status:503}
 const supabase=await createClient()
 const {data:{user},error:authError}=await supabase.auth.getUser()
 if(authError||!user)return{error:'Inicia sesión para consultar el reporte.',status:401}
 const result=await supabase.rpc('student_period_report',{school,student,period})
 if(result.error){
  if(result.error.code==='42501')return{error:'No tienes acceso a este reporte.',status:403}
  if(['PGRST202','42883','42P01'].includes(result.error.code))return{error:'Falta activar Reportes: ejecuta la migración 202611050006_student_reports.sql en Supabase.',status:503}
  if(['P0001','22023'].includes(result.error.code))return{error:'El estudiante o periodo no está disponible para esta institución y tu cuenta.',status:404}
  return{error:'No se pudo generar el reporte. Vuelve a intentarlo.',status:503}
 }
 return{report:result.data,status:200}
}

export async function getManagementReport(school:string,period:string,filters:import('./management-reports').ManagementFilters):Promise<{report?:import('./management-reports').ManagementReport;error?:string;status:number}>{
 if(![school,period].every(validUuid)||!Number.isInteger(filters.year)||filters.year<2000||filters.year>2100||
  (filters.level!==null&&!['Inicial','Primaria','Secundaria'].includes(filters.level))||(filters.grade?.length??0)>40||(filters.section?.length??0)>40||!['all','active','inactive'].includes(filters.state))return{error:'Revisa el año, periodo y filtros del reporte.',status:400}
 if(!configured())return{error:'La aplicación no está conectada a Supabase.',status:503}
 const supabase=await createClient()
 const {data:{user},error:authError}=await supabase.auth.getUser()
 if(authError||!user)return{error:'Inicia sesión para consultar el reporte.',status:401}
 const result=await supabase.rpc('management_period_report',{school,period,filter_year:filters.year,filter_level:filters.level,filter_grade:filters.grade,filter_section:filters.section,filter_state:filters.state})
 if(result.error){
  if(result.error.code==='42501')return{error:'Solo dirección y administración pueden consultar este reporte institucional.',status:403}
  if(['PGRST202','42883','42P01'].includes(result.error.code))return{error:'Falta activar Reportes para dirección: ejecuta la migración 202611050007_management_reports.sql en Supabase.',status:503}
  if(result.error.code==='22023')return{error:'El periodo debe pertenecer a la institución y coincidir con el año seleccionado. Revisa también los filtros.',status:400}
  return{error:'No se pudo generar el reporte institucional. Intenta de nuevo.',status:503}
 }
 return{report:result.data,status:200}
}
