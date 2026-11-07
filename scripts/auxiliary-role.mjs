import{PGlite}from'@electric-sql/pglite'
import{readFileSync}from'node:fs'
import{randomUUID}from'node:crypto'
import assert from'node:assert/strict'
const db=new PGlite();let checks=0
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 for(const f of ['202611050001_school_foundation.sql','202611050002_unified_student_import.sql','202611050003_gate_attendance.sql','202611050004_class_attendance.sql','202611050005_behavior.sql','202611050006_student_reports.sql','202611050007_management_reports.sql','202611050008_enrollment_history.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'))
 for(let u=1;u<=7;u++)await db.query('insert into auth.users values($1,$2,now())',[id(u),`aux${u}@example.test`])
 await db.query("insert into public.institutions values($1,'Escuela A'),($2,'Escuela B')",[id(101),id(102)])
 for(const [user,role,school]of[[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'apoderado',101],[7,'administrador',102]])await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(user),role])
 const {task_year:year,task_day:day,task_future:future,task_past:past}=(await db.query("select extract(year from now() at time zone 'America/Lima')::int as task_year,(now() at time zone 'America/Lima')::date::text as task_day,((now() at time zone 'America/Lima')::date+1)::text as task_future,((now() at time zone 'America/Lima')::date-1)::text as task_past")).rows[0]
 for(const [room,school,section]of[[201,101,'A'],[202,101,'B'],[203,102,'A']])await db.query("insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,$3,'Primaria','1',$4)",[id(room),id(school),year,section])
 for(const [student,school,room]of[[301,101,201],[302,101,201],[303,101,202],[304,102,203]])await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names,dni) values($1,$2,$3,'Alumno','Prueba',$4)",[id(student),id(school),id(room),String(98000000+student)])
 async function as(u){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u?id(u):'']);await db.exec(u?'set role authenticated':'set role anon')}
 async function reject(fn,code){await assert.rejects(fn,code?e=>e.code===code:undefined);checks++}
 async function roomReport(room=201,school=101,date=day){return(await db.query('select public.gate_classroom_report($1,$2,$3) r',[id(school),id(room),date])).rows[0].r}
 await as(1)
 const period=(await db.query('select public.create_behavior_period($1,$2,$3,$4,$5) p',[id(101),'Periodo de prueba',year,`${year}-01-01`,`${year}-12-31`])).rows[0].p
 const qr=(await db.query('select public.get_student_gate_code($1,$2) qr',[id(101),id(301)])).rows[0].qr
 await db.query("select public.set_gate_schedule($1,$2,'00:00',0)",[id(101),id(201)])
 await as(3)
 assert.equal((await db.query('select public.get_student_gate_code($1,$2) qr',[id(101),id(301)])).rows[0].qr,qr);checks++
 await db.exec('reset role');await db.exec(readFileSync(new URL('../supabase/migrations/202611070009_auxiliary_gate_role.sql',import.meta.url),'utf8'))
 await as(3)
 await reject(()=>db.query("insert into public.students(institution_id,classroom_id,first_names,last_names) values($1,$2,'No','Permitido')",[id(101),id(201)]),'42501')
 const before=(await db.query('select first_names from public.students where id=$1',[id(301)])).rows[0].first_names
 await db.query("update public.students set first_names='No permitido' where id=$1",[id(301)]);assert.equal((await db.query('select first_names from public.students where id=$1',[id(301)])).rows[0].first_names,before);checks++
 await reject(()=>db.query('select public.import_school_students($1,$2::jsonb)',[id(101),'[]']),'42501')
 await reject(()=>db.query('select public.get_student_gate_code($1,$2)',[id(101),id(301)]),'42501')
 await reject(()=>db.query('select public.get_student_gate_code($1,$2,true)',[id(101),id(301)]),'42501')
 assert.equal((await db.query('select * from public.student_gate_codes')).rows.length,0);checks++
 assert.equal((await db.query('select public.find_gate_qr($1,$2) s',[id(101),qr])).rows[0].s,id(301));checks++
 assert.equal((await db.query('select * from public.student_enrollments')).rows.length,0);checks++
 await reject(()=>db.query('select public.student_enrollment_detail($1,$2)',[id(101),id(301)]),'42501')
 await reject(()=>db.query("insert into public.classrooms(institution_id,academic_year,level,grade,section) values($1,$2,'Primaria','2','A')",[id(101),year]),'42501')
 await reject(()=>db.query("select public.set_gate_schedule($1,$2,'08:00',0)",[id(101),id(201)]),'42501')
 const first=await roomReport();assert.equal(first.students.length,2);checks++;assert.equal(first.summary.not_registered,2);checks++;assert.ok(!JSON.stringify(first).includes('absent'));checks++
 await reject(()=>roomReport(203,102),'42501');await reject(()=>roomReport(203),'22023');await reject(()=>roomReport(201,101,future),'22023')
 async function mark(kind,options={}){return db.query('select public.record_gate_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id(101),id(301),kind,'qr',options.request??randomUUID(),options.reason??null,null,options.authorization??null,null,options.willReturn??false,qr])}
 const request=randomUUID();await mark('entry',{request});await mark('entry',{request})
 let report=await roomReport();assert.equal(report.summary.first_entries,1);checks++;assert.equal(report.summary.late_entries,1);checks++;assert.equal(report.summary.not_registered,1);checks++;assert.equal(report.students.find(s=>s.id===id(301)).state,'inside');checks++
 await reject(()=>mark('early_exit',{reason:'salud'}),'22023')
 await mark('early_exit',{reason:'salud',authorization:'Dirección de prueba',willReturn:true});report=await roomReport();assert.equal(report.summary.awaiting_return,1);checks++;assert.equal(report.summary.early_exits,1);checks++
 await mark('return');report=await roomReport();assert.equal(report.summary.returns,1);checks++;assert.equal(report.summary.inside,1);checks++;assert.equal(report.summary.first_entries,1);checks++
 const individual=(await db.query('select public.student_period_report($1,$2,$3) r',[id(101),id(301),period])).rows[0].r
 assert.equal(individual.can_classes,false);checks++;assert.equal(individual.can_behavior,false);checks++;assert.equal(individual.gate_events.length,3);checks++
 for(const user of [4,5,6,7]){await as(user);await reject(()=>roomReport(),'42501')}
 for(const user of [1,2]){await as(user);assert.equal((await roomReport()).summary.first_entries,1);checks++}
 await as(1)
 await db.query("select public.change_student_enrollment($1,$2,'transfer',$3,$4,0,$5,'Cambio de salón autorizado para probar el historial')",[id(101),id(301),id(202),(await db.query('select id from public.student_enrollments where student_id=$1',[id(301)])).rows[0].id,randomUUID()])
 await as(3);assert.equal((await roomReport(201)).students.length,1);checks++;assert.equal((await roomReport(202)).summary.first_entries,1);checks++
 if(past.startsWith(String(year))){assert.ok((await roomReport(201,101,past)).students.some(s=>s.id===id(301)));checks++}
 await as(null);await reject(()=>roomReport(),'42501')
 console.log(`${checks} auxiliary restrictions, QR entry, authorized exits, daily classroom report, PDF source privacy and historical enrollment checks passed`)
}catch(e){console.error({message:e.message,code:e.code,where:e.where});process.exitCode=1}finally{await db.close()}
