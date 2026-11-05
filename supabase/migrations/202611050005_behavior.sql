begin;
create table public.behavior_periods (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id),
 name text not null check(length(btrim(name)) between 2 and 100), academic_year integer not null check(academic_year between 2000 and 2100),
 starts_on date not null, ends_on date not null check(ends_on>=starts_on),
 unique(institution_id,id), check(extract(year from starts_on)=academic_year and extract(year from ends_on)=academic_year)
);
create unique index behavior_period_name_idx on public.behavior_periods(institution_id,academic_year,lower(btrim(name)));
create table public.behavior_rubrics (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id),
 name text not null check(length(btrim(name)) between 2 and 120), reference text not null check(length(btrim(reference)) between 2 and 200),
 criteria text not null check(length(btrim(criteria)) between 40 and 5000),
 registered_by uuid not null references auth.users(id), registered_at timestamptz not null default now(),
 unique(institution_id,id)
);
create table public.behavior_records (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null, student_id uuid not null, period_id uuid not null,
 kind text not null check(kind in ('recognition','incident')),
 criterion text not null check(criterion in ('presentation','punctuality','coexistence','responsibility')),
 occurred_at timestamptz not null, location text not null check(length(btrim(location)) between 1 and 120),
 description text not null check(length(btrim(description)) between 10 and 2000), student_version text check(length(student_version)<=2000),
 reported_by uuid not null references auth.users(id), reported_at timestamptz not null default now(),
 family_summary text check(length(family_summary)<=1500), published boolean not null default false,
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 unique(institution_id,id),
 foreign key(institution_id,student_id) references public.students(institution_id,id),
 foreign key(institution_id,period_id) references public.behavior_periods(institution_id,id),
 check(not published or (family_summary is not null and length(btrim(family_summary))>=10 and reviewed_by is not null))
);
create table public.behavior_followups (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null, record_id uuid not null,
 note text not null check(length(btrim(note)) between 5 and 1500), state text not null check(state in ('pending','in_progress','completed')),
 family_visible boolean not null default false, actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(institution_id,record_id) references public.behavior_records(institution_id,id)
);
create table public.behavior_evaluations (
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,student_id uuid not null,period_id uuid not null,rubric_id uuid,
 presentation numeric check(presentation between 0 and 20),punctuality numeric check(punctuality between 0 and 20),
 coexistence numeric check(coexistence between 0 and 20),responsibility numeric check(responsibility between 0 and 20),
 final_score numeric check(final_score between 0 and 20),rationale text check(length(rationale)<=2000),
 state text not null default 'draft' check(state in ('draft','published')),revision integer not null default 0,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),published_at timestamptz,
 unique(institution_id,id),unique(student_id,period_id),
 foreign key(institution_id,student_id) references public.students(institution_id,id),
 foreign key(institution_id,period_id) references public.behavior_periods(institution_id,id),
 foreign key(institution_id,rubric_id) references public.behavior_rubrics(institution_id,id),
 check(state='draft' or (rubric_id is not null and presentation is not null and punctuality is not null and coexistence is not null and responsibility is not null and final_score is not null and length(btrim(rationale))>=20))
);
create table public.behavior_audit (
 id uuid primary key default gen_random_uuid(),institution_id uuid not null,student_id uuid not null,
 record_id uuid,evaluation_id uuid,action text not null,reason text,previous_value jsonb,next_value jsonb,
 actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(institution_id,student_id) references public.students(institution_id,id),
 foreign key(institution_id,record_id) references public.behavior_records(institution_id,id),
 foreign key(institution_id,evaluation_id) references public.behavior_evaluations(institution_id,id),
 check((record_id is null)<>(evaluation_id is null))
);
create index behavior_records_period_idx on public.behavior_records(student_id,period_id,occurred_at desc);
create index behavior_followups_record_idx on public.behavior_followups(record_id,created_at desc);
create index behavior_audit_student_idx on public.behavior_audit(student_id,created_at desc);

