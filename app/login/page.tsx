import { authenticate } from './actions'
import { configured } from '@/lib/supabase/server'
export default async function Login({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams
  const ready = configured()
  return <><h1>Accede a Aula al Día</h1>{!ready && <p className="notice">Falta configurar la URL y la clave publicable de Supabase en .env.local.</p>}{message && <p role="status" className="notice">{message}</p>}<form action={authenticate}><label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label><button name="intent" value="login" disabled={!ready}>Iniciar sesión</button><button className="secondary" name="intent" value="signup" disabled={!ready}>Crear cuenta</button></form></>
}
