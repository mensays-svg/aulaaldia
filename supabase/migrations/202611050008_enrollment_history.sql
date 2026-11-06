begin;
alter table public.classrooms add constraint classroom_year_identity unique(institution_id,id,academic_year);
alter table public.students add column enrollment_revision integer not null default 0;
create table public.student_enrollments (
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,student_id uuid not null,academic_year integer not null,
 classroom_id uuid not null,state text not null check(state in ('planned','active','withdrawn','completed','cancelled')),
 source text not null check(source in ('legacy_snapshot','registration_snapshot','managed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(student_id,academic_year),unique(institution_id,id,student_id,academic_year),
 foreign key(institution_id,student_id) references public.students(institution_id,id),
 foreign key(institution_id,classroom_id,academic_year) references public.classrooms(institution_id,id,academic_year)
);
create unique index one_active_student_enrollment on public.student_enrollments(student_id) where state='active';
create table public.enrollment_placements (
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,enrollment_id uuid not null,student_id uuid not null,academic_year integer not null,classroom_id uuid not null,
 effective_from timestamptz,effective_until timestamptz,
 state text not null check(state in ('active','transferred','withdrawn','completed')),
 source text not null check(source in ('legacy_snapshot','registration_snapshot','managed')),
 recorded_at timestamptz not null default now(),check(effective_from is null or effective_until is null or effective_until>effective_from),
 foreign key(institution_id,enrollment_id,student_id,academic_year) references public.student_enrollments(institution_id,id,student_id,academic_year),
 foreign key(institution_id,classroom_id,academic_year) references public.classrooms(institution_id,id,academic_year)
);
create unique index one_open_enrollment_placement on public.enrollment_placements(student_id) where state='active';
create index enrollment_placement_year_idx on public.enrollment_placements(institution_id,academic_year,student_id,effective_from);
create table public.enrollment_events (
 id uuid primary key default gen_random_uuid(),institution_id uuid not null references public.institutions(id),student_id uuid not null,enrollment_id uuid,
 action text not null,reason text,payload jsonb not null default '{}'::jsonb,previous_value jsonb,next_value jsonb,
 actor_id uuid references auth.users(id),request_id uuid,revision integer not null,created_at timestamptz not null default now(),
 foreign key(institution_id,student_id) references public.students(institution_id,id),unique(institution_id,request_id)
);
create index enrollment_events_student_idx on public.enrollment_events(student_id,created_at desc);

-- This is a snapshot of the available roster, not a fabricated enrollment date.
insert into public.student_enrollments(institution_id,student_id,academic_year,classroom_id,state,source)
 select s.institution_id,s.id,c.academic_year,c.id,case when s.active then 'active' else 'withdrawn' end,'legacy_snapshot'
 from public.students s join public.classrooms c on c.id=s.classroom_id;
insert into public.enrollment_placements(institution_id,enrollment_id,student_id,academic_year,classroom_id,state,source)
 select institution_id,id,student_id,academic_year,classroom_id,case when state='active' then 'active' else 'withdrawn' end,'legacy_snapshot' from public.student_enrollments;
insert into public.enrollment_events(institution_id,student_id,enrollment_id,action,reason,revision)
 select institution_id,student_id,id,'initial_snapshot','Padrón existente al instalar matrículas. Fecha inicial y fechas de retiro no disponibles.',0 from public.student_enrollments;

create function public.enrollment_profile_before_insert() returns trigger language plpgsql security definer set search_path='' as $$
declare year integer;
begin
 new.enrollment_revision:=0;
 select academic_year into year from public.classrooms where id=new.classroom_id and institution_id=new.institution_id;
 if year is distinct from extract(year from now() at time zone 'America/Lima')::integer then new.active:=false;end if;
 return new;
end;
$$;
create function public.enrollment_profile_after_insert() returns trigger language plpgsql security definer set search_path='' as $$
declare year integer;enrollment uuid;status text;
begin
 select academic_year into year from public.classrooms where id=new.classroom_id and institution_id=new.institution_id;
 status:=case when year>extract(year from now() at time zone 'America/Lima') then 'planned' when year<extract(year from now() at time zone 'America/Lima') then 'completed' when new.active then 'active' else 'withdrawn' end;
 insert into public.student_enrollments(institution_id,student_id,academic_year,classroom_id,state,source) values(new.institution_id,new.id,year,new.classroom_id,status,'registration_snapshot') returning id into enrollment;
 if status<>'planned' then
  insert into public.enrollment_placements(institution_id,enrollment_id,student_id,academic_year,classroom_id,state,source) values(new.institution_id,enrollment,new.id,year,new.classroom_id,status,'registration_snapshot');
 end if;
 insert into public.enrollment_events(institution_id,student_id,enrollment_id,action,reason,actor_id,revision) values(new.institution_id,new.id,enrollment,'profile_registered','Perfil registrado; fecha oficial de matrícula no disponible.',auth.uid(),0);
 return new;
end;
$$;
create trigger enrollment_profile_initial_state before insert on public.students for each row execute function public.enrollment_profile_before_insert();
create trigger enrollment_profile_initial_history after insert on public.students for each row execute function public.enrollment_profile_after_insert();
-- Only enrollment RPCs may change the live classroom, active flag or revision.
revoke update on public.students from authenticated;
grant update(first_names,last_names,dni) on public.students to authenticated;

alter table public.student_enrollments enable row level security;
alter table public.enrollment_placements enable row level security;
alter table public.enrollment_events enable row level security;
create policy enrollment_read on public.student_enrollments for select to authenticated using(public.can_read_student(student_id));
create policy placement_read on public.enrollment_placements for select to authenticated using(public.can_read_student(student_id));
create policy enrollment_event_read on public.enrollment_events for select to authenticated using(public.has_school_role(institution_id,array['administrador','director']));
revoke all on public.student_enrollments,public.enrollment_placements,public.enrollment_events from anon,authenticated;
grant select on public.student_enrollments,public.enrollment_placements,public.enrollment_events to authenticated;

create or replace function public.can_read_classroom(classroom uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classrooms c where c.id=classroom and (
  public.has_school_role(c.institution_id,array['administrador','director','auxiliar'])
  or (public.has_school_role(c.institution_id,array['docente']) and exists(select 1 from public.teacher_assignments t where t.classroom_id=c.id and t.user_id=auth.uid()))
  or exists(select 1 from public.students s join public.student_guardians g on g.student_id=s.id where s.classroom_id=c.id and g.user_id=auth.uid())
  or exists(select 1 from public.student_enrollments e join public.student_guardians g on g.student_id=e.student_id where e.classroom_id=c.id and g.user_id=auth.uid())
  or exists(select 1 from public.enrollment_placements e join public.student_guardians g on g.student_id=e.student_id where e.classroom_id=c.id and g.user_id=auth.uid())
 ));
$$;

create function public.enrollment_cohort(school uuid,period_start date,period_end date,year integer)
 returns table(student_id uuid,classroom_id uuid,active boolean,unknown_dates boolean)
 language sql stable security definer set search_path='' as $$
 select distinct on (p.student_id) p.student_id,p.classroom_id,
  not(p.state in ('withdrawn','completed') and (p.effective_until is null or p.effective_until<((period_end+1)::timestamp at time zone 'America/Lima'))) as active,
  (p.effective_from is null) as unknown_dates
 from public.enrollment_placements p where p.institution_id=school and p.academic_year=year
 and coalesce(p.effective_from,make_date(year,1,1)::timestamp at time zone 'America/Lima')<((period_end+1)::timestamp at time zone 'America/Lima')
 and (p.effective_until is null or p.effective_until>(period_start::timestamp at time zone 'America/Lima'))
 order by p.student_id,coalesce(p.effective_from,make_date(year,1,1)::timestamp at time zone 'America/Lima') desc,p.recorded_at desc,p.id;
$$;
create function public.enrollment_session_students(school uuid,classroom uuid,day date,start_time time)
 returns table(student_id uuid) language sql stable security definer set search_path='' as $$
 select distinct p.student_id from public.enrollment_placements p where p.institution_id=school and p.classroom_id=classroom and p.academic_year=extract(year from day)
 and (p.effective_from is null or p.effective_from<=((day+start_time) at time zone 'America/Lima'))
 and (p.effective_until is null or p.effective_until>((day+start_time) at time zone 'America/Lima'))
 and not(p.state in ('withdrawn','completed') and p.effective_until is null);
$$;
create function public.enrollment_gate_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.enrollment_placements p where p.institution_id=new.institution_id and p.student_id=new.student_id and p.classroom_id=new.classroom_id
  and p.academic_year=extract(year from new.school_date) and (p.effective_from is null or p.effective_from<=new.occurred_at)
  and (p.effective_until is null or p.effective_until>new.occurred_at) and not(p.state in ('withdrawn','completed') and p.effective_until is null)) then
  raise exception 'ENROLLMENT_CURRENT_YEAR_REQUIRED' using errcode='P0001';
 end if;return new;
end;
$$;
create trigger gate_requires_valid_enrollment before insert on public.gate_events for each row execute function public.enrollment_gate_guard();

create function public.change_student_enrollment(school uuid,student uuid,operation text,target_classroom uuid,enrollment uuid,expected_revision integer,request uuid,reason text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.students%rowtype;e public.student_enrollments%rowtype;t public.classrooms%rowtype;current_e public.student_enrollments%rowtype;existing_event public.enrollment_events%rowtype;instant timestamptz:=clock_timestamp();current_year integer:=extract(year from now() at time zone 'America/Lima');event_payload jsonb;result_id uuid;before_value jsonb;
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'ENROLLMENT_FORBIDDEN' using errcode='42501';end if;
 if operation is null or operation not in ('plan','activate','transfer','withdraw','reactivate','cancel_plan') or reason is null or length(btrim(reason)) not between 10 and 1000 or request is null then raise exception 'ENROLLMENT_INVALID_INPUT' using errcode='22023';end if;
 select * into s from public.students where id=student and institution_id=school for update;
 if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode='P0001';end if;
 instant:=clock_timestamp();
 event_payload:=jsonb_build_object('operation',operation,'target',target_classroom,'enrollment',enrollment,'reason',btrim(reason));
 select * into existing_event from public.enrollment_events where institution_id=school and request_id=request;
 if found then
  if existing_event.student_id<>student or existing_event.actor_id is distinct from auth.uid() or existing_event.payload<>event_payload then raise exception 'ENROLLMENT_REQUEST_CONFLICT' using errcode='P0001';end if;
  return jsonb_build_object('revision',s.enrollment_revision,'repeated',true);
 end if;
 if expected_revision is null or expected_revision<>s.enrollment_revision then raise exception 'ENROLLMENT_STALE' using errcode='P0001';end if;
 select * into current_e from public.student_enrollments where student_id=student and state='active';
 if target_classroom is not null then
  select * into t from public.classrooms where id=target_classroom and institution_id=school;
  if not found then raise exception 'ENROLLMENT_INVALID_CLASSROOM' using errcode='22023';end if;
 end if;
 if operation='plan' then
  if target_classroom is null or t.academic_year<current_year or (current_e.id is not null and t.academic_year<=current_e.academic_year) then raise exception 'ENROLLMENT_INVALID_CLASSROOM' using errcode='22023';end if;
  select * into e from public.student_enrollments where student_id=student and academic_year=t.academic_year;
  if found and e.state<>'cancelled' then raise exception 'ENROLLMENT_YEAR_EXISTS' using errcode='P0001';end if;
  before_value:=case when e.id is null then null else to_jsonb(e) end;
  if e.id is null then
   insert into public.student_enrollments(institution_id,student_id,academic_year,classroom_id,state,source) values(school,student,t.academic_year,t.id,'planned','managed') returning id into result_id;
  else update public.student_enrollments set classroom_id=t.id,state='planned',updated_at=instant where id=e.id returning id into result_id;end if;
 else
  select * into e from public.student_enrollments where id=enrollment and student_id=student and institution_id=school for update;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode='P0001';end if;
  before_value:=to_jsonb(e);result_id:=e.id;
  if operation='cancel_plan' then
   if e.state<>'planned' then raise exception 'ENROLLMENT_INVALID_STATE' using errcode='P0001';end if;
   update public.student_enrollments set state='cancelled',updated_at=instant where id=e.id;
  elsif operation='withdraw' then
   if e.state<>'active' then raise exception 'ENROLLMENT_INVALID_STATE' using errcode='P0001';end if;
   update public.enrollment_placements set state='withdrawn',effective_until=instant where enrollment_id=e.id and state='active';
   update public.student_enrollments set state='withdrawn',updated_at=instant where id=e.id;
   update public.students set active=false where id=student;
  elsif operation='transfer' then
   if e.state<>'active' or target_classroom is null or t.academic_year<>e.academic_year or t.id=e.classroom_id or e.academic_year<>current_year then raise exception 'ENROLLMENT_INVALID_CLASSROOM' using errcode='22023';end if;
   update public.enrollment_placements set state='transferred',effective_until=instant where enrollment_id=e.id and state='active';
   update public.student_enrollments set classroom_id=t.id,updated_at=instant where id=e.id;
   insert into public.enrollment_placements(institution_id,enrollment_id,student_id,academic_year,classroom_id,effective_from,state,source) values(school,e.id,student,e.academic_year,t.id,instant,'active','managed');
   update public.students set classroom_id=t.id,active=true where id=student;
  elsif operation in ('activate','reactivate') then
   if e.academic_year<>current_year then raise exception 'ENROLLMENT_ACTIVATION_YEAR' using errcode='P0001';end if;
   if (operation='activate' and e.state<>'planned') or (operation='reactivate' and e.state<>'withdrawn') then raise exception 'ENROLLMENT_INVALID_STATE' using errcode='P0001';end if;
   if operation='reactivate' then
    if current_e.id is not null then raise exception 'ENROLLMENT_INVALID_STATE' using errcode='P0001';end if;
    if target_classroom is not null then
     if t.academic_year<>e.academic_year then raise exception 'ENROLLMENT_INVALID_CLASSROOM' using errcode='22023';end if;
     e.classroom_id:=t.id;
    end if;
   end if;
   if current_e.id is not null then
    if current_e.academic_year>=e.academic_year then raise exception 'ENROLLMENT_INVALID_STATE' using errcode='P0001';end if;
    update public.enrollment_placements set state='completed',effective_until=instant where enrollment_id=current_e.id and state='active';
    update public.student_enrollments set state='completed',updated_at=instant where id=current_e.id;
   end if;
   update public.student_enrollments set classroom_id=e.classroom_id,state='active',updated_at=instant where id=e.id;
   insert into public.enrollment_placements(institution_id,enrollment_id,student_id,academic_year,classroom_id,effective_from,state,source) values(school,e.id,student,e.academic_year,e.classroom_id,instant,'active','managed');
   update public.students set classroom_id=e.classroom_id,active=true where id=student;
  end if;
 end if;
 update public.students set enrollment_revision=enrollment_revision+1 where id=student returning enrollment_revision into expected_revision;
 insert into public.enrollment_events(institution_id,student_id,enrollment_id,action,reason,payload,previous_value,next_value,actor_id,request_id,revision)
  values(school,student,result_id,operation,btrim(reason),event_payload,before_value,(select to_jsonb(x) from public.student_enrollments x where x.id=result_id),auth.uid(),request,expected_revision);
 return jsonb_build_object('revision',expected_revision,'repeated',false);
end;
$$;

create function public.plan_enrollment_batch(school uuid,source_classroom uuid,target_classroom uuid,pupils jsonb,reason text) returns integer
 language plpgsql security definer set search_path='' as $$
declare source_year integer;target_year integer;item record;
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'ENROLLMENT_FORBIDDEN' using errcode='42501';end if;
 select academic_year into source_year from public.classrooms where id=source_classroom and institution_id=school;
 select academic_year into target_year from public.classrooms where id=target_classroom and institution_id=school;
 if source_year is null or target_year is null or target_year<=source_year then raise exception 'ENROLLMENT_INVALID_CLASSROOM' using errcode='22023';end if;
 if jsonb_typeof(pupils) is distinct from 'array' then raise exception 'ENROLLMENT_INVALID_INPUT' using errcode='22023';end if;
 if jsonb_array_length(pupils) not between 1 and 500 or octet_length(pupils::text)>200000 then raise exception 'ENROLLMENT_INVALID_INPUT' using errcode='22023';end if;
 if exists(select 1 from jsonb_to_recordset(pupils) as p(student_id uuid) group by student_id having count(*)>1) then raise exception 'ENROLLMENT_INVALID_INPUT' using errcode='22023';end if;
 for item in select * from jsonb_to_recordset(pupils) as p(student_id uuid,revision integer,request uuid) order by p.student_id loop
  if not exists(select 1 from public.students s where s.id=item.student_id and s.institution_id=school and s.classroom_id=source_classroom and s.active) then raise exception 'ENROLLMENT_STALE' using errcode='P0001';end if;
  perform public.change_student_enrollment(school,item.student_id,'plan',target_classroom,null,item.revision,item.request,reason);
 end loop;
 return jsonb_array_length(pupils);
end;
$$;

create function public.student_enrollment_detail(school uuid,student uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare s record;entries jsonb;events jsonb;manager boolean;
begin
 if not public.can_read_student(student) then raise exception 'ENROLLMENT_FORBIDDEN' using errcode='42501';end if;
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

create or replace function public.create_class_session(school uuid,classroom uuid,course uuid,teacher uuid,day date,start_time time,end_time time,subject text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare created uuid; room record; amount integer;
begin
 if not (public.has_school_role(school,array['administrador','director']) or (teacher=auth.uid() and public.has_school_role(school,array['docente']))) then raise exception 'CLASS_FORBIDDEN' using errcode='42501'; end if;
 if day is null or start_time is null or end_time is null or end_time<=start_time or length(subject)>160 then raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
 select * into room from public.classrooms where id=classroom and institution_id=school;
 if not found or extract(year from day)<>room.academic_year then raise exception 'CLASS_INVALID_CLASSROOM' using errcode='22023'; end if;
 if not exists(select 1 from public.school_courses where id=course and institution_id=school) then raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
 if not exists(select 1 from public.teacher_assignments where institution_id=school and classroom_id=classroom and user_id=teacher) then raise exception 'CLASS_TEACHER_NOT_ASSIGNED' using errcode='42501'; end if;
 perform 1 from public.institutions where id=school for update;
 if exists(select 1 from public.class_sessions s where s.institution_id=school and s.session_date=day and (s.classroom_id=classroom or s.teacher_id=teacher) and s.starts_at<end_time and s.ends_at>start_time) then raise exception 'CLASS_OVERLAP' using errcode='P0001'; end if;
 select count(*) into amount from public.enrollment_session_students(school,classroom,day,start_time);
 if amount not between 1 and 1000 then raise exception 'CLASS_EMPTY_ROSTER' using errcode='P0001'; end if;
 insert into public.class_sessions(institution_id,classroom_id,course_id,teacher_id,session_date,starts_at,ends_at,topic,created_by)
 values(school,classroom,course,teacher,day,start_time,end_time,nullif(btrim(subject),''),auth.uid()) returning id into created;
 insert into public.class_roster(institution_id,session_id,student_id) select school,created,student_id from public.enrollment_session_students(school,classroom,day,start_time);
 get diagnostics amount=row_count;
 if amount not between 1 and 1000 then raise exception 'CLASS_EMPTY_ROSTER' using errcode='P0001'; end if;
 insert into public.class_session_logs(institution_id,session_id,action,actor_id) values(school,created,'created',auth.uid());
 return created;
end;
$$;

create or replace function public.management_period_report(
 school uuid,period uuid,filter_year integer,filter_level text default null,
 filter_grade text default null,filter_section text default null,filter_state text default 'all'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p record;school_name text;result jsonb;
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'MANAGEMENT_FORBIDDEN' using errcode='42501';end if;
 select * into p from public.behavior_periods where id=period and institution_id=school;
 if not found then raise exception 'MANAGEMENT_INVALID_PERIOD' using errcode='22023';end if;
 filter_level:=nullif(btrim(filter_level),'');filter_grade:=nullif(btrim(filter_grade),'');filter_section:=nullif(upper(btrim(filter_section)),'');
 if filter_year is null or filter_year<>p.academic_year or filter_year not between 2000 and 2100
  or (filter_level is not null and filter_level not in ('Inicial','Primaria','Secundaria')) or length(filter_grade)>40 or length(filter_section)>40
  or filter_state is null or filter_state not in ('all','active','inactive') then raise exception 'MANAGEMENT_INVALID_FILTER' using errcode='22023';end if;
 select name into school_name from public.institutions where id=school;
 with selected_rooms as (
  select c.id,c.academic_year,c.level,c.grade,c.section,concat(c.academic_year,' · ',c.level,' ',c.grade,' ',c.section) as classroom
  from public.classrooms c where c.institution_id=school and c.academic_year=filter_year
  and (filter_level is null or c.level=filter_level)
  and (filter_grade is null or public.import_grade_key(c.grade)=public.import_grade_key(filter_grade))
  and (filter_section is null or upper(btrim(c.section))=filter_section)
 ),roster as (
  select s.id,s.first_names,s.last_names,s.dni,h.active,h.classroom_id,c.classroom,c.level,c.grade,c.section,h.unknown_dates
  from public.enrollment_cohort(school,p.starts_on,p.ends_on,filter_year) h join public.students s on s.id=h.student_id join selected_rooms c on c.id=h.classroom_id where s.institution_id=school
  and (filter_state='all' or (filter_state='active' and h.active) or (filter_state='inactive' and not h.active))
 ),gate_counts as (
  select g.student_id,count(*) as movements,count(*) filter(where g.first_entry) as first_entries,
   count(*) filter(where g.first_entry and g.is_late) as gate_late,count(*) filter(where g.first_entry and g.is_late=false) as on_time,
   count(*) filter(where g.first_entry and g.is_late is null) as unclassified,count(*) filter(where g.kind='early_exit') as early_exits
  from public.gate_events g join roster r on r.id=g.student_id where g.institution_id=school and g.school_date between p.starts_on and p.ends_on group by g.student_id
 ),class_counts as (
  select a.student_id,count(*) as class_marks,count(*) filter(where a.status='present') as present,count(*) filter(where a.status='late') as class_late,
   count(*) filter(where a.status='absent') as absent,count(*) filter(where a.status='justified') as justified
  from public.class_attendance a join public.class_sessions cs on cs.id=a.session_id join roster r on r.id=a.student_id
  where a.institution_id=school and cs.institution_id=school and cs.state='closed' and cs.session_date between p.starts_on and p.ends_on group by a.student_id
 ),record_counts as (
  select b.student_id,count(*) filter(where b.kind='recognition') as recognitions,count(*) filter(where b.kind='incident') as incidents
  from public.behavior_records b join roster r on r.id=b.student_id where b.institution_id=school and b.period_id=period and b.published group by b.student_id
 ),student_rows as (
  select r.id,concat(r.last_names,', ',r.first_names) as name,r.dni,r.active,r.classroom_id,r.classroom,r.level,r.grade,r.section,
   coalesce(g.movements,0) as movements,coalesce(g.first_entries,0) as first_entries,coalesce(g.gate_late,0) as gate_late,coalesce(g.on_time,0) as on_time,
   coalesce(g.unclassified,0) as unclassified,coalesce(g.early_exits,0) as early_exits,
   coalesce(c.class_marks,0) as class_marks,coalesce(c.present,0) as present,coalesce(c.class_late,0) as class_late,coalesce(c.absent,0) as absent,coalesce(c.justified,0) as justified,
   e.presentation,e.punctuality,e.coexistence,e.responsibility,e.final_score,
   coalesce(b.recognitions,0) as recognitions,coalesce(b.incidents,0) as incidents
  from roster r left join gate_counts g on g.student_id=r.id left join class_counts c on c.student_id=r.id
  left join public.behavior_evaluations e on e.institution_id=school and e.student_id=r.id and e.period_id=period and e.state='published'
  left join record_counts b on b.student_id=r.id
 ),session_counts as (
  select c.id,count(cs.id) filter(where cs.state='closed') as closed_sessions,
   count(cs.id) filter(where cs.state='draft' and (cs.session_date+cs.starts_at)<=(now() at time zone 'America/Lima')) as draft_started,
   count(cs.id) filter(where cs.state='draft' and (cs.session_date+cs.starts_at)>(now() at time zone 'America/Lima')) as upcoming_sessions
  from selected_rooms c left join public.class_sessions cs on cs.classroom_id=c.id and cs.institution_id=school and cs.session_date between p.starts_on and p.ends_on group by c.id
 ),room_rows as (
  select c.id,c.classroom,c.level,c.grade,c.section,count(r.id) as students,count(r.id) filter(where r.active) as active,
   coalesce(sum(r.first_entries),0) as first_entries,coalesce(sum(r.gate_late),0) as gate_late,coalesce(sum(r.early_exits),0) as early_exits,
   coalesce(sum(r.class_marks),0) as class_marks,coalesce(sum(r.present),0) as present,coalesce(sum(r.class_late),0) as class_late,
   coalesce(sum(r.absent),0) as absent,coalesce(sum(r.justified),0) as justified,
   count(r.id) filter(where r.final_score is not null) as published_behavior,count(r.id) filter(where r.final_score is null) as missing_behavior,
   count(r.id) filter(where r.final_score<11) as failed_behavior,round(avg(r.final_score),2) as average_behavior,
   coalesce(sum(r.recognitions),0) as recognitions,coalesce(sum(r.incidents),0) as incidents,
   sc.closed_sessions,sc.draft_started,sc.upcoming_sessions
  from selected_rooms c left join student_rows r on r.classroom_id=c.id join session_counts sc on sc.id=c.id
  group by c.id,c.classroom,c.level,c.grade,c.section,sc.closed_sessions,sc.draft_started,sc.upcoming_sessions
 )
 select jsonb_build_object('cohort_basis','enrollment_history','unknown_enrollment_dates',(select count(*) from roster where unknown_dates),'issued_at',now(),'school',jsonb_build_object('id',school,'name',school_name),
  'period',jsonb_build_object('id',p.id,'name',p.name,'academic_year',p.academic_year,'starts_on',p.starts_on,'ends_on',p.ends_on),
  'filters',jsonb_build_object('year',filter_year,'level',filter_level,'grade',filter_grade,'section',filter_section,'state',filter_state),
  'summary',(select jsonb_build_object('students',count(*),'active',count(*) filter(where active),
   'first_entries',coalesce(sum(first_entries),0),'gate_late',coalesce(sum(gate_late),0),'on_time',coalesce(sum(on_time),0),'unclassified',coalesce(sum(unclassified),0),'early_exits',coalesce(sum(early_exits),0),
   'class_marks',coalesce(sum(class_marks),0),'present',coalesce(sum(present),0),'class_late',coalesce(sum(class_late),0),'absent',coalesce(sum(absent),0),'justified',coalesce(sum(justified),0),
   'students_without_class_marks',count(*) filter(where class_marks=0),
   'published_behavior',count(*) filter(where final_score is not null),'missing_behavior',count(*) filter(where final_score is null),
   'passed_behavior',count(*) filter(where final_score>=11),'failed_behavior',count(*) filter(where final_score<11),'average_behavior',round(avg(final_score),2),
   'recognitions',coalesce(sum(recognitions),0),'incidents',coalesce(sum(incidents),0)) from student_rows),
  'sessions',(select jsonb_build_object('classrooms',count(*),'closed',coalesce(sum(closed_sessions),0),'draft_started',coalesce(sum(draft_started),0),'upcoming',coalesce(sum(upcoming_sessions),0)) from room_rows),
  'classrooms',(select coalesce(jsonb_agg(to_jsonb(r) order by r.level,public.import_grade_key(r.grade),r.section,r.id),'[]'::jsonb) from room_rows r),
  'students',(select coalesce(jsonb_agg(to_jsonb(r) order by r.level,public.import_grade_key(r.grade),r.section,r.name,r.id),'[]'::jsonb) from student_rows r))
 into result;
 return result;
end;
$$;

create or replace function public.student_period_report(school uuid,student uuid,period uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pupil record;p record;school_name text;period_classroom text;period_dates_unknown boolean;classes_allowed boolean;behavior_allowed boolean;
 gate_rows jsonb;class_rows jsonb;evaluation_json jsonb;record_rows jsonb;
 gate_summary jsonb;class_summary jsonb;
begin
 if not public.can_read_student(student) then raise exception 'REPORT_FORBIDDEN' using errcode='42501';end if;
 select s.*,concat(c.academic_year,' · ',c.level,' ',c.grade,' ',c.section) as classroom into pupil
 from public.students s join public.classrooms c on c.id=s.classroom_id where s.id=student and s.institution_id=school;
 if not found then raise exception 'REPORT_NOT_FOUND' using errcode='P0001';end if;
 select * into p from public.behavior_periods where id=period and institution_id=school;
 if not found then raise exception 'REPORT_INVALID_PERIOD' using errcode='22023';end if;
 select name into school_name from public.institutions where id=school;
 select concat(c.academic_year,' · ',c.level,' ',c.grade,' ',c.section),h.unknown_dates into period_classroom,period_dates_unknown from public.enrollment_cohort(school,p.starts_on,p.ends_on,p.academic_year) h join public.classrooms c on c.id=h.classroom_id where h.student_id=student;
 behavior_allowed:=public.behavior_can_grade(school,student) or public.behavior_is_guardian(school,student);
 classes_allowed:=public.has_school_role(school,array['administrador','director','docente']) or public.behavior_is_guardian(school,student);
 select coalesce(jsonb_agg(jsonb_build_object('at',g.occurred_at,'day',g.school_date,'kind',g.kind,'method',g.method,'first_entry',g.first_entry,'is_late',g.is_late,
  'reason',g.reason,'authorized_by',g.authorized_by,'accompanied_by',g.accompanied_by,'expects_return',g.expects_return) order by g.sequence_no),'[]'::jsonb)
 into gate_rows from public.gate_events g where g.institution_id=school and g.student_id=student and g.school_date between p.starts_on and p.ends_on;
 select jsonb_build_object('movements',count(*),'first_entries',count(*) filter(where first_entry),'late_entries',count(*) filter(where first_entry and is_late),
  'on_time_entries',count(*) filter(where first_entry and is_late=false),'unclassified_entries',count(*) filter(where first_entry and is_late is null),'early_exits',count(*) filter(where kind='early_exit'))
 into gate_summary from public.gate_events where institution_id=school and student_id=student and school_date between p.starts_on and p.ends_on;
 if classes_allowed then
  select coalesce(jsonb_agg(jsonb_build_object('date',s.session_date,'starts_at',s.starts_at,'ends_at',s.ends_at,'course',c.name,
   'classroom',concat(r.academic_year,' · ',r.level,' ',r.grade,' ',r.section),'status',a.status,'note',a.note) order by s.session_date,s.starts_at,s.id),'[]'::jsonb)
  into class_rows from public.class_attendance a join public.class_sessions s on s.id=a.session_id
  join public.school_courses c on c.id=s.course_id join public.classrooms r on r.id=s.classroom_id
  where a.institution_id=school and a.student_id=student and s.state='closed' and s.session_date between p.starts_on and p.ends_on
  and public.class_student_access(s.id,student);
  select jsonb_build_object('sessions',count(*),'present',count(*) filter(where a.status='present'),'late',count(*) filter(where a.status='late'),
   'absent',count(*) filter(where a.status='absent'),'justified',count(*) filter(where a.status='justified'))
  into class_summary from public.class_attendance a join public.class_sessions s on s.id=a.session_id
  where a.institution_id=school and a.student_id=student and s.state='closed' and s.session_date between p.starts_on and p.ends_on
  and public.class_student_access(s.id,student);
 end if;
 if behavior_allowed then
  select jsonb_build_object('presentation',e.presentation,'punctuality',e.punctuality,'coexistence',e.coexistence,'responsibility',e.responsibility,
   'final_score',e.final_score,'rationale',e.rationale,'published_at',e.published_at,'rubric_name',r.name,'rubric_reference',r.reference)
  into evaluation_json from public.behavior_evaluations e join public.behavior_rubrics r on r.id=e.rubric_id
  where e.institution_id=school and e.student_id=student and e.period_id=period and e.state='published';
  select coalesce(jsonb_agg(jsonb_build_object('at',r.occurred_at,'kind',r.kind,'criterion',r.criterion,'summary',r.family_summary,
   'followups',(select coalesce(jsonb_agg(jsonb_build_object('at',f.created_at,'state',f.state,'note',f.note) order by f.created_at,f.id),'[]'::jsonb)
   from public.behavior_followups f where f.record_id=r.id and f.family_visible)) order by r.occurred_at,r.id),'[]'::jsonb)
  into record_rows from public.behavior_records r where r.institution_id=school and r.student_id=student and r.period_id=period and r.published;
 end if;
 return jsonb_build_object('issued_at',now(),'school',jsonb_build_object('id',school,'name',school_name),
  'student',jsonb_build_object('id',student,'name',concat(pupil.last_names,', ',pupil.first_names),'dni',pupil.dni,'classroom',pupil.classroom,'active',pupil.active,'period_classroom',period_classroom,'enrollment_dates_unknown',period_dates_unknown),
  'period',jsonb_build_object('id',p.id,'name',p.name,'academic_year',p.academic_year,'starts_on',p.starts_on,'ends_on',p.ends_on),
  'can_classes',classes_allowed,'can_behavior',behavior_allowed,'gate_summary',gate_summary,'gate_events',gate_rows,
  'class_summary',class_summary,'classes',coalesce(class_rows,'[]'::jsonb),'evaluation',evaluation_json,'records',coalesce(record_rows,'[]'::jsonb));
end;
$$;

revoke all on function public.enrollment_profile_before_insert(),public.enrollment_profile_after_insert(),public.enrollment_cohort(uuid,date,date,integer),public.enrollment_session_students(uuid,uuid,date,time),public.enrollment_gate_guard() from public;
revoke all on function public.change_student_enrollment(uuid,uuid,text,uuid,uuid,integer,uuid,text),public.plan_enrollment_batch(uuid,uuid,uuid,jsonb,text),public.student_enrollment_detail(uuid,uuid) from public;
grant execute on function public.change_student_enrollment(uuid,uuid,text,uuid,uuid,integer,uuid,text),public.plan_enrollment_batch(uuid,uuid,uuid,jsonb,text),public.student_enrollment_detail(uuid,uuid) to authenticated;
commit;
