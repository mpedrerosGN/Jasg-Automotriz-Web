-- Ejecutar una vez en SQL Editor > JASG Automotora Web.
-- No borra publicaciones ni cambia las politicas RLS existentes.
begin;

grant usage on schema public to anon, authenticated;

-- Visitantes: lectura del catalogo publico.
grant select on table public.vehicle_brands, public.vehicle_models,
  public.equipment_catalog, public.vehicles, public.vehicle_images,
  public.vehicle_equipment to anon;

-- Administracion: operaciones permitidas por las politicas RLS existentes.
grant select, insert, update, delete on table public.vehicle_brands,
  public.vehicle_models, public.equipment_catalog, public.vehicles,
  public.vehicle_images, public.vehicle_equipment, public.site_settings
  to authenticated;

commit;

-- Resultado esperado: todos los valores son true.
select
  has_table_privilege('anon', 'public.vehicles', 'SELECT') as public_can_read,
  has_table_privilege('authenticated', 'public.vehicles', 'SELECT') as admin_can_read,
  has_table_privilege('authenticated', 'public.vehicles', 'INSERT') as admin_can_insert,
  has_table_privilege('authenticated', 'public.vehicles', 'UPDATE') as admin_can_update,
  has_table_privilege('authenticated', 'public.vehicles', 'DELETE') as admin_can_delete;
