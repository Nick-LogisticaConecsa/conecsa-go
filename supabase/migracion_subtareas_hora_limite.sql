-- Tareas: hora límite (aparte de la fecha) y subtareas con su propia fecha, hora y responsable.

alter table public.tareas
  add column hora_limite time,
  add constraint tareas_hora_requiere_fecha check (hora_limite is null or fecha_limite is not null);

create table public.subtareas (
  id            bigint generated always as identity primary key,
  tarea_id      bigint not null references public.tareas(id) on delete cascade,
  titulo        text   not null check (length(btrim(titulo)) > 0),
  fecha_limite  date,
  hora_limite   time,
  asignado_a    uuid references public.perfiles(id) on delete set null,
  estado        text   not null default 'pendiente' check (estado in ('pendiente','en_curso','hecha')),
  completada_en timestamptz,
  created_by    uuid   not null default auth.uid() references public.perfiles(id),
  created_at    timestamptz not null default now(),
  constraint subtareas_hora_requiere_fecha check (hora_limite is null or fecha_limite is not null)
);
create index on public.subtareas (tarea_id);

alter table public.subtareas enable row level security;
revoke all on public.subtareas from anon;
grant select, insert, update, delete on public.subtareas to authenticated;

-- ¿u es quien creó la tarea o uno de sus asignados?
create function public.esta_en_tarea(t bigint, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tareas where id = t and creado_por = u)
      or exists (select 1 from public.tarea_asignados where tarea_id = t and usuario_id = u)
$$;
revoke execute on function public.esta_en_tarea(bigint, uuid) from public, anon;
grant execute on function public.esta_en_tarea(bigint, uuid) to authenticated;

-- Las ven y las agregan quienes participan de la tarea; edita o borra quien creó la tarea o la subtarea.
-- El estado lo cambia su responsable (o cualquier participante si no tiene responsable) con la función de abajo.
create policy sub_sel on public.subtareas for select to authenticated using (public.participa_tarea(tarea_id));
create policy sub_ins on public.subtareas for insert to authenticated
  with check (created_by = auth.uid() and public.participa_tarea(tarea_id) and estado = 'pendiente'
    and (asignado_a is null or public.esta_en_tarea(tarea_id, asignado_a)));
create policy sub_upd on public.subtareas for update to authenticated
  using (public.soy_creador(tarea_id) or created_by = auth.uid())
  with check ((public.soy_creador(tarea_id) or created_by = auth.uid())
    and (asignado_a is null or public.esta_en_tarea(tarea_id, asignado_a)));
create policy sub_del on public.subtareas for delete to authenticated
  using (public.soy_creador(tarea_id) or created_by = auth.uid());

create function public.cambiar_estado_subtarea(p_id bigint, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_estado not in ('pendiente','en_curso','hecha') then raise exception 'Estado inválido'; end if;
  update public.subtareas s
     set estado = p_estado, completada_en = case when p_estado = 'hecha' then now() else null end
   where s.id = p_id
     and (s.asignado_a = auth.uid()
          or public.soy_creador(s.tarea_id)
          or (s.asignado_a is null and public.participa_tarea(s.tarea_id)));
  if not found then raise exception 'No tienes permiso para cambiar esta subtarea'; end if;
end $$;
revoke execute on function public.cambiar_estado_subtarea(bigint, text) from public, anon;
grant execute on function public.cambiar_estado_subtarea(bigint, text) to authenticated;
