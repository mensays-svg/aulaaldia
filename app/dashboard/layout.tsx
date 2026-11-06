import { Suspense } from 'react'
import { schoolContext } from '@/lib/school/context'
import AppShell from './app-shell'
export default async function DashboardLayout({children}:{children:React.ReactNode}){
 const {supabase,user,memberships}=await schoolContext()
 const {data}=await supabase.from('institutions').select('id,name')
 return <Suspense fallback={<p className="notice">Cargando tu espacio…</p>}><AppShell memberships={memberships} institutions={data??[]} email={user.email??''}>{children}</AppShell></Suspense>
}