create function public.behavior_can_grade(school uuid,student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.students s where s.id=student and s.institution_id=school and (
  public.has_school_role(school,array['administrador','director']) or
  (public.has_school_role(school,array['docente']) and exists(select 1 from public.teacher_assignments t where t.institution_id=school and t.classroom_id=s.classroom_id and t.user_id=auth.uid()))
 ));
$$;
create function public.behavior_can_report(school uuid,student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.behavior_can_grade(school,student) or (public.has_school_role(school,array['auxiliar']) and exists(select 1 from public.students where id=student and institution_id=school));
$$;
create function public.behavior_is_guardian(school uuid,student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_guardians where institution_id=school and student_id=student and user_id=auth.uid());
$$;
alter table public.behavior_periods enable row level security;
alter table public.behavior_rubrics enable row level security;
alter table public.behavior_records enable row level security;
alter table public.behavior_followups enable row level security;
alter table public.behavior_evaluations enable row level security;
alter table public.behavior_audit enable row level security;
create policy behavior_period_read on public.behavior_periods for select to authenticated using(public.has_school_role(institution_id,array['administrador','director','docente','auxiliar','apoderado']));
create policy behavior_rubric_read on public.behavior_rubrics for select to authenticated using(public.has_school_role(institution_id,array['administrador','director','docente','auxiliar','apoderado']));
-- Internal descriptions and student versions are never exposed to families by table reads.
create policy behavior_record_read on public.behavior_records for select to authenticated using(public.behavior_can_report(institution_id,student_id));
create policy behavior_followup_read on public.behavior_followups for select to authenticated using(exists(select 1 from public.behavior_records r where r.id=record_id and public.behavior_can_report(r.institution_id,r.student_id)));
create policy behavior_evaluation_read on public.behavior_evaluations for select to authenticated using(public.behavior_can_grade(institution_id,student_id) or (state='published' and public.behavior_is_guardian(institution_id,student_id)));
create policy behavior_audit_read on public.behavior_audit for select to authenticated using(public.behavior_can_grade(institution_id,student_id));
revoke all on public.behavior_periods,public.behavior_rubrics,public.behavior_records,public.behavior_followups,public.behavior_evaluations,public.behavior_audit from anon,authenticated;
grant select on public.behavior_periods,public.behavior_rubrics,public.behavior_records,public.behavior_followups,public.behavior_evaluations,public.behavior_audit to authenticated;

create function public.create_behavior_period(school uuid,label text,year integer,start_date date,end_date date) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
 if label is null or length(btrim(label)) not between 2 and 100 or year is null or year not between 2000 and 2100 or start_date is null or end_date is null or start_date>end_date or extract(year from start_date)<>year or extract(year from end_date)<>year then raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 insert into public.behavior_periods(institution_id,name,academic_year,starts_on,ends_on) values(school,btrim(label),year,start_date,end_date) returning id into result;return result;
end;
$$;
create function public.register_behavior_rubric(school uuid,label text,approval_reference text,criteria_text text,confirmed boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
 if confirmed is distinct from true or label is null or length(btrim(label)) not between 2 and 120 or approval_reference is null or length(btrim(approval_reference)) not between 2 and 200 or criteria_text is null or length(btrim(criteria_text)) not between 40 and 5000 then raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 insert into public.behavior_rubrics(institution_id,name,reference,criteria,registered_by) values(school,btrim(label),btrim(approval_reference),btrim(criteria_text),auth.uid()) returning id into result;return result;
end;
$$;
create function public.add_behavior_record(school uuid,student uuid,period uuid,record_kind text,item text,happened_at timestamptz,place text,facts text,student_statement text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare p record;result uuid;
begin
 if not public.behavior_can_report(school,student) then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
 select * into p from public.behavior_periods where id=period and institution_id=school;
 if not found then raise exception 'BEHAVIOR_INVALID_PERIOD' using errcode='22023';end if;
 if record_kind is null or record_kind not in ('recognition','incident') or item is null or item not in ('presentation','punctuality','coexistence','responsibility') or happened_at is null or happened_at>clock_timestamp() or (happened_at at time zone 'America/Lima')::date not between p.starts_on and p.ends_on or place is null or length(btrim(place)) not between 1 and 120 or facts is null or length(btrim(facts)) not between 10 and 2000 or length(student_statement)>2000 then raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 insert into public.behavior_records(institution_id,student_id,period_id,kind,criterion,occurred_at,location,description,student_version,reported_by)
 values(school,student,period,record_kind,item,happened_at,btrim(place),btrim(facts),nullif(btrim(student_statement),''),auth.uid()) returning id into result;
 insert into public.behavior_audit(institution_id,student_id,record_id,action,actor_id) values(school,student,result,'record_created',auth.uid());return result;
end;
$$;
create function public.communicate_behavior_record(school uuid,record uuid,family_text text,visible boolean,review_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 select * into r from public.behavior_records where id=record and institution_id=school for update;
 if not found then raise exception 'BEHAVIOR_NOT_FOUND' using errcode='P0001';end if;
 if not public.behavior_can_grade(school,r.student_id) then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
 if visible is null or review_reason is null or length(btrim(review_reason)) not between 5 and 1000 or (visible and (family_text is null or length(btrim(family_text)) not between 10 and 1500)) then raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 update public.behavior_records set family_summary=case when visible then btrim(family_text) else null end,published=visible,reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=record;
 insert into public.behavior_audit(institution_id,student_id,record_id,action,reason,previous_value,next_value,actor_id)
 values(school,r.student_id,record,case when visible then 'record_communicated' else 'record_hidden' end,btrim(review_reason),jsonb_build_object('summary',r.family_summary,'published',r.published),jsonb_build_object('summary',case when visible then btrim(family_text) else null end,'published',visible),auth.uid());
end;
$$;
create function public.add_behavior_followup(school uuid,record uuid,progress text,progress_state text,visible boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare r record;result uuid;
begin
 select * into r from public.behavior_records where id=record and institution_id=school;
 if not found then raise exception 'BEHAVIOR_NOT_FOUND' using errcode='P0001';end if;
 if not public.behavior_can_report(school,r.student_id) or (visible and not public.behavior_can_grade(school,r.student_id)) then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
 if progress is null or length(btrim(progress)) not between 5 and 1500 or progress_state is null or progress_state not in ('pending','in_progress','completed') or visible is null then raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 insert into public.behavior_followups(institution_id,record_id,note,state,family_visible,actor_id) values(school,record,btrim(progress),progress_state,visible,auth.uid()) returning id into result;
 insert into public.behavior_audit(institution_id,student_id,record_id,action,next_value,actor_id) values(school,r.student_id,record,'followup_added',jsonb_build_object('id',result,'state',progress_state,'family_visible',visible),auth.uid());return result;
end;
$$;

create function public.save_behavior_evaluation(school uuid,student uuid,period uuid,expected_revision integer,values_json jsonb,correction text default null) returns uuid
language plpgsql security definer set search_path='' as $$
<<grade_values>>
declare p record;e record;result uuid;rubric uuid;presentation numeric;punctuality numeric;coexistence numeric;responsibility numeric;final_score numeric;explanation text;
begin
 if not public.behavior_can_grade(school,student) then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
 select * into p from public.behavior_periods where id=period and institution_id=school;
 if not found then raise exception 'BEHAVIOR_INVALID_PERIOD' using errcode='22023';end if;
 if jsonb_typeof(values_json) is distinct from 'object' then raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 rubric:=nullif(values_json->>'rubric_id','')::uuid;
 presentation:=nullif(values_json->>'presentation','')::numeric;punctuality:=nullif(values_json->>'punctuality','')::numeric;
 coexistence:=nullif(values_json->>'coexistence','')::numeric;responsibility:=nullif(values_json->>'responsibility','')::numeric;final_score:=nullif(values_json->>'final_score','')::numeric;
 explanation:=nullif(btrim(values_json->>'rationale'),'');correction:=nullif(btrim(correction),'');
 if (rubric is not null and not exists(select 1 from public.behavior_rubrics where id=rubric and institution_id=school)) or presentation not between 0 and 20 or punctuality not between 0 and 20 or coexistence not between 0 and 20 or responsibility not between 0 and 20 or final_score not between 0 and 20 or length(explanation)>2000 or length(correction)>1000 or (correction is not null and length(correction)<5) then raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 perform 1 from public.students where id=student and institution_id=school for update;
 select * into e from public.behavior_evaluations where student_id=student and period_id=period for update;
 if found then
  if e.state<>'draft' then raise exception 'BEHAVIOR_PUBLISHED' using errcode='P0001';end if;
  if expected_revision is null or expected_revision<>e.revision then raise exception 'BEHAVIOR_STALE' using errcode='P0001';end if;
  if correction is null then raise exception 'BEHAVIOR_REASON_REQUIRED' using errcode='22023';end if;
  update public.behavior_evaluations set rubric_id=rubric,presentation=grade_values.presentation,punctuality=grade_values.punctuality,coexistence=grade_values.coexistence,responsibility=grade_values.responsibility,final_score=grade_values.final_score,rationale=explanation,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=e.id returning id into result;
 else
  if expected_revision is distinct from -1 then raise exception 'BEHAVIOR_STALE' using errcode='P0001';end if;
  insert into public.behavior_evaluations(institution_id,student_id,period_id,rubric_id,presentation,punctuality,coexistence,responsibility,final_score,rationale,updated_by)
   values(school,student,period,rubric,presentation,punctuality,coexistence,responsibility,final_score,explanation,auth.uid()) returning id into result;
 end if;
 insert into public.behavior_audit(institution_id,student_id,evaluation_id,action,reason,previous_value,next_value,actor_id)
 values(school,student,result,'evaluation_saved',correction,case when e.id is null then null else to_jsonb(e) end,values_json,auth.uid());return result;
end;
$$;
create function public.publish_behavior_evaluation(school uuid,evaluation uuid,expected_revision integer,publish boolean,reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare e record;p record;
begin
 select * into e from public.behavior_evaluations where id=evaluation and institution_id=school for update;
 if not found then raise exception 'BEHAVIOR_NOT_FOUND' using errcode='P0001';end if;
 if not public.behavior_can_grade(school,e.student_id) then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
 if expected_revision is null or expected_revision<>e.revision then raise exception 'BEHAVIOR_STALE' using errcode='P0001';end if;
 if length(reason)>1000 then raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 select * into p from public.behavior_periods where id=e.period_id;
 if publish is true and e.state='draft' then
  if p.starts_on>(now() at time zone 'America/Lima')::date then raise exception 'BEHAVIOR_FUTURE_PERIOD' using errcode='P0001';end if;
  if e.rubric_id is null or e.presentation is null or e.punctuality is null or e.coexistence is null or e.responsibility is null or e.final_score is null or e.rationale is null or length(btrim(e.rationale))<20 then raise exception 'BEHAVIOR_INCOMPLETE' using errcode='P0001';end if;
  update public.behavior_evaluations set state='published',published_at=clock_timestamp(),revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=e.id;
 elsif publish is false and e.state='published' then
  if not public.has_school_role(school,array['administrador','director']) then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
  if reason is null or length(btrim(reason)) not between 5 and 1000 then raise exception 'BEHAVIOR_REASON_REQUIRED' using errcode='22023';end if;
  update public.behavior_evaluations set state='draft',published_at=null,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=e.id;
 else raise exception 'BEHAVIOR_INVALID_INPUT' using errcode='22023';end if;
 insert into public.behavior_audit(institution_id,student_id,evaluation_id,action,reason,previous_value,actor_id)
 values(school,e.student_id,e.id,case when publish then 'evaluation_published' else 'evaluation_reopened' end,nullif(btrim(reason),''),to_jsonb(e),auth.uid());
end;
$$;

create function public.behavior_student_detail(school uuid,student uuid,period uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s record;p record;grader boolean;staff boolean;guardian boolean;records_json jsonb;eval_json jsonb;gate_json jsonb;class_json jsonb;
begin
 grader:=public.behavior_can_grade(school,student);staff:=public.behavior_can_report(school,student);guardian:=public.behavior_is_guardian(school,student);
 if not staff and not guardian then raise exception 'BEHAVIOR_FORBIDDEN' using errcode='42501';end if;
 select st.*,concat(c.academic_year,' · ',c.level,' ',c.grade,' ',c.section) as classroom into s from public.students st join public.classrooms c on c.id=st.classroom_id where st.id=student and st.institution_id=school;
 select * into p from public.behavior_periods where id=period and institution_id=school;
 if not found then raise exception 'BEHAVIOR_INVALID_PERIOD' using errcode='22023';end if;
 select to_jsonb(e) into eval_json from public.behavior_evaluations e where e.institution_id=school and e.student_id=student and e.period_id=period and (grader or (guardian and e.state='published'));
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'criterion',r.criterion,'occurred_at',r.occurred_at,'description',case when staff then r.description else r.family_summary end,
  'student_version',case when staff then r.student_version else null end,'location',case when staff then r.location else null end,'published',r.published,'family_summary',r.family_summary,
  'followups',(select coalesce(jsonb_agg(jsonb_build_object('note',f.note,'state',f.state,'at',f.created_at) order by f.created_at desc),'[]'::jsonb) from (select * from public.behavior_followups where record_id=r.id and (staff or family_visible) order by created_at desc,id limit 30) f)) order by r.occurred_at desc),'[]'::jsonb)
 into records_json from (select * from public.behavior_records where institution_id=school and student_id=student and period_id=period and (staff or published) order by occurred_at desc,id limit 100) r;
 select jsonb_build_object('first_entries',count(*) filter(where first_entry),'late_entries',count(*) filter(where first_entry and is_late),'unclassified_entries',count(*) filter(where first_entry and is_late is null),'early_exits',count(*) filter(where kind='early_exit')) into gate_json
 from public.gate_events where institution_id=school and student_id=student and school_date between p.starts_on and p.ends_on;
 select jsonb_build_object('present',count(*) filter(where a.status='present'),'late',count(*) filter(where a.status='late'),'absent',count(*) filter(where a.status='absent'),'justified',count(*) filter(where a.status='justified')) into class_json
 from public.class_attendance a join public.class_sessions cs on cs.id=a.session_id where a.student_id=student and a.institution_id=school and cs.state='closed' and cs.session_date between p.starts_on and p.ends_on;
 return jsonb_build_object('student_id',student,'name',concat(s.last_names,', ',s.first_names),'dni',s.dni,'classroom',s.classroom,'period',to_jsonb(p),'can_grade',grader,'can_report',staff,
  'manager',public.has_school_role(school,array['administrador','director']),'evaluation',eval_json,'records',records_json,'gate',gate_json,'classes',class_json);
end;
$$;
revoke all on function public.behavior_can_grade(uuid,uuid),public.behavior_can_report(uuid,uuid),public.behavior_is_guardian(uuid,uuid),public.create_behavior_period(uuid,text,integer,date,date),public.register_behavior_rubric(uuid,text,text,text,boolean),public.add_behavior_record(uuid,uuid,uuid,text,text,timestamptz,text,text,text),public.communicate_behavior_record(uuid,uuid,text,boolean,text),public.add_behavior_followup(uuid,uuid,text,text,boolean),public.save_behavior_evaluation(uuid,uuid,uuid,integer,jsonb,text),public.publish_behavior_evaluation(uuid,uuid,integer,boolean,text),public.behavior_student_detail(uuid,uuid,uuid) from public;
grant execute on function public.behavior_can_grade(uuid,uuid),public.behavior_can_report(uuid,uuid),public.behavior_is_guardian(uuid,uuid),public.create_behavior_period(uuid,text,integer,date,date),public.register_behavior_rubric(uuid,text,text,text,boolean),public.add_behavior_record(uuid,uuid,uuid,text,text,timestamptz,text,text,text),public.communicate_behavior_record(uuid,uuid,text,boolean,text),public.add_behavior_followup(uuid,uuid,text,text,boolean),public.save_behavior_evaluation(uuid,uuid,uuid,integer,jsonb,text),public.publish_behavior_evaluation(uuid,uuid,integer,boolean,text),public.behavior_student_detail(uuid,uuid,uuid) to authenticated;
commit;
