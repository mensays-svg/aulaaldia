begin;

create function public.import_grade_key(value text) returns text
language sql immutable set search_path = '' as $$
 with cleaned as (
  select regexp_replace(regexp_replace(lower(btrim(value)), 'grados?|años?', '', 'g'), '[[:space:].º°ª]', '', 'g') as k
 ) select case
  when k in ('primer','primero','1ro','1ero','1er') then '1'
  when k in ('segundo','2do') then '2'
  when k in ('tercero','tercer','3ro','3er') then '3'
  when k in ('cuarto','4to') then '4'
  when k in ('quinto','5to') then '5'
  when k in ('sexto','6to') then '6'
  else k end from cleaned;
$$;

-- One transaction creates the missing classrooms and all students together.
-- The caller cannot supply another institution per student, ids, roles or active flags.
create function public.import_school_students(school uuid, roster jsonb) returns jsonb
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
 if not public.has_school_role(school,array['administrador','director','auxiliar']) then
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
revoke all on function public.import_school_students(uuid,jsonb) from public;
grant execute on function public.import_school_students(uuid,jsonb) to authenticated;
commit;
