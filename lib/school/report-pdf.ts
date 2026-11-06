import {PDFDocument,rgb,type PDFFont,type PDFPage,PDFString} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {StudentReport,ReportSection} from './reports'
import {individualAnalytics,chartValue,type ReportAnalytics} from './report-analytics.ts'

const regularBytes=()=>readFile(join(process.cwd(),'assets/fonts/DejaVuSans.ttf'))
const boldBytes=()=>readFile(join(process.cwd(),'assets/fonts/DejaVuSans-Bold.ttf'))
export type ReportPdfHeader={schoolName:string;documentTitle:string;title:string;context:string;subject:string;lines:string[];issuedAt:string;landscape?:boolean;analytics?:ReportAnalytics;viewUrl?:string}
export async function renderDocumentPdf(info:ReportPdfHeader,sections:ReportSection[]):Promise<Uint8Array>{
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit)
 const [regular,bold]=await Promise.all([regularBytes().then(bytes=>pdf.embedFont(bytes,{subset:true})),boldBytes().then(bytes=>pdf.embedFont(bytes,{subset:true}))])
 pdf.setTitle(info.documentTitle)
 pdf.setAuthor(info.schoolName);pdf.setSubject(info.subject);pdf.setCreator('Aula al Día')
 const width=info.landscape?841.89:595.28,height=info.landscape?595.28:841.89,margin=42,bottom=46,lineHeight=13,fontSize=9
 const ink=rgb(.09,.17,.27),muted=rgb(.3,.36,.43),border=rgb(.78,.82,.88),shade=rgb(.94,.96,.98)
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
 function newPage(){
  page=pdf.addPage([width,height]);y=height-margin
  const schoolLines=wrap(info.schoolName,width-margin*2,bold,11)
  for(const text of schoolLines){drawLine(text,margin,y,bold,11);y-=15}
  for(const text of wrap(info.context,width-margin*2,regular,8)){drawLine(text,margin,y,regular,8,muted);y-=12}
  page.drawLine({start:{x:margin,y:y-3},end:{x:width-margin,y:y-3},thickness:.5,color:border});y-=20
 }
 function paragraph(text:string,font=regular,size=fontSize){
  for(const line of wrap(text,width-margin*2,font,size)){
   if(y<bottom+lineHeight)newPage()
   drawLine(line,margin,y,font,size);y-=lineHeight
  }
  y-=7
 }
 function heading(text:string){if(y<bottom+50)newPage();y-=6;paragraph(text,bold,12);header=text}
 newPage()
 paragraph(info.title,bold,14)
 for(const line of info.lines)paragraph(line)
 const issued=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'}).format(new Date(info.issuedAt))
 paragraph('Emitido: '+issued+' (hora de Lima).')
 if(info.viewUrl&&/^https?:\/\//.test(info.viewUrl)){
  if(y<bottom+25)newPage()
  const linkY=y
  drawLine('Abrir versión interactiva en Aula al Día (requiere sesión)',margin,linkY,bold,9,rgb(.03,.5,.47))
  const link=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[margin,linkY-3,width-margin,linkY+12],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(info.viewUrl)}}))
  page.node.addAnnot(link);y-=25
 }
 if(info.analytics){
  heading('Resumen visual y estadísticas')
  const cardWidth=(width-margin*2-16)/2
  for(let i=0;i<info.analytics.metrics.length;i+=2){
   const pair=info.analytics.metrics.slice(i,i+2)
   const notes=pair.map(m=>wrap(m.note,cardWidth-20,regular,8))
   const cardHeight=60+Math.max(...notes.map(n=>n.length))*11
   if(y-cardHeight<bottom)newPage()
   pair.forEach((m,j)=>{const x=margin+j*(cardWidth+16);page.drawRectangle({x,y:y-cardHeight,width:cardWidth,height:cardHeight,color:shade,borderColor:border,borderWidth:.5});drawLine(m.label,x+10,y-17,bold,9);drawLine(m.value,x+10,y-41,bold,17);notes[j].forEach((line,n)=>drawLine(line,x+10,y-57-n*11,regular,8,muted))})
   y-=cardHeight+12
  }
  for(const chart of info.analytics.charts){
   const available=width-margin*2,labelWidth=available*.43,valueWidth=100,trackWidth=available-labelWidth-valueWidth-12
   const labelLines=chart.data.map(d=>wrap(d.label,labelWidth-8,regular,8))
   const rowHeights=labelLines.map(lines=>Math.max(29,lines.length*11+10))
   const chartHeight=48+rowHeights.reduce((a,b)=>a+b,0)
   if(y-chartHeight<bottom)newPage()
   heading(chart.title)
   const maximum=chart.maximum??Math.max(1,...chart.data.map(d=>d.value??0))
   chart.data.forEach((d,i)=>{
    const at=y-10;labelLines[i].forEach((line,n)=>drawLine(line,margin,at-n*11,regular,8))
    page.drawRectangle({x:margin+labelWidth,y:at-2,width:trackWidth,height:9,color:shade})
    if(d.value!==null&&d.value>0){const hex=d.color.slice(1);page.drawRectangle({x:margin+labelWidth,y:at-2,width:trackWidth*Math.max(0,Math.min(1,d.value/maximum)),height:9,color:rgb(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255)})}
    drawLine(chartValue(chart,d.value),margin+labelWidth+trackWidth+10,at,regular,8)
    y-=rowHeights[i]
   })
   paragraph('Escala: 0–'+maximum+' · '+chart.unit,regular,8)
   paragraph(chart.note,regular,8)
   if(!chart.maximum&&chart.data.every(d=>(d.value??0)===0))paragraph('No hay registros disponibles para graficar en este periodo.',regular,8)
  }
 }
 for(const section of sections){
  heading(section.heading)
  if(section.columns&&section.rows?.length){
   const columns=section.columns,weights=section.weights??columns.map(()=>1),sum=weights.reduce((a,b)=>a+b,0)
   const widths=weights.map(w=>(width-margin*2)*w/sum)
   function tableHeader(){
    const cells=columns.map((c,i)=>wrap(c,widths[i]-10,bold,8)),max=Math.max(...cells.map(c=>c.length)),h=max*lineHeight+10
    if(y-h<bottom+lineHeight){newPage();paragraph(header+' (continuación)',bold,11)}
    page.drawRectangle({x:margin,y:y-h,width:width-margin*2,height:h,color:shade,borderColor:border,borderWidth:.5})
    let x=margin
    cells.forEach((cell,i)=>{cell.forEach((line,n)=>drawLine(line,x+5,y-12-n*lineHeight,bold,8));x+=widths[i]});y-=h
   }
   tableHeader()
   for(const row of section.rows){
    const cells=columns.map((_,i)=>wrap(row[i]??'',widths[i]-10)),max=Math.max(...cells.map(c=>c.length))
    let offset=0
    while(offset<max){
     let capacity=Math.floor((y-bottom-10)/lineHeight)
     if(capacity<1){newPage();paragraph(header+' (continuación)',bold,11);tableHeader();capacity=Math.floor((y-bottom-10)/lineHeight)}
     const count=Math.min(capacity,max-offset),h=count*lineHeight+10
     let x=margin
     cells.forEach((cell,i)=>{
      page.drawRectangle({x,y:y-h,width:widths[i],height:h,borderColor:border,borderWidth:.4})
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
 if(escaped)paragraph('Los caracteres no disponibles en la fuente se representan con su código Unicode [U+...], sin omitir su posición.',regular,8)
 const pages=pdf.getPages()
 pages.forEach((p,index)=>{p.drawText(`Aula al Día · ${index+1}/${pages.length}`,{x:margin,y:25,font:regular,size:8,color:muted})})
 return pdf.save()
}

export async function renderReportPdf(report:StudentReport,sections:ReportSection[],viewUrl?:string):Promise<Uint8Array>{
 return renderDocumentPdf({schoolName:report.school.name,documentTitle:'Reporte individual · '+report.student.name,title:'REPORTE INDIVIDUAL DE SEGUIMIENTO',analytics:individualAnalytics(report),viewUrl,context:report.student.name+' · '+report.period.name,subject:report.period.name,issuedAt:report.issued_at,lines:[
  'Estudiante: '+report.student.name,
  'DNI: '+(report.student.dni??'Sin DNI')+' · Aula actual: '+report.student.classroom,
  ...(report.student.period_classroom!==undefined?['Aula del periodo: '+(report.student.period_classroom??'Sin matrícula registrada para el periodo')+(report.student.enrollment_dates_unknown?' · Fecha inicial no disponible.':'')]:[]),
  'Periodo: '+report.period.name+' · '+report.period.starts_on.split('-').reverse().join('/')+' al '+report.period.ends_on.split('-').reverse().join('/'),
 ]},sections)
}
