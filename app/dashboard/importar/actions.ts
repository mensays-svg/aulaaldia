'use server'
import { revalidatePath } from 'next/cache'
import { schoolContext } from '@/lib/school/context'
import { validUuid } from '@/lib/school/validation'
import { MAX_IMPORT_BYTES, parseStudentsCsv, type ImportStudent, type ImportIssue } from '@/lib/school/student-import'

export type ImportResult = {
  status: 'error' | 'preview' | 'success'
  message: string
  issues: ImportIssue[]
  students: ImportStudent[]
  count?: number
}

export async function importStudents(form: FormData): Promise<ImportResult> {
  const failure = (message: string, issues: ImportIssue[] = []): ImportResult => ({ status: 'error', message, issues, students: [] })
  const school = String(form.get('school') ?? '')
  const classroom = String(form.get('classroom') ?? '')
  const stage = String(form.get('stage') ?? '')
  const { supabase, roles, school: currentSchool } = await schoolContext(school)
  if (school !== currentSchool || !validUuid(school) || !roles.some(r => ['administrador','director','auxiliar'].includes(r))) return failure('No tienes permiso para importar en esta institución.')
  if (!validUuid(classroom) || !['preview','confirm'].includes(stage)) return failure('Selecciona el aula y vuelve a revisar el archivo.')
  const file = form.get('file')
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv') || !file.size || file.size > MAX_IMPORT_BYTES) return failure('Selecciona un CSV UTF-8 de hasta 256 KB.')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
  catch { return failure('No se pudo leer el archivo. Desde Excel, guárdalo como CSV UTF-8.') }
  const parsed = parseStudentsCsv(text)
  if (parsed.issues.length) return failure('Corrige los errores del archivo y vuelve a revisarlo. No se guardó ningún estudiante.', parsed.issues)
  const room = await supabase.from('classrooms').select('id').eq('id', classroom).eq('institution_id', school).maybeSingle()
  if (room.error || !room.data) return failure('El aula no está disponible en esta institución.')
  const duplicates: ImportIssue[] = []
  for (let offset = 0; offset < parsed.students.length; offset += 100) {
    const group = parsed.students.slice(offset, offset + 100)
    const existing = await supabase.from('students').select('dni').eq('institution_id', school).in('dni', group.map(s => s.dni))
    if (existing.error) return failure('No se pudo comprobar si existen estudiantes repetidos. Intenta revisar el archivo de nuevo.')
    const used = new Set((existing.data ?? []).map(s => s.dni))
    group.forEach(s => { if (used.has(s.dni)) duplicates.push({ row: s.row, message: 'Este DNI ya está registrado en la institución. Retira esta fila del CSV; no se reemplazan ni trasladan estudiantes.' }) })
  }
  if (duplicates.length) return failure('Hay estudiantes ya registrados. No se guardó ningún estudiante del archivo.', duplicates)
  if (stage === 'preview') return { status: 'preview', message: 'Archivo revisado. Comprueba los estudiantes y el aula antes de confirmar.', issues: [], students: parsed.students }
  const result = await supabase.from('students').insert(parsed.students.map(({ dni, first_names, last_names }) => ({ institution_id: school, classroom_id: classroom, dni, first_names, last_names })))
  if (result.error) return failure(result.error.code === '23505'
    ? 'Algún DNI acaba de registrarse en otro intento. No se importó este lote. Vuelve a revisar el archivo.'
    : 'No se pudo confirmar la importación. Revisa el listado antes de reintentar; si hubo un corte de conexión, el lote podría haberse guardado.')
  revalidatePath('/dashboard')
  return { status: 'success', message: `Se registraron ${parsed.students.length} estudiantes.`, count: parsed.students.length, issues: [], students: [] }
}
