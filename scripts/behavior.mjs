import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
const db=new PGlite()
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 for(const file of ['202611050001_school_foundation.sql','202611050002_unified_student_import.sql','202611050003_gate_attendance.sql','202611050004_class_attendance.sql','202611050005_behavior.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
 for(let n=1;n<=10;n++)await db.query('insert into auth.users values($1,$2,now())',[id(n),`behavior${n}@example.com`])
 await db.query("insert into public.institutions(id,name) values($1,'Escuela Uno'),($2,'Escuela Dos')",[id(101),id(102)])
 for(const[u,role,school]of[[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'apoderado',101],[6,'docente',101],[8,'administrador',102],[9,'apoderado',101],[10,'docente',101]])await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(u),role])
 const time=(await db.query("select ((now() at time zone 'America/Lima')::date)::text as day,extract(year from now() at time zone 'America/Lima')::int as year,now()::text instant")).rows[0]
 for(const[room,school]of[[201,101],[202,101],[203,102]])await db.query("insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,$3,'Secundaria','1',$4)",[id(room),id(school),time.year,String(room)])
 for(const[student,school,room]of[[301,101,201],[302,101,201],[303,101,202],[304,102,203]])await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names) values($1,$2,$3,'Alumno','Prueba')",[id(student),id(school),id(room)])
 for(const[u,room]of[[4,201],[6,202]])await db.query('insert into public.teacher_assignments(institution_id,classroom_id,user_id) values($1,$2,$3)',[id(101),id(room),id(u)])
 await db.query("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Padre'),($1,$4,$5,'Madre')",[id(101),id(301),id(5),id(303),id(9)])
 let checks=0
 async function as(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated')}
 async function rejected(fn,code){await assert.rejects(fn,e=>e.code===code);checks++}
 async function count(table,n){const r=await db.query(`select count(*)::int n from public.${table}`);assert.equal(r.rows[0].n,n,table);checks++}
 async function period(name='Periodo de prueba',school=101,year=time.year){return(await db.query('select public.create_behavior_period($1,$2,$3,$4,$5) id',[id(school),name,year,`${year}-01-01`,`${year}-12-31`])).rows[0].id}
 async function rubric(confirmed=true,school=101){return(await db.query('select public.register_behavior_rubric($1,$2,$3,$4,$5) id',[id(school),'Rúbrica ficticia','Acta de prueba','Criterios de prueba institucional. La nota final debe sustentarse por el evaluador; sin descuentos automáticos.',confirmed])).rows[0].id}
 await as(1);const p=await period(),r=await rubric()
 await rejected(()=>period('periodo de prueba'),'23505')
 await rejected(()=>rubric(false),'22023')
 await as(3);await rejected(()=>period('Otro'),'42501');await rejected(()=>rubric(),'42501')
 await as(8);const otherPeriod=await period('Otro',102),otherRubric=await rubric(true,102)
 async function record(options={}){const{school=101,student=301,selectedPeriod=p,kind='incident',criterion='coexistence',date=time.instant,place='Patio',facts='Hechos objetivos observados durante el recreo.',statement='Versión reservada del estudiante'}=options;return(await db.query('select public.add_behavior_record($1,$2,$3,$4,$5,$6,$7,$8,$9) id',[id(school),id(student),selectedPeriod,kind,criterion,date,place,facts,statement])).rows[0].id}
 async function detail(student=301,selectedPeriod=p,school=101){return(await db.query('select public.behavior_student_detail($1,$2,$3) d',[id(school),id(student),selectedPeriod])).rows[0].d}
 async function communicate(recordId,visible=true){return db.query('select public.communicate_behavior_record($1,$2,$3,$4,$5)',[id(101),recordId,'Resumen revisado y adecuado para la familia.',visible,'Revisión de hechos con el estudiante'])}
 async function follow(recordId,visible=false){return db.query('select public.add_behavior_followup($1,$2,$3,$4,$5)',[id(101),recordId,visible?'Acuerdo compartido con la familia.':'Nota reservada para el personal.','pending',visible])}
 await as(3);const incident=await record(),positive=await record({kind:'recognition',criterion:'responsibility',facts:'Cumplió el compromiso de devolver los materiales.'})
 await rejected(()=>record({facts:'corto'}),'22023');await rejected(()=>record({student:304}),'42501');await rejected(()=>record({selectedPeriod:otherPeriod}),'22023')
 await rejected(()=>record({date:new Date(Date.parse(time.instant)+86400000).toISOString()}),'22023')
 await rejected(()=>record({criterion:'otro'}),'22023')
 await follow(incident);await rejected(()=>follow(incident,true),'42501');await rejected(()=>communicate(incident),'42501')
 await as(5);await count('behavior_records',0);await count('behavior_followups',0);assert.equal((await detail()).records.length,0);checks++
 await as(4);await follow(incident,true);await communicate(incident)
 await as(5);let d=await detail();assert.equal(d.records.length,1);checks++
 assert.equal(d.records[0].description,'Resumen revisado y adecuado para la familia.');checks++
 assert.equal(d.records[0].student_version,null);checks++
 assert.equal(d.records[0].location,null);checks++
 assert.deepEqual(d.records[0].followups.map(f=>f.note),['Acuerdo compartido con la familia.']);checks++
 await count('behavior_records',0);await count('behavior_followups',0);await count('behavior_audit',0)
 await rejected(()=>detail(302),'42501');await rejected(()=>record(),'42501')
 await as(6);await rejected(()=>detail(),'42501');await rejected(()=>communicate(positive),'42501')
 await as(4)
 async function save(revision,values={},correction=null,student=301,selectedPeriod=p){return(await db.query('select public.save_behavior_evaluation($1,$2,$3,$4,$5::jsonb,$6) id',[id(101),id(student),selectedPeriod,revision,JSON.stringify(values),correction])).rows[0].id}
 const evaluation=await save(-1)
 async function publish(revision,visible=true,reason=null){return db.query('select public.publish_behavior_evaluation($1,$2,$3,$4,$5)',[id(101),evaluation,revision,visible,reason])}
 await rejected(()=>publish(0),'P0001')
 for(const value of [-1,21,'NaN'])await rejected(()=>save(0,{presentation:value},'Corrección de prueba'),'22023')
 await rejected(()=>save(0,{rubric_id:otherRubric},'Corrección de prueba'),'22023')
 await rejected(()=>save(0,{}),'22023')
 await rejected(()=>save(-1,{},'Corrección de prueba'),'P0001')
 const scores={rubric_id:r,presentation:18,punctuality:12,coexistence:17,responsibility:16,final_score:15,rationale:'Valoración sustentada por el evaluador aplicando la rúbrica institucional y los antecedentes revisados.'}
 await save(0,scores,'Completar evaluación revisada')
 d=await detail();assert.equal(d.evaluation.final_score,15);checks++
 assert.equal(d.evaluation.revision,1);checks++
 await as(5);await count('behavior_evaluations',0);assert.equal((await detail()).evaluation,null);checks++
 await as(3);await rejected(()=>save(1,scores,'Intento de auxiliar'),'42501');assert.equal((await detail()).evaluation,null);checks++
 await as(4);await publish(1)
 await rejected(()=>save(2,scores,'Intento en nota publicada'),'P0001')
 await as(5);await count('behavior_evaluations',1);d=await detail();assert.equal(d.evaluation.final_score,15);checks++
 await as(9);await count('behavior_evaluations',0);await rejected(()=>detail(),'42501')
 await as(4);await rejected(()=>publish(2,false,'Reabrir para corregir'),'42501')
 await as(2);await rejected(()=>publish(2,false),'22023');await publish(2,false,'Revisión solicitada por la familia')
 await as(5);assert.equal((await detail()).evaluation,null);checks++
 await as(4);await rejected(()=>save(2,scores,'Conflicto de versión'),'P0001');await save(3,{...scores,final_score:16},'Corrección fundamentada por revisión');await publish(4)
 await as(5);assert.equal((await detail()).evaluation.final_score,16);checks++
 await as(4);await communicate(incident,false)
 await as(5);assert.equal((await detail()).records.length,0);checks++
 await as(4);await communicate(incident)
 // Attendance is contextual and counted separately. No grade calculation is triggered.
 await db.exec('reset role')
 const gateEarly=randomUUID()
 await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,first_entry,is_late) values($1,$2,$3,$4::date,$5::timestamptz,'entry','dni',$6,$7,true,true)",[id(101),id(301),id(201),time.day,time.instant,id(3),randomUUID()])
 await db.query("insert into public.gate_events(id,institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,reason,authorized_by,expects_return) values($1,$2,$3,$4,$5::date,$6::timestamptz,'early_exit','dni',$7,$8,'salud','Dirección',true)",[gateEarly,id(101),id(301),id(201),time.day,time.instant,id(3),randomUUID()])
 await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,return_of) values($1,$2,$3,$4::date,$5::timestamptz,'return','dni',$6,$7,$8)",[id(101),id(301),id(201),time.day,time.instant,id(3),randomUUID(),gateEarly])
 await as(1);const course=(await db.query("select public.create_school_course($1,'Prueba') id",[id(101)])).rows[0].id
 const lesson=(await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:00','23:59:59') id",[id(101),id(201),course,id(4),time.day])).rows[0].id
 await as(4);await db.query('select public.save_class_attendance($1,$2,0,$3::jsonb)',[id(101),lesson,JSON.stringify([{student_id:id(301),status:'late'},{student_id:id(302),status:'absent'}])]);await db.query("select public.change_class_session_state($1,$2,1,'closed')",[id(101),lesson])
 await as(5);d=await detail();assert.equal(d.gate.first_entries,1);checks++;assert.equal(d.gate.late_entries,1);checks++;assert.equal(d.gate.early_exits,1);checks++;assert.equal(d.classes.late,1);checks++;assert.equal(d.classes.absent,0);checks++;assert.equal(d.evaluation.final_score,16);checks++
 await as(1);const futurePeriod=await period('Periodo futuro',101,time.year+1)
 await as(4);const futureEvaluation=await save(-1,scores,null,301,futurePeriod)
 await rejected(()=>db.query('select public.publish_behavior_evaluation($1,$2,0,true)',[id(101),futureEvaluation]),'P0001')
 await as(4);await rejected(()=>db.query('update public.behavior_evaluations set final_score=20'),'42501');await rejected(()=>db.query('delete from public.behavior_audit'),'42501')
 await as(10);await rejected(()=>detail(),'42501')
 await as(7);await count('behavior_evaluations',0);await rejected(()=>detail(),'42501')
 await as(8);await count('behavior_evaluations',0);await rejected(()=>detail(),'42501')
 await db.exec('reset role;set role anon');await rejected(()=>db.query('select * from public.behavior_evaluations'),'42501');await rejected(()=>detail(),'42501')
 console.log(`${checks} behavior evaluation, privacy and evidence checks passed`)
}catch(e){console.error({message:e.message,code:e.code,where:e.where,position:e.position,stack:e.code?undefined:e.stack});process.exitCode=1}finally{await db.close()}
