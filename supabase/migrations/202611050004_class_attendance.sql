begin;
create table public.school_courses (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 name text not null check(length(btrim(name)) between 2 and 100),
 unique(institution_id,id)
);
create unique index school_course_name_idx on public.school_courses(institution_id,lower(btrim(name)));
create table public.class_sessions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 classroom_id uuid not null,
 course_id uuid not null,
 teacher_id uuid not null references auth.users(id),
 session_date date not null,
 starts_at time not null,
 ends_at time not null check(ends_at>starts_at),
 topic text check(length(topic)<=160),
 state text not null default 'draft' check(state in ('draft','closed')),
 revision integer not null default 0,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 closed_at timestamptz,
 unique(institution_id,id),
 unique(classroom_id,session_date,starts_at),
 foreign key(institution_id,classroom_id) references public.classrooms(institution_id,id),
 foreign key(institution_id,course_id) references public.school_courses(institution_id,id)
);
create table public.class_roster (
 institution_id uuid not null,
 session_id uuid not null,
 student_id uuid not null,
 primary key(session_id,student_id),
 unique(institution_id,session_id,student_id),
 foreign key(institution_id,session_id) references public.class_sessions(institution_id,id),
 foreign key(institution_id,student_id) references public.students(institution_id,id)
);
create table public.class_attendance (
 institution_id uuid not null,
 session_id uuid not null,
 student_id uuid not null,
 status text not null check(status in ('present','late','absent','justified')),
 note text check(length(note)<=500),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(session_id,student_id),
 foreign key(institution_id,session_id,student_id) references public.class_roster(institution_id,session_id,student_id),
 check(status<>'justified' or (note is not null and length(btrim(note))>0))
);
create table public.class_attendance_changes (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 session_id uuid not null,
 student_id uuid not null,
 old_status text,
 new_status text not null,
 old_note text,
 new_note text,
 reason text,
 actor_id uuid not null references auth.users(id),
 changed_at timestamptz not null default now(),
 foreign key(institution_id,session_id,student_id) references public.class_roster(institution_id,session_id,student_id)
);
create table public.class_session_logs (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 session_id uuid not null,
 action text not null check(action in ('created','closed','reopened')),
 reason text,
 actor_id uuid not null references auth.users(id),
 happened_at timestamptz not null default now(),
 foreign key(institution_id,session_id) references public.class_sessions(institution_id,id)
);
create index class_session_day_idx on public.class_sessions(institution_id,session_date,starts_at);
create index class_roster_student_idx on public.class_roster(student_id,session_id);
create index class_changes_session_idx on public.class_attendance_changes(session_id,changed_at);

create function public.class_staff_access(lesson uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.class_sessions s where s.id=lesson and (
  public.has_school_role(s.institution_id,array['administrador','director']) or
  (public.has_school_role(s.institution_id,array['docente']) and exists(select 1 from public.teacher_assignments t where t.classroom_id=s.classroom_id and t.user_id=auth.uid()))
 ));
$$;
create function public.class_write_access(lesson uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.class_sessions s where s.id=lesson and (
  public.has_school_role(s.institution_id,array['administrador','director']) or
  (s.teacher_id=auth.uid() and public.has_school_role(s.institution_id,array['docente']) and exists(select 1 from public.teacher_assignments t where t.classroom_id=s.classroom_id and t.user_id=auth.uid()))
 ));
