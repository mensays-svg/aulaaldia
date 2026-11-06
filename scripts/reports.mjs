import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
const db=new PGlite()
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 for(const file of ['202611050001_school_foundation.sql','202611050002_unified_student_import.sql','202611050003_gate_attendance.sql','202611050004_class_attendance.sql','202611050005_behavior.sql','202611050006_student_reports.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
 for(let n=1;n<=9;n++)await db.query('insert into auth.users values($1,$2,now())',[id(n),`report${n}@example.com`])
 await db.query("insert into public.institutions(id,name) values($1,'Escuela Uno'),($2,'Escuela Dos')",[id(101),id(102)])
 for(const[u,role,school]of[[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'apoderado',101],[6,'docente',101],[8,'administrador',102],[9,'apoderado',101]])await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(u),role])
 const now=(await db.query("select (now() at time zone 'America/Lima')::date::text as day,extract(year from now() at time zone 'America/Lima')::int as year,now()::text instant")).rows[0]
 for(const[room,school]of[[201,101],[202,101],[203,102]])await db.query("insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,$3,'Secundaria','1',$4)",[id(room),id(school),now.year,String(room)])
 for(const[student,school,room]of[[301,101,201],[302,101,201],[303,101,202],[304,102,203]])await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names) values($1,$2,$3,'María José','Muñoz Prueba')",[id(student),id(school),id(room)])
 for(const[u,room]of[[4,201],[6,202]])await db.query('insert into public.teacher_assignments(institution_id,classroom_id,user_id) values($1,$2,$3)',[id(101),id(room),id(u)])
 await db.query("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Padre'),($1,$4,$5,'Madre')",[id(101),id(301),id(5),id(303),id(9)])
 let checks=0
 async function as(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated')}
 async function denied(fn,code){await assert.rejects(fn,e=>e.code===code);checks++}
 async function makePeriod(school){return(await db.query('select public.create_behavior_period($1,$2,$3,$4,$5) id',[id(school),'Periodo de prueba',now.year,`${now.year}-01-01`,`${now.year}-12-31`])).rows[0].id}
 await as(1);const period=await makePeriod(101)
 const rubric=(await db.query("select public.register_behavior_rubric($1,'Rúbrica prueba','Acta ficticia','Criterios institucionales de prueba. La valoración es manual y sustentada sin descuentos automáticos.',true) id",[id(101)])).rows[0].id
 const course=(await db.query("select public.create_school_course($1,'Matemática') id",[id(101)])).rows[0].id
 const session=(await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:00','00:01') id",[id(101),id(201),course,id(4),now.day])).rows[0].id
 const draft=(await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:01','00:02') id",[id(101),id(201),course,id(4),now.day])).rows[0].id
 const historical=(await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:00','00:01') id",[id(101),id(202),course,id(6),now.day])).rows[0].id
 await db.exec('reset role')
 await db.query('insert into public.class_roster values($1,$2,$3)',[id(101),historical,id(301)])
 await db.query("insert into public.class_attendance values($1,$2,$3,'absent','DRAFT_CLASS_PRIVATE',$4,now())",[id(101),draft,id(301),id(4)])
 await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,first_entry,is_late,note) values($1,$2,$3,$4::date,$5::timestamptz,'entry','dni',$6,$7,true,true,'INTERNAL_GATE_NOTE')",[id(101),id(301),id(201),now.day,now.instant,id(3),randomUUID()])
 await as(4);await db.query('select public.save_class_attendance($1,$2,0,$3::jsonb)',[id(101),session,JSON.stringify([{student_id:id(301),status:'late',note:'Observación publicada de la clase.'},{student_id:id(302),status:'absent',note:'PRIVATE_OTHER_PUPIL'}])]);await db.query("select public.change_class_session_state($1,$2,1,'closed')",[id(101),session])
 await as(6);await db.query('select public.save_class_attendance($1,$2,0,$3::jsonb)',[id(101),historical,JSON.stringify([{student_id:id(301),status:'present',note:'Sesión histórica autorizada.'},{student_id:id(303),status:'justified',note:'PRIVATE_OTHER_CLASS_PUPIL'}])]);await db.query("select public.change_class_session_state($1,$2,1,'closed')",[id(101),historical])
 await as(4)
 const evaluation=(await db.query('select public.save_behavior_evaluation($1,$2,$3,-1,$4::jsonb) id',[id(101),id(301),period,JSON.stringify({rubric_id:rubric,presentation:17,punctuality:14,coexistence:18,responsibility:16,final_score:16,rationale:'Sustento publicado para la familia, revisado por el evaluador según la rúbrica.'})])).rows[0].id
 const incident=(await db.query("select public.add_behavior_record($1,$2,$3,'incident','coexistence',$4,'INTERNAL_LOCATION','INTERNAL_FACTS_NOT_FOR_REPORT','INTERNAL_STUDENT_VERSION') id",[id(101),id(301),period,now.instant])).rows[0].id
 await db.query("select public.add_behavior_followup($1,$2,'INTERNAL_FOLLOWUP','pending',false)",[id(101),incident])
 await db.query("select public.add_behavior_followup($1,$2,'Seguimiento comunicado a la familia.','in_progress',true)",[id(101),incident])
 await db.query("select public.add_behavior_record($1,$2,$3,'recognition','responsibility',$4,'Patio','UNPUBLISHED_RECOGNITION','Reservado')",[id(101),id(301),period,now.instant])
 await as(8);const otherPeriod=await makePeriod(102)
 async function report(student=301,school=101,chosenPeriod=period){return(await db.query('select public.student_period_report($1,$2,$3) r',[id(school),id(student),chosenPeriod])).rows[0].r}
 await as(5);let result=await report();assert.equal(result.evaluation,null);checks++;assert.equal(result.records.length,0);checks++
 assert.equal(result.classes.length,2);checks++;assert.equal(result.class_summary.sessions,2);checks++;assert.equal(result.class_summary.absent,0);checks++
 assert.equal(result.gate_summary.first_entries,1);checks++;assert.equal(result.gate_summary.late_entries,1);checks++;assert.equal(result.class_summary.late,1);checks++
 assert.equal(result.can_classes,true);checks++;assert.equal(Object.hasOwn(result.gate_summary,'absent'),false);checks++
 await as(4);await db.query('select public.publish_behavior_evaluation($1,$2,0,true)',[id(101),evaluation]);await db.query("select public.communicate_behavior_record($1,$2,'Resumen familiar revisado sin datos de terceros.',true,'Revisión para comunicación')",[id(101),incident])
 for(const user of [1,2,4,5]){
  await as(user);result=await report()
  assert.equal(result.evaluation.final_score,16);checks++
  assert.equal(result.records[0].summary,'Resumen familiar revisado sin datos de terceros.');checks++
  assert.deepEqual(result.records[0].followups.map(f=>f.note),['Seguimiento comunicado a la familia.']);checks++
  assert.equal(result.classes.length,user===4?1:2);checks++
  const text=JSON.stringify(result)
  for(const hidden of ['DRAFT_CLASS_PRIVATE','PRIVATE_OTHER_PUPIL','PRIVATE_OTHER_CLASS_PUPIL','INTERNAL_GATE_NOTE','INTERNAL_LOCATION','INTERNAL_FACTS_NOT_FOR_REPORT','INTERNAL_STUDENT_VERSION','INTERNAL_FOLLOWUP','UNPUBLISHED_RECOGNITION']){assert.ok(!text.includes(hidden),hidden);checks++}
 }
 await as(3);result=await report();assert.equal(result.can_classes,false);checks++;assert.equal(result.can_behavior,false);checks++;assert.equal(result.evaluation,null);checks++;assert.equal(result.classes.length,0);checks++;assert.equal(result.records.length,0);checks++
 await as(5);await denied(()=>report(302),'42501');await denied(()=>report(301,101,otherPeriod),'22023');await denied(()=>report(301,102,otherPeriod),'P0001')
 await as(6);await denied(()=>report(),'42501')
 await as(9);await denied(()=>report(),'42501')
 await as(7);await denied(()=>report(),'42501')
 await as(8);await denied(()=>report(),'42501')
 await as(2);await db.query("select public.publish_behavior_evaluation($1,$2,1,false,'Revisión solicitada')",[id(101),evaluation])
 await as(5);assert.equal((await report()).evaluation,null);checks++
 await as(4);await db.query("select public.communicate_behavior_record($1,$2,'',false,'Retirar para revisión')",[id(101),incident]);assert.equal((await report()).records.length,0);checks++
 // Explicitly verify no PostgREST 1000-row truncation or implicit UI sample limit.
 await db.exec('reset role')
 await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id) select $1,$2,$3,$4::date,$5::timestamptz,case when n%2=0 then 'exit' else 'entry' end,'dni',$6,gen_random_uuid() from generate_series(1,1005) n",[id(101),id(301),id(201),now.day,now.instant,id(3)])
 await as(5);result=await report();assert.equal(result.gate_events.length,1006);checks++;assert.equal(result.gate_summary.movements,1006);checks++
 await db.exec('reset role;set role anon');await denied(()=>report(),'42501')
 console.log(`${checks} individual report authorization, completeness and privacy checks passed`)
}catch(e){console.error({message:e.message,code:e.code,where:e.where,stack:e.code?undefined:e.stack});process.exitCode=1}finally{await db.close()}
