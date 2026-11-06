import Link from 'next/link'
import { configured } from '@/lib/supabase/server'
import { requestRecovery } from './actions'
export default async function Recover({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams
  return <><Link href="/login">← Volver al inicio de sesión</Link><h1>Recuperar contraseña</h1><p>Escribe el correo con el que creaste tu cuenta. Te enviaremos un enlace para elegir una nueva contraseña.</p>{message && <p className="notice" role="status">{message}</p>}<form action={requestRecovery}><label>Correo electrónico<input name="email" type="email" autoComplete="email" maxLength={254} required /></label><button disabled={!configured()}>Enviar enlace de recuperación</button></form></>
}
