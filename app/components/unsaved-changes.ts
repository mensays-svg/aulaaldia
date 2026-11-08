'use client'
import {useEffect} from 'react'
const drafts=new Set<symbol>()
const question='Tienes cambios sin guardar. ¿Quieres salir y descartarlos?'
export function confirmLeavingDraft():boolean{return drafts.size===0||window.confirm(question)}
function beforeUnload(event:BeforeUnloadEvent){event.preventDefault();event.returnValue=''}
function click(event:MouseEvent){
 if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return
 const anchor=event.target instanceof Element?event.target.closest('a'):null
 if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return
 const target=new URL(anchor.href,window.location.href),current=new URL(window.location.href)
 if(['/dashboard/reportes/pdf','/dashboard/reportes/docente/pdf','/dashboard/reportes/direccion/pdf','/dashboard/porteria/salones/pdf'].includes(target.pathname))return
 if(!['http:','https:'].includes(target.protocol)||(target.origin===current.origin&&target.pathname===current.pathname&&target.search===current.search))return
 if(!confirmLeavingDraft()){event.preventDefault();event.stopImmediatePropagation()}
}
function submit(event:SubmitEvent){
 const form=event.target
 if(form instanceof HTMLFormElement&&new URL(form.action,location.href).pathname==='/auth/signout'&&!confirmLeavingDraft()){event.preventDefault();event.stopImmediatePropagation()}
}
export function useUnsavedChanges(dirty:boolean){
 useEffect(()=>{
  if(!dirty)return
  const id=Symbol('draft')
  if(!drafts.size){window.addEventListener('beforeunload',beforeUnload);document.addEventListener('click',click,true);document.addEventListener('submit',submit,true)}
  drafts.add(id)
  return()=>{drafts.delete(id);if(!drafts.size){window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('click',click,true);document.removeEventListener('submit',submit,true)}}
 },[dirty])
}
