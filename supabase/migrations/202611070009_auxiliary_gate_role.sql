begin;
-- Auxiliaries operate the school gate. Student and QR administration stays with management.
alter policy student_insert on public.students with check(public.has_school_role(institution_id,array['administrador','director']));
alter policy student_update on public.students using(public.has_school_role(institution_id,array['administrador','director'])) with check(public.has_school_role(institution_id,array['administrador','director']));
alter policy gate_code_read on public.student_gate_codes using(public.has_school_role(institution_id,array['administrador','director']));
alter policy enrollment_read on public.student_enrollments using(public.can_read_student(student_id) and public.has_school_role(institution_id,array['administrador','director','docente','apoderado']));
alter policy placement_read on public.enrollment_placements using(public.can_read_student(student_id) and public.has_school_role(institution_id,array['administrador','director','docente','apoderado']));
create or replace function public.import_school_students(school uuid, roster jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 item record;
 room record;
 normalized jsonb;
 room_id uuid;
 room_count integer;
 created_rooms integer := 0;
 imported integer;
begin
 if not public.has_school_role(school,array['administrador','director']) then
  raise exception 'Acceso denegado' using errcode='42501';
 end if;
 if jsonb_typeof(roster) is distinct from 'array' then raise exception 'INVALID_IMPORT' using errcode='22023'; end if;
 if jsonb_array_length(roster) not between 1 and 500 or octet_length(roster::text)>524288 then raise exception 'INVALID_IMPORT_SIZE' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(roster) e where jsonb_typeof(e) <> 'object') then raise exception 'INVALID_IMPORT' using errcode='22023'; end if;
 select jsonb_agg(jsonb_build_object(
  'dni',btrim(r.dni),'first_names',btrim(r.first_names),'last_names',btrim(r.last_names),
  'academic_year',r.academic_year,'level',case lower(btrim(r.level)) when 'inicial' then 'Inicial' when 'primaria' then 'Primaria' when 'secundaria' then 'Secundaria' end,
  'grade',public.import_grade_key(r.grade),'section',upper(btrim(r.section))
 )) into normalized from jsonb_to_recordset(roster) as r(dni text,first_names text,last_names text,academic_year integer,level text,grade text,section text);
 for item in select * from jsonb_to_recordset(normalized) as r(dni text,first_names text,last_names text,academic_year integer,level text,grade text,section text) loop
  if item.dni is null or item.dni !~ '^[0-9]{8}$'
   or item.first_names is null or length(item.first_names) not between 1 and 100
   or item.last_names is null or length(item.last_names) not between 1 and 120
   or item.academic_year is null or item.academic_year not between 2000 and 2100
   or item.level is null or item.grade is null
   or (item.level='Inicial' and item.grade not in ('3','4','5'))
   or (item.level='Primaria' and item.grade not in ('1','2','3','4','5','6'))
   or (item.level='Secundaria' and item.grade not in ('1','2','3','4','5'))
   or item.section is null or length(item.section) not between 1 and 40 then
    raise exception 'INVALID_IMPORT_ROW' using errcode='22023';
  end if;
 end loop;
 if exists(select 1 from jsonb_to_recordset(normalized) as r(dni text) group by dni having count(*)>1) then
  raise exception 'DUPLICATE_IMPORT_DNI' using errcode='23505';
 end if;
 -- Serializes imports for this school, including retry/parallel import attempts.
 perform 1 from public.institutions where id=school for update;
 if exists(select 1 from jsonb_to_recordset(normalized) as r(dni text) join public.students s on s.dni=r.dni and s.institution_id=school) then
  raise exception 'EXISTING_IMPORT_DNI' using errcode='23505';
 end if;
 for room in select distinct r.academic_year,r.level,r.grade,r.section
  from jsonb_to_recordset(normalized) as r(academic_year integer,level text,grade text,section text)
  order by r.academic_year,r.level,r.grade,r.section loop
  select count(*),min(c.id::text)::uuid into room_count,room_id from public.classrooms c
   where c.institution_id=school and c.academic_year=room.academic_year
   and lower(btrim(c.level))=lower(room.level) and public.import_grade_key(c.grade)=room.grade and upper(btrim(c.section))=room.section;
  if room_count>1 then raise exception 'AMBIGUOUS_IMPORT_CLASSROOM' using errcode='P0001'; end if;
  if room_count=0 then
   insert into public.classrooms(institution_id,academic_year,level,grade,section)
    values(school,room.academic_year,room.level,room.grade,room.section) on conflict do nothing returning id into room_id;
   if room_id is not null then created_rooms := created_rooms+1;
   else select c.id into room_id from public.classrooms c where c.institution_id=school and c.academic_year=room.academic_year and c.level=room.level and c.grade=room.grade and c.section=room.section; end if;
  end if;
  insert into public.students(institution_id,classroom_id,dni,first_names,last_names)
   select school,room_id,r.dni,r.first_names,r.last_names
   from jsonb_to_recordset(normalized) as r(dni text,first_names text,last_names text,academic_year integer,level text,grade text,section text)
   where r.academic_year=room.academic_year and r.level=room.level and r.grade=room.grade and r.section=room.section;
 end loop;
 imported := jsonb_array_length(normalized);
 return jsonb_build_object('students',imported,'classrooms_created',created_rooms);
