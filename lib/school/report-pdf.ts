import {PDFDocument,rgb,type PDFFont,type PDFPage,type PDFRef,PDFString} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {StudentReport,ReportSection} from './reports'
import {individualAnalytics,chartValue,type ReportAnalytics} from './report-analytics.ts'

const regularBytes=()=>readFile(join(process.cwd(),'assets/fonts/DejaVuSans.ttf'))
const boldBytes=()=>readFile(join(process.cwd(),'assets/fonts/DejaVuSans-Bold.ttf'))
export type ReportPdfHeader={schoolName:string;documentTitle:string;title:string;context:string;subject:string;lines:string[];issuedAt:string;landscape?:boolean;analytics?:ReportAnalytics;viewUrl?:string;profile?:{name:string;dni:string|null;classroom:string;periodClassroom?:string|null;unknownDates?:boolean|null;periodLabel:string;range:string;summaryRows:[string,string][]}}
export async function renderDocumentPdf(info:ReportPdfHeader,sections:ReportSection[]):Promise<Uint8Array>{
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit)
 const [regular,bold]=await Promise.all([regularBytes().then(bytes=>pdf.embedFont(bytes,{subset:true})),boldBytes().then(bytes=>pdf.embedFont(bytes,{subset:true}))])
 pdf.setTitle(info.documentTitle)
 pdf.setAuthor(info.schoolName);pdf.setSubject(info.subject);pdf.setCreator('Aula al Día')
 const width=info.landscape?841.89:595.28,height=info.landscape?595.28:841.89,margin=42,bottom=46,lineHeight=13,fontSize=9
 const ink=rgb(.09,.17,.22),muted=rgb(.36,.44,.48),border=rgb(.85,.9,.91),shade=rgb(.95,.98,.97),teal=rgb(.03,.5,.47),navy=rgb(.08,.2,.29),canvas=rgb(.95,.96,.98)
 const boldCharacters=new Set(bold.getCharacterSet())
 const supported=new Set(regular.getCharacterSet().filter(char=>boldCharacters.has(char)))
 let escaped=false,y=0,header=''
 let page!:PDFPage
 function clean(input:string):string{
  return Array.from(String(input).replace(/\r\n?/g,'\n').replace(/\t/g,' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ')).map(char=>{
   if(char==='\n'||supported.has(char.codePointAt(0)!))return char
   escaped=true;return '[U+'+char.codePointAt(0)!.toString(16).toUpperCase()+']'
  }).join('')
 }
 function wrap(input:string,available:number,font:PDFFont=regular,size=fontSize):string[]{
  const lines:string[]=[]
  for(const paragraph of clean(input).split('\n')){
   let line=''
   for(const word of paragraph.split(/\s+/).filter(Boolean)){
    if(line&&font.widthOfTextAtSize(line+' '+word,size)<=available){line+=' '+word;continue}
    if(line){lines.push(line);line=''}
    if(font.widthOfTextAtSize(word,size)<=available){line=word;continue}
    let part=''
    for(const char of Array.from(word)){if(part&&font.widthOfTextAtSize(part+char,size)>available){lines.push(part);part=''}part+=char}
    line=part
   }
   lines.push(line)
  }
  return lines.length?lines:['']
 }
 function drawLine(text:string,x:number,at:number,font=regular,size=fontSize,color=ink){page.drawText(clean(text),{x,y:at,font,size,color})}
 function roundBox(x:number,top:number,w:number,h:number,r:number,fill=rgb(1,1,1)){
  page.drawRectangle({x:x+r,y:top-h,width:w-2*r,height:h,color:fill})
  page.drawRectangle({x,y:top-h+r,width:w,height:h-2*r,color:fill})
  for(const cx of [x+r,x+w-r])for(const cy of [top-r,top-h+r])page.drawCircle({x:cx,y:cy,size:r,color:fill})
 }
 function newPage(){
  const cover=pdf.getPageCount()===0&&!!info.profile
  page=pdf.addPage([width,height])
  if(cover){
   const profile=info.profile!,schoolLines=wrap(info.schoolName,width-margin*2,regular,11),periodLines=wrap(profile.periodLabel,width-margin*2-28,bold,10)
   const band=120+schoolLines.length*14+periodLines.length*14
   page.drawRectangle({x:0,y:0,width,height,color:canvas})
   page.drawRectangle({x:0,y:height-band,width,height:band,color:navy})
   roundBox(margin,height-25,4,16,2,rgb(.2,.8,.74));drawLine('AULA AL DÍA',margin+14,height-37,bold,10,rgb(1,1,1))
   drawLine('Reporte de seguimiento',margin,height-70,bold,24,rgb(1,1,1))
   let at=height-94
   schoolLines.forEach(line=>{drawLine(line,margin,at,regular,11,rgb(.77,.85,.91));at-=14})
   at-=9
   const pillWidth=Math.min(width-margin*2,Math.max(180,...periodLines.map(line=>bold.widthOfTextAtSize(line,10)+28)))
   roundBox(margin,at+10,pillWidth,periodLines.length*14+12,7,rgb(.14,.28,.37))
   periodLines.forEach((line,n)=>drawLine(line,margin+14,at-5-n*14,bold,10,rgb(1,1,1)))
   y=height-band-28
   return
  }
  const schoolLines=wrap(info.schoolName,width-margin*2-112,bold,11),contextLines=wrap(info.context,width-margin*2,regular,8)
  const band=34+schoolLines.length*14+contextLines.length*11
  page.drawRectangle({x:0,y:height-band,width,height:band,color:navy})
  page.drawRectangle({x:0,y:height-band-3,width,height:3,color:teal})
  let at=height-28
  for(const text of schoolLines){drawLine(text,margin,at,bold,11,rgb(1,1,1));at-=14}
  drawLine('AULA AL DÍA',width-margin-94,height-28,bold,9,rgb(.48,.85,.76))
  at-=5
  for(const text of contextLines){drawLine(text,margin,at,regular,8,rgb(.76,.86,.87));at-=11}
  y=height-band-24
 }
 function paragraph(text:string,font=regular,size=fontSize){
  for(const line of wrap(text,width-margin*2,font,size)){
   if(y<bottom+lineHeight)newPage()
   drawLine(line,margin,y,font,size);y-=lineHeight
  }
  y-=7
 }
 function heading(text:string){if(y<bottom+50)newPage();y-=6;paragraph(text,bold,12);header=text}
 function compact(text:string,size=8){
  for(const line of wrap(text,width-margin*2,regular,size)){if(y<bottom+12)newPage();drawLine(line,margin,y,regular,size,muted);y-=11}
  y-=4
 }
 function linkAt(target:PDFPage,label:string,x:number,at:number,linkWidth:number,uri?:string,dest?:[PDFRef,'Fit']){
  const annotation=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,at-4,x+linkWidth,at+12],Border:[0,0,0],...(uri?{A:{Type:'Action',S:'URI',URI:PDFString.of(uri)}}:{Dest:dest})}))
  target.node.addAnnot(annotation)
 }
 function color(hex:string){return rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255)}
 newPage()
 const issued=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(info.issuedAt))
 if(info.profile){
  const profile=info.profile
  drawLine('ESTUDIANTE',margin,y,bold,8,muted);y-=22
  for(const line of wrap(profile.name,width-margin*2,bold,16)){drawLine(line,margin,y,bold,16,navy);y-=20}
  const classText=profile.periodClassroom===undefined?profile.classroom:profile.periodClassroom??'Sin matrícula registrada para el periodo'
  compact(classText+' · DNI: '+(profile.dni??'Sin DNI'),9)
  if(profile.periodClassroom!==undefined&&profile.periodClassroom!==profile.classroom)compact('Aula actual: '+profile.classroom,8)
  compact('Periodo: '+profile.range,9)
  if(profile.unknownDates)compact('Fecha inicial de matrícula no disponible; no certifica una fecha oficial.',7)
  y-=14
 }else{
  paragraph(info.title,bold,info.landscape?16:15)
  for(const line of info.lines)compact(line,8)
  compact('Emitido: '+issued+' (hora de Lima).',7)
 }
 const onlineLink=()=>{
  if(!info.viewUrl||!/^https?:\/\//.test(info.viewUrl))return
  if(y<bottom+40)newPage()
  roundBox(margin,y+7,width-margin*2,29,7,shade)
  drawLine('EXPLORAR REPORTE INTERACTIVO  →',margin+12,y-9,bold,8,teal)
  drawLine('Requiere sesión',width-margin-92,y-9,regular,7,muted)
  linkAt(page,'',margin,y-9,width-margin*2,info.viewUrl);y-=37
 }
 if(!info.profile)onlineLink()
 if(info.analytics){
  const source=info.analytics.metrics
  const ordered=info.profile?[...source].sort((a,b)=>['Ingresos registrados','Clases con registro','Ingresos a tiempo','Nota final publicada'].indexOf(a.label)-['Ingresos registrados','Clases con registro','Ingresos a tiempo','Nota final publicada'].indexOf(b.label)):source
  const labelsMap:Record<string,string>={'Ingresos registrados':'INGRESOS AL COLEGIO','Clases con registro':'ASISTENCIA A CLASES','Ingresos a tiempo':'PUNTUALIDAD','Nota final publicada':'NOTA FINAL'}
  const metrics=ordered.map(m=>info.profile?{...m,label:labelsMap[m.label]??m.label,note:m.label==='Ingresos registrados'?'días registrados':m.label==='Clases con registro'?'clases con registro publicado':m.label==='Ingresos a tiempo'&&m.value==='Sin datos'?'Sin ingresos con horario':m.label==='Nota final publicada'?(m.value==='Sin publicar'?'Pendiente de evaluación publicada':'Evaluación publicada · escala de 0 a 20'):m.note}:m)
  const columns=info.landscape?4:2,gap=16,cardWidth=(width-margin*2-gap*(columns-1))/columns
  for(let i=0;i<metrics.length;i+=columns){
   const items=metrics.slice(i,i+columns),notes=items.map(m=>wrap(m.note,cardWidth-28,regular,7.5)),labels=items.map(m=>wrap(m.label,cardWidth-28,bold,7.5))
   const labelHeight=Math.max(...labels.map(n=>n.length))*10,cardHeight=(info.profile?69:47)+labelHeight+Math.max(...notes.map(n=>n.length))*10
   if(y-cardHeight<bottom)newPage()
   items.forEach((m,j)=>{const x=margin+j*(cardWidth+gap)
    if(info.profile){
     roundBox(x,y,cardWidth,cardHeight,12)
     roundBox(x+15,y-23,22,3,1.5,teal)
     labels[j].forEach((line,n)=>drawLine(line,x+15,y-44-n*10,bold,7.5,muted))
     const valueSize=m.value.length>13?18:m.value.length>8?21:26
     drawLine(m.value,x+15,y-64-labelHeight/2,bold,valueSize,navy)
     notes[j].forEach((line,n)=>drawLine(line,x+15,y-77-labelHeight/2-n*10,regular,7.5,muted))
    }else{
     page.drawRectangle({x,y:y-cardHeight,width:cardWidth,height:cardHeight,color:shade,borderColor:border,borderWidth:.5});page.drawRectangle({x,y:y-cardHeight,width:3,height:cardHeight,color:teal});labels[j].forEach((line,n)=>drawLine(line,x+12,y-15-n*10,bold,8,muted));drawLine(m.value,x+12,y-27-labelHeight,bold,20,teal);notes[j].forEach((line,n)=>drawLine(line,x+12,y-43-labelHeight-n*9,regular,7,muted))
    }
   })
   y-=cardHeight+(info.profile?16:10)
  }
  const populated=info.analytics.charts.filter(c=>c.data.some(d=>d.value!==null&&(!!c.maximum||d.value>0)))
  const pending=info.analytics.charts.filter(c=>!populated.includes(c))
  const chartGap=12
  for(let i=0;i<populated.length;i+=2){
   const pair=populated.slice(i,i+2),chartWidth=pair.length===1?width-margin*2:(width-margin*2-chartGap)/2,sizes=pair.map(chart=>{
    const titleLines=wrap(chart.title,chartWidth-24,bold,9),noteLines=wrap(chart.note,chartWidth-24,regular,7)
    const body=chart.maximum?chart.data.reduce((sum,d)=>sum+wrap(d.label,chartWidth-65,regular,7).length*9+19,0)+16:Math.max(100,chart.data.length*22)
    return {titleLines,noteLines,body,height:40+titleLines.length*12+body+noteLines.length*9+12}
   }),boxHeight=Math.max(...sizes.map(c=>c.height))
   if(y-boxHeight<bottom)newPage()
   pair.forEach((chart,j)=>{
    const x=margin+j*(chartWidth+chartGap),top=y,size=sizes[j]
    if(info.profile&&pdf.getPageCount()===1)roundBox(x,top,chartWidth,boxHeight,12);else page.drawRectangle({x,y:top-boxHeight,width:chartWidth,height:boxHeight,color:rgb(1,1,1),borderColor:border,borderWidth:.7})
    size.titleLines.forEach((line,n)=>drawLine(line,x+12,top-18-n*12,bold,9))
    const bodyTop=top-30-size.titleLines.length*12
    if(chart.maximum){
     let at=bodyTop
     chart.data.forEach(d=>{const labels=wrap(d.label,chartWidth-65,regular,7);labels.forEach((line,n)=>drawLine(line,x+12,at-n*9,regular,7));drawLine(chartValue(chart,d.value),x+chartWidth-52,at,bold,7,d.value===null?muted:teal);at-=labels.length*9+4;page.drawRectangle({x:x+12,y:at-5,width:chartWidth-24,height:6,color:shade});if(d.value!==null&&d.value>0)page.drawRectangle({x:x+12,y:at-5,width:(chartWidth-24)*Math.min(1,d.value/chart.maximum!),height:6,color:color(d.color)});at-=15})
     drawLine('Escala: 0–'+chart.maximum,x+12,at+2,regular,6,muted)
    }else{
     const total=chart.data.reduce((sum,d)=>sum+(d.value??0),0),radius=info.landscape?42:34,cx=x+radius+14,cy=bodyTop-48
     let angle=-Math.PI/2
     chart.data.forEach(d=>{const value=d.value??0;if(value<=0)return;const sweep=value/total*Math.PI*2;if(sweep>=Math.PI*2-.00001)page.drawCircle({x:cx,y:cy,size:radius,color:color(d.color)});else{const startX=Math.cos(angle)*radius,startY=Math.sin(angle)*radius,endX=Math.cos(angle+sweep)*radius,endY=Math.sin(angle+sweep)*radius;page.drawSvgPath(`M 0 0 L ${startX} ${startY} A ${radius} ${radius} 0 ${sweep>Math.PI?1:0} 1 ${endX} ${endY} Z`,{x:cx,y:cy,color:color(d.color)})}angle+=sweep})
     page.drawCircle({x:cx,y:cy,size:radius*.67,color:rgb(1,1,1)})
     const totalText=new Intl.NumberFormat('es-PE').format(total),totalSize=totalText.length>5?11:16
     drawLine(totalText,cx-bold.widthOfTextAtSize(totalText,totalSize)/2,cy-1,bold,totalSize,teal)
     drawLine('REGISTROS',cx-regular.widthOfTextAtSize('REGISTROS',5)/2,cy-13,regular,5,muted)
     const legendX=x+radius*2+24,legendWidth=chartWidth-(legendX-x)-12
     let at=bodyTop-10
     chart.data.forEach(d=>{page.drawCircle({x:legendX,y:at+2,size:2.5,color:color(d.color)});const labels=wrap(d.label,legendWidth-10,regular,7);labels.forEach((line,n)=>drawLine(line,legendX+7,at-n*9,regular,7));at-=labels.length*9;drawLine(chartValue(chart,d.value),legendX+7,at,bold,7);at-=13})
    }
    const noteAt=top-boxHeight+12+size.noteLines.length*9
    size.noteLines.forEach((line,n)=>drawLine(line,x+12,noteAt-n*9,regular,7,muted))
   })
   y-=boxHeight+12
  }
  if(pending.length&&!info.profile){
   const note=populated.length?'Pendiente de datos: ':'Aún no hay registros para crear gráficas. '
   compact(note+pending.map(c=>c.title).join(' · ')+'. Sin publicar no equivale a cero.',8)
  }
 }
 const filled=sections.filter(s=>!!s.rows?.length)
 const unfilled=sections.filter(s=>s.columns&&!s.rows?.length)
 const narrative=sections.filter(s=>!s.columns)
 const compactProfile=!!info.profile&&!filled.length
 if(info.profile){
  if(compactProfile){
   const rows=info.profile.summaryRows,contentWidth=width-margin*2,labelWidth=contentWidth*.3
   const prepared=rows.map(([label,value])=>({label,lines:wrap(value,contentWidth-labelWidth-28,regular,8)}))
   const panelHeight=prepared.reduce((sum,r)=>sum+Math.max(23,r.lines.length*11+8),0)+18
   if(y-panelHeight-125<bottom)newPage()
   drawLine('OTROS REGISTROS',margin,y,bold,8,muted);y-=16
   roundBox(margin,y,contentWidth,panelHeight,10)
   let at=y-21
   prepared.forEach(row=>{drawLine(row.label,margin+14,at,bold,8,navy);row.lines.forEach((line,n)=>drawLine(line,margin+labelWidth,at-n*11,regular,8,muted));at-=Math.max(23,row.lines.length*11+8)})
   y-=panelHeight+18
   roundBox(margin,y,contentWidth,64,10,rgb(.88,.94,.95))
   drawLine('¿Cómo interpretar este reporte?',margin+15,y-20,bold,9,teal)
   const explanation=wrap('La falta de registros no equivale a inasistencias ni a una nota de cero.',contentWidth-30,regular,9)
   explanation.forEach((line,n)=>drawLine(line,margin+15,y-37-n*12,regular,9,navy));y-=80
  }
  onlineLink()
 }
 // Keep all records in the annex. An empty report stays a compact information sheet.
 let detailPage:PDFPage|undefined
 if(filled.length&&info.analytics){
  newPage();detailPage=page;paragraph('DETALLE Y SEGUIMIENTO',bold,15)
 }else if(info.analytics&&!compactProfile){
  y-=6;heading('Disponibilidad de información')
 }
 const displaySections=compactProfile?[]:filled.length?sections.filter(s=>!s.columns||!!s.rows?.length):narrative
 for(const section of displaySections){
  if(!filled.length&&info.analytics){compact(section.heading,8);for(const text of section.paragraphs??[])compact(text,7);continue}
  heading(section.heading)
  if(section.columns&&section.rows?.length){
   const columns=section.columns,weights=section.weights??columns.map(()=>1),sum=weights.reduce((a,b)=>a+b,0)
   const widths=weights.map(w=>(width-margin*2)*w/sum)
   function tableHeader(){
    const cells=columns.map((c,i)=>wrap(c,widths[i]-10,bold,8)),max=Math.max(...cells.map(c=>c.length)),h=max*lineHeight+10
    if(y-h<bottom+lineHeight){newPage();paragraph(header+' (continuación)',bold,11)}
    page.drawRectangle({x:margin,y:y-h,width:width-margin*2,height:h,color:teal,borderColor:teal,borderWidth:.5})
    let x=margin
    cells.forEach((cell,i)=>{cell.forEach((line,n)=>drawLine(line,x+5,y-12-n*lineHeight,bold,8,rgb(1,1,1)));x+=widths[i]});y-=h
   }
   tableHeader()
   for(const [rowIndex,row] of section.rows.entries()){
    const cells=columns.map((_,i)=>wrap(row[i]??'',widths[i]-10)),max=Math.max(...cells.map(c=>c.length))
    let offset=0
    while(offset<max){
     let capacity=Math.floor((y-bottom-10)/lineHeight)
     if(capacity<1){newPage();paragraph(header+' (continuación)',bold,11);tableHeader();capacity=Math.floor((y-bottom-10)/lineHeight)}
     const count=Math.min(capacity,max-offset),h=count*lineHeight+10
     let x=margin
     cells.forEach((cell,i)=>{
      page.drawRectangle({x,y:y-h,width:widths[i],height:h,color:rowIndex%2===0?rgb(.97,.99,.98):rgb(1,1,1),borderColor:border,borderWidth:.4})
      const chunk=cell.slice(offset,offset+count)
      const visible=offset>0&&i===0&&!chunk.length?wrap('(cont.) '+row[0],widths[i]-10).slice(0,count):chunk
      visible.forEach((line,n)=>drawLine(line,x+5,y-12-n*lineHeight))
      x+=widths[i]
     })
     y-=h;offset+=count
    }
   }
   y-=10
  }else if(section.columns&&section.empty)paragraph(section.empty)
  for(const text of section.paragraphs??[])paragraph(text)
 }
 if(unfilled.length&&!compactProfile){
  if(filled.length)heading('Secciones sin registros')
  for(const section of unfilled){compact(section.heading+': '+(section.empty??'Sin registros disponibles.'),7);for(const text of section.paragraphs??[])compact(text,7)}
 }
 if(escaped)paragraph('Los caracteres no disponibles en la fuente se representan con su código Unicode [U+...], sin omitir su posición.',regular,8)
 const pages=pdf.getPages()
 pages.forEach((p,index)=>{
  if(info.profile&&index===0){p.drawText('Emitido: '+issued+' · Información disponible según permisos.',{x:margin,y:45,font:regular,size:7,color:muted});p.drawText('Reporte informativo. No sustituye una certificación oficial.',{x:margin,y:33,font:regular,size:7,color:muted})}else p.drawLine({start:{x:margin,y:37},end:{x:width-margin,y:37},thickness:.5,color:border})
  p.drawText(`Aula al Día · ${index+1}/${pages.length}`,{x:margin,y:23,font:regular,size:7,color:muted})
  if(index===0&&detailPage){const label='Ver detalle completo →';p.drawText(label,{x:width-margin-112,y:23,font:bold,size:7,color:teal});linkAt(p,label,width-margin-115,23,115,undefined,[detailPage.ref,'Fit'])}
  if(index>0){const label='Volver al resumen ↑';p.drawText(label,{x:width-margin-105,y:23,font:bold,size:7,color:teal});linkAt(p,label,width-margin-108,23,108,undefined,[pages[0].ref,'Fit'])}
 })
 return pdf.save()
}

