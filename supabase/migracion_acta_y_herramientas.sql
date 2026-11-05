-- Etapa 1 de Mejora: acta del proyecto (Project Charter) y herramientas por fase en la Biblioteca.

-- Acta: el campo "descripcion" pasa a ser el Problema; se suman objetivo, alcance, beneficio y patrocinador
alter table public.proyectos
  add column objetivo   text,
  add column alcance    text,
  add column beneficio  text,
  add column patrocinador_id uuid references public.perfiles(id) on delete set null;
create index on public.proyectos (patrocinador_id);

-- Herramientas de mejora: enlaces de la Biblioteca con tipo 'herramienta' y fase DMAIC
alter table public.enlaces
  add column fase text check (fase is null or fase in ('definir','medir','analizar','mejorar','controlar'));

-- El patrocinador también ve el proyecto
create or replace function public.soy_de_proyecto(pid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.proyectos p
                 where p.id = pid and (p.created_by = auth.uid() or p.responsable_id = auth.uid() or p.patrocinador_id = auth.uid()))
      or exists (select 1 from public.proyecto_miembros m where m.proyecto_id = pid and m.usuario_id = auth.uid())
      or exists (select 1 from public.proyecto_tareas t where t.proyecto_id = pid and t.asignado_a = auth.uid())
      or exists (select 1 from public.proyecto_tarea_participantes x join public.proyecto_tareas t on t.id = x.tarea_id
                 where t.proyecto_id = pid and x.usuario_id = auth.uid())
$$;
