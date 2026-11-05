begin;

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  created_at timestamptz not null default now()
);
create table public.memberships (
  institution_id uuid not null references public.institutions(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('administrador','director','auxiliar','docente','apoderado')),
  created_at timestamptz not null default now(),
  primary key (institution_id,user_id,role)
);
create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  academic_year integer not null check (academic_year between 2000 and 2100),
  level text not null check (level in ('Inicial','Primaria','Secundaria')),
  grade text not null check (length(trim(grade)) between 1 and 40),
  section text not null check (length(trim(section)) between 1 and 40),
  unique (institution_id,id),
  unique (institution_id,academic_year,level,grade,section)
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id),
  classroom_id uuid not null,
  dni text check (dni is null or dni ~ '^[0-9]{8}$'),
  first_names text not null check (length(trim(first_names)) between 1 and 100),
  last_names text not null check (length(trim(last_names)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (institution_id,id),
  unique (institution_id,dni),
  foreign key (institution_id,classroom_id) references public.classrooms(institution_id,id)
);
create table public.teacher_assignments (
  institution_id uuid not null,
  classroom_id uuid not null,
  user_id uuid not null,
  role text not null default 'docente' check (role='docente'),
  primary key (classroom_id,user_id),
  foreign key (institution_id,classroom_id) references public.classrooms(institution_id,id),
  foreign key (institution_id,user_id,role) references public.memberships(institution_id,user_id,role)
);
create table public.student_guardians (
  institution_id uuid not null,
  student_id uuid not null,
  user_id uuid not null,
  role text not null default 'apoderado' check (role='apoderado'),
  relationship text not null check (relationship in ('Madre','Padre','Tutor/a','Otro apoderado')),
  primary key (student_id,user_id),
  foreign key (institution_id,student_id) references public.students(institution_id,id),
  foreign key (institution_id,user_id,role) references public.memberships(institution_id,user_id,role)
);
create index memberships_user_idx on public.memberships(user_id,institution_id);
create index students_classroom_idx on public.students(classroom_id);
create index guardians_user_idx on public.student_guardians(user_id,student_id);
create index teachers_user_idx on public.teacher_assignments(user_id,classroom_id);

-- Helpers bypass only their own lookup policies; the caller identity is auth.uid().
create function public.has_school_role(school uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.institution_id=school and m.user_id=auth.uid() and m.role=any(roles));
$$;
create function public.can_read_classroom(classroom uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.classrooms c where c.id=classroom and (
  public.has_school_role(c.institution_id,array['administrador','director','auxiliar'])
  or (public.has_school_role(c.institution_id,array['docente']) and exists(select 1 from public.teacher_assignments t where t.classroom_id=c.id and t.user_id=auth.uid()))
  or exists(select 1 from public.students s join public.student_guardians g on g.student_id=s.id where s.classroom_id=c.id and g.user_id=auth.uid())
 ));
$$;
create function public.can_read_student(student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.students s where s.id=student and (
  public.has_school_role(s.institution_id,array['administrador','director','auxiliar'])
  or (public.has_school_role(s.institution_id,array['docente']) and exists(select 1 from public.teacher_assignments t where t.classroom_id=s.classroom_id and t.user_id=auth.uid()))
  or exists(select 1 from public.student_guardians g where g.student_id=s.id and g.user_id=auth.uid())
 ));
$$;

alter table public.institutions enable row level security;
alter table public.memberships enable row level security;
alter table public.classrooms enable row level security;
alter table public.students enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.student_guardians enable row level security;

create policy institution_read on public.institutions for select to authenticated using (public.has_school_role(id,array['administrador','director','auxiliar','docente','apoderado']));
create policy membership_read on public.memberships for select to authenticated using (user_id=auth.uid() or public.has_school_role(institution_id,array['administrador','director']));
create policy classroom_read on public.classrooms for select to authenticated using (public.can_read_classroom(id));
create policy classroom_insert on public.classrooms for insert to authenticated with check (public.has_school_role(institution_id,array['administrador','director']));
create policy student_read on public.students for select to authenticated using (public.can_read_student(id));
create policy student_insert on public.students for insert to authenticated with check (public.has_school_role(institution_id,array['administrador','director','auxiliar']));
create policy student_update on public.students for update to authenticated using (public.has_school_role(institution_id,array['administrador','director','auxiliar'])) with check (public.has_school_role(institution_id,array['administrador','director','auxiliar']));
create policy teacher_read on public.teacher_assignments for select to authenticated using (user_id=auth.uid() or public.has_school_role(institution_id,array['administrador','director']));
create policy teacher_insert on public.teacher_assignments for insert to authenticated with check (public.has_school_role(institution_id,array['administrador','director']));
create policy teacher_delete on public.teacher_assignments for delete to authenticated using (public.has_school_role(institution_id,array['administrador','director']));
create policy guardian_read on public.student_guardians for select to authenticated using (user_id=auth.uid() or public.has_school_role(institution_id,array['administrador','director']));
create policy guardian_insert on public.student_guardians for insert to authenticated with check (public.has_school_role(institution_id,array['administrador','director']));
create policy guardian_delete on public.student_guardians for delete to authenticated using (public.has_school_role(institution_id,array['administrador','director']));

-- No client can create their own membership, institution, or privileged role.
create function public.assign_school_role(school uuid, account_email text, assigned_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare account_id uuid;
begin
 if not public.has_school_role(school,array['administrador']) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 if assigned_role not in ('administrador','director','auxiliar','docente','apoderado') then raise exception 'Rol inválido'; end if;
 select id into account_id from auth.users where lower(email)=lower(trim(account_email)) and email_confirmed_at is not null;
 if account_id is null then raise exception 'La cuenta debe registrarse y confirmar su correo primero' using errcode='P0001'; end if;
 insert into public.memberships(institution_id,user_id,role) values(school,account_id,assigned_role) on conflict do nothing;
end;
$$;
create function public.list_school_members(school uuid) returns table(user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.has_school_role(school,array['administrador','director']) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 return query select m.user_id,u.email::text,m.role from public.memberships m join auth.users u on u.id=m.user_id where m.institution_id=school order by u.email,m.role;
end;
$$;

create function public.remove_school_role(school uuid, account_id uuid, removed_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.has_school_role(school,array['administrador']) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 perform 1 from public.institutions where id=school for update;
 if removed_role='administrador' and exists(select 1 from public.memberships where institution_id=school and user_id=account_id and role='administrador')
 and (select count(*) from public.memberships where institution_id=school and role='administrador') <= 1 then
  raise exception 'No se puede retirar al último administrador' using errcode='P0001';
 end if;
 if removed_role='docente' then delete from public.teacher_assignments where institution_id=school and user_id=account_id; end if;
 if removed_role='apoderado' then delete from public.student_guardians where institution_id=school and user_id=account_id; end if;
 delete from public.memberships where institution_id=school and user_id=account_id and role=removed_role;
end;
$$;

revoke all on function public.has_school_role(uuid,text[]), public.can_read_classroom(uuid), public.can_read_student(uuid), public.assign_school_role(uuid,text,text), public.list_school_members(uuid) from public;
grant execute on function public.has_school_role(uuid,text[]), public.can_read_classroom(uuid), public.can_read_student(uuid), public.assign_school_role(uuid,text,text), public.list_school_members(uuid) to authenticated;
revoke all on function public.remove_school_role(uuid,uuid,text) from public;
grant execute on function public.remove_school_role(uuid,uuid,text) to authenticated;
revoke all on public.institutions,public.memberships,public.classrooms,public.students,public.teacher_assignments,public.student_guardians from anon,authenticated;
grant select on public.institutions,public.memberships to authenticated;
grant select,insert on public.classrooms to authenticated;
grant select,insert,update on public.students to authenticated;
grant select,insert,delete on public.teacher_assignments,public.student_guardians to authenticated;
commit;
