'use server'
import { redirect } from 'next/navigation'
import { createClient, configured } from '@/lib/supabase/server'
import { authErrorMessage } from '@/lib/supabase/auth-error'

export async function authenticate(form: FormData) {
  if (!configured()) redirect('/login?message=Configura%20Supabase%20para%20continuar.')
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')
  const signup = form.get('intent') === 'signup'
  if (!email || password.length < 8) redirect('/login?message=Introduce%20un%20correo%20y%20una%20contrase%C3%B1a%20de%20al%20menos%208%20caracteres.')
  const supabase = await createClient()
  const { data, error } = signup
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    console.error('Authentication failed', {
      operation: signup ? 'signup' : 'login',
      code: error.code ?? 'unknown',
      status: error.status,
    })
    redirect('/login?message=' + encodeURIComponent(authErrorMessage(error, signup)))
  }
  if (!data.session) redirect('/login?message=Revisa%20tu%20correo%20para%20confirmar%20tu%20cuenta.')
  redirect('/dashboard')
}
