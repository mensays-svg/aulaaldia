import Link from 'next/link'
import { redirect } from 'next/navigation'
import { validRecoveryToken } from '@/lib/supabase/password'
import { confirmRecovery } from '../actions'
export const dynamic = 'force-dynamic'
export const metadata = { referrer: 'no-referrer' as const, robots: { index: false, follow: false } }
export default async function ConfirmRecovery({ searchParams }: { searchParams: Promise<{ token_hash?: string }> }) {
  const { token_hash } = await searchParams
  if (!token_hash || !validRecoveryToken(token_hash)) redirect('/recuperar?message=' + encodeURIComponent('El enlace no es válido. Solicita uno nuevo.'))
  return <><h1>Confirma la recuperación</h1><p>Continúa para verificar tu enlace y elegir una nueva contraseña. El enlace solo puede utilizarse una vez.</p><form action={confirmRecovery}><input type="hidden" name="token_hash" value={token_hash}/><button>Continuar y cambiar contraseña</button></form><Link href="/recuperar">Solicitar otro enlace</Link></>
}
