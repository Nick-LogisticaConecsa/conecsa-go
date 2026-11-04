-- Mejora: miembros por proyecto (visibilidad), jefatura crea proyectos, comentarios/evidencia/aplazos
-- en tareas de proyecto, y comentarios en Tareas.

-- ---------------------------------------------------------------------
-- Tablas nuevas
-- ---------------------------------------------------------------------
create table public.proyecto_miembros (
  proyecto_id bigint not null references public.proyectos(id) on delete cascade,
  usuario_id  uuid   not null references public.perfiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (proyecto_id, usuario_id)
);
create index on public.proyecto_miembros (usuario_id);

create table public.proyecto_tarea_participantes (
  tarea_id   bigint not null references public.proyecto_tareas(id) on delete cascade,
  usuario_id uuid   not null references public.perfiles(id) on delete cascade,
  primary key (tarea_id, usuario_id)
);
create index on public.proyecto_tarea_participantes (usuario_id);

alter table public.proyecto_tareas
  add column aplazada_hasta timestamptz,
  add column aplazos integer not null default 0;

create table public.proyecto_tarea_comentarios (
  id           bigint generated always as identity primary key,
  tarea_id     bigint not null references public.proyecto_tareas(id) on delete cascade,
  autor_id     uuid   not null default auth.uid() references public.perfiles(id),
  tipo         text   not null default 'comentario'
               check (tipo in ('comentario','evidencia','aplazo_solicitud','aplazo_resuelto')),
  texto        text   not null check (length(btrim(texto)) > 0),
  atendido_por uuid references public.perfiles(id),
  atendido_en  timestamptz,
  resultado    text check (resultado in ('aprobado','rechazado')),
  created_at   timestamptz not null default now()
);
create index on public.proyecto_tarea_comentarios (tarea_id);
-- una sola solicitud de aplazo pendiente por tarea
create unique index proyecto_tarea_aplazo_pendiente
  on public.proyecto_tarea_comentarios (tarea_id)
  where tipo = 'aplazo_solicitud' and atendido_en is null;

create table public.tarea_comentarios (
  id         bigint generated always as identity primary key,
  tarea_id   bigint not null references public.tareas(id) on delete cascade,
  autor_id   uuid   not null default auth.uid() references public.perfiles(id),
  tipo       text   not null default 'comentario' check (tipo in ('comentario','evidencia')),
  texto      text   not null check (length(btrim(texto)) > 0),
  created_at timestamptz not null default now()
);
create index on public.tarea_comentarios (tarea_id);

alter table public.proyecto_miembros            enable row level security;
alter table public.proyecto_tarea_participantes enable row level security;
alter table public.proyecto_tarea_comentarios   enable row level security;
alter table public.tarea_comentarios            enable row level security;

revoke all on public.proyecto_miembros, public.proyecto_tarea_participantes,
              public.proyecto_tarea_comentarios, public.tarea_comentarios from anon;
grant select, insert, delete on public.proyecto_miembros, public.proyecto_tarea_participantes to authenticated;
grant select, insert on public.proyecto_tarea_comentarios, public.tarea_comentarios to authenticated;

-- ---------------------------------------------------------------------
-- Funciones de permiso
-- ---------------------------------------------------------------------
-- Gestiona el proyecto: admin, quien lo creó o su responsable
create function public.gestiona_proyecto(pid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = 'admin' or exists (
    select 1 from public.proyectos p
    where p.id = pid and (p.created_by = auth.uid() or p.responsable_id = auth.uid())), false)
$$;

-- Participa del proyecto: creador, responsable, miembro, o involucrado en alguna tarea
create or replace function public.soy_de_proyecto(pid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.proyectos p where p.id = pid and (p.created_by = auth.uid() or p.responsable_id = auth.uid()))
      or exists (select 1 from public.proyecto_miembros m where m.proyecto_id = pid and m.usuario_id = auth.uid())
      or exists (select 1 from public.proyecto_tareas t where t.proyecto_id = pid and t.asignado_a = auth.uid())
      or exists (select 1 from public.proyecto_tarea_participantes x join public.proyecto_tareas t on t.id = x.tarea_id
                 where t.proyecto_id = pid and x.usuario_id = auth.uid())
