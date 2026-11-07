import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {PDFDocument} from 'pdf-lib'
import {gateClassSections,gateClassAnalytics} from '../lib/school/gate-reports.ts'
import {renderDocumentPdf} from '../lib/school/report-pdf.ts'
const r={issued_at:new Date().toISOString(),school:{id:'test',name:'Institución Ficticia de Prueba'},classroom:{id:'room',label:'2026 · Primaria 1 A'},date:'2026-11-07',summary:{students:2,active:2,first_entries:1,late_entries:1,on_time_entries:0,unclassified_entries:0,not_registered:1,inside:1,awaiting_return:0,early_exits:1,returns:1},students:[{id:'one',name:'Estudiante de prueba Uno',dni:'98000001',active:true,unknown_dates:true,first_entry_at:'2026-11-07T14:00:00Z',is_late:true,last_at:'2026-11-07T15:00:00Z',last_kind:'return',state:'inside',early_exits:1,returns:1},{id:'two',name:'Estudiante de prueba Dos',dni:null,active:true,unknown_dates:false,first_entry_at:null,is_late:null,last_at:null,last_kind:null,state:'unregistered',early_exits:0,returns:0}]}
const sections=gateClassSections(r),analytics=gateClassAnalytics(r)
assert.equal(sections[0].rows.length,2);assert.match(sections[0].rows[1][1],/Sin ingreso registrado/);assert.equal(analytics.metrics[3].value,'1');assert.ok(!JSON.stringify(sections).includes('Falta'))
const bytes=await renderDocumentPdf({schoolName:r.school.name,documentTitle:'Portería por salón · Prueba',title:'REPORTE DE PORTERÍA POR SALÓN',context:r.classroom.label,subject:r.date,issuedAt:r.issued_at,landscape:true,analytics,viewUrl:'https://aulaaldia.vercel.app/dashboard/porteria/salones',lines:['Fecha: '+r.date]},sections)
const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>0);assert.ok(doc.getPages()[0].getWidth()>doc.getPages()[0].getHeight());assert.ok(doc.getPages()[0].node.Annots()?.size()>0)
writeFileSync('/tmp/aulaaldia-porteria-salon-prueba.pdf',bytes)
console.log('PASS gate classroom PDF, daily statistics, no invented absences, link and landscape layout')