end;
$$;
revoke all on function public.import_grade_key(text) from public;
create or replace function public.get_student_gate_code(school uuid, student uuid, rotate boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare code uuid;
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'GATE_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.students where id=student and institution_id=school and active for update;
 if not found then raise exception 'GATE_STUDENT_NOT_FOUND' using errcode='P0001'; end if;
 insert into public.student_gate_codes(institution_id,student_id) values(school,student) on conflict do nothing;
 if rotate then update public.student_gate_codes set token=gen_random_uuid(),updated_at=clock_timestamp() where student_id=student; end if;
 select token into code from public.student_gate_codes where student_id=student;
 return code;
end;
$$;

create or replace function public.student_enrollment_detail(school uuid,student uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare s record;entries jsonb;events jsonb;manager boolean;
begin
 if not public.can_read_student(student) or not public.has_school_role(school,array['administrador','director','docente','apoderado']) then raise exception 'ENROLLMENT_FORBIDDEN' using errcode='42501';end if;
 select * into s from public.students where id=student and institution_id=school;
 if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode='P0001';end if;
 manager:=public.has_school_role(school,array['administrador','director']);
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'year',e.academic_year,'classroom_id',e.classroom_id,'classroom',concat(c.academic_year,' · ',c.level,' ',c.grade,' ',c.section),'state',e.state,'source',e.source,
  'placements',(select coalesce(jsonb_agg(jsonb_build_object('classroom',concat(r.academic_year,' · ',r.level,' ',r.grade,' ',r.section),'from',p.effective_from,'until',p.effective_until,'state',p.state,'source',p.source) order by p.effective_from nulls first,p.recorded_at),'[]'::jsonb) from public.enrollment_placements p join public.classrooms r on r.id=p.classroom_id where p.enrollment_id=e.id)) order by e.academic_year desc),'[]'::jsonb)
 into entries from public.student_enrollments e join public.classrooms c on c.id=e.classroom_id where e.student_id=student and e.institution_id=school;
 if manager then
  select coalesce(jsonb_agg(jsonb_build_object('action',x.action,'reason',x.reason,'at',x.created_at,'revision',x.revision) order by x.created_at desc),'[]'::jsonb) into events from (select * from public.enrollment_events where institution_id=school and student_id=student order by created_at desc,id limit 100) x;
 end if;
 return jsonb_build_object('id',student,'name',concat(s.last_names,', ',s.first_names),'dni',s.dni,'revision',s.enrollment_revision,'manager',manager,'enrollments',entries,'events',coalesce(events,'[]'::jsonb));
end;
$$;

create function public.gate_classroom_report(school uuid,classroom uuid,day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare room public.classrooms%rowtype;result jsonb;
begin
 if not public.has_school_role(school,array['administrador','director','auxiliar']) then raise exception 'GATE_REPORT_FORBIDDEN' using errcode='42501';end if;
 select * into room from public.classrooms where id=classroom and institution_id=school;
 if not found or day is null or extract(year from day)<>room.academic_year or day>(now() at time zone 'America/Lima')::date then raise exception 'GATE_REPORT_INVALID_FILTER' using errcode='22023';end if;
 with roster as (
  select s.id,concat(s.last_names,', ',s.first_names) as name,s.dni,h.active,h.unknown_dates,
   first_entry.occurred_at as first_entry_at,first_entry.is_late,last_event.occurred_at as last_at,last_event.kind as last_kind,
   case when last_event.kind in ('entry','return') then 'inside' when last_event.kind='early_exit' and last_event.expects_return then 'awaiting_return' when last_event.kind is null then 'unregistered' else 'outside' end as state,
   counters.early_exits,counters.returns
  from public.enrollment_cohort(school,day,day,room.academic_year) h join public.students s on s.id=h.student_id and s.institution_id=school
  left join lateral(select e.occurred_at,e.is_late from public.gate_events e where e.institution_id=school and e.student_id=s.id and e.school_date=day and e.first_entry order by e.sequence_no limit 1) first_entry on true
  left join lateral(select e.occurred_at,e.kind,e.expects_return from public.gate_events e where e.institution_id=school and e.student_id=s.id and e.school_date=day order by e.sequence_no desc limit 1) last_event on true
  cross join lateral(select count(*) filter(where e.kind='early_exit') as early_exits,count(*) filter(where e.kind='return') as returns from public.gate_events e where e.institution_id=school and e.student_id=s.id and e.school_date=day) counters
  where h.classroom_id=classroom
 )
 select jsonb_build_object('issued_at',now(),'school',jsonb_build_object('id',school,'name',(select name from public.institutions where id=school)),
  'classroom',jsonb_build_object('id',room.id,'label',concat(room.academic_year,' · ',room.level,' ',room.grade,' ',room.section)),'date',day,
  'summary',jsonb_build_object('students',count(*),'active',count(*) filter(where active),'first_entries',count(*) filter(where first_entry_at is not null),'late_entries',count(*) filter(where is_late),'on_time_entries',count(*) filter(where is_late=false),'unclassified_entries',count(*) filter(where first_entry_at is not null and is_late is null),'not_registered',count(*) filter(where first_entry_at is null),'inside',count(*) filter(where state='inside'),'awaiting_return',count(*) filter(where state='awaiting_return'),'early_exits',coalesce(sum(early_exits),0),'returns',coalesce(sum(returns),0)),
  'students',coalesce(jsonb_agg(to_jsonb(roster) order by name,id),'[]'::jsonb)) into result from roster;
 return result;
end;
$$;
revoke all on function public.gate_classroom_report(uuid,uuid,date) from public;
grant execute on function public.gate_classroom_report(uuid,uuid,date) to authenticated;
commit;
