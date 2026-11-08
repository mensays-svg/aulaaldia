import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const require=createRequire(import.meta.url),ts=require('typescript')
function load(path,mocks={}){const module={exports:{}},code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>mocks[name]?{__esModule:true,...mocks[name]}:require(name),module,module.exports);return module.exports}
let own=[{id:'child1',first_names:'Ana',last_names:'Prueba',institution_id:'school'},{id:'child2',first_names:'Luis',last_names:'Prueba',institution_id:'school'}],fail=false,calls=[]
const periods=[{id:'p1',name:'I Bimestre',academic_year:2026,starts_on:'2026-03-01',ends_on:'2026-05-15'},{id:'p2',name:'II Bimestre',academic_year:2026,starts_on:'2026-05-16',ends_on:'2026-07-31'}]
const supabase={from(table){const filters=[];let ids;const q={select(){return q},eq(key,value){filters.push([key,value]);return q},in(key,value){ids=value;return q},order(){return q},range(){return q},limit(){return q},then(resolve){let data=table==='student_guardians'?own.map(c=>({student_id:c.id,user_id:'parent',institution_id:'school'})):table==='students'?[...own,{id:'other-child',first_names:'Otro',last_names:'Privado',institution_id:'school'}]:periods.map(p=>({...p,institution_id:'school'}));data=data.filter(row=>filters.every(([key,value])=>row[key]===value));if(ids)data=data.filter(c=>ids.includes(c.id));resolve({data:fail?null:data,error:fail?{message:'offline'}:null})}};return q}}
const context={school:'school',roles:['apoderado'],user:{id:'parent'},supabase},family=load('../lib/school/family-children.ts')
assert.deepEqual((await family.familyChildren(context)).children.map(c=>c.id),['child1','child2'])
assert.equal(family.familySelection(own,'other-child'),undefined)
const mocks={'next/link':{default:({href,children,...props})=>React.createElement('a',{href,...props},children)},'@/lib/school/context':{schoolContext:async()=>context},'@/lib/school/navigation':{familyOnly:r=>r.includes('apoderado')},'@/lib/school/family-children':family,'@/lib/school/gate':{limaDate:()=>'2026-06-01'},'@/lib/school/report-data':{getStudentReport:async(s,c,p)=>{calls.push([s,c,p]);return{report:{student:{id:c,name:c},period:periods.find(v=>v.id===p)}}}},'@/lib/school/reports':{buildReportSections:()=>[]},'@/lib/school/report-analytics':{individualAnalytics:()=>({metrics:[],charts:[]})},'./reportes/student-report-view':{default:()=>React.createElement('p',null,'Reporte familiar')},'./reportes/report-charts':{default:()=>null},'./reportes/report-details':{default:()=>null}}
const View=load('../app/dashboard/family-period-report.tsx',mocks).default
const render=async(props={})=>renderToStaticMarkup(await View({school:'school',...props}))
const html=await render({period:'p1',student:'child2'})
assert.deepEqual(calls.at(-1),['school','child2','p1'])
assert.ok(!html.includes('name="q"'))
assert.ok(!html.includes('Buscar'))
assert.ok(!html.includes('other-child'))
assert.ok(html.includes('name="student"'))
assert.ok(html.includes('I Bimestre'))
assert.ok(html.includes('student=child2&amp;period=p1'))
calls=[];assert.match(await render({student:'other-child'}),/no está vinculado/);assert.equal(calls.length,0)
assert.match(await render({period:'invalid'}),/no está disponible/);assert.equal(calls.length,0)
own=own.slice(0,1);const single=await render();assert.match(single,/type="hidden" name="student"/);assert.ok(!single.includes('<select name="student"'))
own=[];calls=[];assert.match(await render(),/No hay hijos vinculados/);assert.equal(calls.length,0)
fail=true;calls=[];assert.match(await render(),/No se pudieron cargar/);assert.equal(calls.length,0)
console.log('PASS family period view: explicit linked children, single/multiple children, no search, selected bimestre and PDF context, foreign IDs and failures rejected')
