-- Editar tareas ya creadas (quien las creó; admin y jefatura que participan de ellas) y hora límite en tareas de Mejora.

-- Tareas de proyecto: hora límite aparte de la fecha
alter table public.proyecto_tareas
  add column hora_limite time,
  add constraint ptareas_hora_requiere_fecha check (hora_limite is null or fecha_limite is not null);

-- Puede editar una tarea: quien la creó, o admin/jefatura que participan de ella
create function public.edita_tarea(t bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.soy_creador(t)
    or (public.mi_rol() in ('admin','jefatura') and public.participa_tarea(t)), false)
$$;
revoke execute on function public.edita_tarea(bigint) from public, anon;
grant execute on function public.edita_tarea(bigint) to authenticated;

create policy editar_tareas on public.tareas for update to authenticated
  using (public.edita_tarea(id)) with check (public.edita_tarea(id));

-- Nadie puede cambiar quién creó la tarea
create function public.trg_tarea_inmutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.creado_por is distinct from old.creado_por then raise exception 'No se puede cambiar quién creó la tarea'; end if;
  return new;
end $$;
revoke execute on function public.trg_tarea_inmutable() from public, anon, authenticated;
create trigger tarea_inmutable before update on public.tareas for each row execute function public.trg_tarea_inmutable();

-- Asignados: quien edita la tarea los ve, agrega y quita
drop policy asignar on public.tarea_asignados;
drop policy "ver asignaciones" on public.tarea_asignados;
create policy asignar_tarea on public.tarea_asignados for insert to authenticated
  with check (public.edita_tarea(tarea_id) and (usuario_id = auth.uid() or public.mi_rol() in ('admin','jefatura','asistente')));
create policy ver_asignaciones on public.tarea_asignados for select to authenticated
  using (usuario_id = auth.uid() or public.edita_tarea(tarea_id));
create policy quitar_asignado on public.tarea_asignados for delete to authenticated
  using (public.edita_tarea(tarea_id));

-- Subtareas: las edita o borra quien edita la tarea o quien creó la subtarea
drop policy sub_upd on public.subtareas;
drop policy sub_del on public.subtareas;
create policy sub_upd on public.subtareas for update to authenticated
  using (public.edita_tarea(tarea_id) or created_by = auth.uid())
  with check ((public.edita_tarea(tarea_id) or created_by = auth.uid())
    and (asignado_a is null or public.esta_en_tarea(tarea_id, asignado_a)));
create policy sub_del on public.subtareas for delete to authenticated
  using (public.edita_tarea(tarea_id) or created_by = auth.uid());

-- Al aprobar un aplazo, la tarea queda también con la hora nueva
create or replace function public.resolver_aplazo(p_solicitud bigint, p_aprobar boolean, p_hasta timestamptz default null, p_nota text default null)
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
           hora_limite = (p_hasta at time zone 'America/Lima')::time,
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
