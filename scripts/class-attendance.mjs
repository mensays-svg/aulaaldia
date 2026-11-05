import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const db=new PGlite()
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
 for(const file of ['202611050001_school_foundation.sql','202611050002_unified_student_import.sql','202611050003_gate_attendance.sql','202611050004_class_attendance.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
 for(let n=1;n<=10;n++)await db.query('insert into auth.users values($1,$2,now())',[id(n),`class${n}@example.com`])
 await db.query("insert into public.institutions(id,name) values($1,'Escuela Uno'),($2,'Escuela Dos')",[id(101),id(102)])
 for(const [u,role,school]of[[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'apoderado',101],[6,'docente',101],[8,'administrador',102],[9,'docente',101],[10,'apoderado',101]])await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(u),role])
 const dates=(await db.query("select ((now() at time zone 'America/Lima')::date-1)::text past,((now() at time zone 'America/Lima')::date+1)::text future")).rows[0]
 for(const[room,school,year]of[[201,101,Number(dates.past.slice(0,4))],[202,101,Number(dates.past.slice(0,4))],[203,102,Number(dates.past.slice(0,4))],[204,101,Number(dates.future.slice(0,4))],[205,101,Number(dates.past.slice(0,4))]])await db.query("insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,$3,'Secundaria','1',$4)",[id(room),id(school),year,String(room)])
 for(const[student,school,room,active]of[[301,101,201,true],[302,101,201,true],[303,101,202,true],[304,102,203,true],[305,101,201,false],[306,101,204,true]])await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names,active) values($1,$2,$3,'Alumno','Prueba',$4)",[id(student),id(school),id(room),active])
 for(const[user,room]of[[4,201],[4,202],[4,204],[4,205],[6,201]])await db.query('insert into public.teacher_assignments(institution_id,classroom_id,user_id) values($1,$2,$3)',[id(101),id(room),id(user)])
 await db.query("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Padre'),($1,$4,$5,'Madre')",[id(101),id(301),id(5),id(303),id(10)])
 const early=randomUUID()
 await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,first_entry) values($1,$2,$3,$4::date,($4::date+time '07:00') at time zone 'America/Lima','entry','dni',$5,$6,true)",[id(101),id(301),id(201),dates.past,id(3),randomUUID()])
 await db.query("insert into public.gate_events(id,institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,reason,authorized_by,expects_return) values($1,$2,$3,$4,$5::date,($5::date+time '08:15') at time zone 'America/Lima','early_exit','dni',$6,$7,'salud','Dirección',true)",[early,id(101),id(301),id(201),dates.past,id(3),randomUUID()])
 await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,return_of) values($1,$2,$3,$4::date,($4::date+time '09:30') at time zone 'America/Lima','return','dni',$5,$6,$7)",[id(101),id(301),id(201),dates.past,id(3),randomUUID(),early])
 let checks=0
 async function as(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated')}
 async function rejected(fn,code){await assert.rejects(fn,e=>e.code===code);checks++}
 async function count(table,n){const r=await db.query(`select count(*)::int n from public.${table}`);assert.equal(r.rows[0].n,n,table);checks++}
 async function course(name,school=101){return(await db.query('select public.create_school_course($1,$2) id',[id(school),name])).rows[0].id}
 await as(1);const math=await course('Matemática'),language=await course('Comunicación')
 await rejected(()=>course('matemática'),'23505')
 await as(3);await rejected(()=>course('Otro'),'42501')
 await as(8);const other=await course('Otro colegio',102)
 async function create(options={}){const{room=201,course=math,teacher=4,day=dates.past,start='08:00',end='09:00',school=101}=options;return(await db.query('select public.create_class_session($1,$2,$3,$4,$5,$6,$7,$8) id',[id(school),id(room),course,id(teacher),day,start,end,'Tema de prueba'])).rows[0].id}
 await as(4);const lesson=await create()
 const mark=(student,status,note='')=>({student_id:id(student),status,note})
 async function detail(session=lesson,school=101){return(await db.query('select public.class_session_detail($1,$2) d',[id(school),session])).rows[0].d}
 async function save(revision,marks,correction=null,session=lesson){return(await db.query('select public.save_class_attendance($1,$2,$3,$4::jsonb,$5) r',[id(101),session,revision,JSON.stringify(marks),correction])).rows[0].r}
 async function state(revision,value,reason=null){return(await db.query('select public.change_class_session_state($1,$2,$3,$4,$5) r',[id(101),lesson,revision,value,reason])).rows[0].r}
 let d=await detail();assert.equal(d.students.length,2);checks++
 assert.equal(d.students.find(s=>s.id===id(301)).gate_kind,'early_exit');checks++
 assert.ok(d.students.every(s=>s.status===null));checks++
 await rejected(()=>create({start:'08:30',end:'09:30',course:language}),'P0001')
 await rejected(()=>create({room:202,start:'08:30',end:'09:30'}),'P0001')
 await rejected(()=>create({room:205}),'P0001')
 await rejected(()=>create({course:other,start:'10:00',end:'11:00'}),'22023')
 await rejected(()=>create({teacher:6,start:'10:00',end:'11:00'}),'42501')
 await rejected(()=>create({teacher:9,start:'10:00',end:'11:00'}),'42501')
 await rejected(()=>create({start:'10:00',end:'09:00'}),'22023')
 await rejected(()=>save(0,[mark(301,'present'),mark(302,'justified')]),'22023')
 await count('class_attendance',0);await count('class_attendance_changes',0)
 assert.equal(await save(0,[mark(301,'present')]),1);checks++
 await rejected(()=>state(1,'closed'),'P0001')
 await rejected(()=>save(0,[mark(302,'absent')]),'P0001')
 await rejected(()=>save(1,[mark(301,'late')]),'22023')
 assert.equal(await save(1,[mark(302,'justified','Permiso documentado')]),2);checks++
 assert.equal(await save(2,[mark(301,'present'),mark(302,'justified','Permiso documentado')]),2);checks++
 await count('class_attendance_changes',2)
 await rejected(()=>save(2,[mark(301,'late'),mark(303,'absent')],'Revisión'),'42501')
 d=await detail();assert.equal(d.students.find(s=>s.id===id(301)).status,'present');checks++
 await count('class_attendance_changes',2)
 assert.equal(await save(2,[mark(301,'late')],'Verificación del docente'),3);checks++
 await as(5);await count('class_sessions',0);await count('class_attendance',0);await rejected(()=>detail(),'42501')
 await as(4);assert.equal(await state(3,'closed'),4);checks++
 await rejected(()=>save(4,[mark(301,'absent')],'Corrección'),'P0001')
 await as(5);await count('class_sessions',1);await count('class_roster',1);await count('class_attendance',1);await count('class_attendance_changes',0);await count('class_session_logs',0)
 d=await detail();assert.deepEqual(d.students.map(s=>s.id),[id(301)]);checks++
 await rejected(()=>save(4,[mark(301,'present')]),'42501');await rejected(()=>state(4,'draft','Cambio'),'42501')
 await as(10);await count('class_sessions',0);await rejected(()=>detail(),'42501')
 await as(6);d=await detail();assert.equal(d.can_edit,false);checks++
 await rejected(()=>save(4,[mark(301,'present')]),'42501')
 await as(3);await count('class_sessions',0);await rejected(()=>detail(),'42501')
 await as(9);await count('class_sessions',0);await rejected(()=>detail(),'42501')
 await as(4);await rejected(()=>state(4,'draft','Corregir'),'42501')
 await as(2);await rejected(()=>state(4,'draft'),'22023');assert.equal(await state(4,'draft','Solicitud del docente'),5);checks++
 await as(5);await count('class_sessions',0);await count('class_attendance',0)
 await as(2);await rejected(()=>save(4,[mark(301,'present')],'Revisión'),'P0001')
 assert.equal(await save(5,[mark(301,'present')],'Verificación de asistencia'),6);checks++
 assert.equal(await state(6,'closed'),7);checks++
 await as(1)
 await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names) values($1,$2,$3,'Alumno Nuevo','Prueba')",[id(307),id(101),id(201)])
 await rejected(()=>save(7,[mark(307,'present')]),'P0001')
 await state(7,'draft','Revisar lista');await rejected(()=>save(8,[mark(307,'present')]),'42501')
 assert.equal((await detail()).students.length,2);checks++
 const next=await create({start:'09:00',end:'10:00'});assert.equal((await detail(next)).students.length,3);checks++
 const future=await create({room:204,day:dates.future})
 await rejected(()=>save(0,[mark(306,'present')],null,future),'P0001')
 await rejected(()=>db.query('update public.class_attendance set status=\'present\''),'42501')
 await rejected(()=>db.query('delete from public.class_session_logs'),'42501')
 await rejected(()=>db.query('insert into public.class_roster values($1,$2,$3)',[id(101),lesson,id(307)]),'42501')
 await as(8);await count('class_sessions',0);await rejected(()=>detail(),'42501')
 await as(7);await count('class_sessions',0)
 await db.exec('reset role;set role anon');await rejected(()=>db.query('select * from public.class_attendance'),'42501');await rejected(()=>detail(),'42501')
 console.log(`${checks} class attendance lifecycle and permission checks passed`)
}catch(e){console.error({message:e.message,code:e.code,where:e.where,stack:e.code?undefined:e.stack});process.exitCode=1}finally{await db.close()}
