import type { Metadata } from 'next'
import './style.css'
export const metadata: Metadata = { title: 'Aula al Día', description: 'Asistencia, comportamiento y reportes escolares' }
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body><main>{children}</main></body></html>
}
