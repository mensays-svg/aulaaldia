import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
for (const name of ['202611050001_school_foundation.sql','202611050002_unified_student_import.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'))
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
for(let n=1;n<=6;n++) await db.query('insert into auth.users values($1,$2,now())',[id(n),`test${n}@example.com`])
await db.query("insert into public.institutions values($1,'Colegio Uno'),($2,'Colegio Dos')",[id(101),id(102)])
for(const [user,role,school] of [[1,'administrador',101],[2,'auxiliar',101],[3,'docente',101],[4,'apoderado',101],[5,'administrador',102]]) await db.query('insert into public.memberships(institution_id,user_id,role) values($1,$2,$3)',[id(school),id(user),role])
await db.query("insert into public.classrooms(institution_id,academic_year,level,grade,section) values($1,2026,'Primaria','1.º','a')",[id(101)])
let checks=0
async function as(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated')}
const student=(dni,extra={})=>({dni,first_names:'María',last_names:'Pérez',academic_year:2026,level:'Primaria',grade:'1',section:'A',...extra})
async function run(roster,school=101){return db.query('select public.import_school_students($1,$2::jsonb) result',[id(school),JSON.stringify(roster)])}
async function denied(roster,school=101){await assert.rejects(run(roster,school));checks++}
async function totals(school,students,rooms){await db.exec('reset role');const result=await db.query('select (select count(*)::int from public.students where institution_id=$1) s,(select count(*)::int from public.classrooms where institution_id=$1) c',[id(school)]);assert.deepEqual(result.rows[0],{s:students,c:rooms});checks++}
await as(1)
let result=await run([student('00123456'),student('00123457',{section:'B'})])
assert.deepEqual(result.rows[0].result,{students:2,classrooms_created:1});checks++
await totals(101,2,2)
await as(1);await denied([student('00123456'),student('00123458',{section:'NEW'})]);await totals(101,2,2)
await as(1);await denied([student('00123459'),student('00123459')]);await totals(101,2,2)
for(const extra of [{dni:'123'},{academic_year:1999},{level:'Otro'},{grade:'9'},{section:''},{first_names:null},{last_names:'X'.repeat(121)}]){await as(1);await denied([student('00123460',extra)])}
await as(1);await denied([]);await denied(null);await denied({});await denied(Array.from({length:501},(_,i)=>student(String(i).padStart(8,'0'))))
for(const user of [3,4,6]){await as(user);await denied([student('00123461')])}
await as(5);await denied([student('00123461')]);await totals(101,2,2)
await as(2);result=await run([student('00123462',{level:'Secundaria',grade:'2',section:'c'})]);assert.deepEqual(result.rows[0].result,{students:1,classrooms_created:1});checks++
await totals(101,3,3)
// A late database failure rolls back both the new classroom and every student.
await db.exec("create function public.test_import_reject() returns trigger language plpgsql as $$begin if new.dni='99999999' then raise exception 'Simulated insert failure';end if;return new;end;$$;create trigger test_import_reject before insert on public.students for each row execute function public.test_import_reject();")
await as(1);await denied([student('00123463',{section:'D'}),student('99999999',{section:'E'})]);await totals(101,3,3)
await as(5);result=await run([student('00123456')],102);assert.equal(result.rows[0].result.students,1);checks++
await totals(102,1,1)
await as(1);result=await run([student('00123464',{grade:'PRIMERO',section:'a',level:'primaria',institution_id:id(102),active:false})]);assert.equal(result.rows[0].result.classrooms_created,0);checks++
await db.exec('reset role');const saved=await db.query("select institution_id,active from public.students where dni='00123464'");assert.deepEqual(saved.rows[0],{institution_id:id(101),active:true});checks++
await db.query("insert into public.classrooms(institution_id,academic_year,level,grade,section) values($1,2026,'Primaria','primero','A')",[id(101)])
await as(1);await denied([student('00123465')]);await totals(101,4,4)
await db.exec('reset role;set role anon');await denied([student('00123466')])
console.log(`${checks} transactional multi-classroom import checks passed`)
await db.close()
