import{PGlite}from'@electric-sql/pglite'
import{readFileSync}from'node:fs'
import{randomUUID}from'node:crypto'
import assert from'node:assert/strict'
const db=new PGlite()
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 const files=['202611050001_school_foundation.sql','202611050002_unified_student_import.sql','202611050003_gate_attendance.sql','202611050004_class_attendance.sql','202611050005_behavior.sql','202611050006_student_reports.sql','202611050007_management_reports.sql']
 for(const file of files)await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
 for(let n=1;n<=8;n++)await db.query('insert into auth.users values($1,$2,now())',[id(n),`enroll${n}@example.com`])
 await db.query("insert into public.institutions(id,name) values($1,'Escuela Uno'),($2,'Escuela Dos')",[id(101),id(102)])
 for(const[u,role,school]of[[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'apoderado',101],[6,'docente',101],[8,'administrador',102]])await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(u),role])
 const time=(await db.query("select (now() at time zone 'America/Lima')::date::text as day,((now() at time zone 'America/Lima')::date-1)::text past,((now() at time zone 'America/Lima')::date+1)::text future,extract(year from now() at time zone 'America/Lima')::int as year")).rows[0]
 for(const[room,school,year,section]of[[201,101,time.year,'A'],[202,101,time.year,'B'],[203,101,time.year+1,'A'],[204,101,time.year+1,'B'],[205,101,time.year-1,'A'],[206,102,time.year,'A']])await db.query("insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,$3,'Secundaria','1',$4)",[id(room),id(school),year,section])
 for(const[student,school,room,active]of[[301,101,201,true],[302,101,202,true],[303,101,205,true],[304,102,206,true],[305,101,201,false]])await db.query("insert into public.students(id,institution_id,classroom_id,dni,first_names,last_names,active) values($1,$2,$3,$4,'Alumno','Prueba',$5)",[id(student),id(school),id(room),String(98000000+student),active])
 for(const[u,room]of[[4,201],[4,205],[6,202]])await db.query('insert into public.teacher_assignments(institution_id,classroom_id,user_id) values($1,$2,$3)',[id(101),id(room),id(u)])
 await db.query("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Padre'),($1,$4,$3,'Padre')",[id(101),id(301),id(5),id(303)])
 let checks=0
 function eq(a,b,label){assert.deepEqual(a,b,label);checks++}
 async function as(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated')}
 async function rejected(fn,code){await assert.rejects(fn,code?e=>e.code===code:undefined);checks++}
 async function period(year,name,end=`${year}-12-31`){return(await db.query('select public.create_behavior_period($1,$2,$3,$4,$5) id',[id(101),name,year,`${year}-01-01`,end])).rows[0].id}
 await as(1)
 const pYear=await period(time.year,'Año actual'),pOld=await period(time.year-1,'Año anterior')
 const closedEnd=Number(time.past.slice(0,4))===time.year?time.past:time.day
 const pPast=await period(time.year,'Periodo de referencia',closedEnd)
 const course=(await db.query("select public.create_school_course($1,'Matemática') id",[id(101)])).rows[0].id
 const rubric=(await db.query("select public.register_behavior_rubric($1,'Rúbrica prueba','Acta ficticia','Criterios institucionales de prueba para valoración manual y sustentada.',true) id",[id(101)])).rows[0].id
 const lessons=[]
 for(const[student,room,teacher,year,p,day]of[[301,201,4,time.year,pPast,closedEnd],[303,205,4,time.year-1,pOld,`${time.year-1}-06-01`]]){
  const lesson=(await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:00','00:01') id",[id(101),id(room),course,id(teacher),day])).rows[0].id
  await db.query('select public.save_class_attendance($1,$2,0,$3::jsonb)',[id(101),lesson,JSON.stringify([{student_id:id(student),status:'present'}])]);await db.query("select public.change_class_session_state($1,$2,1,'closed')",[id(101),lesson]);lessons.push(lesson)
  const evaluation=(await db.query('select public.save_behavior_evaluation($1,$2,$3,-1,$4::jsonb) id',[id(101),id(student),p,JSON.stringify({rubric_id:rubric,presentation:17,punctuality:17,coexistence:17,responsibility:17,final_score:17,rationale:'Valoración de prueba publicada antes de activar las matrículas.'})])).rows[0].id
  await db.query('select public.publish_behavior_evaluation($1,$2,0,true)',[id(101),evaluation])
  await db.exec('reset role');await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,first_entry) values($1,$2,$3,$4::date,($4::date+time '08:00') at time zone 'America/Lima','entry','dni',$5,$6,true)",[id(101),id(student),id(room),day,id(3),randomUUID()]);await as(1)
 }
 const token=(await db.query('select public.get_student_gate_code($1,$2) c',[id(101),id(301)])).rows[0].c
 async function individual(student,p){return(await db.query('select public.student_period_report($1,$2,$3) r',[id(101),id(student),p])).rows[0].r}
 const original=await individual(303,pOld)
 const originals={}
 for(const table of ['gate_events','class_roster','behavior_evaluations','student_guardians'])originals[table]=(await db.query(`select to_jsonb(t) x from public.${table} t order by to_jsonb(t)::text`)).rows.map(r=>r.x)
 await db.exec('reset role');await db.exec(readFileSync(new URL('../supabase/migrations/202611050008_enrollment_history.sql',import.meta.url),'utf8'))
 await as(1)
 async function detail(student=301){return(await db.query('select public.student_enrollment_detail($1,$2) d',[id(101),id(student)])).rows[0].d}
 async function profile(student=301){return(await db.query('select classroom_id,active,enrollment_revision from public.students where id=$1',[id(student)])).rows[0]}
 async function change(operation,options={}){
  const{student=301,target=null,enrollment=null,request=randomUUID(),reason='Motivo administrativo de prueba autorizado',revision}=options
  const expected=revision??(await detail(student)).revision
  return(await db.query('select public.change_student_enrollment($1,$2,$3,$4,$5,$6,$7,$8) r',[id(101),id(student),operation,target===null?null:id(target),enrollment,expected,request,reason])).rows[0].r
 }
 async function management(p=pPast,year=time.year,state='all'){return(await db.query('select public.management_period_report($1,$2,$3,null,null,null,$4) r',[id(101),p,year,state])).rows[0].r}
 let d=await detail();eq(d.enrollments.length,1);eq(d.enrollments[0].placements[0].from,null);eq(d.enrollments[0].source,'legacy_snapshot');eq((await profile()).classroom_id,id(201));eq((await management()).cohort_basis,'enrollment_history')
 await rejected(()=>db.query('update public.students set active=false where id=$1',[id(301)]),'42501');await rejected(()=>db.query('update public.students set classroom_id=$1 where id=$2',[id(202),id(301)]),'42501')
 const request=randomUUID(),prepared=await change('plan',{target:203,request});eq(prepared.repeated,false)
 d=await detail();let planned=d.enrollments.find(e=>e.year===time.year+1);const active=d.enrollments.find(e=>e.year===time.year)
 eq(planned.state,'planned');eq((await profile()).classroom_id,id(201));eq((await profile()).active,true)
 eq((await change('plan',{target:203,request,revision:0})).repeated,true);eq((await detail()).revision,1)
 await rejected(()=>change('plan',{target:203}),'P0001');await rejected(()=>change('activate',{enrollment:planned.id}),'P0001')
 eq((await profile()).classroom_id,id(201))
 await change('cancel_plan',{enrollment:planned.id});await change('plan',{target:204});d=await detail();planned=d.enrollments.find(e=>e.year===time.year+1);eq(planned.classroom_id,id(204));eq(planned.id,d.enrollments.find(e=>e.year===time.year+1).id)
 await rejected(()=>change('transfer',{enrollment:active.id,target:203}),'22023');await rejected(()=>change('transfer',{enrollment:active.id,target:206}),'22023');await rejected(()=>change('transfer',{enrollment:active.id,target:202,revision:0}),'P0001');await rejected(()=>change('plan',{target:null}),'22023')
 await change('transfer',{enrollment:active.id,target:202});eq((await profile()).classroom_id,id(202))
 d=await detail();eq(d.enrollments.find(e=>e.id===active.id).placements.length,2)
 if(closedEnd!==time.day){const old=(await management()).students.find(s=>s.id===id(301));eq(old.classroom_id,id(201));eq(old.final_score,17);eq((await individual(301,pPast)).student.period_classroom.includes(' A'),true)}
 eq((await management(pYear)).students.find(s=>s.id===id(301)).classroom_id,id(202))
 eq((await db.query('select public.get_student_gate_code($1,$2) c',[id(101),id(301)])).rows[0].c,token)
 await db.query("select public.record_gate_event($1,$2,'entry','qr',$3,null,null,null,null,false,$4)",[id(101),id(301),randomUUID(),token]).catch(async e=>{if(e.message!=='GATE_INVALID_TRANSITION')throw e})
 await change('withdraw',{enrollment:active.id});eq((await profile()).active,false)
 await rejected(()=>db.query("select public.record_gate_event($1,$2,'entry','dni',$3)",[id(101),id(301),randomUUID()]),'P0001')
 eq((await management(pYear,time.year,'inactive')).students.some(s=>s.id===id(301)),true)
 await change('reactivate',{enrollment:active.id,target:202});eq((await profile()).active,true);eq((await detail()).enrollments.find(e=>e.id===active.id).placements.length,3)
 // Past session rosters use the placement at the class time, not the live profile.
 await as(4)
 const pastLesson=(await db.query("select public.create_class_session($1,$2,$3,$4,$5,'00:02','00:03') id",[id(101),id(201),course,id(4),closedEnd])).rows[0].id
 const roster=(await db.query('select public.class_session_detail($1,$2) d',[id(101),pastLesson])).rows[0].d.students
 eq(roster.some(s=>s.id===id(301)),true)
 await rejected(()=>detail(),'42501');await rejected(()=>change('withdraw',{enrollment:active.id,revision:0}),'42501')
 await as(5);d=await detail();eq(d.manager,false);eq(d.events.length,0)
 eq((await db.query('select count(*)::int n from public.enrollment_events')).rows[0].n,0)
 const rooms=(await db.query('select id from public.classrooms where id in ($1,$2,$3)',[id(201),id(202),id(204)])).rows.map(r=>r.id);eq(rooms.length,3)
 await rejected(()=>db.query('select public.enrollment_cohort($1,$2,$3,$4)',[id(101),`${time.year}-01-01`,`${time.year}-12-31`,time.year]),'42501')
 await as(1)
 // Activate a current-year plan from a prior-year enrollment without rewriting history.
 const oldEnrollment=(await detail(303)).enrollments[0].id
 await change('plan',{student:303,target:202});const current=(await detail(303)).enrollments.find(e=>e.year===time.year)
 await change('activate',{student:303,enrollment:current.id});eq((await profile(303)).classroom_id,id(202));eq((await detail(303)).enrollments.find(e=>e.id===oldEnrollment).state,'completed')
 const after=await individual(303,pOld);eq(after.classes,original.classes);eq(after.gate_events,original.gate_events);eq(after.evaluation,original.evaluation);eq(after.student.period_classroom.includes(String(time.year-1)),true)
 eq((await management(pOld,time.year-1)).students.find(s=>s.id===id(303)).classroom_id,id(205))
 // Batch rollback: an invalid later pupil must undo the earlier plan and revision.
 await change('plan',{student:303,target:203});let future=(await detail(303)).enrollments.find(e=>e.year===time.year+1)
 let batch=[{student_id:id(302),revision:(await detail(302)).revision,request:randomUUID()},{student_id:id(303),revision:(await detail(303)).revision,request:randomUUID()}]
 const revision302=(await detail(302)).revision
 await rejected(()=>db.query('select public.plan_enrollment_batch($1,$2,$3,$4::jsonb,$5)',[id(101),id(202),id(203),JSON.stringify(batch),'Preparación de lote autorizada por dirección']),'P0001')
 eq((await detail(302)).revision,revision302);eq((await detail(302)).enrollments.some(e=>e.year===time.year+1),false)
 await change('cancel_plan',{student:303,enrollment:future.id})
 batch=[{student_id:id(302),revision:(await detail(302)).revision,request:randomUUID()},{student_id:id(303),revision:(await detail(303)).revision,request:randomUUID()}]
 const runBatch=()=>db.query('select public.plan_enrollment_batch($1,$2,$3,$4::jsonb,$5) n',[id(101),id(202),id(203),JSON.stringify(batch),'Preparación de lote autorizada por dirección'])
 eq((await runBatch()).rows[0].n,2);const versions=[(await detail(302)).revision,(await detail(303)).revision];eq((await runBatch()).rows[0].n,2);eq([(await detail(302)).revision,(await detail(303)).revision],versions)
 eq((await profile(302)).classroom_id,id(202));eq((await profile(303)).classroom_id,id(202))
 // Every profile insertion path gets a year-specific enrollment automatically.
 await as(3)
 for(const[student,room,state]of[[401,201,'active'],[402,203,'planned'],[403,205,'completed']]){
  await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names,active) values($1,$2,$3,'Alumno nuevo','Prueba',true)",[id(student),id(101),id(room)])
  eq((await detail(student)).enrollments[0].state,state);eq((await profile(student)).active,state==='active')
 }
 const futureProfile=await detail(402);await rejected(()=>change('activate',{student:402,enrollment:futureProfile.enrollments[0].id,revision:0}),'42501')
 await rejected(()=>db.query('update public.students set active=true where id=$1',[id(402)]),'42501')
 await as(2);await rejected(()=>change('activate',{student:402,enrollment:futureProfile.enrollments[0].id}),'P0001')
 await db.query('select public.import_school_students($1,$2::jsonb)',[id(101),JSON.stringify([{dni:'97000001',first_names:'Importado',last_names:'Futuro',academic_year:time.year+1,level:'Secundaria',grade:'2',section:'A'}])])
 eq((await db.query("select s.active,e.state from public.students s join public.student_enrollments e on e.student_id=s.id where s.dni='97000001'")).rows[0],{active:false,state:'planned'})
 await rejected(()=>db.query('delete from public.enrollment_events'),'42501');await rejected(()=>db.query("update public.student_enrollments set state='active'"),'42501')
 // Original educational records and family links are intact, byte-for-byte in JSON.
 await db.exec('reset role')
 for(const[table,rows]of Object.entries(originals)){
  const current=(await db.query(`select to_jsonb(t) x from public.${table} t`)).rows.map(r=>r.x)
  for(const row of rows)eq(current.some(x=>JSON.stringify(x)===JSON.stringify(row)),true,table)
 }
 for(const user of[7,8]){await as(user);await rejected(()=>detail(),'42501');await rejected(()=>change('plan',{target:203,revision:0}),'42501')}
 await db.exec('reset role;set role anon');await rejected(()=>detail(),'42501')
 console.log(`${checks} enrollment migration, transfer, withdrawal, renewal, history and permission checks passed`)
}catch(e){console.error({message:e.message,code:e.code,where:e.where,stack:e.code?undefined:e.stack});process.exitCode=1}finally{await db.close()}
