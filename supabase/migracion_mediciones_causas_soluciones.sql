-- Etapa 2 de Mejora: historial del indicador, causas raíz y soluciones por proyecto.
-- Lo ven los participantes del proyecto. Cualquier participante registra; edita o borra quien lo creó
-- o quien gestiona el proyecto (admin, creador o responsable).

create table public.proyecto_mediciones (
  id             bigint generated always as identity primary key,
  proyecto_id    bigint not null references public.proyectos(id) on delete cascade,
  fecha          date   not null default current_date,
  valor          numeric not null,
  nota           text,
  registrado_por uuid   not null default auth.uid() references public.perfiles(id),
  created_at     timestamptz not null default now()
);
create index on public.proyecto_mediciones (proyecto_id, fecha);

create table public.proyecto_causas (
  id          bigint generated always as identity primary key,
  proyecto_id bigint not null references public.proyectos(id) on delete cascade,
  categoria   text   not null check (categoria in ('metodos','mano_obra','materiales','maquinas','medicion','medio_ambiente')),
  descripcion text   not null check (length(btrim(descripcion)) > 0),
  verificada  boolean not null default false,
  evidencia   text,
  created_by  uuid   not null default auth.uid() references public.perfiles(id),
  created_at  timestamptz not null default now()
);
create index on public.proyecto_causas (proyecto_id);

create table public.proyecto_soluciones (
  id          bigint generated always as identity primary key,
  proyecto_id bigint not null references public.proyectos(id) on delete cascade,
  causa_id    bigint references public.proyecto_causas(id) on delete set null,
  descripcion text   not null check (length(btrim(descripcion)) > 0),
  estado      text   not null default 'propuesta' check (estado in ('propuesta','en_piloto','funciona','descartada')),
  resultado   text,
  created_by  uuid   not null default auth.uid() references public.perfiles(id),
  created_at  timestamptz not null default now()
);
create index on public.proyecto_soluciones (proyecto_id);

alter table public.proyecto_mediciones   enable row level security;
alter table public.proyecto_causas       enable row level security;
alter table public.proyecto_soluciones   enable row level security;

revoke all on public.proyecto_mediciones, public.proyecto_causas, public.proyecto_soluciones from anon;
grant select, insert, delete on public.proyecto_mediciones to authenticated;
grant select, insert, update, delete on public.proyecto_causas, public.proyecto_soluciones to authenticated;

create policy pmed_sel on public.proyecto_mediciones for select to authenticated using (public.ve_proyecto(proyecto_id));
create policy pmed_ins on public.proyecto_mediciones for insert to authenticated
  with check (registrado_por = auth.uid() and public.ve_proyecto(proyecto_id));
create policy pmed_del on public.proyecto_mediciones for delete to authenticated
  using (registrado_por = auth.uid() or public.gestiona_proyecto(proyecto_id));

create policy pcau_sel on public.proyecto_causas for select to authenticated using (public.ve_proyecto(proyecto_id));
create policy pcau_ins on public.proyecto_causas for insert to authenticated
  with check (created_by = auth.uid() and public.ve_proyecto(proyecto_id));
create policy pcau_upd on public.proyecto_causas for update to authenticated
  using (created_by = auth.uid() or public.gestiona_proyecto(proyecto_id))
  with check (created_by = auth.uid() or public.gestiona_proyecto(proyecto_id));
create policy pcau_del on public.proyecto_causas for delete to authenticated
  using (created_by = auth.uid() or public.gestiona_proyecto(proyecto_id));

-- La causa elegida en una solución debe ser del mismo proyecto
create policy psol_sel on public.proyecto_soluciones for select to authenticated using (public.ve_proyecto(proyecto_id));
create policy psol_ins on public.proyecto_soluciones for insert to authenticated
  with check (created_by = auth.uid() and public.ve_proyecto(proyecto_id)
    and (causa_id is null or exists (select 1 from public.proyecto_causas c where c.id = causa_id and c.proyecto_id = proyecto_soluciones.proyecto_id)));
create policy psol_upd on public.proyecto_soluciones for update to authenticated
  using (created_by = auth.uid() or public.gestiona_proyecto(proyecto_id))
  with check ((created_by = auth.uid() or public.gestiona_proyecto(proyecto_id))
    and (causa_id is null or exists (select 1 from public.proyecto_causas c where c.id = causa_id and c.proyecto_id = proyecto_soluciones.proyecto_id)));
create policy psol_del on public.proyecto_soluciones for delete to authenticated
  using (created_by = auth.uid() or public.gestiona_proyecto(proyecto_id));

-- El valor actual del proyecto sigue a la última medición registrada
create function public.trg_medicion_actual() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid bigint := coalesce(new.proyecto_id, old.proyecto_id); v numeric;
begin
  select valor into v from public.proyecto_mediciones where proyecto_id = pid order by fecha desc, id desc limit 1;
  if found then update public.proyectos set valor_actual = v where id = pid; end if;
  return null;
end $$;
revoke execute on function public.trg_medicion_actual() from public, anon, authenticated;
create trigger medicion_actual after insert or delete on public.proyecto_mediciones
  for each row execute function public.trg_medicion_actual();