$$;
create function public.class_read_access(lesson uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.class_staff_access(lesson) or exists(
  select 1 from public.class_sessions s join public.class_roster r on r.session_id=s.id
  join public.student_guardians g on g.student_id=r.student_id
  where s.id=lesson and s.state='closed' and g.user_id=auth.uid()
 );
$$;
create function public.class_student_access(lesson uuid,student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.class_read_access(lesson) and (public.class_staff_access(lesson) or exists(select 1 from public.student_guardians g where g.student_id=student and g.user_id=auth.uid()));
$$;

alter table public.school_courses enable row level security;
alter table public.class_sessions enable row level security;
alter table public.class_roster enable row level security;
alter table public.class_attendance enable row level security;
alter table public.class_attendance_changes enable row level security;
alter table public.class_session_logs enable row level security;
create policy class_course_read on public.school_courses for select to authenticated using(public.has_school_role(institution_id,array['administrador','director','docente','auxiliar','apoderado']));
create policy class_session_read on public.class_sessions for select to authenticated using(public.class_read_access(id));
create policy class_roster_read on public.class_roster for select to authenticated using(public.class_student_access(session_id,student_id));
create policy class_attendance_read on public.class_attendance for select to authenticated using(public.class_student_access(session_id,student_id));
create policy class_changes_read on public.class_attendance_changes for select to authenticated using(public.class_staff_access(session_id));
create policy class_logs_read on public.class_session_logs for select to authenticated using(public.class_staff_access(session_id));
revoke all on public.school_courses,public.class_sessions,public.class_roster,public.class_attendance,public.class_attendance_changes,public.class_session_logs from anon,authenticated;
grant select on public.school_courses,public.class_sessions,public.class_roster,public.class_attendance,public.class_attendance_changes,public.class_session_logs to authenticated;

create function public.create_school_course(school uuid, course_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'CLASS_FORBIDDEN' using errcode='42501'; end if;
 if course_name is null or length(btrim(course_name)) not between 2 and 100 then raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
 insert into public.school_courses(institution_id,name) values(school,btrim(course_name)) returning id into created;
 return created;
end;
$$;
create function public.create_class_session(school uuid,classroom uuid,course uuid,teacher uuid,day date,start_time time,end_time time,subject text default null) returns uuid
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
 select count(*) into amount from public.students where institution_id=school and classroom_id=classroom and active;
 if amount not between 1 and 1000 then raise exception 'CLASS_EMPTY_ROSTER' using errcode='P0001'; end if;
 insert into public.class_sessions(institution_id,classroom_id,course_id,teacher_id,session_date,starts_at,ends_at,topic,created_by)
 values(school,classroom,course,teacher,day,start_time,end_time,nullif(btrim(subject),''),auth.uid()) returning id into created;
 insert into public.class_roster(institution_id,session_id,student_id) select school,created,id from public.students where institution_id=school and classroom_id=classroom and active;
 get diagnostics amount=row_count;
 if amount not between 1 and 1000 then raise exception 'CLASS_EMPTY_ROSTER' using errcode='P0001'; end if;
 insert into public.class_session_logs(institution_id,session_id,action,actor_id) values(school,created,'created',auth.uid());
 return created;
end;
$$;

create function public.save_class_attendance(school uuid,lesson uuid,expected_revision integer,marks jsonb,correction text default null) returns integer
language plpgsql security definer set search_path='' as $$
declare s record; item record; previous record; changed integer:=0; clean_note text;
begin
 if not public.class_write_access(lesson) then raise exception 'CLASS_FORBIDDEN' using errcode='42501'; end if;
 select * into s from public.class_sessions where id=lesson and institution_id=school for update;
 if not found then raise exception 'CLASS_NOT_FOUND' using errcode='P0001'; end if;
 if s.state<>'draft' then raise exception 'CLASS_CLOSED' using errcode='P0001'; end if;
 if expected_revision is null or expected_revision<>s.revision then raise exception 'CLASS_STALE' using errcode='P0001'; end if;
 if (s.session_date+s.starts_at)>(clock_timestamp() at time zone 'America/Lima') then raise exception 'CLASS_FUTURE' using errcode='P0001'; end if;
 correction:=nullif(btrim(correction),'');
 if length(correction)>500 or jsonb_typeof(marks) is distinct from 'array' then raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
 if jsonb_array_length(marks) not between 1 and 1000 or octet_length(marks::text)>700000 then raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(marks) e where jsonb_typeof(e)<>'object') then raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
 if exists(select 1 from jsonb_to_recordset(marks) as m(student_id uuid) group by student_id having count(*)>1) then raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
 for item in select * from jsonb_to_recordset(marks) as m(student_id uuid,status text,note text) loop
  clean_note:=nullif(btrim(item.note),'');
  if item.student_id is null or item.status is null or item.status not in ('present','late','absent','justified') or length(clean_note)>500 or (item.status='justified' and clean_note is null) then raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
  if not exists(select 1 from public.class_roster where session_id=lesson and student_id=item.student_id) then raise exception 'CLASS_STUDENT_NOT_IN_ROSTER' using errcode='42501'; end if;
  select * into previous from public.class_attendance where session_id=lesson and student_id=item.student_id;
  if found and previous.status=item.status and previous.note is not distinct from clean_note then continue; end if;
  if found and correction is null then raise exception 'CLASS_CORRECTION_REQUIRED' using errcode='22023'; end if;
  insert into public.class_attendance_changes(institution_id,session_id,student_id,old_status,new_status,old_note,new_note,reason,actor_id)
   values(school,lesson,item.student_id,previous.status,item.status,previous.note,clean_note,correction,auth.uid());
  insert into public.class_attendance(institution_id,session_id,student_id,status,note,updated_by)
   values(school,lesson,item.student_id,item.status,clean_note,auth.uid())
   on conflict(session_id,student_id) do update set status=excluded.status,note=excluded.note,updated_by=auth.uid(),updated_at=clock_timestamp();
  changed:=changed+1;
 end loop;
 if changed>0 then update public.class_sessions set revision=revision+1 where id=lesson returning revision into expected_revision; end if;
 return expected_revision;
end;
$$;

create function public.change_class_session_state(school uuid,lesson uuid,expected_revision integer,new_state text,reason text default null) returns integer
language plpgsql security definer set search_path='' as $$
declare s record;
begin
 if not public.class_write_access(lesson) then raise exception 'CLASS_FORBIDDEN' using errcode='42501'; end if;
 select * into s from public.class_sessions where id=lesson and institution_id=school for update;
 if not found then raise exception 'CLASS_NOT_FOUND' using errcode='P0001'; end if;
 if expected_revision is null or s.revision<>expected_revision then raise exception 'CLASS_STALE' using errcode='P0001'; end if;
 reason:=nullif(btrim(reason),'');
 if new_state='closed' and s.state='draft' then
  if (s.session_date+s.starts_at)>(clock_timestamp() at time zone 'America/Lima') then raise exception 'CLASS_FUTURE' using errcode='P0001'; end if;
  if exists(select 1 from public.class_roster r where r.session_id=lesson and not exists(select 1 from public.class_attendance a where a.session_id=lesson and a.student_id=r.student_id)) then raise exception 'CLASS_INCOMPLETE' using errcode='P0001'; end if;
  update public.class_sessions set state='closed',revision=revision+1,closed_at=clock_timestamp() where id=lesson returning revision into expected_revision;
  insert into public.class_session_logs(institution_id,session_id,action,actor_id) values(school,lesson,'closed',auth.uid());
 elsif new_state='draft' and s.state='closed' then
  if not public.has_school_role(school,array['administrador','director']) then raise exception 'CLASS_FORBIDDEN' using errcode='42501'; end if;
  if reason is null or length(reason)>500 then raise exception 'CLASS_CORRECTION_REQUIRED' using errcode='22023'; end if;
  update public.class_sessions set state='draft',revision=revision+1,closed_at=null where id=lesson returning revision into expected_revision;
  insert into public.class_session_logs(institution_id,session_id,action,reason,actor_id) values(school,lesson,'reopened',reason,auth.uid());
 else raise exception 'CLASS_INVALID_INPUT' using errcode='22023'; end if;
 return expected_revision;
end;
$$;

create function public.class_session_detail(school uuid,lesson uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s record; roster jsonb; cutoff timestamptz;
begin
 if not public.class_read_access(lesson) then raise exception 'CLASS_FORBIDDEN' using errcode='42501'; end if;
 select cs.*,c.name as course,concat(r.academic_year,' · ',r.level,' ',r.grade,' ',r.section) as classroom into s
 from public.class_sessions cs join public.school_courses c on c.id=cs.course_id join public.classrooms r on r.id=cs.classroom_id
 where cs.id=lesson and cs.institution_id=school;
 if not found then raise exception 'CLASS_NOT_FOUND' using errcode='P0001'; end if;
 cutoff:=least(now(),(s.session_date+s.ends_at) at time zone 'America/Lima');
 select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'first_names',st.first_names,'last_names',st.last_names,'dni',st.dni,
  'status',a.status,'note',a.note,'gate_kind',g.kind,'gate_at',g.occurred_at,'gate_reason',g.reason,'gate_expects_return',g.expects_return)
  order by st.last_names,st.first_names,st.id),'[]'::jsonb) into roster
 from public.class_roster r join public.students st on st.id=r.student_id
 left join public.class_attendance a on a.session_id=r.session_id and a.student_id=r.student_id
 left join lateral (select e.kind,e.occurred_at,e.reason,e.expects_return from public.gate_events e where e.student_id=r.student_id and e.school_date=s.session_date and e.occurred_at<=cutoff order by e.sequence_no desc limit 1) g on true
 where r.session_id=lesson and public.class_student_access(lesson,r.student_id);
 return jsonb_build_object('id',s.id,'course',s.course,'classroom',s.classroom,'teacher_id',s.teacher_id,'date',s.session_date,
  'starts_at',s.starts_at,'ends_at',s.ends_at,'topic',s.topic,'state',s.state,'revision',s.revision,'can_edit',public.class_write_access(lesson),
  'can_manage',public.has_school_role(school,array['administrador','director']),'gate_cutoff',cutoff,'students',roster);
end;
$$;

revoke all on function public.class_staff_access(uuid),public.class_write_access(uuid),public.class_read_access(uuid),public.class_student_access(uuid,uuid),public.create_school_course(uuid,text),public.create_class_session(uuid,uuid,uuid,uuid,date,time,time,text),public.save_class_attendance(uuid,uuid,integer,jsonb,text),public.change_class_session_state(uuid,uuid,integer,text,text),public.class_session_detail(uuid,uuid) from public;
grant execute on function public.class_staff_access(uuid),public.class_write_access(uuid),public.class_read_access(uuid),public.class_student_access(uuid,uuid),public.create_school_course(uuid,text),public.create_class_session(uuid,uuid,uuid,uuid,date,time,time,text),public.save_class_attendance(uuid,uuid,integer,jsonb,text),public.change_class_session_state(uuid,uuid,integer,text,text),public.class_session_detail(uuid,uuid) to authenticated;
commit;
