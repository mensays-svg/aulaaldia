import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`)
await db.exec(readFileSync(new URL('../supabase/migrations/202611050001_school_foundation.sql', import.meta.url), 'utf8'))
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
for(let n=1;n<=8;n++) await db.query('insert into auth.users values($1,$2,now())',[id(n),`user${n}@example.com`])
await db.query('insert into public.institutions(id,name) values($1,$2),($3,$4)',[id(101),'Escuela Uno',id(102),'Escuela Dos'])
for(const [user,role,school] of [[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'apoderado',101],[7,'administrador',102],[8,'docente',101]]) await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(user),role])
for(const [room,school,section] of [[201,101,'A'],[202,101,'B'],[203,102,'A']]) await db.query('insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,2026,\'Primaria\',\'1\',$3)',[id(room),id(school),section])
for(const [student,school,room] of [[301,101,201],[302,101,201],[303,101,202],[304,102,203]]) await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names) values($1,$2,$3,'Alumno','Prueba')",[id(student),id(school),id(room)])
await db.query('insert into public.teacher_assignments(institution_id,classroom_id,user_id) values($1,$2,$3)',[id(101),id(201),id(4)])
await db.query("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Madre')",[id(101),id(301),id(5)])
let checks=0
async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(user)]);await db.exec('set role authenticated')}
async function count(table,expected){const {rows}=await db.query(`select count(*)::int n from public.${table}`);assert.equal(rows[0].n,expected,table);checks++}
async function denied(sql,args){await assert.rejects(db.query(sql,args));checks++}
await as(1); await count('students',3); await count('classrooms',2)
await denied('select public.remove_school_role($1,$2,$3)',[id(101),id(1),'administrador'])
await as(2); await count('students',3)
await as(3); await count('students',3);await denied('select * from public.list_school_members($1)',[id(101)])
await as(4);await count('students',2);await count('classrooms',1)
await as(5);await count('students',1);await count('classrooms',1);await count('memberships',1)
await denied("insert into public.students(institution_id,classroom_id,first_names,last_names) values($1,$2,'X','Y')",[id(101),id(201)])
await denied("select public.assign_school_role($1,'user5@example.com','administrador')",[id(101)])
await denied('select * from public.list_school_members($1)',[id(101)])
await as(6);await count('students',0);await count('institutions',0)
await denied("insert into public.memberships(institution_id,user_id,role) values($1,$2,'administrador')",[id(101),id(6)])
await as(7);await count('students',1)
await as(8);await count('students',0)
await as(1)
await denied("insert into public.students(institution_id,classroom_id,first_names,last_names) values($1,$2,'X','Y')",[id(101),id(203)])
await denied("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Padre')",[id(101),id(302),id(4)])
await db.query("select public.assign_school_role($1,'user6@example.com','apoderado')",[id(101)])
checks++
await db.query('delete from public.student_guardians where student_id=$1',[id(301)])
await as(5);await count('students',0)
await as(1);await db.query('select public.remove_school_role($1,$2,$3)',[id(101),id(4),'docente']);checks++
await as(4);await count('classrooms',0);await count('students',0)
await db.exec('reset role; set role anon')
await denied('select * from public.students')
console.log(`${checks} PostgreSQL/RLS checks passed`)
await db.close()
