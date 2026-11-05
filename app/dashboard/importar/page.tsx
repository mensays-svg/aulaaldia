import Link from 'next/link'
import { schoolContext } from '@/lib/school/context'
import ImportForm from './import-form'
export const dynamic = 'force-dynamic'
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const params = await searchParams
  const { supabase, school, roles, setupError } = await schoolContext(params.school)
  const back = <Link href={school ? '/dashboard?school=' + school : '/dashboard'}>← Volver al panel</Link>
  if (setupError || !school) return <>{back}<h1>Carga de estudiantes</h1><p className="notice">Primero debes estar vinculado a una institución configurada.</p></>
  if (!roles.some(r => ['administrador','director','auxiliar'].includes(r))) return <>{back}<h1>Acceso restringido</h1><p>Solo administración, dirección y auxiliares pueden registrar estudiantes.</p></>
  const result = await supabase.from('classrooms').select('id,academic_year,level,grade,section').eq('institution_id', school).order('academic_year', { ascending: false }).order('grade').order('section')
  return <div className="workspace">{back}<h1>Cargar estudiantes en bloque</h1>{result.error ? <p className="notice">No se pudieron cargar las aulas. Recarga la página antes de continuar.</p> : <ImportForm school={school} rooms={(result.data ?? []).map(r => ({ id: r.id, label: `${r.academic_year} · ${r.level} ${r.grade} ${r.section}` }))} />}</div>
}
