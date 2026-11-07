'use client'
import {useEffect,useTransition} from 'react'
import {useRouter} from 'next/navigation'
export default function FamilyRefresh(){
 const router=useRouter(),[pending,start]=useTransition()
 const refresh=()=>start(()=>router.refresh())
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')router.refresh()},60000);return()=>clearInterval(timer)},[router])
 return <button className="secondary" onClick={refresh} disabled={pending}>{pending?'Actualizando…':'Actualizar asistencia'}</button>
}
