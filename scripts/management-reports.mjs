import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
const db=new PGlite()
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 for(const file of ['202611050001_school_foundation.sql','202611050002_unified_student_import.sql','202611050003_gate_attendance.sql','202611050004_class_attendance.sql','202611050005_behavior.sql','202611050006_student_reports.sql','202611050007_management_reports.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
 for(let n=1;n<=8;n++)await db.query('insert into auth.users values($1,$2,now())',[id(n),`manager${n}@example.com`])
 await db.query("insert into public.institutions(id,name) values($1,'Escuela Uno'),($2,'Escuela Dos')",[id(101),id(102)])
 for(const[u,role,school]of[[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'apoderado',101],[6,'docente',101],[8,'administrador',102]])await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(u),role])
 const time=(await db.query("select (now() at time zone 'America/Lima')::date::text as day,((now() at time zone 'America/Lima')::date+1)::text future,extract(year from now() at time zone 'America/Lima')::int as year,now()::text instant")).rows[0]
 for(const[room,school,level,grade,section]of[[201,101,'Inicial','3','A'],[202,101,'Primaria','1.º','A'],[203,101,'Primaria','2','B'],[204,101,'Secundaria','1','A'],[205,101,'Secundaria','1','B'],[206,102,'Secundaria','1','A']])await db.query('insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,$3,$4,$5,$6)',[id(room),id(school),time.year,level,grade,section])
 for(const[student,school,room,active]of[[301,101,202,true],[302,101,202,true],[303,101,202,false],[304,101,204,true],[305,101,201,true],[306,102,206,true]])await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names,active) values($1,$2,$3,'Alumno','Prueba '||$4::text,$5)",[id(student),id(school),id(room),student,active])
 for(const[u,room]of[[4,202],[6,204]])await db.query('insert into public.teacher_assignments(institution_id,classroom_id,user_id) values($1,$2,$3)',[id(101),id(room),id(u)])
 await db.query("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Padre')",[id(101),id(301),id(5)])
 let checks=0
 function equal(actual,expected,label){assert.deepEqual(actual,expected,label);checks++}
 async function as(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated')}
 async function denied(fn){await assert.rejects(fn,e=>e.code==='42501');checks++}
 async function invalid(fn){await assert.rejects(fn,e=>e.code==='22023');checks++}
 async function period(school){return(await db.query('select public.create_behavior_period($1,$2,$3,$4,$5) id',[id(school),'Periodo de prueba',time.year,`${time.year}-01-01`,`${time.year}-12-31`])).rows[0].id}
 await as(1);const p=await period(101),rubric=(await db.query("select public.register_behavior_rubric($1,'Rúbrica ficticia','Acta prueba','Criterios de prueba para valoración manual sin descuentos ni promedios automáticos.',true) id",[id(101)])).rows[0].id
 for(const[student,score,published]of[[301,20,true],[302,10,true],[303,19,false],[304,8,true]]){
  const evaluation=(await db.query('select public.save_behavior_evaluation($1,$2,$3,-1,$4::jsonb) id',[id(101),id(student),p,JSON.stringify({rubric_id:rubric,presentation:score,punctuality:score,coexistence:score,responsibility:score,final_score:score,rationale:published?'Sustento publicado según criterios institucionales.':'PRIVATE_DRAFT_RATIONALE'})])).rows[0].id
  if(published)await db.query('select public.publish_behavior_evaluation($1,$2,0,true)',[id(101),evaluation])
 }
 for(const[student,kind,published]of[[301,'incident',true],[301,'recognition',true],[302,'incident',false],[304,'recognition',true]]){
  const record=(await db.query("select public.add_behavior_record($1,$2,$3,$4,'responsibility',$5,'PRIVATE_LOCATION','PRIVATE_INTERNAL_DESCRIPTION','PRIVATE_STUDENT_VERSION') id",[id(101),id(student),p,kind,time.instant])).rows[0].id
  if(published)await db.query("select public.communicate_behavior_record($1,$2,'PRIVATE_FAMILY_SUMMARY_NOT_IN_AGGREGATE',true,'Revisión del registro')",[id(101),record])
 }
 const course=(await db.query("select public.create_school_course($1,'Matemática') id",[id(101)])).rows[0].id
 const closed=(await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:00','00:01') id",[id(101),id(202),course,id(4),time.day])).rows[0].id
 await db.query('select public.save_class_attendance($1,$2,0,$3::jsonb)',[id(101),closed,JSON.stringify([{student_id:id(301),status:'present',note:'PRIVATE_CLASS_NOTE'},{student_id:id(302),status:'late'}])]);await db.query("select public.change_class_session_state($1,$2,1,'closed')",[id(101),closed])
 const draft=(await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:00','00:01') id",[id(101),id(204),course,id(6),time.day])).rows[0].id
 await db.query('select public.save_class_attendance($1,$2,0,$3::jsonb)',[id(101),draft,JSON.stringify([{student_id:id(304),status:'absent',note:'PRIVATE_DRAFT_CLASS'}])])
 const upcoming=Number(time.future.slice(0,4))===time.year?1:0
 if(upcoming)await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:00','00:01')",[id(101),id(202),course,id(4),time.future])
 await db.exec('reset role')
 for(const[student,room,late]of[[301,202,true],[302,202,false],[303,202,false],[304,204,null]])await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,first_entry,is_late,note) values($1,$2,$3,$4::date,$5::timestamptz,'entry','dni',$6,$7,true,$8,'PRIVATE_GATE_NOTE')",[id(101),id(student),id(room),time.day,time.instant,id(3),randomUUID(),late])
 const early=randomUUID()
 await db.query("insert into public.gate_events(id,institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,reason,authorized_by,expects_return) values($1,$2,$3,$4,$5::date,$6::timestamptz,'early_exit','dni',$7,$8,'salud','PRIVATE_AUTHORIZER',true)",[early,id(101),id(301),id(202),time.day,time.instant,id(3),randomUUID()])
 await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,return_of) values($1,$2,$3,$4::date,$5::timestamptz,'return','dni',$6,$7,$8)",[id(101),id(301),id(202),time.day,time.instant,id(3),randomUUID(),early])
 await as(8);const otherPeriod=await period(102)
 async function report(options={}){const{school=101,period=p,year=time.year,level=null,grade=null,section=null,state='all'}=options;return(await db.query('select public.management_period_report($1,$2,$3,$4,$5,$6,$7) r',[id(school),period,year,level,grade,section,state])).rows[0].r}
 await as(1);let r=await report()
 for(const[key,value]of Object.entries({students:5,active:4,first_entries:4,gate_late:1,on_time:2,unclassified:1,early_exits:1,class_marks:2,present:1,class_late:1,absent:0,justified:0,students_without_class_marks:3,published_behavior:3,missing_behavior:2,passed_behavior:1,failed_behavior:2,average_behavior:12.67,recognitions:2,incidents:1}))equal(r.summary[key],value,key)
 equal(r.sessions,{classrooms:5,closed:1,draft_started:1,upcoming},'sessions are not multiplied by students')
 equal(r.classrooms.length,5);equal(r.students.length,5)
 equal(r.classrooms.find(c=>c.id===id(203)).students,0);equal(r.classrooms.find(c=>c.id===id(203)).missing_behavior,0);equal(r.classrooms.find(c=>c.id===id(203)).average_behavior,null)
 const pupil=r.students.find(s=>s.id===id(301));equal(pupil.movements,3);equal(pupil.class_marks,1);equal(pupil.incidents,1);equal(pupil.recognitions,1)
 for(const hidden of ['PRIVATE_DRAFT_RATIONALE','PRIVATE_LOCATION','PRIVATE_INTERNAL_DESCRIPTION','PRIVATE_STUDENT_VERSION','PRIVATE_FAMILY_SUMMARY_NOT_IN_AGGREGATE','PRIVATE_CLASS_NOTE','PRIVATE_DRAFT_CLASS','PRIVATE_GATE_NOTE','PRIVATE_AUTHORIZER']){assert.ok(!JSON.stringify(r).includes(hidden),hidden);checks++}
 r=await report({level:'Primaria',grade:'primero',section:' a '});equal(r.summary.students,3);equal(r.summary.average_behavior,15);equal(r.classrooms.length,1);equal(r.classrooms[0].id,id(202))
 r=await report({level:'Secundaria',grade:'1'});equal(r.summary.students,1);equal(r.summary.average_behavior,8);equal(r.classrooms.length,2)
 r=await report({level:'Inicial'});equal(r.summary.students,1);equal(r.summary.average_behavior,null);equal(r.summary.missing_behavior,1);equal(r.summary.absent,0)
 r=await report({state:'active'});equal(r.summary.students,4);equal(r.summary.first_entries,3);equal(r.summary.average_behavior,12.67)
 r=await report({state:'inactive'});equal(r.summary.students,1);equal(r.summary.average_behavior,null);equal(r.summary.failed_behavior,0)
 r=await report({section:'Z'});equal(r.summary.students,0);equal(r.summary.average_behavior,null);equal(r.classrooms.length,0);equal(r.students.length,0)
 await invalid(()=>report({year:time.year+1}));await invalid(()=>report({level:'Universidad'}));await invalid(()=>report({state:'todos'}));await invalid(()=>report({period:otherPeriod}));await invalid(()=>report({section:'X'.repeat(41)}))
 await as(2);equal((await report()).summary.average_behavior,12.67)
 for(const user of [3,4,5,6,7]){await as(user);await denied(()=>report())}
 await as(8);await denied(()=>report());r=await report({school:102,period:otherPeriod});equal(r.summary.students,1);equal(r.students[0].id,id(306))
 // A cohort above the REST limit remains complete; averages use only published grades.
 await db.exec('reset role');await db.query("insert into public.students(institution_id,classroom_id,first_names,last_names) select $1,$2,'Alumno masivo',n::text from generate_series(1,1005) n",[id(101),id(202)])
 await as(1);r=await report();equal(r.students.length,1010);equal(r.summary.students,1010);equal(r.summary.average_behavior,12.67);equal(r.summary.missing_behavior,1007);equal(r.summary.class_marks,2);equal(r.sessions.draft_started,1)
 await db.exec('reset role;set role anon');await denied(()=>report())
 console.log(`${checks} management report scope, filters, aggregation and completeness checks passed`)
}catch(e){console.error({message:e.message,code:e.code,where:e.where,position:e.position,stack:e.code?undefined:e.stack});process.exitCode=1}finally{await db.close()}
