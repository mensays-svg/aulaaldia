import{PGlite}from'@electric-sql/pglite'
import{readFileSync,writeFileSync}from'node:fs'
import{randomUUID}from'node:crypto'
import assert from'node:assert/strict'
const db=new PGlite();let checks=0;const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 for(const f of ['202611050001_school_foundation.sql','202611050002_unified_student_import.sql','202611050003_gate_attendance.sql','202611050004_class_attendance.sql','202611050005_behavior.sql','202611050006_student_reports.sql','202611050007_management_reports.sql','202611050008_enrollment_history.sql','202611070009_auxiliary_gate_role.sql','202611070010_teacher_qr_reports.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'))
 for(let n=1;n<=8;n++)await db.query('insert into auth.users values($1,$2,now())',[id(n),`teacher${n}@example.test`])
 await db.query("insert into public.institutions values($1,'Escuela Uno'),($2,'Escuela Dos')",[id(101),id(102)])
 for(const[u,role,school]of[[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'docente',101],[6,'apoderado',101],[8,'administrador',102]])await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(u),role])
 const {task_year:year,task_day:day,task_future:future}=(await db.query("select extract(year from now() at time zone 'America/Lima')::int as task_year,(now() at time zone 'America/Lima')::date::text as task_day,((now() at time zone 'America/Lima')::date+1)::text as task_future")).rows[0]
 for(const[room,school,section]of[[201,101,'A'],[202,101,'B'],[203,102,'A']])await db.query("insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,$3,'Primaria','1',$4)",[id(room),id(school),year,section])
 for(const[student,school,room]of[[301,101,201],[302,101,201],[303,101,201],[304,101,202],[305,101,201],[306,101,201],[401,102,203]])await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names,dni) values($1,$2,$3,'Estudiante','Prueba',$4)",[id(student),id(school),id(room),String(98000000+student)])
 await db.query('insert into public.teacher_assignments values($1,$2,$3),($1,$4,$5)',[id(101),id(201),id(4),id(202),id(5)])
 await db.query("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Padre')",[id(101),id(301),id(6)])
 async function as(u){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u?id(u):'']);await db.exec(u?'set role authenticated':'set role anon')}
 async function reject(fn,code){await assert.rejects(fn,code?e=>e.code===code:undefined);checks++}
 await as(1)
 const course=(await db.query("select public.create_school_course($1,'Matemática') c",[id(101)])).rows[0].c
 const period=(await db.query('select public.create_behavior_period($1,$2,$3,$4,$5) p',[id(101),'Periodo de prueba',year,`${year}-01-01`,`${year}-12-31`])).rows[0].p
 const codes={};for(const n of [301,302,303,304,305,306])codes[n]=(await db.query('select public.get_student_gate_code($1,$2) c',[id(101),id(n)])).rows[0].c
 const open=async(room=201,teacher=4,date=day)=>(await db.query("select public.open_class_session($1,$2,$3,$4,$5,'00:00','23:59:59','Clase de prueba') r",[id(101),id(room),course,id(teacher),date])).rows[0].r
 await as(4)
 const lesson=(await open()).session_id;assert.equal((await open()).session_id,lesson);checks++;assert.equal((await open()).reused,true);checks++
 await reject(()=>open(202,5),'42501')
 let revision=0
 async function scan(student,request=randomUUID(),rev=revision,session=lesson,code=codes[student]){const r=(await db.query('select public.scan_class_attendance($1,$2,$3,$4,$5) r',[id(101),session,code,rev,request])).rows[0].r;revision=r.revision;return r}
 const request=randomUUID(),first=await scan(301,request);assert.equal(first.status,'present');checks++;assert.equal(revision,1);checks++
 const repeat=await scan(301,request,0);assert.equal(repeat.repeated,true);checks++;assert.equal(revision,1);checks++
 const duplicate=await scan(301);assert.equal(duplicate.repeated,true);checks++;assert.equal(revision,1);checks++
 await reject(()=>scan(305,request),'P0001')
 await reject(()=>scan(304),'42501');await reject(()=>scan(305,randomUUID(),0),'P0001')
 await db.query('select public.save_class_attendance($1,$2,$3,$4::jsonb)',[id(101),lesson,revision,JSON.stringify([{student_id:id(302),status:'absent'}])]);revision++
 const saved=await scan(302);assert.equal(saved.status,'absent');checks++;assert.equal(saved.repeated,true);checks++
 await reject(()=>scan(301,request,0),'P0001')
 await as(3)
 for(const kind of ['entry','early_exit'])await db.query('select public.record_gate_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id(101),id(303),kind,'dni',randomUUID(),kind==='early_exit'?'salud':null,null,kind==='early_exit'?'Dirección de prueba':null,null,kind==='early_exit',null])
 await as(1);const oldCode=codes[305];codes[305]=(await db.query('select public.get_student_gate_code($1,$2,true) c',[id(101),id(305)])).rows[0].c
 await as(4);await reject(()=>scan(305,randomUUID(),revision,lesson,oldCode),'42501');await reject(()=>db.query('select * from public.class_qr_reads'),'42501')
 const warning=await scan(303);assert.equal(warning.needs_review,true);checks++;assert.equal(warning.status,null);checks++;assert.equal(warning.gate_kind,'early_exit');checks++
 assert.equal((await db.query('select public.class_session_detail($1,$2) d',[id(101),lesson])).rows[0].d.students.find(s=>s.id===id(303)).status,null);checks++
 const futureLesson=(await open(201,4,future)).session_id
 await reject(()=>scan(305,randomUUID(),0,futureLesson),'P0001')
 for(const u of [3,5,6,7,8]){await as(u);await reject(()=>scan(305),'42501')}
 await as(1)
 const enrollment=(await db.query('select id from public.student_enrollments where student_id=$1',[id(306)])).rows[0].id
 await db.query("select public.change_student_enrollment($1,$2,'withdraw',null,$3,0,$4,'Retiro autorizado de prueba')",[id(101),id(306),enrollment,randomUUID()])
 await as(4);await reject(()=>scan(306),'42501')
 const report=async(room=201)=>(await db.query('select public.teacher_period_report($1,$2,$3) r',[id(101),period,id(room)])).rows[0].r
 let r=await report();assert.equal(r.classrooms.length,1);checks++;assert.equal(r.classrooms[0].id,id(201));checks++;assert.ok(r.students.every(s=>s.classroom_id===id(201)));checks++;assert.equal(r.summary.class_marks,0);checks++
 await reject(()=>report(202),'42501')
 await as(1)
 // A published grade is visible; its private drafts and descriptions are not part of grouped reports.
 const rubric=(await db.query("select public.register_behavior_rubric($1,'Rúbrica prueba','Acta prueba','Criterios de prueba autorizados para valoración manual.',true) r",[id(101)])).rows[0].r
 const evaluation=(await db.query('select public.save_behavior_evaluation($1,$2,$3,-1,$4::jsonb) e',[id(101),id(301),period,JSON.stringify({rubric_id:rubric,presentation:17,punctuality:16,coexistence:18,responsibility:17,final_score:17,rationale:'Sustento reservado de la evaluación de prueba'})])).rows[0].e
 await db.query('select public.publish_behavior_evaluation($1,$2,0,true)',[id(101),evaluation])
 await as(4);r=await report();assert.equal(r.summary.published_behavior,1);checks++;assert.ok(!JSON.stringify(r).includes('Sustento reservado'));checks++
 await db.query('select public.save_class_attendance($1,$2,$3,$4::jsonb)',[id(101),lesson,revision,JSON.stringify([303,305,306].map(n=>({student_id:id(n),status:'present'})))]);revision++
 await db.query("select public.change_class_session_state($1,$2,$3,'closed')",[id(101),lesson,revision]);revision++
 await reject(()=>scan(301),'P0001');await reject(()=>open(),'P0001')
 r=await report();assert.equal(r.summary.class_marks,5);checks++;assert.equal(r.summary.present,4);checks++;assert.equal(r.summary.absent,1);checks++
 writeFileSync('/tmp/aulaaldia-teacher-report-fixture.json',JSON.stringify(r))
 for(const u of [3,6,7,8]){await as(u);await reject(()=>report(),'42501')}
 await as(1)
 const movedEnrollment=(await db.query('select id from public.student_enrollments where student_id=$1',[id(301)])).rows[0].id
 await db.query("select public.change_student_enrollment($1,$2,'transfer',$3,$4,0,$5,'Traslado autorizado de prueba para revisar la privacidad docente')",[id(101),id(301),id(202),movedEnrollment,randomUUID()])
 await db.query("select public.assign_school_role($1,'teacher4@example.test','auxiliar')",[id(101)])
 await as(4);assert.equal((await db.query('select public.can_read_student($1) ok',[id(301)])).rows[0].ok,true);checks++;assert.ok(!(await report()).students.some(s=>s.id===id(301)));checks++;await reject(()=>report(202),'42501')
 await as(1);await db.query('delete from public.teacher_assignments where user_id=$1 and classroom_id=$2',[id(4),id(201)])
 await as(4);await reject(()=>report(),'42501');await reject(()=>scan(301),'42501')
 await as(null);await reject(()=>report(),'42501')
 console.log(`${checks} teacher QR, duplicate/retry, session scope, hours, gate warning, published reports and revocation checks passed`)
}catch(e){console.error({message:e.message,code:e.code,where:e.where});process.exitCode=1}finally{await db.close()}
