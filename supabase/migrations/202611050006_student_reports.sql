begin;
-- One stable query builds the same authorized data used by the web and PDF.
-- No writes, public links, service-role access, or internal behavior annotations.
create function public.student_period_report(school uuid,student uuid,period uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pupil record;p record;school_name text;classes_allowed boolean;behavior_allowed boolean;
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
  'student',jsonb_build_object('id',student,'name',concat(pupil.last_names,', ',pupil.first_names),'dni',pupil.dni,'classroom',pupil.classroom,'active',pupil.active),
  'period',jsonb_build_object('id',p.id,'name',p.name,'academic_year',p.academic_year,'starts_on',p.starts_on,'ends_on',p.ends_on),
  'can_classes',classes_allowed,'can_behavior',behavior_allowed,'gate_summary',gate_summary,'gate_events',gate_rows,
  'class_summary',class_summary,'classes',coalesce(class_rows,'[]'::jsonb),'evaluation',evaluation_json,'records',coalesce(record_rows,'[]'::jsonb));
end;
$$;
revoke all on function public.student_period_report(uuid,uuid,uuid) from public;
grant execute on function public.student_period_report(uuid,uuid,uuid) to authenticated;
commit;
