import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

export async function createClient() {
  if (!configured()) throw new Error('Configura las variables públicas de Supabase en .env.local.')
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)) }
        catch { /* Server Components cannot write cookies; proxy refreshes them. */ }
      },
    },
  })
}
