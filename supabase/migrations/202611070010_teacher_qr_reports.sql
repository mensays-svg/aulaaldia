begin;
create table public.class_qr_reads(
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,session_id uuid not null,student_id uuid not null,actor_id uuid not null references auth.users(id),request_id uuid not null,revision integer not null,recorded_at timestamptz not null default clock_timestamp(),
 unique(institution_id,request_id),foreign key(institution_id,session_id,student_id) references public.class_roster(institution_id,session_id,student_id)
);
alter table public.class_qr_reads enable row level security;
revoke all on public.class_qr_reads from anon,authenticated;

create function public.open_class_session(school uuid,classroom uuid,course uuid,teacher uuid,day date,start_time time,end_time time,subject text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.class_sessions%rowtype;created uuid;
begin
 if not(public.has_school_role(school,array['administrador','director']) or (teacher=auth.uid() and public.has_school_role(school,array['docente']))) then raise exception 'CLASS_FORBIDDEN' using errcode='42501';end if;
 perform 1 from public.institutions where id=school for update;
 select * into existing from public.class_sessions s where s.institution_id=school and s.classroom_id=classroom and s.course_id=course and s.teacher_id=teacher and s.session_date=day and s.starts_at=start_time and s.ends_at=end_time;
 if found then
  if not public.class_write_access(existing.id) then raise exception 'CLASS_FORBIDDEN' using errcode='42501';end if;
  if existing.state<>'draft' then raise exception 'CLASS_CLOSED' using errcode='P0001';end if;
  return jsonb_build_object('session_id',existing.id,'reused',true);
 end if;
 created:=public.create_class_session(school,classroom,course,teacher,day,start_time,end_time,subject);
 return jsonb_build_object('session_id',created,'reused',false);
end;
$$;

create function public.scan_class_attendance(school uuid,lesson uuid,code uuid,expected_revision integer,request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.class_sessions%rowtype;pupil record;existing public.class_qr_reads%rowtype;previous public.class_attendance%rowtype;gate record;new_revision integer;local_now timestamp:=clock_timestamp() at time zone 'America/Lima';
begin
 if not public.class_write_access(lesson) then raise exception 'CLASS_FORBIDDEN' using errcode='42501';end if;
 select * into s from public.class_sessions where id=lesson and institution_id=school for update;
 if not found then raise exception 'CLASS_NOT_FOUND' using errcode='P0001';end if;
 if s.state<>'draft' then raise exception 'CLASS_CLOSED' using errcode='P0001';end if;
 if request is null or code is null or expected_revision is null then raise exception 'CLASS_INVALID_INPUT' using errcode='22023';end if;
 select st.id,st.first_names,st.last_names into pupil from public.student_gate_codes c join public.students st on st.id=c.student_id and st.institution_id=school join public.class_roster r on r.student_id=st.id and r.session_id=lesson and r.institution_id=school where c.institution_id=school and c.token=code and st.active;
 if not found then raise exception 'CLASS_QR_NOT_IN_ROSTER' using errcode='42501';end if;
 select * into existing from public.class_qr_reads where institution_id=school and request_id=request;
 if found then
  if existing.session_id<>lesson or existing.student_id<>pupil.id or existing.actor_id<>auth.uid() then raise exception 'CLASS_QR_REQUEST_CONFLICT' using errcode='P0001';end if;
  if existing.revision<>s.revision then raise exception 'CLASS_STALE' using errcode='P0001';end if;
  select * into previous from public.class_attendance where session_id=lesson and student_id=pupil.id;
  return jsonb_build_object('student_id',pupil.id,'name',concat(pupil.last_names,', ',pupil.first_names),'status',previous.status,'revision',s.revision,'repeated',true,'needs_review',false);
 end if;
 local_now:=clock_timestamp() at time zone 'America/Lima';
 if s.revision<>expected_revision then raise exception 'CLASS_STALE' using errcode='P0001';end if;
 if s.session_date<>local_now::date or local_now<s.session_date+s.starts_at or local_now>s.session_date+s.ends_at then raise exception 'CLASS_QR_OUTSIDE_TIME' using errcode='P0001';end if;
 select * into previous from public.class_attendance where session_id=lesson and student_id=pupil.id;
 if found then
  return jsonb_build_object('student_id',pupil.id,'name',concat(pupil.last_names,', ',pupil.first_names),'status',previous.status,'revision',s.revision,'repeated',true,'needs_review',false);
 end if;
 select e.kind,e.expects_return,e.occurred_at,e.reason into gate from public.gate_events e where e.institution_id=school and e.student_id=pupil.id and e.school_date=s.session_date and e.occurred_at<=least(clock_timestamp(),(s.session_date+s.ends_at) at time zone 'America/Lima') order by e.sequence_no desc limit 1;
 if gate.kind in ('exit','early_exit') then
  return jsonb_build_object('student_id',pupil.id,'name',concat(pupil.last_names,', ',pupil.first_names),'status',null,'revision',s.revision,'repeated',false,'needs_review',true,'gate_kind',gate.kind,'gate_at',gate.occurred_at,'gate_reason',gate.reason,'gate_expects_return',gate.expects_return);
 end if;
 new_revision:=public.save_class_attendance(school,lesson,s.revision,jsonb_build_array(jsonb_build_object('student_id',pupil.id,'status','present','note',null)),'Registro por QR en clase');
 insert into public.class_qr_reads(institution_id,session_id,student_id,actor_id,request_id,revision) values(school,lesson,pupil.id,auth.uid(),request,new_revision);
 return jsonb_build_object('student_id',pupil.id,'name',concat(pupil.last_names,', ',pupil.first_names),'status','present','revision',new_revision,'repeated',false,'needs_review',false);
end;
$$;
create function public.teacher_period_report(school uuid,period uuid,classroom uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p record;school_name text;result jsonb;filter_year integer;filter_level text:=null;filter_grade text:=null;filter_section text:=null;filter_state text:='all';
begin
 if not public.has_school_role(school,array['administrador','director','docente']) then raise exception 'MANAGEMENT_FORBIDDEN' using errcode='42501';end if;
 select * into p from public.behavior_periods where id=period and institution_id=school;
 if not found then raise exception 'MANAGEMENT_INVALID_PERIOD' using errcode='22023';end if;
 filter_year:=p.academic_year;
 if not exists(select 1 from public.classrooms c where c.id=classroom and c.institution_id=school and c.academic_year=filter_year and (public.has_school_role(school,array['administrador','director']) or exists(select 1 from public.teacher_assignments t where t.institution_id=school and t.classroom_id=c.id and t.user_id=auth.uid()))) then raise exception 'TEACHER_REPORT_FORBIDDEN' using errcode='42501';end if;
 filter_level:=nullif(btrim(filter_level),'');filter_grade:=nullif(btrim(filter_grade),'');filter_section:=nullif(upper(btrim(filter_section)),'');
 if filter_year is null or filter_year<>p.academic_year or filter_year not between 2000 and 2100
  or (filter_level is not null and filter_level not in ('Inicial','Primaria','Secundaria')) or length(filter_grade)>40 or length(filter_section)>40
  or filter_state is null or filter_state not in ('all','active','inactive') then raise exception 'MANAGEMENT_INVALID_FILTER' using errcode='22023';end if;
 select name into school_name from public.institutions where id=school;
 with selected_rooms as (
  select c.id,c.academic_year,c.level,c.grade,c.section,concat(c.academic_year,' · ',c.level,' ',c.grade,' ',c.section) as classroom
  from public.classrooms c where c.institution_id=school and c.academic_year=filter_year and c.id=classroom
  and (filter_level is null or c.level=filter_level)
  and (filter_grade is null or public.import_grade_key(c.grade)=public.import_grade_key(filter_grade))
  and (filter_section is null or upper(btrim(c.section))=filter_section)
 ),roster as (
  select s.id,s.first_names,s.last_names,s.dni,h.active,h.classroom_id,c.classroom,c.level,c.grade,c.section,h.unknown_dates
  from public.enrollment_cohort(school,p.starts_on,p.ends_on,filter_year) h join public.students s on s.id=h.student_id join selected_rooms c on c.id=h.classroom_id where s.institution_id=school and public.can_read_student(s.id) and (public.has_school_role(school,array['administrador','director']) or exists(select 1 from public.teacher_assignments mine where mine.institution_id=school and mine.classroom_id=s.classroom_id and mine.user_id=auth.uid()))
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
  where a.institution_id=school and cs.institution_id=school and cs.state='closed' and public.class_staff_access(cs.id) and cs.session_date between p.starts_on and p.ends_on group by a.student_id
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
 select jsonb_build_object('teacher_scope',true,'cohort_basis','enrollment_history','unknown_enrollment_dates',(select count(*) from roster where unknown_dates),'issued_at',now(),'school',jsonb_build_object('id',school,'name',school_name),
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


revoke all on function public.open_class_session(uuid,uuid,uuid,uuid,date,time,time,text),public.scan_class_attendance(uuid,uuid,uuid,integer,uuid),public.teacher_period_report(uuid,uuid,uuid) from public;
grant execute on function public.open_class_session(uuid,uuid,uuid,uuid,date,time,time,text),public.scan_class_attendance(uuid,uuid,uuid,integer,uuid),public.teacher_period_report(uuid,uuid,uuid) to authenticated;
commit;
