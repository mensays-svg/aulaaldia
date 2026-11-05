'use server'
import { revalidatePath } from 'next/cache'
import { schoolContext } from '@/lib/school/context'
import { validUuid } from '@/lib/school/validation'
import { MAX_IMPORT_BYTES, parseStudentsCsv, classroomKey, classroomLabel, type ImportStudent, type ImportIssue } from '@/lib/school/student-import'

export type ImportResult = {
  status: 'error' | 'preview' | 'success'
  message: string
  issues: ImportIssue[]
  students: ImportStudent[]
  count?: number
  classrooms?: { label: string; create: boolean }[]
}

export async function importStudents(form: FormData): Promise<ImportResult> {
  const failure = (message: string, issues: ImportIssue[] = []): ImportResult => ({ status: 'error', message, issues, students: [] })
  const school = String(form.get('school') ?? '')
  const stage = String(form.get('stage') ?? '')
  const { supabase, roles, school: currentSchool } = await schoolContext(school)
  if (school !== currentSchool || !validUuid(school) || !roles.some(r => ['administrador','director','auxiliar'].includes(r))) return failure('No tienes permiso para importar en esta institución.')
  if (!['preview','confirm'].includes(stage)) return failure('Vuelve a revisar el archivo.')
  const file = form.get('file')
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv') || !file.size || file.size > MAX_IMPORT_BYTES) return failure('Selecciona un CSV UTF-8 de hasta 256 KB.')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
  catch { return failure('No se pudo leer el archivo. Desde Excel, guárdalo como CSV UTF-8.') }
  const parsed = parseStudentsCsv(text)
  if (parsed.issues.length) return failure('Corrige los errores del archivo y vuelve a revisarlo. No se guardó ningún estudiante.', parsed.issues)
  const duplicates: ImportIssue[] = []
  for (let offset = 0; offset < parsed.students.length; offset += 100) {
    const group = parsed.students.slice(offset, offset + 100)
    const existing = await supabase.from('students').select('dni').eq('institution_id', school).in('dni', group.map(s => s.dni))
    if (existing.error) return failure('No se pudo comprobar si existen estudiantes repetidos. Intenta revisar el archivo de nuevo.')
    const used = new Set((existing.data ?? []).map(s => s.dni))
    group.forEach(s => { if (used.has(s.dni)) duplicates.push({ row: s.row, message: 'Este DNI ya está registrado en la institución. Retira esta fila del CSV; no se reemplazan ni trasladan estudiantes.' }) })
  }
  if (duplicates.length) return failure('Hay estudiantes ya registrados. No se guardó ningún estudiante del archivo.', duplicates)
  if (stage === 'preview') {
    const keys = new Map<string, { label: string; create: boolean }>()
    parsed.students.forEach(s => keys.set(classroomKey(s), { label: classroomLabel(s), create: true }))
    const found = new Map<string, number>()
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from('classrooms').select('id,academic_year,level,grade,section').eq('institution_id', school).order('id').range(offset, offset + 499)
      if (result.error) return failure('No se pudieron comprobar las aulas. Vuelve a revisar el archivo.')
      for (const room of result.data ?? []) {
        const key = classroomKey(room)
        if (keys.has(key)) { keys.get(key)!.create = false; found.set(key, (found.get(key) ?? 0) + 1) }
      }
      if ((result.data?.length ?? 0) < 500) break
    }
    if ([...found.values()].some(count => count > 1)) return failure('Hay aulas existentes con el mismo año, nivel, grado y sección escritos de formas equivalentes. El administrador debe revisar esas aulas antes de importar.')
    return { status: 'preview', message: 'Archivo revisado. Comprueba las aulas y los estudiantes antes de confirmar.', issues: [], students: parsed.students, classrooms: [...keys.values()] }
  }
  const roster = parsed.students.map(({ row: _row, ...student }) => student)
  const result = await supabase.rpc('import_school_students', { school, roster })
  if (result.error) {
    if (result.error.code === 'PGRST202' || result.error.code === '42883') return failure('Falta activar la importación con aulas automáticas en Supabase. El administrador debe ejecutar la nueva migración SQL.')
    if (result.error.code === '23505') return failure('Algún DNI ya está registrado. No se importó este lote ni se crearon aulas. Vuelve a revisar el archivo.')
    if (result.error.code === 'P0001') return failure('Hay aulas equivalentes duplicadas. El administrador debe revisarlas antes de importar. No se guardó el lote.')
    return failure('No se pudo confirmar la importación. Revisa el listado antes de reintentar; si hubo un corte de conexión, el lote podría haberse guardado.')
  }
  revalidatePath('/dashboard')
  return { status: 'success', message: `Se registraron ${result.data.students} estudiantes y se crearon ${result.data.classrooms_created} aulas. Las demás aulas se reutilizaron.`, count: parsed.students.length, issues: [], students: [] }
}
