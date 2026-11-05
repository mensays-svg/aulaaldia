-- Ejecutar UNA SOLA VEZ en Supabase SQL Editor después de la migración.
-- Sustituir los dos valores. La cuenta debe existir y tener el correo confirmado.
-- No incluir contraseñas, claves secretas ni service_role.
do $$
declare
  admin_email text := 'REEMPLAZAR_POR_CORREO_DEL_ADMINISTRADOR';
  school_name text := 'REEMPLAZAR_POR_NOMBRE_DE_LA_INSTITUCION';
  admin_id uuid;
  school_id uuid;
begin
  if admin_email like 'REEMPLAZAR%' or school_name like 'REEMPLAZAR%' then
    raise exception 'Completa el correo del administrador y el nombre de la institución antes de ejecutar';
  end if;
  select id into admin_id from auth.users where lower(email)=lower(trim(admin_email)) and email_confirmed_at is not null;
  if admin_id is null then raise exception 'La cuenta debe registrarse y confirmar su correo primero'; end if;
  if exists(select 1 from public.institutions where name=trim(school_name)) then
    raise exception 'Ya existe una institución con ese nombre. Revisa su configuración; no se creó otra.';
  end if;
  insert into public.institutions(name) values(trim(school_name)) returning id into school_id;
  insert into public.memberships(institution_id,user_id,role) values(school_id,admin_id,'administrador');
end;
$$;
