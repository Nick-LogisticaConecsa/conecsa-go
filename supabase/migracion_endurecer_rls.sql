-- PROPUESTA (no aplicada). Endurece RLS de Flota y retira privilegios al rol anon.
-- Aplicar en Supabase > SQL Editor, o con apply_migration.

-- 1) Escritura limitada a la sucursal del usuario (admin/jefatura ven todas vía ve_sucursal)
drop policy if exists veh_ins on public.vehiculos;
drop policy if exists veh_upd on public.vehiculos;
drop policy if exists veh_del on public.vehiculos;
create policy veh_ins on public.vehiculos for insert to authenticated
  with check (puede('flota','editar') and ve_sucursal(sucursal));
create policy veh_upd on public.vehiculos for update to authenticated
  using (puede('flota','editar') and ve_sucursal(sucursal))
  with check (puede('flota','editar') and ve_sucursal(sucursal));
create policy veh_del on public.vehiculos for delete to authenticated
  using (puede('flota','editar') and ve_sucursal(sucursal));

-- incidencias y mantenimientos: solo sobre unidades que el usuario puede ver
-- (la RLS de vehiculos se aplica dentro de la subconsulta)
drop policy if exists inc_ins on public.incidencias;
drop policy if exists inc_upd on public.incidencias;
drop policy if exists inc_del on public.incidencias;
create policy inc_ins on public.incidencias for insert to authenticated
  with check (puede('flota','editar') and exists (select 1 from public.vehiculos v where v.id = vehiculo_id));
create policy inc_upd on public.incidencias for update to authenticated
  using (puede('flota','editar') and exists (select 1 from public.vehiculos v where v.id = incidencias.vehiculo_id))
  with check (puede('flota','editar') and exists (select 1 from public.vehiculos v where v.id = incidencias.vehiculo_id));
create policy inc_del on public.incidencias for delete to authenticated
  using (puede('flota','editar') and exists (select 1 from public.vehiculos v where v.id = incidencias.vehiculo_id));

drop policy if exists mant_ins on public.mantenimientos;
drop policy if exists mant_upd on public.mantenimientos;
drop policy if exists mant_del on public.mantenimientos;
create policy mant_ins on public.mantenimientos for insert to authenticated
  with check (puede('flota','editar') and exists (select 1 from public.vehiculos v where v.id = vehiculo_id));
create policy mant_upd on public.mantenimientos for update to authenticated
  using (puede('flota','editar') and exists (select 1 from public.vehiculos v where v.id = mantenimientos.vehiculo_id))
  with check (puede('flota','editar') and exists (select 1 from public.vehiculos v where v.id = mantenimientos.vehiculo_id));
create policy mant_del on public.mantenimientos for delete to authenticated
  using (puede('flota','editar') and exists (select 1 from public.vehiculos v where v.id = mantenimientos.vehiculo_id));

-- 2) El visitante sin sesión (anon) no necesita ningún privilegio sobre las tablas
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- NO revocar EXECUTE de mi_rol(), puede(), ve_sucursal(), soy_creador(), soy_de_proyecto():
-- las políticas RLS las invocan con los privilegios del usuario autenticado y dejarían de funcionar.
