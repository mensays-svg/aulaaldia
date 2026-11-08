'use client'
import Link from 'next/link'
import { usePathname,useSearchParams,useRouter } from 'next/navigation'
import { useState,useTransition } from 'react'
import { roleNavigation,schoolHref,familyOnly,familyHref } from '@/lib/school/navigation'
import {confirmLeavingDraft} from '@/app/components/unsaved-changes'
import Icon from '@/app/components/ui-icon'
type Membership={institution_id:string;role:string}
const labels:Record<string,string>={administrador:'Administración',director:'Dirección',auxiliar:'Auxiliar',docente:'Docente',apoderado:'Familia'}
export default function AppShell({children,memberships,institutions,email}:{children:React.ReactNode;memberships:Membership[];institutions:{id:string;name:string}[];email:string}){
 const router=useRouter(),[switching,startSwitch]=useTransition()
 const pathname=usePathname(),params=useSearchParams(),[open,setOpen]=useState(false)
 const requested=params.get('school'),school=memberships.some(m=>m.institution_id===requested)?requested??undefined:memberships[0]?.institution_id
 const roles=memberships.filter(m=>m.institution_id===school).map(m=>m.role),navigation=roleNavigation(roles)
 const active=navigation.filter(n=>!n.path.includes('#')&&(n.path==='/dashboard'?pathname==='/dashboard':pathname.startsWith(n.path))).sort((a,b)=>b.path.length-a.path.length)[0]
 const href=(path:string)=>familyOnly(roles)?familyHref(path,school,params):schoolHref(path,school)
 const schoolIds=[...new Set(memberships.map(m=>m.institution_id))]
 function changeSchool(next:string){if(next===school||!schoolIds.includes(next)||!confirmLeavingDraft())return;setOpen(false);startSwitch(()=>router.push(schoolHref('/dashboard',next)))}
 const title=pathname==='/dashboard/seguridad'?'Mi cuenta':active?.title??'Mi panel'
 return <div className="app-shell"><a className="skip-link" href="#panel-content">Saltar al contenido</a>
 <aside className={'app-sidebar'+(open?' is-open':'')} aria-label="Navegación principal"><Link className="app-brand" href={href('/dashboard')} onClick={()=>setOpen(false)}><span className="brand-symbol"><Icon name="book"/></span><span>Aula al Día<small>COMUNIDAD EDUCATIVA</small></span></Link>
 <div className="sidebar-school"><span className="eyebrow">MI INSTITUCIÓN</span>{schoolIds.length>1?<label className="school-switcher"><span className="sr-only">Cambiar institución</span><select aria-label="Cambiar institución" value={school??''} disabled={switching} onChange={e=>changeSchool(e.target.value)}>{schoolIds.map(id=><option key={id} value={id}>{institutions.find(i=>i.id===id)?.name??'Institución vinculada'}</option>)}</select></label>:<strong>{institutions.find(i=>i.id===school)?.name??'Aula al Día'}</strong>}<span>{roles.map(r=>labels[r]??r).join(' · ')||'Cuenta pendiente de vinculación'}</span></div>
 <p className="nav-caption">ESPACIO DE TRABAJO</p><nav id="workspace-navigation">{navigation.map(n=><Link key={n.id} href={href(n.path)} className={active?.id===n.id?'nav-item active':'nav-item'} aria-current={active?.id===n.id?'page':undefined} onClick={()=>setOpen(false)}><Icon name={n.icon}/><span>{n.id==='students'&&roles.includes('apoderado')&&!roles.some(r=>['administrador','director','auxiliar','docente'].includes(r))?'Mis estudiantes':n.title}</span></Link>)}</nav>
 <div className="sidebar-bottom"><Link className={'nav-item'+(pathname==='/dashboard/seguridad'?' active':'')} href={schoolHref('/dashboard/seguridad',school)} onClick={()=>setOpen(false)}><Icon name="lock"/>Mi cuenta</Link><form action="/auth/signout" method="post"><button className="nav-item logout-button"><Icon name="logout"/>Cerrar sesión</button></form><small>Acompañamos cada día de aprendizaje.</small></div></aside>
 <div className="app-main"><header className="app-topbar"><button className="menu-toggle secondary" aria-label={open?'Cerrar menú':'Abrir menú'} aria-expanded={open} aria-controls="workspace-navigation" onClick={()=>setOpen(!open)}><Icon name={open?'close':'menu'}/></button><div><span className="topbar-label">AULA AL DÍA</span><strong>{title}</strong></div><div className="account-chip"><span className="account-avatar" aria-hidden="true">{email.slice(0,1).toUpperCase()||'A'}</span><span>{email}<small>{roles.map(r=>labels[r]??r).join(' · ')||'Mi cuenta'}</small></span></div></header><div className="app-content" id="panel-content" tabIndex={-1} aria-busy={switching}>{children}</div><footer className="app-footer">Aula al Día <span>Asistencia, seguimiento y comunidad.</span></footer></div>
 </div>
}
