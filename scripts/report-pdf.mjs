import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {PDFDocument} from 'pdf-lib'
import {buildReportSections} from '../lib/school/reports.ts'
import {renderReportPdf} from '../lib/school/report-pdf.ts'
const report={issued_at:'2026-11-06T02:00:00Z',school:{id:'school',name:'I.E. Ficticia San José'},student:{id:'student',name:'Muñoz Peña, María José',dni:'98000999',classroom:'2026 · Secundaria 1 A',active:true},period:{id:'period',name:'Periodo de prueba',academic_year:2026,starts_on:'2026-01-01',ends_on:'2026-12-31'},can_classes:true,can_behavior:true,gate_summary:{movements:0,first_entries:0,late_entries:0,on_time_entries:0,unclassified_entries:0,early_exits:0},gate_events:[],class_summary:{sessions:1,present:1,late:0,absent:0,justified:0},classes:[{date:'2026-11-05',starts_at:'08:00:00',ends_at:'09:00:00',course:'Matemática',classroom:'2026 · Secundaria 1 A',status:'present',note:'Observación revisada para la familia.'}],evaluation:{presentation:17,punctuality:14,coexistence:18,responsibility:16,final_score:16,rationale:'Sustento de prueba según la rúbrica institucional.',published_at:'2026-11-06T02:00:00Z',rubric_name:'Rúbrica de prueba',rubric_reference:'Acta ficticia'},records:[]}
let checks=0
let sections=buildReportSections(report)
assert.ok(sections.some(s=>s.heading.includes('Comportamiento')&&s.rows.some(row=>row[0]==='Nota final'&&row[1]==='16')));checks++
assert.ok(sections.some(s=>s.paragraphs?.some(p=>p.includes('No se deducen faltas'))));checks++
const empty={...report,can_classes:false,can_behavior:false,class_summary:null,classes:[],evaluation:null,records:[]}
const limited=buildReportSections(empty)
assert.ok(!JSON.stringify(limited).includes('Sustento de prueba'));checks++
assert.ok(limited.filter(s=>s.paragraphs?.includes('Esta sección no está disponible para tu perfil.')).length===2);checks++
const simple=await renderReportPdf(report,sections)
assert.ok(Buffer.from(simple).subarray(0,8).toString().startsWith('%PDF-'));checks++
const simpleDocument=await PDFDocument.load(simple);assert.ok(simpleDocument.getPageCount()>0);checks++
assert.equal(simpleDocument.getTitle(),'Reporte individual · Muñoz Peña, María José');checks++
// Stress multi-page rendering, long unsplittable text and one row taller than a page.
report.classes=Array.from({length:130},(_,i)=>({...report.classes[0],course:'Matemática '+(i+1),note:i===129?'MARCADOR_ULTIMA_CLASE':('Seguimiento familiar del estudiante. ').repeat(5)}))
report.class_summary.sessions=130;report.class_summary.present=130
report.records=[{at:'2026-11-05T14:00:00Z',kind:'recognition',criterion:'responsibility',summary:'Resumen revisado. '+('Texto de seguimiento suficientemente largo para cruzar varias páginas. ').repeat(150)+' MARCADOR_FIN_REGISTRO',followups:[{at:'2026-11-05T15:00:00Z',state:'completed',note:'Acuerdo cumplido. '+('ABCDEFGHIJ'.repeat(70))+' 😀 🪿'}]}]
sections=buildReportSections(report)
const long=await renderReportPdf(report,sections)
const document=await PDFDocument.load(long)
assert.ok(document.getPageCount()>5);checks++
assert.ok(long.length>simple.length);checks++
writeFileSync('/tmp/aulaaldia-reporte-prueba.pdf',long)
console.log(`${checks} PDF and shared report rendering checks passed; ${document.getPageCount()} pages generated at /tmp/aulaaldia-reporte-prueba.pdf`)
