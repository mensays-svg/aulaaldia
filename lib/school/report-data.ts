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
