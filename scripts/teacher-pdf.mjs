import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {PDFDocument} from 'pdf-lib'
import {managementAnalytics} from '../lib/school/report-analytics.ts'
import {buildManagementSections} from '../lib/school/management-reports.ts'
import {renderDocumentPdf} from '../lib/school/report-pdf.ts'
const r=JSON.parse(readFileSync('/tmp/aulaaldia-teacher-report-fixture.json','utf8')),sections=buildManagementSections(r)
assert.equal(r.teacher_scope,true);assert.equal(r.classrooms.length,1);assert.ok(sections.at(-1).paragraphs.some(p=>p.includes('aula asignada')));assert.ok(!JSON.stringify(sections).includes('Sustento reservado'))
const bytes=await renderDocumentPdf({schoolName:r.school.name,documentTitle:'Docente · Aula de prueba',title:'REPORTE DE MI GRADO Y SECCIÓN',context:r.classrooms[0].classroom,subject:r.period.name,issuedAt:r.issued_at,landscape:true,analytics:managementAnalytics(r),viewUrl:'https://aulaaldia.vercel.app/dashboard/reportes/docente',lines:[r.period.name,'Solo estudiantes autorizados y datos publicados.']},sections)
const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>0);assert.ok(pdf.getPages()[0].getWidth()>pdf.getPages()[0].getHeight());assert.ok(pdf.getPages()[0].node.Annots()?.size()>0)
writeFileSync('/tmp/aulaaldia-reporte-docente-prueba.pdf',bytes)
console.log('PASS teacher PDF with actual test-database report, assigned scope, privacy, landscape charts and authenticated link')
