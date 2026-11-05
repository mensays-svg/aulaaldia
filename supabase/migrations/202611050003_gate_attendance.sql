begin;
create table public.gate_schedules (
 institution_id uuid not null,
 classroom_id uuid primary key,
 starts_at time not null,
 grace_minutes integer not null default 0 check (grace_minutes between 0 and 120),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 foreign key(institution_id,classroom_id) references public.classrooms(institution_id,id)
);
create table public.student_gate_codes (
 institution_id uuid not null,
 student_id uuid primary key,
 token uuid not null unique default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 foreign key(institution_id,student_id) references public.students(institution_id,id)
);
create table public.gate_events (
 id uuid primary key default gen_random_uuid(),
 sequence_no bigint generated always as identity unique,
 institution_id uuid not null,
 student_id uuid not null,
 classroom_id uuid not null,
 school_date date not null,
 occurred_at timestamptz not null,
 kind text not null check(kind in ('entry','exit','early_exit','return')),
 method text not null check(method in ('dni','apellidos','qr')),
 actor_id uuid not null references auth.users(id),
 request_id uuid not null,
 reason text check(reason in ('salud','urgencia_familiar','tramite','otro')),
 note text check(length(note)<=500),
 authorized_by text check(length(authorized_by)<=120),
 accompanied_by text check(length(accompanied_by)<=120),
 expects_return boolean not null default false,
 return_of uuid references public.gate_events(id),
 first_entry boolean not null default false,
 is_late boolean,
 constraint gate_events_student_fk foreign key(institution_id,student_id) references public.students(institution_id,id),
 foreign key(institution_id,classroom_id) references public.classrooms(institution_id,id),
 unique(institution_id,request_id),
 check (school_date=(occurred_at at time zone 'America/Lima')::date),
 check ((kind='early_exit' and reason is not null and length(btrim(authorized_by))>0)
  or (kind<>'early_exit' and reason is null and authorized_by is null and accompanied_by is null and not expects_return)),
 check ((kind='return')=(return_of is not null)),
 check (not first_entry or kind='entry'),
 check (is_late is null or first_entry)
);
create index gate_events_student_day_idx on public.gate_events(student_id,school_date,sequence_no desc);
create index gate_events_school_day_idx on public.gate_events(institution_id,school_date,sequence_no desc);
alter table public.gate_schedules enable row level security;
alter table public.student_gate_codes enable row level security;
alter table public.gate_events enable row level security;
create policy gate_schedule_read on public.gate_schedules for select to authenticated using(public.can_read_classroom(classroom_id));
create policy gate_code_read on public.student_gate_codes for select to authenticated using(public.has_school_role(institution_id,array['administrador','director','auxiliar']));
create policy gate_event_read on public.gate_events for select to authenticated using(public.can_read_student(student_id));
revoke all on public.gate_schedules,public.student_gate_codes,public.gate_events from anon,authenticated;
grant select on public.gate_schedules,public.student_gate_codes,public.gate_events to authenticated;

