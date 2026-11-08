import {schoolHref} from '@/lib/school/navigation'
import {validUuid} from '@/lib/school/validation'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { configured, createClient } from '@/lib/supabase/server'
import { changePassword } from './actions'
export const dynamic = 'force-dynamic'
export default async function Security({ searchParams }: { searchParams: Promise<{ message?: string;school?:string }> }) {
  if (!configured()) redirect('/login')
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const { message,school } = await searchParams
  return <div className="workspace account-workspace"><Link href={schoolHref('/dashboard',school&&validUuid(school)?school:undefined)}>← Volver al panel</Link><h1>Cambiar contraseña</h1><p>Cuenta: {user.email}</p><p>Usa de 8 a 128 caracteres. Al guardar, tendrás que iniciar sesión de nuevo.</p>{message && <p className="notice" role="status">{message}</p>}<form action={changePassword}><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label><label>Repite la nueva contraseña<input name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label><button>Guardar nueva contraseña</button></form></div>
}
