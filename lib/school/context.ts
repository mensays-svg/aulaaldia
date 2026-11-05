import { redirect } from 'next/navigation'
import { configured, createClient } from '@/lib/supabase/server'

export const roleLabels: Record<string, string> = {
  administrador: 'Administrador', director: 'Director', auxiliar: 'Auxiliar', docente: 'Docente', apoderado: 'Apoderado',
}
export type Membership = { institution_id: string; role: string }
export async function schoolContext(schoolId?: string) {
  if (!configured()) redirect('/login')
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const result = await supabase.from('memberships').select('institution_id,role').eq('user_id', user.id)
  const memberships = (result.data ?? []) as Membership[]
  const school = schoolId && memberships.some(m => m.institution_id === schoolId) ? schoolId : memberships[0]?.institution_id
  const roles = memberships.filter(m => m.institution_id === school).map(m => m.role)
  return { supabase, user, memberships, school, roles, setupError: result.error }
}
