import Link from 'next/link'
import { schoolContext } from '@/lib/school/context'
import ImportForm from './import-form'
export const dynamic = 'force-dynamic'
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const params = await searchParams
  const { school, roles, setupError } = await schoolContext(params.school)
  const back = <Link href={school ? '/dashboard?school=' + school : '/dashboard'}>← Volver al panel</Link>
  if (setupError || !school) return <>{back}<h1>Carga de estudiantes</h1><p className="notice">Primero debes estar vinculado a una institución configurada.</p></>
  if (!roles.some(r => ['administrador','director'].includes(r))) return <>{back}<h1>Acceso restringido</h1><p>Solo administración y dirección pueden registrar estudiantes.</p></>
  return <div className="workspace">{back}<h1>Cargar estudiantes y aulas en bloque</h1><ImportForm school={school} /></div>
}
