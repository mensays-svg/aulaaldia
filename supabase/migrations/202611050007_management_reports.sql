begin;
-- Cohort = students' current classrooms. Each source is aggregated separately
-- before joining, so movements, class marks and behavior records cannot multiply.
create function public.management_period_report(
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
  select s.id,s.first_names,s.last_names,s.dni,s.active,s.classroom_id,c.classroom,c.level,c.grade,c.section
  from public.students s join selected_rooms c on c.id=s.classroom_id where s.institution_id=school
  and (filter_state='all' or (filter_state='active' and s.active) or (filter_state='inactive' and not s.active))
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
 select jsonb_build_object('issued_at',now(),'school',jsonb_build_object('id',school,'name',school_name),
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
revoke all on function public.management_period_report(uuid,uuid,integer,text,text,text,text) from public;
grant execute on function public.management_period_report(uuid,uuid,integer,text,text,text,text) to authenticated;
commit;