$$;

create function public.ve_proyecto(pid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = 'admin' or public.soy_de_proyecto(pid), false)
$$;

create function public.proyecto_de_ptarea(tid bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select proyecto_id from public.proyecto_tareas where id = tid
$$;

create function public.soy_responsable_ptarea(tid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.proyecto_tareas where id = tid and asignado_a = auth.uid())
$$;

-- Puede comentar: responsable de la tarea, participantes, o quien gestiona el proyecto
create function public.participa_ptarea(tid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.proyecto_tareas t
                 where t.id = tid and (t.asignado_a = auth.uid() or public.gestiona_proyecto(t.proyecto_id)))
      or exists (select 1 from public.proyecto_tarea_participantes x where x.tarea_id = tid and x.usuario_id = auth.uid())
$$;

create function public.participa_tarea(tid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tareas where id = tid and creado_por = auth.uid())
      or exists (select 1 from public.tarea_asignados where tarea_id = tid and usuario_id = auth.uid())
$$;

revoke execute on function public.gestiona_proyecto(bigint), public.soy_de_proyecto(bigint), public.ve_proyecto(bigint),
  public.proyecto_de_ptarea(bigint), public.soy_responsable_ptarea(bigint), public.participa_ptarea(bigint),
  public.participa_tarea(bigint) from public, anon;
grant execute on function public.gestiona_proyecto(bigint), public.soy_de_proyecto(bigint), public.ve_proyecto(bigint),
  public.proyecto_de_ptarea(bigint), public.soy_responsable_ptarea(bigint), public.participa_ptarea(bigint),
  public.participa_tarea(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Políticas: proyectos visibles solo para sus participantes; admin ve todos
-- ---------------------------------------------------------------------
drop policy proy_sel on public.proyectos;
drop policy proy_ins on public.proyectos;
drop policy proy_upd on public.proyectos;
drop policy proy_del on public.proyectos;
-- created_by va directo (no por función) para que funcione el RETURNING del INSERT
create policy proy_sel on public.proyectos for select to authenticated
  using (created_by = auth.uid() or public.ve_proyecto(id));
create policy proy_ins on public.proyectos for insert to authenticated
  with check (created_by = auth.uid() and (public.mi_rol() in ('admin','jefatura') or public.puede('mejora','editar')));
create policy proy_upd on public.proyectos for update to authenticated
  using (public.gestiona_proyecto(id)) with check (public.gestiona_proyecto(id));
create policy proy_del on public.proyectos for delete to authenticated
  using (public.gestiona_proyecto(id));

drop policy ptar_sel on public.proyecto_tareas;
drop policy ptar_ins on public.proyecto_tareas;
drop policy ptar_upd on public.proyecto_tareas;
drop policy ptar_del on public.proyecto_tareas;
create policy ptar_sel on public.proyecto_tareas for select to authenticated using (public.ve_proyecto(proyecto_id));
create policy ptar_ins on public.proyecto_tareas for insert to authenticated with check (public.gestiona_proyecto(proyecto_id));
create policy ptar_upd on public.proyecto_tareas for update to authenticated
  using (public.gestiona_proyecto(proyecto_id)) with check (public.gestiona_proyecto(proyecto_id));
create policy ptar_del on public.proyecto_tareas for delete to authenticated using (public.gestiona_proyecto(proyecto_id));

create policy pmiem_sel on public.proyecto_miembros for select to authenticated using (public.ve_proyecto(proyecto_id));
create policy pmiem_ins on public.proyecto_miembros for insert to authenticated with check (public.gestiona_proyecto(proyecto_id));
create policy pmiem_del on public.proyecto_miembros for delete to authenticated using (public.gestiona_proyecto(proyecto_id));

create policy ppart_sel on public.proyecto_tarea_participantes for select to authenticated
  using (public.ve_proyecto(public.proyecto_de_ptarea(tarea_id)));
create policy ppart_ins on public.proyecto_tarea_participantes for insert to authenticated
  with check (public.gestiona_proyecto(public.proyecto_de_ptarea(tarea_id)));
create policy ppart_del on public.proyecto_tarea_participantes for delete to authenticated
  using (public.gestiona_proyecto(public.proyecto_de_ptarea(tarea_id)));

-- Comentarios: los lee todo el proyecto; los escriben los involucrados.
-- Solo el responsable de la tarea puede solicitar aplazo. No se editan ni borran (queda la evidencia).
create policy pcom_sel on public.proyecto_tarea_comentarios for select to authenticated
  using (public.ve_proyecto(public.proyecto_de_ptarea(tarea_id)));
create policy pcom_ins on public.proyecto_tarea_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.participa_ptarea(tarea_id)
    and (tipo in ('comentario','evidencia') or (tipo = 'aplazo_solicitud' and public.soy_responsable_ptarea(tarea_id))));

create policy tcom_sel on public.tarea_comentarios for select to authenticated using (public.participa_tarea(tarea_id));
create policy tcom_ins on public.tarea_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.participa_tarea(tarea_id));

