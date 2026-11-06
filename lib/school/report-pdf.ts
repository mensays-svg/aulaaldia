import {PDFDocument,rgb,type PDFFont,type PDFPage} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {StudentReport,ReportSection} from './reports'

const regularBytes=()=>readFile(join(process.cwd(),'assets/fonts/DejaVuSans.ttf'))
const boldBytes=()=>readFile(join(process.cwd(),'assets/fonts/DejaVuSans-Bold.ttf'))
export type ReportPdfHeader={schoolName:string;documentTitle:string;title:string;context:string;subject:string;lines:string[];issuedAt:string;landscape?:boolean}
export async function renderDocumentPdf(info:ReportPdfHeader,sections:ReportSection[]):Promise<Uint8Array>{
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit)
 const [regular,bold]=await Promise.all([regularBytes().then(bytes=>pdf.embedFont(bytes,{subset:true})),boldBytes().then(bytes=>pdf.embedFont(bytes,{subset:true}))])
 pdf.setTitle(info.documentTitle)
 pdf.setAuthor(info.schoolName);pdf.setSubject(info.subject);pdf.setCreator('Aula al Día')
 const width=info.landscape?841.89:595.28,height=info.landscape?595.28:841.89,margin=42,bottom=46,lineHeight=13,fontSize=9
 const ink=rgb(.09,.17,.27),muted=rgb(.3,.36,.43),border=rgb(.78,.82,.88),shade=rgb(.94,.96,.98)
 const boldCharacters=new Set(bold.getCharacterSet())
 const supported=new Set(regular.getCharacterSet().filter(char=>boldCharacters.has(char)))
 let escaped=false,page:PDFPage,y=0,header=''
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

export async function renderReportPdf(report:StudentReport,sections:ReportSection[]):Promise<Uint8Array>{
 return renderDocumentPdf({schoolName:report.school.name,documentTitle:'Reporte individual · '+report.student.name,title:'REPORTE INDIVIDUAL DE SEGUIMIENTO',context:report.student.name+' · '+report.period.name,subject:report.period.name,issuedAt:report.issued_at,lines:[
  'Estudiante: '+report.student.name,
  'DNI: '+(report.student.dni??'Sin DNI')+' · Aula actual: '+report.student.classroom,
  'Periodo: '+report.period.name+' · '+report.period.starts_on.split('-').reverse().join('/')+' al '+report.period.ends_on.split('-').reverse().join('/'),
 ]},sections)
}
