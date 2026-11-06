'use server'
import { redirect } from 'next/navigation'
import { configured, createClient } from '@/lib/supabase/server'
import { passwordValidation, passwordError } from '@/lib/supabase/password'
export async function changePassword(form: FormData) {
  if (!configured()) redirect('/login')
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')
  const password = String(form.get('password') ?? ''), confirmation = String(form.get('confirmation') ?? '')
  const invalid = passwordValidation(password, confirmation)
  if (invalid) redirect('/dashboard/seguridad?message=' + encodeURIComponent(invalid))
  const { error } = await supabase.auth.updateUser({ password })
  if (error) redirect('/dashboard/seguridad?message=' + encodeURIComponent(passwordError(error)))
  // Revoke refresh sessions after the change. Existing access tokens expire per Supabase settings.
  const { error: signoutError } = await supabase.auth.signOut({ scope: 'global' })
  if (signoutError) redirect('/dashboard/seguridad?message=' + encodeURIComponent('Contraseña actualizada. No se pudo cerrar todas las sesiones; vuelve a cerrar sesión desde el panel.'))
  redirect('/login?message=' + encodeURIComponent('Contraseña actualizada. Inicia sesión con tu nueva contraseña.'))
}
