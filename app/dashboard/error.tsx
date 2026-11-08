'use client'
import Link from 'next/link'
import {useSearchParams} from 'next/navigation'
import {schoolHref} from '@/lib/school/navigation'
import {validUuid} from '@/lib/school/validation'
export default function WorkspaceError({retry}:{error:unknown;retry:()=>void}){
 const params=useSearchParams(),school=params.get('school')
 return <div className="workspace" role="alert"><p className="eyebrow">AULA AL DÍA</p><h1>No se pudo cargar esta pantalla</h1><p>Intenta cargarla de nuevo. Si estabas guardando información, revisa lo registrado antes de repetir la operación.</p><div className="row-actions"><button onClick={retry}>Intentar de nuevo</button><Link href={schoolHref('/dashboard',school&&validUuid(school)?school:undefined)}>Volver a mi inicio</Link></div></div>
}
