'use server'
import { redirect } from 'next/navigation'
import { configured, createClient } from '@/lib/supabase/server'
import { passwordError, validRecoveryToken } from '@/lib/supabase/password'
export async function requestRecovery(form: FormData) {
  if (!configured()) redirect('/login')
  const email = String(form.get('email') ?? '').trim()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect('/recuperar?message=' + encodeURIComponent('Introduce un correo electrónico válido.'))
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  // Do not disclose whether an address has an account or its confirmation state.
  if (error && (error.status === 429 || (error.status ?? 0) >= 500 || error.status === 0)) redirect('/recuperar?message=' + encodeURIComponent(passwordError(error)))
  redirect('/recuperar?message=' + encodeURIComponent('Si existe una cuenta para ese correo, recibirás un enlace para recuperar el acceso. Revisa también Spam.'))
}
export async function confirmRecovery(form: FormData) {
  const token_hash = String(form.get('token_hash') ?? '')
  if (!configured() || !validRecoveryToken(token_hash)) redirect('/recuperar?message=' + encodeURIComponent('El enlace no es válido. Solicita uno nuevo.'))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: 'recovery' })
  if (error || !data.session) redirect('/recuperar?message=' + encodeURIComponent('El enlace ha caducado o ya fue utilizado. Solicita uno nuevo.'))
  redirect('/dashboard/seguridad')
}
