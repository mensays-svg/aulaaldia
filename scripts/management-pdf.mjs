import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {PDFDocument} from 'pdf-lib'
import {buildManagementSections,managementFilterLabel} from '../lib/school/management-reports.ts'
import {renderDocumentPdf} from '../lib/school/report-pdf.ts'
const students=Array.from({length:120},(_,i)=>{
 const score=i===119?null:i===0?0:16,room=Math.floor(i/20)+1
 return{id:'student-'+i,name:i===119?'MARCADOR_ESTUDIANTE_FINAL':'Muñoz Prueba, María '+(i+1),dni:String(98000000+i),active:i!==119,classroom_id:'room-'+room,classroom:`2026 · Secundaria ${room<=5?room:5} ${room===6?'B':'A'}`,level:'Secundaria',grade:String(room<=5?room:5),section:room===6?'B':'A',movements:1,first_entries:1,gate_late:1,on_time:0,unclassified:0,early_exits:0,class_marks:2,present:1,class_late:1,absent:0,justified:0,presentation:score,punctuality:score,coexistence:score,responsibility:score,final_score:score,recognitions:1,incidents:0}
})
const classrooms=Array.from({length:6},(_,i)=>{
 const pupils=students.filter(s=>s.classroom_id==='room-'+(i+1)),scores=pupils.map(s=>s.final_score).filter(v=>v!==null)
 return{id:'room-'+(i+1),classroom:pupils[0].classroom,level:'Secundaria',grade:pupils[0].grade,section:pupils[0].section,students:20,active:pupils.filter(p=>p.active).length,first_entries:20,gate_late:20,early_exits:0,class_marks:40,present:20,class_late:20,absent:0,justified:0,published_behavior:scores.length,missing_behavior:20-scores.length,failed_behavior:scores.filter(v=>v<11).length,average_behavior:scores.reduce((a,b)=>a+b,0)/scores.length,recognitions:20,incidents:0,closed_sessions:2,draft_started:1,upcoming_sessions:0}
})
const report={issued_at:'2026-11-06T02:00:00Z',school:{id:'school',name:'I.E. Ficticia de Pruebas'},period:{id:'period',name:'Periodo de prueba',academic_year:2026,starts_on:'2026-01-01',ends_on:'2026-12-31'},filters:{year:2026,level:'Secundaria',grade:null,section:null,state:'all'},summary:{students:120,active:119,first_entries:120,gate_late:120,on_time:0,unclassified:0,early_exits:0,class_marks:240,present:120,class_late:120,absent:0,justified:0,students_without_class_marks:0,published_behavior:119,missing_behavior:1,passed_behavior:118,failed_behavior:1,average_behavior:15.87,recognitions:120,incidents:0},sessions:{classrooms:6,closed:12,draft_started:6,upcoming:0},classrooms,students}
let checks=0
const sections=buildManagementSections(report)
const behavior=sections.find(s=>s.heading.startsWith('Conducta publicada'))
assert.equal(behavior.rows[0].at(-1),'0');checks++
assert.equal(behavior.rows.at(-1).at(-1),'Sin publicar');checks++
assert.equal(behavior.rows.length,120);checks++
assert.ok(!JSON.stringify(sections).includes('undefined'));checks++
assert.ok(sections.at(-1).paragraphs.some(p=>p.includes('no como promedio de promedios')));checks++
const bytes=await renderDocumentPdf({schoolName:report.school.name,documentTitle:'Reporte institucional de prueba',title:'REPORTE GENERAL PARA DIRECCIÓN',context:managementFilterLabel(report.filters),subject:report.period.name,issuedAt:report.issued_at,landscape:true,lines:[report.period.name,managementFilterLabel(report.filters),'Datos ficticios.']},sections)
const document=await PDFDocument.load(bytes)
assert.ok(document.getPageCount()>5);checks++
assert.ok(document.getPages()[0].getWidth()>document.getPages()[0].getHeight());checks++
assert.equal(document.getTitle(),'Reporte institucional de prueba');checks++
writeFileSync('/tmp/aulaaldia-reporte-direccion-prueba.pdf',bytes)
console.log(`${checks} management report rendering checks passed; ${document.getPageCount()} landscape pages at /tmp/aulaaldia-reporte-direccion-prueba.pdf`)
