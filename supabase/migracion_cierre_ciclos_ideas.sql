-- Etapa 3 de Mejora: cierre del proyecto con lecciones aprendidas, nuevo ciclo y buzón de ideas (Kaizen).

alter table public.proyectos
  add column logro      text check (logro is null or logro in ('si','parcial','no')),
  add column resultado  text,
  add column lecciones  text,
  add column cerrado_en timestamptz,
  add column ciclo_de   bigint references public.proyectos(id) on delete set null;
create index on public.proyectos (ciclo_de);

-- Ideas de mejora: las puede enviar cualquier usuario; las revisan admin, jefatura y quien edita Mejora
create table public.ideas (
  id          bigint generated always as identity primary key,
  titulo      text not null check (length(btrim(titulo)) > 0),
  descripcion text,
  sucursal    text,
  estado      text not null default 'nueva' check (estado in ('nueva','en_revision','proyecto','descartada')),
  respuesta   text,
  proyecto_id bigint references public.proyectos(id) on delete set null,
  atendida_por uuid references public.perfiles(id),
  atendida_en  timestamptz,
  created_by  uuid not null default auth.uid() references public.perfiles(id),
  created_at  timestamptz not null default now()
);
create index on public.ideas (created_by);
create index on public.ideas (estado);

alter table public.ideas enable row level security;
revoke all on public.ideas from anon;
grant select, insert, update, delete on public.ideas to authenticated;

create function public.puede_revisar_ideas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() in ('admin','jefatura') or public.puede('mejora','editar'), false)
$$;
revoke execute on function public.puede_revisar_ideas() from public, anon;
grant execute on function public.puede_revisar_ideas() to authenticated;

create policy ide_sel on public.ideas for select to authenticated
  using (created_by = auth.uid() or public.puede_revisar_ideas());
create policy ide_ins on public.ideas for insert to authenticated
  with check (created_by = auth.uid() and estado = 'nueva' and respuesta is null and proyecto_id is null and atendida_por is null);
create policy ide_upd on public.ideas for update to authenticated
  using (public.puede_revisar_ideas()) with check (public.puede_revisar_ideas());
create policy ide_del on public.ideas for delete to authenticated
  using ((created_by = auth.uid() and estado = 'nueva') or public.mi_rol() = 'admin');
