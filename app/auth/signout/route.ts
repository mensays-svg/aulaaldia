import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return new NextResponse('Forbidden', { status: 403 })
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) return new NextResponse('No se pudo cerrar sesión.', { status: 503 })
  return NextResponse.redirect(new URL('/login', request.url), 303)
}
