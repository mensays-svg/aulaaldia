'use client'
import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
export default function Scanner({ onScan, onClose }: { onScan:(text:string)=>void; onClose:()=>void }) {
  const video=useRef<HTMLVideoElement>(null)
  const callback=useRef(onScan)
  const [error,setError]=useState('')
  useEffect(()=>{callback.current=onScan},[onScan])
  useEffect(()=>{
    let cancelled=false,controls:IScannerControls|undefined
    async function start(){
      try {
        const {BrowserQRCodeReader}=await import('@zxing/browser')
        if(cancelled || !video.current) return
        const reader=new BrowserQRCodeReader()
        controls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'}}},video.current,(result,_error,scanner)=>{
          if(result && !cancelled){cancelled=true;scanner.stop();callback.current(result.getText())}
        })
        if(cancelled) controls.stop()
      } catch { if(!cancelled) setError('No se pudo abrir la cámara. Revisa los permisos del navegador o usa DNI, apellidos o un lector QR externo.') }
    }
    void start()
    return ()=>{cancelled=true;controls?.stop()}
  },[])
  return <div className="scanner"><h3>Escanear carnet QR</h3><video ref={video} playsInline muted aria-label="Vista de la cámara para leer el carnet" />{error && <p role="alert">{error}</p>}<button type="button" className="secondary" onClick={onClose}>Cerrar cámara</button></div>
}
