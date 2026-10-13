-- JASG Automotriz Web
-- Ejecutar en Supabase > SQL Editor del proyecto JASG Automotora Web.

create extension if not exists pgcrypto;

create table if not exists public.vehicle_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.vehicle_brands(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, name)
);

create table if not exists public.equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'General',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.vehicle_brands(id) on delete set null,
  model_id uuid references public.vehicle_models(id) on delete set null,
  brand text not null,
  model text not null,
  year integer not null check (year between 1886 and 2200),
  price integer not null default 0 check (price >= 0),
  mileage integer not null default 0 check (mileage >= 0),
  category text not null default 'SUV',
  transmission text not null default 'Automática',
  fuel text not null default 'Bencina',
  status text not null default 'Disponible' check (status in ('Disponible', 'Reservado', 'Vendido')),
  description text not null default '',
  youtube_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_images (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_equipment (
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  primary key (vehicle_id, equipment_id)
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_status_idx on public.vehicles(status);
create index if not exists vehicles_brand_idx on public.vehicles(brand_id);
create index if not exists vehicle_models_brand_idx on public.vehicle_models(brand_id);
create index if not exists vehicle_images_vehicle_idx on public.vehicle_images(vehicle_id, sort_order);

alter table public.vehicle_brands enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.equipment_catalog enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_images enable row level security;
alter table public.vehicle_equipment enable row level security;
alter table public.site_settings enable row level security;

-- Permisos de acceso a la API. RLS sigue controlando las filas permitidas.
grant usage on schema public to anon, authenticated;
grant select on table public.vehicle_brands, public.vehicle_models,
  public.equipment_catalog, public.vehicles, public.vehicle_images,
  public.vehicle_equipment to anon;
grant select, insert, update, delete on table public.vehicle_brands,
  public.vehicle_models, public.equipment_catalog, public.vehicles,
  public.vehicle_images, public.vehicle_equipment, public.site_settings
  to authenticated;

drop policy if exists "Public can read active brands" on public.vehicle_brands;
create policy "Public can read active brands" on public.vehicle_brands
  for select using (active = true);

drop policy if exists "Public can read active models" on public.vehicle_models;
create policy "Public can read active models" on public.vehicle_models
  for select using (active = true);

drop policy if exists "Public can read active equipment" on public.equipment_catalog;
create policy "Public can read active equipment" on public.equipment_catalog
  for select using (active = true);

drop policy if exists "Public can read available vehicles" on public.vehicles;
create policy "Public can read available vehicles" on public.vehicles
  for select using (status in ('Disponible', 'Reservado', 'Vendido'));

drop policy if exists "Public can read vehicle images" on public.vehicle_images;
create policy "Public can read vehicle images" on public.vehicle_images
  for select using (exists (
    select 1 from public.vehicles v where v.id = vehicle_id
  ));

drop policy if exists "Public can read vehicle equipment" on public.vehicle_equipment;
create policy "Public can read vehicle equipment" on public.vehicle_equipment
  for select using (exists (
    select 1 from public.vehicles v where v.id = vehicle_id
  ));

-- Administración: cualquier usuario autenticado puede mantener el catálogo.
drop policy if exists "Authenticated users manage brands" on public.vehicle_brands;
create policy "Authenticated users manage brands" on public.vehicle_brands
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage models" on public.vehicle_models;
create policy "Authenticated users manage models" on public.vehicle_models
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage equipment" on public.equipment_catalog;
create policy "Authenticated users manage equipment" on public.equipment_catalog
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage vehicles" on public.vehicles;
create policy "Authenticated users manage vehicles" on public.vehicles
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage vehicle images" on public.vehicle_images;
create policy "Authenticated users manage vehicle images" on public.vehicle_images
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage vehicle equipment" on public.vehicle_equipment;
create policy "Authenticated users manage vehicle equipment" on public.vehicle_equipment
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage site settings" on public.site_settings;
create policy "Authenticated users manage site settings" on public.site_settings
  for all to authenticated using (true) with check (true);

insert into public.equipment_catalog (name, category, sort_order) values
  ('Aire acondicionado', 'Confort', 10),
  ('Apple CarPlay', 'Tecnología', 20),
  ('Android Auto', 'Tecnología', 30),
  ('Cámara de retroceso', 'Seguridad', 40),
  ('Control crucero', 'Confort', 50),
  ('Sensores de estacionamiento', 'Seguridad', 60),
  ('Sunroof', 'Confort', 70),
  ('Asientos de cuero', 'Confort', 80),
  ('Tracción 4x4', 'Seguridad', 90)
on conflict (name) do nothing;

-- Almacenamiento público para las imágenes del catálogo.
insert into storage.buckets (id, name, public)
values ('vehicle-images', 'vehicle-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view vehicle images storage" on storage.objects;
create policy "Public can view vehicle images storage" on storage.objects
  for select using (bucket_id = 'vehicle-images');

drop policy if exists "Authenticated users upload vehicle images" on storage.objects;
create policy "Authenticated users upload vehicle images" on storage.objects
  for insert to authenticated with check (bucket_id = 'vehicle-images');

drop policy if exists "Authenticated users update vehicle images" on storage.objects;
create policy "Authenticated users update vehicle images" on storage.objects
  for update to authenticated using (bucket_id = 'vehicle-images') with check (bucket_id = 'vehicle-images');

drop policy if exists "Authenticated users delete vehicle images" on storage.objects;
create policy "Authenticated users delete vehicle images" on storage.objects
  for delete to authenticated using (bucket_id = 'vehicle-images');
