import Link from 'next/link'
import Icon from './components/ui-icon'
import type { Metadata } from 'next'
import './style.css'
export const metadata: Metadata = { title: 'Aula al Día', description: 'Asistencia, comportamiento y reportes escolares' }
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body><main><Link href="/" className="public-brand"><span className="brand-symbol"><Icon name="book"/></span>Aula al Día</Link>{children}</main></body></html>
}
