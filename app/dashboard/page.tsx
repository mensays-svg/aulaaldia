import { redirect } from 'next/navigation'
import { createClient, configured } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'
export default async function Dashboard() {
  if (!configured()) redirect('/login')
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  return <><h1>Mi panel</h1><p>Sesión iniciada como {user.email}.</p><p>Esta página solo está disponible para usuarios autenticados.</p><form action="/auth/signout" method="post"><button>Cerrar sesión</button></form></>
}
