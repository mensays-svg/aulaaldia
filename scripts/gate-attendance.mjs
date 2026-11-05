import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
for(const file of ['202611050001_school_foundation.sql','202611050003_gate_attendance.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
for(let n=1;n<=7;n++)await db.query('insert into auth.users values($1,$2,now())',[id(n),`gate${n}@example.com`])
await db.query("insert into public.institutions(id,name) values($1,'Escuela Uno'),($2,'Escuela Dos')",[id(101),id(102)])
for(const [u,role,school] of [[1,'administrador',101],[2,'director',101],[3,'auxiliar',101],[4,'docente',101],[5,'apoderado',101],[7,'administrador',102]])await db.query('insert into public.memberships values($1,$2,$3)',[id(school),id(u),role])
for(const [room,school] of [[201,101],[202,102]])await db.query("insert into public.classrooms(id,institution_id,academic_year,level,grade,section) values($1,$2,2026,'Secundaria','1','A')",[id(room),id(school)])
for(const [student,school,room] of [[301,101,201],[302,101,201],[303,102,202],[304,101,201],[305,101,201]])await db.query("insert into public.students(id,institution_id,classroom_id,first_names,last_names) values($1,$2,$3,'Alumno','Prueba')",[id(student),id(school),id(room)])
await db.query('insert into public.teacher_assignments(institution_id,classroom_id,user_id) values($1,$2,$3)',[id(101),id(201),id(4)])
await db.query("insert into public.student_guardians(institution_id,student_id,user_id,relationship) values($1,$2,$3,'Padre')",[id(101),id(301),id(5)])
let checks=0
async function as(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(user)]);await db.exec('set role authenticated')}
async function rejected(fn,code){await assert.rejects(fn,code?e=>e.code===code:undefined);checks++}
async function status(student=301,school=101){const r=await db.query('select public.gate_student_status($1,$2) s',[id(school),id(student)]);return r.rows[0].s}
async function mark(movement,options={}){
 const {student=301,school=101,method='dni',request=randomUUID(),reason=null,note=null,authorization=null,companion=null,willReturn=false,qr=null}=options
 const r=await db.query('select public.record_gate_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) e',[id(school),id(student),movement,method,request,reason,note,authorization,companion,willReturn,qr]);return r.rows[0].e
}
async function count(expected){const r=await db.query('select count(*)::int n from public.gate_events');assert.equal(r.rows[0].n,expected);checks++}
async function code(rotate=false,student=301){const r=await db.query('select public.get_student_gate_code($1,$2,$3) c',[id(101),id(student),rotate]);return r.rows[0].c}
await as(3)
assert.equal((await status()).state,'unregistered');checks++
await rejected(()=>mark('exit'),'P0001');await rejected(()=>mark('return'),'P0001');await rejected(()=>mark('early_exit'),'22023')
const request=randomUUID(),first=await mark('entry',{request})
assert.equal(first.is_late,null);checks++
assert.equal((await status()).state,'inside');checks++
assert.equal((await mark('entry',{request})).id,first.id);checks++
await count(1)
await rejected(()=>mark('entry',{request,note:'Datos distintos'}),'P0001')
await rejected(()=>mark('entry'),'P0001')
await rejected(()=>mark('early_exit',{reason:'salud'}),'22023')
const early=await mark('early_exit',{reason:'salud',authorization:'Director de turno',companion:'Apoderado autorizado',willReturn:true})
assert.equal((await status()).state,'awaiting_return');checks++
await rejected(()=>mark('entry'),'P0001');await rejected(()=>mark('exit'),'P0001')
const returned=await mark('return')
assert.equal(returned.is_late,null);checks++
assert.equal((await status()).state,'inside');checks++
const linked=await db.query("select return_of from public.gate_events where id=$1",[returned.id]);assert.equal(linked.rows[0].return_of,early.id);checks++
await mark('exit');assert.equal((await status()).state,'outside');checks++
await rejected(()=>mark('exit'),'P0001')
await mark('entry');await mark('early_exit',{reason:'tramite',authorization:'Dirección'})
await rejected(()=>mark('return'),'P0001')
await mark('entry');await mark('exit')
// Schedule changes are privileged and never modify the original attendance.
await rejected(()=>db.query("select public.set_gate_schedule($1,$2,'08:00',5)",[id(101),id(201)]),'42501')
await as(1);await db.query("select public.set_gate_schedule($1,$2,'00:00',0)",[id(101),id(201)])
await rejected(()=>db.query("select public.set_gate_schedule($1,$2,'08:00',-1)",[id(101),id(201)]),'22023')
await rejected(()=>db.query("select public.set_gate_schedule($1,$2,'08:00',5)",[id(101),id(202)]),'P0001')
await as(3);const scheduled=await mark('entry',{student:302})
const expected=await db.query("select is_late=((occurred_at at time zone 'America/Lima')>school_date+time '00:00') ok from public.gate_events where id=$1",[scheduled.id]);assert.equal(expected.rows[0].ok,true);checks++
const unchanged=await db.query('select is_late from public.gate_events where id=$1',[first.id]);assert.equal(unchanged.rows[0].is_late,null);checks++
// Opaque, institution-scoped and revocable QR codes.
const token=await code();assert.equal(await code(),token);checks++
let lookup=await db.query('select public.find_gate_qr($1,$2) s',[id(101),token]);assert.equal(lookup.rows[0].s,id(301));checks++
const replaced=await code(true);assert.notEqual(replaced,token);checks++
await rejected(()=>db.query('select public.find_gate_qr($1,$2)',[id(101),token]),'P0001')
await rejected(()=>mark('entry',{method:'qr',qr:token}),'P0001')
await mark('entry',{method:'qr',qr:replaced});checks++
await rejected(()=>mark('exit',{method:'qr'}),'P0001')
await rejected(()=>db.query('insert into public.gate_events(id) values($1)',[randomUUID()]),'42501')
await rejected(()=>db.query('delete from public.gate_events'),'42501')
await rejected(()=>db.query('update public.student_gate_codes set token=gen_random_uuid()'),'42501')
// Read access follows classroom assignments or explicit family links.
await as(5);assert.equal((await status()).id,id(301));checks++
await rejected(()=>status(302),'42501');await rejected(()=>mark('exit'),'42501');await rejected(()=>code(),'42501')
const own=await db.query('select distinct student_id from public.gate_events');assert.deepEqual(own.rows.map(r=>r.student_id),[id(301)]);checks++
await as(4);assert.equal((await status(302)).id,id(302));checks++
await rejected(()=>mark('exit'),'42501')
await as(6);await count(0);await rejected(()=>status(),'42501')
await as(7);await count(0);await rejected(()=>mark('entry'),'42501');await rejected(()=>code(),'42501')
await mark('entry',{school:102,student:303});await count(1)
// Inactive students cannot be marked; yesterday's entry does not count as today.
await db.exec('reset role');await db.query('update public.students set active=false where id=$1',[id(304)])
await db.query("insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,first_entry) values($1,$2,$3,((now()-interval '1 day') at time zone 'America/Lima')::date,now()-interval '1 day','entry','dni',$4,$5,true)",[id(101),id(305),id(201),id(3),randomUUID()])
await as(3);await rejected(()=>mark('entry',{student:304}),'P0001');assert.equal((await status(305)).state,'unregistered');checks++
await mark('entry',{student:305});assert.equal((await status(305)).state,'inside');checks++
await rejected(()=>mark('other'),'22023');await rejected(()=>mark('entry',{student:303}),'P0001')
await db.exec('reset role;set role anon');await rejected(()=>db.query('select * from public.gate_events'),'42501');await rejected(()=>mark('entry'),'42501')
console.log(`${checks} gate attendance database checks passed`)
await db.close()