create function public.set_gate_schedule(school uuid, classroom uuid, start_time time, tolerance integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'GATE_FORBIDDEN' using errcode='42501'; end if;
 if start_time is null or tolerance is null or tolerance not between 0 and 120 then raise exception 'GATE_INVALID_SCHEDULE' using errcode='22023'; end if;
 if not exists(select 1 from public.classrooms where institution_id=school and id=classroom) then raise exception 'GATE_STUDENT_NOT_FOUND' using errcode='P0001'; end if;
 insert into public.gate_schedules(institution_id,classroom_id,starts_at,grace_minutes,updated_by)
 values(school,classroom,start_time,tolerance,auth.uid())
 on conflict(classroom_id) do update set starts_at=excluded.starts_at,grace_minutes=excluded.grace_minutes,updated_by=auth.uid(),updated_at=clock_timestamp();
end;
$$;

create function public.get_student_gate_code(school uuid, student uuid, rotate boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare code uuid;
begin
 if not public.has_school_role(school,array['administrador','director','auxiliar']) then raise exception 'GATE_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.students where id=student and institution_id=school and active for update;
 if not found then raise exception 'GATE_STUDENT_NOT_FOUND' using errcode='P0001'; end if;
 insert into public.student_gate_codes(institution_id,student_id) values(school,student) on conflict do nothing;
 if rotate then update public.student_gate_codes set token=gen_random_uuid(),updated_at=clock_timestamp() where student_id=student; end if;
 select token into code from public.student_gate_codes where student_id=student;
 return code;
end;
$$;

create function public.find_gate_qr(school uuid, code uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare student uuid;
begin
 if not public.has_school_role(school,array['administrador','director','auxiliar']) then raise exception 'GATE_FORBIDDEN' using errcode='42501'; end if;
 select student_id into student from public.student_gate_codes where institution_id=school and token=code;
 if student is null then raise exception 'GATE_QR_INVALID' using errcode='P0001'; end if;
 return student;
end;
$$;

create function public.gate_student_status(school uuid, student uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s record; last_event record; schedule record; day date := (now() at time zone 'America/Lima')::date;
begin
 if not public.can_read_student(student) then raise exception 'GATE_FORBIDDEN' using errcode='42501'; end if;
 select st.*,c.academic_year,c.level,c.grade,c.section into s from public.students st join public.classrooms c on c.id=st.classroom_id where st.id=student and st.institution_id=school;
 if not found then raise exception 'GATE_STUDENT_NOT_FOUND' using errcode='P0001'; end if;
 select * into last_event from public.gate_events where student_id=student and school_date=day order by sequence_no desc limit 1;
 select * into schedule from public.gate_schedules where classroom_id=s.classroom_id;
 return jsonb_build_object('id',s.id,'first_names',s.first_names,'last_names',s.last_names,'dni',s.dni,'active',s.active,
  'classroom_id',s.classroom_id,'classroom',concat(s.academic_year,' · ',s.level,' ',s.grade,' ',s.section),'day',day,
  'state',case when last_event.kind in ('entry','return') then 'inside' when last_event.kind='early_exit' and last_event.expects_return then 'awaiting_return' when last_event.kind is null then 'unregistered' else 'outside' end,
  'last_kind',last_event.kind,'last_at',last_event.occurred_at,'starts_at',schedule.starts_at,'grace_minutes',schedule.grace_minutes);
end;
$$;

create function public.record_gate_event(
 school uuid, student uuid, movement text, source text, request uuid,
 exit_reason text default null, observation text default null, authorized_name text default null,
 companion text default null, will_return boolean default false, qr_code uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s record; previous record; saved record; schedule record; instant timestamptz; day date; first boolean; late boolean; return_event uuid;
begin
 if not public.has_school_role(school,array['administrador','director','auxiliar']) then raise exception 'GATE_FORBIDDEN' using errcode='42501'; end if;
 if movement is null or movement not in ('entry','exit','early_exit','return') or source is null or source not in ('dni','apellidos','qr') or request is null then raise exception 'GATE_INVALID_INPUT' using errcode='22023'; end if;
 observation := nullif(btrim(observation),''); authorized_name := nullif(btrim(authorized_name),''); companion := nullif(btrim(companion),'');
 if length(observation)>500 or length(authorized_name)>120 or length(companion)>120 or will_return is null then raise exception 'GATE_INVALID_INPUT' using errcode='22023'; end if;
 if movement='early_exit' then
  if exit_reason is null or exit_reason not in ('salud','urgencia_familiar','tramite','otro') or authorized_name is null then raise exception 'GATE_EXIT_DETAILS_REQUIRED' using errcode='22023'; end if;
 else
  if exit_reason is not null or authorized_name is not null or companion is not null or will_return then raise exception 'GATE_INVALID_INPUT' using errcode='22023'; end if;
 end if;
 select * into s from public.students where id=student and institution_id=school for update;
 if not found then raise exception 'GATE_STUDENT_NOT_FOUND' using errcode='P0001'; end if;
 -- Read the original result before state checks: a retry is never a second marking.
 select * into saved from public.gate_events where institution_id=school and request_id=request;
 if found then
  if saved.student_id<>student or saved.kind<>movement or saved.method<>source or saved.actor_id<>auth.uid()
   or saved.reason is distinct from exit_reason or saved.note is distinct from observation
   or saved.authorized_by is distinct from authorized_name or saved.accompanied_by is distinct from companion
   or saved.expects_return is distinct from will_return then raise exception 'GATE_REQUEST_CONFLICT' using errcode='P0001'; end if;
  return jsonb_build_object('id',saved.id,'occurred_at',saved.occurred_at,'is_late',saved.is_late,'repeated',true);
 end if;
 if not s.active then raise exception 'GATE_INACTIVE_STUDENT' using errcode='P0001'; end if;
 if source='qr' then
  if qr_code is null or not exists(select 1 from public.student_gate_codes where student_id=student and institution_id=school and token=qr_code) then raise exception 'GATE_QR_INVALID' using errcode='P0001'; end if;
 end if;
 instant := clock_timestamp(); day := (instant at time zone 'America/Lima')::date;
 select * into previous from public.gate_events where student_id=student and school_date=day order by sequence_no desc limit 1;
 if movement='entry' and (previous.kind in ('entry','return') or (previous.kind='early_exit' and previous.expects_return)) then raise exception 'GATE_INVALID_TRANSITION' using errcode='P0001'; end if;
 if movement in ('exit','early_exit') and (previous.kind is null or previous.kind not in ('entry','return')) then raise exception 'GATE_INVALID_TRANSITION' using errcode='P0001'; end if;
 if movement='return' and (previous.kind is null or previous.kind<>'early_exit' or not previous.expects_return) then raise exception 'GATE_INVALID_TRANSITION' using errcode='P0001'; end if;
 first := movement='entry' and not exists(select 1 from public.gate_events where student_id=student and school_date=day and kind='entry');
 if first then
  select * into schedule from public.gate_schedules where classroom_id=s.classroom_id;
  if found then late := (instant at time zone 'America/Lima') > day+schedule.starts_at+make_interval(mins=>schedule.grace_minutes); end if;
 end if;
 if movement='return' then return_event := previous.id; end if;
 insert into public.gate_events(institution_id,student_id,classroom_id,school_date,occurred_at,kind,method,actor_id,request_id,reason,note,authorized_by,accompanied_by,expects_return,return_of,first_entry,is_late)
 values(school,student,s.classroom_id,day,instant,movement,source,auth.uid(),request,exit_reason,observation,authorized_name,companion,will_return,return_event,first,late)
 returning * into saved;
 return jsonb_build_object('id',saved.id,'occurred_at',saved.occurred_at,'is_late',saved.is_late,'repeated',false);
end;
$$;

revoke all on function public.set_gate_schedule(uuid,uuid,time,integer),public.get_student_gate_code(uuid,uuid,boolean),public.find_gate_qr(uuid,uuid),public.gate_student_status(uuid,uuid),public.record_gate_event(uuid,uuid,text,text,uuid,text,text,text,text,boolean,uuid) from public;
grant execute on function public.set_gate_schedule(uuid,uuid,time,integer),public.get_student_gate_code(uuid,uuid,boolean),public.find_gate_qr(uuid,uuid),public.gate_student_status(uuid,uuid),public.record_gate_event(uuid,uuid,text,text,uuid,text,text,text,text,boolean,uuid) to authenticated;
commit;
