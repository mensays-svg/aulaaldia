import assert from 'node:assert/strict'
import {combineTeacherReports} from '../lib/school/teacher-reports.ts'
const pupil=(id,score)=>({id,name:id,final_score:score})
const room=(id,scores)=>({school:{id:'school'},period:{id:'period'},filters:{year:2026,level:'Secundaria',grade:'2',section:id,state:'all'},issued_at:'',teacher_scope:true,summary:{students:scores.length,active:scores.length,first_entries:10,gate_late:1,early_exits:2,class_marks:20,present:15,class_late:2,absent:2,justified:1,recognitions:1,incidents:0,published_behavior:scores.filter(v=>v!==null).length,missing_behavior:scores.filter(v=>v===null).length,passed_behavior:scores.filter(v=>v!==null&&v>=11).length,failed_behavior:scores.filter(v=>v!==null&&v<11).length,average_behavior:999,on_time:9,unclassified:0,students_without_class_marks:0},sessions:{classrooms:1,closed:2,draft_started:1,upcoming:3},classrooms:[{id,level:'Secundaria',grade:'2'}],students:scores.map((v,i)=>pupil(id+i,v))})
const a=room('A',[20]),b=room('B',[10,0,null]),r=combineTeacherReports([a,b])
assert.equal(r.summary.students,4)
assert.equal(r.summary.first_entries,20)
assert.equal(r.summary.average_behavior,10) // 20,10,0; unpublished excluded
assert.equal(r.summary.published_behavior,3)
assert.equal(r.summary.missing_behavior,1)
assert.equal(r.summary.failed_behavior,2)
assert.equal(r.sessions.closed,4)
assert.equal(r.sessions.classrooms,2)
assert.equal(r.filters.section,null)
assert.equal(r.filters.level,'Secundaria')
assert.equal(r.filters.grade,'2')
assert.equal(r.teacher_scope,true)
assert.equal(a.summary.average_behavior,999) // source is untouched
assert.equal(combineTeacherReports([room('N',[null])]).summary.average_behavior,null)
assert.throws(()=>combineTeacherReports([]))
assert.throws(()=>combineTeacherReports([a,a]))
assert.throws(()=>combineTeacherReports([a,{...b,school:{id:'other'}}]))
assert.throws(()=>combineTeacherReports([a,{...b,period:{id:'other'}}]))
assert.throws(()=>combineTeacherReports([a,{...b,students:[pupil('A0',10)]}]))
console.log('PASS grade report aggregation: sums, weighted published grades, zero/null, scope consistency and duplicate rejection')

// Exercise the actual server helper with controlled Supabase responses.
const {readFileSync}=await import('node:fs'),{createRequire}=await import('node:module'),require=createRequire(import.meta.url),ts=require('typescript')
const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'),school=uuid(1),period=uuid(2)
const rooms=[['A','Primaria','1',2026],['B','Primaria','Primero',2026],['C','Primaria','1',2026],['D','Primaria','2',2026],['E','Secundaria','1',2026],['F','Primaria','1',2025]].map(([name,level,grade,academic_year],i)=>({id:uuid(100+i),name,level,grade,academic_year,institution_id:school}))
let calls=[],rejectRoom=null
const client={auth:{getUser:async()=>({data:{user:{id:uuid(3)}}})},from(table){const filters=[];let lo=0,hi=499;const query={select(){return query},eq(k,v){filters.push([k,v]);return query},order(){return query},range(a,b){lo=a;hi=b;return query},then(resolve){let data=table==='teacher_assignments'?rooms.filter(r=>['A','B','D','E','F'].includes(r.name)).map(r=>({classroom_id:r.id,institution_id:school,user_id:uuid(3)})):rooms;resolve({data:data.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(lo,hi+1),error:null})}};return query},async rpc(name,args){calls.push(args.classroom);if(args.classroom===rejectRoom)return{error:{code:'42501'}};const selected=rooms.find(r=>r.id===args.classroom),report=room(selected.name,[10]);report.school.id=school;report.period={id:period,academic_year:2026};report.classrooms=[{...report.classrooms[0],id:selected.id,level:selected.level,grade:selected.grade}];return{data:report}}}
const context={school,roles:['docente'],user:{id:uuid(3)},supabase:client}
const mocks={'@/lib/supabase/server':{createClient:async()=>client,configured:()=>true},'@/lib/school/validation':{validUuid:v=>/^[0-9a-f-]{36}$/.test(v)},'./context':{schoolContext:async()=>context},'./student-import':{normalizeGrade:v=>v==='Primero'?'1':v},'./teacher-reports':{combineTeacherReports}}
const module={exports:{}},compiled=ts.transpileModule(readFileSync(new URL('../lib/school/report-data.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new Function('require','module','exports',compiled)(name=>{if(!mocks[name])throw new Error('Unexpected dependency: '+name);return mocks[name]},module,module.exports)
const result=await module.exports.getTeacherGradeReport(school,period,rooms[0].id)
assert.equal(result.status,200)
assert.deepEqual(new Set(calls),new Set([rooms[0].id,rooms[1].id])) // no unassigned, other grade/level/year
assert.equal(result.report.sessions.classrooms,2)
assert.equal(result.report.summary.students,2)
rejectRoom=rooms[1].id;calls=[]
const denied=await module.exports.getTeacherGradeReport(school,period,rooms[0].id)
assert.equal(denied.status,403)
assert.equal(denied.report,undefined) // fail closed, never return a partial grade
console.log('PASS actual grade helper: assigned sections only, grade aliases, isolated level/year, RPC reauthorization and revoked access rejects entire report')