export async function renderReportPdf(report:StudentReport,sections:ReportSection[],viewUrl?:string):Promise<Uint8Array>{
 return renderDocumentPdf({schoolName:report.school.name,documentTitle:'Reporte individual · '+report.student.name,title:'REPORTE INDIVIDUAL DE SEGUIMIENTO',analytics:individualAnalytics(report),viewUrl,profile:{name:report.student.name,dni:report.student.dni,classroom:report.student.classroom,periodClassroom:report.student.period_classroom,unknownDates:report.student.enrollment_dates_unknown,periodLabel:report.period.name.toLocaleUpperCase('es-PE')+' · '+report.period.academic_year,range:report.period.starts_on.split('-').reverse().join('/')+' al '+report.period.ends_on.split('-').reverse().join('/'),summaryRows:[...(!report.can_classes?[["Asistencia a clases","No disponible para tu perfil."] as [string,string]]:[]),['Portería',report.gate_summary.movements+' movimientos · '+report.gate_summary.early_exits+' salidas anticipadas.'],['Comportamiento',report.can_behavior?'Sin evaluación publicada.':'No disponible para tu perfil.'],['Comunicaciones',report.can_behavior?'Sin comunicaciones de reconocimientos o incidencias a la familia.':'No disponible para tu perfil.']]},context:report.student.name+' · '+report.period.name,subject:report.period.name,issuedAt:report.issued_at,lines:[
  'Estudiante: '+report.student.name,
  'DNI: '+(report.student.dni??'Sin DNI')+' · Aula actual: '+report.student.classroom,
  ...(report.student.period_classroom!==undefined?['Aula del periodo: '+(report.student.period_classroom??'Sin matrícula registrada para el periodo')+(report.student.enrollment_dates_unknown?' · Fecha inicial no disponible.':'')]:[]),
  'Periodo: '+report.period.name+' · '+report.period.starts_on.split('-').reverse().join('/')+' al '+report.period.ends_on.split('-').reverse().join('/'),
 ]},sections)
}