-- ---------------------------------------------------------------------
-- RPC: el responsable/creador del proyecto aprueba (con fecha y hora) o rechaza un aplazo
-- ---------------------------------------------------------------------
create function public.resolver_aplazo(p_solicitud bigint, p_aprobar boolean, p_hasta timestamptz default null, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s record; txt text;
begin
  select c.id, c.tarea_id, c.atendido_en, t.proyecto_id into s
    from public.proyecto_tarea_comentarios c join public.proyecto_tareas t on t.id = c.tarea_id
   where c.id = p_solicitud and c.tipo = 'aplazo_solicitud' for update of c;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if not public.gestiona_proyecto(s.proyecto_id) then raise exception 'No tienes permiso para resolver esta solicitud'; end if;
  if s.atendido_en is not null then raise exception 'La solicitud ya fue atendida'; end if;
  if p_aprobar then
    if p_hasta is null or p_hasta <= now() then raise exception 'Indica una fecha y hora futura'; end if;
    update public.proyecto_tareas
       set aplazada_hasta = p_hasta, fecha_limite = (p_hasta at time zone 'America/Lima')::date,
           aplazos = aplazos + 1, actualizado_en = now(), actualizado_por = auth.uid()
     where id = s.tarea_id;
    txt := 'Aplazo aprobado hasta ' || to_char(p_hasta at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI')
           || coalesce(': ' || nullif(btrim(p_nota), ''), '');
  else
    txt := 'Aplazo rechazado' || coalesce(': ' || nullif(btrim(p_nota), ''), '');
  end if;
  update public.proyecto_tarea_comentarios
     set atendido_por = auth.uid(), atendido_en = now(), resultado = case when p_aprobar then 'aprobado' else 'rechazado' end
   where id = p_solicitud;
  insert into public.proyecto_tarea_comentarios (tarea_id, autor_id, tipo, texto) values (s.tarea_id, auth.uid(), 'aplazo_resuelto', txt);
end $$;
revoke execute on function public.resolver_aplazo(bigint, boolean, timestamptz, text) from public, anon;
grant execute on function public.resolver_aplazo(bigint, boolean, timestamptz, text) to authenticated;

-- El responsable de la tarea (o quien gestiona el proyecto) cambia el estado
create or replace function public.cambiar_estado_ptarea(p_id bigint, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_estado not in ('pendiente','en_proceso','hecha') then
    raise exception 'Estado inválido';
  end if;
  update public.proyecto_tareas
     set estado = p_estado,
         completada_en = case when p_estado = 'hecha' then now() else null end,
         actualizado_en = now(),
         actualizado_por = auth.uid()
   where id = p_id
     and (asignado_a = auth.uid() or public.gestiona_proyecto(proyecto_id));
  if not found then
    raise exception 'No tienes permiso para cambiar esta tarea';
  end if;
end $$;
