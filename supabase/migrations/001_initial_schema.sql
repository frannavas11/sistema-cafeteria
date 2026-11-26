-- =============================================================================
-- 001_initial_schema.sql
-- Plataforma multi-tenant de cafeterías: esquema base, integridad y RPCs.
--
-- Principios:
--   * Toda tabla de negocio lleva `cafe_id`. Las FKs entre tablas hijas son
--     COMPUESTAS (id, cafe_id) para que sea imposible, a nivel de motor,
--     colgar un producto de una categoría de otra cafetería, un ítem de un
--     pedido ajeno, etc.
--   * Los pedidos sólo se crean/mutan vía RPCs `security definer` que
--     recalculan precios desde la DB (zero trust) y validan rol.
--   * Idempotente: puede re-ejecutarse sin romper (if not exists / or replace).
-- Las políticas RLS viven en 002_rls_policies.sql.
-- =============================================================================

create extension if not exists postgis with schema extensions;

create schema if not exists private;
comment on schema private is
  'Helpers internos (no expuesto por la Data API). Usado por políticas RLS y RPCs.';

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.member_role as enum ('super_admin', 'admin', 'receptionist', 'driver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_channel as enum ('pos', 'delivery', 'pickup');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum
    ('pending', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'card', 'transfer', 'mercadopago');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'paid', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.zone_type as enum ('radius', 'polygon');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stock_reason as enum ('sale', 'restock', 'adjustment', 'waste', 'cancellation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'suspended', 'cancelled');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Utilidad: updated_at
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Plataforma: planes y super admins
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[a-z0-9_]{2,32}$'),
  name           text not null check (char_length(name) between 1 and 80),
  price_monthly  numeric(12,2) not null default 0 check (price_monthly >= 0),
  currency       char(3) not null default 'ARS',
  limits         jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Super admins globales. Se mantienen fuera de cafe_members porque no
-- pertenecen a una cafetería concreta; es el único punto de bypass.
create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tenants
-- -----------------------------------------------------------------------------
create table if not exists public.cafes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  slug            text not null unique check (
                    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60
                    -- rutas reservadas de la app: /[slug] no debe pisarlas
                    and slug not in ('admin', 'super-admin', 'driver', 'track', 'login', 'design',
                                     'sin-acceso', 'api', 'auth', '_next')
                  ),
  address         text check (char_length(address) <= 240),
  lat             double precision check (lat between -90 and 90),
  lng             double precision check (lng between -180 and 180),
  timezone        text not null default 'America/Argentina/Buenos_Aires',
  is_active       boolean not null default true,   -- suspensión (solo super_admin)
  accepts_orders  boolean not null default true,   -- pausa manual de pedidos online (admin)
  -- Config pública (colores, logo, moneda, tiempos de preparación). NUNCA secretos.
  config          jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists cafes_updated_at on public.cafes;
create trigger cafes_updated_at before update on public.cafes
  for each row execute function private.set_updated_at();

create table if not exists public.cafe_members (
  id            uuid primary key default gen_random_uuid(),
  cafe_id       uuid not null references public.cafes (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- super_admin vive en platform_admins, nunca como miembro de un café.
  role          public.member_role not null check (role <> 'super_admin'),
  display_name  text check (char_length(display_name) <= 80),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (cafe_id, user_id)
);
create index if not exists cafe_members_user_id_idx on public.cafe_members (user_id) where is_active;

create table if not exists public.cafe_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  cafe_id             uuid not null unique references public.cafes (id) on delete cascade,
  plan_id             uuid not null references public.plans (id),
  status              public.subscription_status not null default 'trialing',
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists cafe_subscriptions_plan_id_idx on public.cafe_subscriptions (plan_id);

drop trigger if exists cafe_subscriptions_updated_at on public.cafe_subscriptions;
create trigger cafe_subscriptions_updated_at before update on public.cafe_subscriptions
  for each row execute function private.set_updated_at();

-- Horarios. Si closes_at < opens_at el turno cruza la medianoche.
create table if not exists public.cafe_hours (
  id        uuid primary key default gen_random_uuid(),
  cafe_id   uuid not null references public.cafes (id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens_at  time not null,
  closes_at time not null,
  check (opens_at <> closes_at),
  unique (cafe_id, weekday, opens_at)
);

-- -----------------------------------------------------------------------------
-- Menú
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  cafe_id      uuid not null references public.cafes (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text check (char_length(description) <= 280),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, cafe_id)
);
create index if not exists categories_cafe_id_idx on public.categories (cafe_id, sort_order);

drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  cafe_id       uuid not null references public.cafes (id) on delete cascade,
  category_id   uuid,
  name          text not null check (char_length(name) between 1 and 120),
  description   text check (char_length(description) <= 500),
  price         numeric(12,2) not null check (price >= 0),
  image_url     text check (char_length(image_url) <= 1000),
  is_active     boolean not null default true,    -- visible en la carta
  is_available  boolean not null default true,    -- "agotado" temporal
  track_stock   boolean not null default false,
  stock_qty     integer not null default 0 check (stock_qty >= 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, cafe_id),
  foreign key (category_id, cafe_id) references public.categories (id, cafe_id)
    on delete set null (category_id)
);
create index if not exists products_cafe_id_idx on public.products (cafe_id, sort_order);
create index if not exists products_category_id_idx on public.products (category_id);

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

-- Variantes/extras: grupos (ej. "Tamaño", "Leche") con ítems de recargo.
create table if not exists public.product_option_groups (
  id          uuid primary key default gen_random_uuid(),
  cafe_id     uuid not null references public.cafes (id) on delete cascade,
  product_id  uuid not null,
  name        text not null check (char_length(name) between 1 and 80),
  min_select  smallint not null default 0 check (min_select >= 0),
  max_select  smallint not null default 1 check (max_select >= 1),
  sort_order  integer not null default 0,
  check (min_select <= max_select),
  unique (id, cafe_id),
  foreign key (product_id, cafe_id) references public.products (id, cafe_id) on delete cascade
);
create index if not exists pog_product_id_idx on public.product_option_groups (product_id);
create index if not exists pog_cafe_id_idx on public.product_option_groups (cafe_id);

create table if not exists public.product_option_items (
  id            uuid primary key default gen_random_uuid(),
  cafe_id       uuid not null references public.cafes (id) on delete cascade,
  group_id      uuid not null,
  name          text not null check (char_length(name) between 1 and 80),
  price_delta   numeric(12,2) not null default 0 check (price_delta >= 0),
  is_available  boolean not null default true,
  sort_order    integer not null default 0,
  unique (id, cafe_id),
  foreign key (group_id, cafe_id) references public.product_option_groups (id, cafe_id) on delete cascade
);
create index if not exists poi_group_id_idx on public.product_option_items (group_id);
create index if not exists poi_cafe_id_idx on public.product_option_items (cafe_id);

-- -----------------------------------------------------------------------------
-- Zonas de delivery (radio o polígono GeoJSON) → `area` geography calculada.
-- -----------------------------------------------------------------------------
create table if not exists public.delivery_zones (
  id           uuid primary key default gen_random_uuid(),
  cafe_id      uuid not null references public.cafes (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  zone_type    public.zone_type not null,
  center_lat   double precision check (center_lat between -90 and 90),
  center_lng   double precision check (center_lng between -180 and 180),
  radius_km    numeric(6,2) check (radius_km > 0 and radius_km <= 50),
  polygon      jsonb,  -- GeoJSON geometry: Polygon | MultiPolygon (lng, lat)
  area         extensions.geography,  -- calculada por trigger, no editable
  fee          numeric(12,2) not null default 0 check (fee >= 0),
  min_order    numeric(12,2) not null default 0 check (min_order >= 0),
  eta_minutes  smallint check (eta_minutes between 1 and 240),
  priority     integer not null default 0,  -- mayor gana si se solapan
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, cafe_id),
  check (
    (zone_type = 'radius'  and center_lat is not null and center_lng is not null and radius_km is not null)
    or
    (zone_type = 'polygon' and polygon is not null and polygon->>'type' in ('Polygon', 'MultiPolygon'))
  )
);
create index if not exists delivery_zones_cafe_id_idx on public.delivery_zones (cafe_id) where is_active;
create index if not exists delivery_zones_area_gix on public.delivery_zones using gist (area);

-- search_path = extensions: ST_Buffer(geography) llama internamente a funciones
-- de PostGIS (_ST_BestSRID / ST_Transform) que pueden no ir cualificadas.
-- Seguro: los usuarios no pueden crear objetos en el schema extensions.
create or replace function private.compute_zone_area()
returns trigger
language plpgsql
set search_path = extensions
as $$
begin
  if new.zone_type = 'radius' then
    new.area := extensions.st_buffer(
      extensions.st_setsrid(extensions.st_makepoint(new.center_lng, new.center_lat), 4326)::extensions.geography,
      (new.radius_km * 1000)::double precision
    );
  else
    new.area := extensions.st_setsrid(extensions.st_geomfromgeojson(new.polygon::text), 4326)::extensions.geography;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists delivery_zones_area on public.delivery_zones;
create trigger delivery_zones_area before insert or update on public.delivery_zones
  for each row execute function private.compute_zone_area();

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table if not exists private.order_counters (
  cafe_id      uuid primary key references public.cafes (id) on delete cascade,
  last_number  integer not null default 0
);

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  cafe_id            uuid not null references public.cafes (id) on delete cascade,
  order_number       integer not null,
  channel            public.order_channel not null,
  status             public.order_status not null default 'pending',
  customer_name      text check (char_length(customer_name) <= 80),
  customer_phone     text check (char_length(customer_phone) <= 30),
  notes              text check (char_length(notes) <= 500),
  delivery_address   text check (char_length(delivery_address) <= 240),
  delivery_lat       double precision check (delivery_lat between -90 and 90),
  delivery_lng       double precision check (delivery_lng between -180 and 180),
  delivery_zone_id   uuid,
  delivery_fee       numeric(12,2) not null default 0 check (delivery_fee >= 0),
  subtotal           numeric(12,2) not null check (subtotal >= 0),
  total              numeric(12,2) not null check (total >= 0),
  payment_method     public.payment_method not null default 'cash',
  payment_status     public.payment_status not null default 'unpaid',
  driver_id          uuid references auth.users (id) on delete set null,
  tracking_token     uuid not null unique default gen_random_uuid(),
  created_by         uuid references auth.users (id) on delete set null,
  estimated_ready_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, cafe_id),
  unique (cafe_id, order_number),
  check (total = subtotal + delivery_fee),
  check (channel <> 'delivery' or (delivery_address is not null and delivery_lat is not null and delivery_lng is not null)),
  check (channel = 'delivery' or driver_id is null),
  foreign key (delivery_zone_id, cafe_id) references public.delivery_zones (id, cafe_id)
    on delete set null (delivery_zone_id)
);
create index if not exists orders_board_idx on public.orders (cafe_id, status, created_at desc);
create index if not exists orders_cafe_created_idx on public.orders (cafe_id, created_at desc);
create index if not exists orders_driver_idx on public.orders (driver_id) where driver_id is not null;
create index if not exists orders_zone_idx on public.orders (delivery_zone_id) where delivery_zone_id is not null;
create index if not exists orders_created_by_idx on public.orders (created_by) where created_by is not null;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

-- Número correlativo por cafetería (#1, #2...). El upsert serializa por café.
create or replace function private.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.order_counters as c (cafe_id, last_number)
  values (new.cafe_id, 1)
  on conflict (cafe_id) do update set last_number = c.last_number + 1
  returning c.last_number into new.order_number;
  return new;
end;
$$;

drop trigger if exists orders_number on public.orders;
create trigger orders_number before insert on public.orders
  for each row execute function private.assign_order_number();

-- El repartidor asignado debe ser driver activo de ESA cafetería.
create or replace function private.validate_order_driver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.driver_id is not null and not exists (
    select 1 from public.cafe_members m
    where m.cafe_id = new.cafe_id and m.user_id = new.driver_id
      and m.role = 'driver' and m.is_active
  ) then
    raise exception 'DRIVER_NOT_IN_CAFE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_driver_check on public.orders;
create trigger orders_driver_check before insert or update of driver_id on public.orders
  for each row execute function private.validate_order_driver();

create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  cafe_id       uuid not null references public.cafes (id) on delete cascade,
  order_id      uuid not null,
  product_id    uuid,
  product_name  text not null,           -- snapshot
  unit_price    numeric(12,2) not null check (unit_price >= 0),  -- base + extras (snapshot)
  quantity      integer not null check (quantity between 1 and 100),
  line_total    numeric(12,2) not null check (line_total >= 0),
  options       jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  notes         text check (char_length(notes) <= 200),
  created_at    timestamptz not null default now(),
  check (line_total = unit_price * quantity),
  foreign key (order_id, cafe_id) references public.orders (id, cafe_id) on delete cascade,
  foreign key (product_id, cafe_id) references public.products (id, cafe_id) on delete set null (product_id)
);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id) where product_id is not null;
create index if not exists order_items_cafe_id_idx on public.order_items (cafe_id);

create table if not exists public.order_status_history (
  id           bigint generated always as identity primary key,
  cafe_id      uuid not null references public.cafes (id) on delete cascade,
  order_id     uuid not null,
  from_status  public.order_status,
  to_status    public.order_status not null,
  changed_by   uuid references auth.users (id) on delete set null,
  note         text check (char_length(note) <= 280),
  created_at   timestamptz not null default now(),
  foreign key (order_id, cafe_id) references public.orders (id, cafe_id) on delete cascade
);
create index if not exists osh_order_id_idx on public.order_status_history (order_id, created_at);
create index if not exists osh_cafe_id_idx on public.order_status_history (cafe_id);
create index if not exists osh_changed_by_idx on public.order_status_history (changed_by) where changed_by is not null;

create table if not exists public.stock_movements (
  id          bigint generated always as identity primary key,
  cafe_id     uuid not null references public.cafes (id) on delete cascade,
  product_id  uuid,  -- null si el producto se borró: la auditoría se conserva
  delta       integer not null check (delta <> 0),
  reason      public.stock_reason not null,
  order_id    uuid,
  note        text check (char_length(note) <= 280),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (product_id, cafe_id) references public.products (id, cafe_id) on delete set null (product_id),
  foreign key (order_id, cafe_id) references public.orders (id, cafe_id) on delete set null (order_id)
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_cafe_idx on public.stock_movements (cafe_id, created_at desc);
create index if not exists stock_movements_order_idx on public.stock_movements (order_id) where order_id is not null;
create index if not exists stock_movements_created_by_idx on public.stock_movements (created_by) where created_by is not null;

-- =============================================================================
-- Helpers de autorización (schema private, security definer).
-- Leen tablas protegidas por RLS sin recursión y siempre anclados a auth.uid().
-- =============================================================================
create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

-- Set de cafe_id donde el usuario actual tiene alguno de los roles dados.
-- Uso en políticas: `cafe_id in (select private.my_cafe_ids('{admin}'))`
-- → se evalúa una sola vez por query (no por fila).
create or replace function private.my_cafe_ids(roles public.member_role[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.cafe_id
  from public.cafe_members m
  join public.cafes c on c.id = m.cafe_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and c.is_active               -- café suspendido = staff sin acceso
    and m.role = any (roles);
$$;

create or replace function private.has_cafe_role(p_cafe_id uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.my_cafe_ids(roles) id where id = p_cafe_id);
$$;

-- Set de cafés activos, para políticas públicas evaluadas una sola vez (initPlan).
create or replace function private.public_cafe_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.cafes c where c.is_active;
$$;

create or replace function private.is_cafe_public(p_cafe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.cafes c where c.id = p_cafe_id and c.is_active);
$$;

-- ¿Está abierto ahora según cafe_hours? Sin horarios cargados = abierto.
create or replace function private.is_cafe_open_now(p_cafe_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_now   timestamp;
  v_dow   smallint;
  v_time  time;
begin
  select timezone into v_tz from public.cafes where id = p_cafe_id;
  if not exists (select 1 from public.cafe_hours where cafe_id = p_cafe_id) then
    return true;
  end if;
  v_now  := now() at time zone coalesce(v_tz, 'UTC');
  v_dow  := extract(dow from v_now)::smallint;
  v_time := v_now::time;
  return exists (
    select 1 from public.cafe_hours h
    where h.cafe_id = p_cafe_id and (
      -- turno normal del día
      (h.weekday = v_dow and h.opens_at < h.closes_at and v_time >= h.opens_at and v_time < h.closes_at)
      -- turno que cruza medianoche: parte de hoy
      or (h.weekday = v_dow and h.opens_at > h.closes_at and v_time >= h.opens_at)
      -- turno que cruza medianoche: cola del día anterior
      or (h.weekday = ((v_dow + 6) % 7) and h.opens_at > h.closes_at and v_time < h.closes_at)
    )
  );
end;
$$;

-- Sólo super_admin puede suspender (is_active) o renombrar el slug de un café.
create or replace function private.guard_cafe_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.is_active is distinct from old.is_active or new.slug is distinct from old.slug)
     and not private.is_super_admin()
     and coalesce(auth.role(), '') <> 'service_role'
     and (select auth.uid()) is not null then
    raise exception 'ONLY_SUPER_ADMIN_CAN_CHANGE_STATUS_OR_SLUG' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cafes_guard on public.cafes;
create trigger cafes_guard before update on public.cafes
  for each row execute function private.guard_cafe_update();

-- Un timezone inválido rompería is_cafe_open_now y con ella toda la toma de pedidos.
create or replace function private.validate_cafe_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform now() at time zone new.timezone;
  exception when others then
    raise exception 'INVALID_TIMEZONE: %', new.timezone using errcode = '22023';
  end;
  if new.config ? 'prep_minutes' and jsonb_typeof(new.config->'prep_minutes') <> 'number' then
    raise exception 'INVALID_CONFIG: prep_minutes debe ser numérico' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists cafes_validate on public.cafes;
create trigger cafes_validate before insert or update of timezone, config on public.cafes
  for each row execute function private.validate_cafe_settings();

-- =============================================================================
-- RPCs públicas (expuestas por la Data API). Única vía de escritura de pedidos.
-- =============================================================================

-- create_order -----------------------------------------------------------------
-- p_items: [{ "product_id": uuid, "quantity": int, "option_item_ids": [uuid], "notes": text }]
-- p_customer: { "name", "phone", "notes" }
-- p_delivery: { "address", "lat", "lng" }   (sólo channel = delivery)
-- Cualquier precio/total que venga del cliente se IGNORA: no hay parámetro para ello.
create or replace function public.create_order(
  p_cafe_id         uuid,
  p_channel         public.order_channel,
  p_items           jsonb,
  p_customer        jsonb default '{}'::jsonb,
  p_delivery        jsonb default null,
  p_payment_method  public.payment_method default 'cash'
)
returns table (order_id uuid, order_number integer, tracking_token uuid, total numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_cafe         public.cafes%rowtype;
  v_uid          uuid := (select auth.uid());
  v_is_staff     boolean;
  v_item         jsonb;
  v_product      public.products%rowtype;
  v_qty          integer;
  v_opt_ids      uuid[];
  v_opt_count    integer;
  v_opts_json    jsonb;
  v_opts_total   numeric(12,2);
  v_unit         numeric(12,2);
  v_subtotal     numeric(12,2) := 0;
  v_fee          numeric(12,2) := 0;
  v_zone         public.delivery_zones%rowtype;
  v_lat          double precision;
  v_lng          double precision;
  v_order_id     uuid;
  v_order_number integer;
  v_token        uuid;
  v_lines        jsonb := '[]'::jsonb;
  v_line         jsonb;
  v_bad_group    text;
begin
  -- 1. Cafetería y canal ----------------------------------------------------
  select * into v_cafe from public.cafes c where c.id = p_cafe_id and c.is_active;
  if not found then
    raise exception 'CAFE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_is_staff := private.has_cafe_role(p_cafe_id, '{admin,receptionist}') or private.is_super_admin();

  if p_channel = 'pos' then
    if not v_is_staff then
      raise exception 'FORBIDDEN_POS' using errcode = '42501';
    end if;
  else
    if not v_cafe.accepts_orders or not private.is_cafe_open_now(p_cafe_id) then
      raise exception 'CAFE_CLOSED' using errcode = 'P0001';
    end if;
    if char_length(coalesce(trim(p_customer->>'name'), '')) < 2
       or char_length(coalesce(trim(p_customer->>'phone'), '')) < 6 then
      raise exception 'CUSTOMER_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'INVALID_ITEMS' using errcode = 'P0001';
  end if;

  -- Anti-abuso: un mismo teléfono no puede acumular más de 3 pedidos pendientes
  -- en 30 min (evita agotar stock o llenar el tablero). Complementar con rate-limit en el edge.
  if not v_is_staff and (
    select count(*) from public.orders o
     where o.cafe_id = p_cafe_id and o.status = 'pending'
       and o.customer_phone = left(trim(p_customer->>'phone'), 30)
       and o.created_at > now() - interval '30 minutes') >= 3 then
    raise exception 'TOO_MANY_PENDING_ORDERS' using errcode = 'P0001';
  end if;

  -- Bloqueo de stock en ORDEN FIJO (por id) y sólo de productos con stock:
  -- dos pedidos con los mismos ítems en distinto orden no pueden hacer deadlock.
  perform 1 from public.products p
   where p.cafe_id = p_cafe_id and p.track_stock
     and p.id in (select (e.v->>'product_id')::uuid from jsonb_array_elements(p_items) as e(v))
   order by p.id
   for update;

  -- 2. Ítems: precio SIEMPRE desde la DB -----------------------------------
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_qty not between 1 and 100 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    -- Producto del café, visible, disponible y de una categoría activa (o sin categoría).
    select * into v_product from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.cafe_id = p_cafe_id and p.is_active and p.is_available
      and (p.category_id is null or exists (
            select 1 from public.categories c where c.id = p.category_id and c.is_active));
    if not found then
      raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001';
    end if;

    if jsonb_typeof(coalesce(v_item->'option_item_ids', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_item->'option_item_ids', '[]'::jsonb)) > 20 then
      raise exception 'INVALID_OPTIONS' using errcode = 'P0001';
    end if;

    select coalesce(array_agg(distinct t.v::uuid), '{}')
      into v_opt_ids
      from jsonb_array_elements_text(coalesce(v_item->'option_item_ids', '[]'::jsonb)) as t(v);

    -- Opciones válidas: pertenecen a un grupo DE ESTE producto, mismo café, disponibles.
    select count(*), coalesce(sum(i.price_delta), 0),
           coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id, 'name', i.name, 'price_delta', i.price_delta,
             'group_id', g.id, 'group_name', g.name) order by g.sort_order, i.sort_order), '[]'::jsonb)
      into v_opt_count, v_opts_total, v_opts_json
      from public.product_option_items i
      join public.product_option_groups g on g.id = i.group_id and g.cafe_id = i.cafe_id
     where i.id = any (v_opt_ids)
       and g.product_id = v_product.id
       and i.cafe_id = p_cafe_id
       and i.is_available;

    if v_opt_count <> coalesce(array_length(v_opt_ids, 1), 0) then
      raise exception 'INVALID_OPTIONS' using errcode = 'P0001';
    end if;

    -- min/max por grupo
    select g.name into v_bad_group
      from public.product_option_groups g
      left join public.product_option_items i on i.group_id = g.id and i.id = any (v_opt_ids)
     where g.product_id = v_product.id
     group by g.id, g.name, g.min_select, g.max_select
    having count(i.id) < g.min_select or count(i.id) > g.max_select
     limit 1;
    if v_bad_group is not null then
      raise exception 'OPTION_GROUP_CONSTRAINT: %', v_bad_group using errcode = 'P0001';
    end if;

    -- Stock
    if v_product.track_stock then
      update public.products set stock_qty = stock_qty - v_qty
       where id = v_product.id and stock_qty >= v_qty;
      if not found then
        raise exception 'OUT_OF_STOCK: %', v_product.name using errcode = 'P0001';
      end if;
    end if;

    v_unit := v_product.price + v_opts_total;
    v_subtotal := v_subtotal + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name,
      'unit_price', v_unit, 'quantity', v_qty, 'options', v_opts_json,
      'notes', left(nullif(trim(v_item->>'notes'), ''), 200),
      'track_stock', v_product.track_stock);
  end loop;

  -- 3. Delivery: zona por punto-en-área -----------------------------------
  if p_channel = 'delivery' then
    v_lat := (p_delivery->>'lat')::double precision;
    v_lng := (p_delivery->>'lng')::double precision;
    if v_lat is null or v_lng is null or char_length(coalesce(trim(p_delivery->>'address'), '')) < 4 then
      raise exception 'DELIVERY_ADDRESS_REQUIRED' using errcode = 'P0001';
    end if;

    select * into v_zone from public.delivery_zones z
     where z.cafe_id = p_cafe_id and z.is_active
       and extensions.st_covers(z.area,
             extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography)
     order by z.priority desc, z.fee asc
     limit 1;
    if not found then
      raise exception 'OUT_OF_DELIVERY_AREA' using errcode = 'P0001';
    end if;
    if v_subtotal < v_zone.min_order then
      raise exception 'BELOW_MIN_ORDER: %', v_zone.min_order using errcode = 'P0001';
    end if;
    v_fee := v_zone.fee;
  end if;

  -- 4. Persistencia atómica -------------------------------------------------
  insert into public.orders (
    cafe_id, order_number, channel, status, customer_name, customer_phone, notes,
    delivery_address, delivery_lat, delivery_lng, delivery_zone_id, delivery_fee,
    subtotal, total, payment_method, created_by, estimated_ready_at
  ) values (
    p_cafe_id, 0, p_channel,
    case when p_channel = 'pos' then 'preparing'::public.order_status else 'pending'::public.order_status end,
    left(nullif(trim(p_customer->>'name'), ''), 80),
    left(nullif(trim(p_customer->>'phone'), ''), 30),
    left(nullif(trim(p_customer->>'notes'), ''), 500),
    case when p_channel = 'delivery' then left(trim(p_delivery->>'address'), 240) end,
    case when p_channel = 'delivery' then v_lat end,
    case when p_channel = 'delivery' then v_lng end,
    case when p_channel = 'delivery' then v_zone.id end,
    v_fee, v_subtotal, v_subtotal + v_fee, p_payment_method, v_uid,
    -- prep_minutes tolerante a config inválida: nunca rompe la toma de pedidos.
    now() + make_interval(mins => case
      when jsonb_typeof(v_cafe.config->'prep_minutes') = 'number'
        then least(greatest((v_cafe.config->>'prep_minutes')::numeric::integer, 1), 180)
      else 15 end)
  )
  returning id, orders.order_number, orders.tracking_token
  into v_order_id, v_order_number, v_token;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    insert into public.order_items (cafe_id, order_id, product_id, product_name, unit_price, quantity, line_total, options, notes)
    values (p_cafe_id, v_order_id, (v_line->>'product_id')::uuid, v_line->>'product_name',
            (v_line->>'unit_price')::numeric, (v_line->>'quantity')::integer,
            (v_line->>'unit_price')::numeric * (v_line->>'quantity')::integer,
            v_line->'options', v_line->>'notes');

    if (v_line->>'track_stock')::boolean then
      insert into public.stock_movements (cafe_id, product_id, delta, reason, order_id, created_by)
      values (p_cafe_id, (v_line->>'product_id')::uuid, -((v_line->>'quantity')::integer), 'sale', v_order_id, v_uid);
    end if;
  end loop;

  insert into public.order_status_history (cafe_id, order_id, from_status, to_status, changed_by)
  values (p_cafe_id, v_order_id, null,
          case when p_channel = 'pos' then 'preparing'::public.order_status else 'pending'::public.order_status end,
          v_uid);

  return query select v_order_id, v_order_number, v_token, v_subtotal + v_fee;
end;
$$;

-- transition_order_status --------------------------------------------------------
-- Máquina de estados por rol:
--   staff (admin|receptionist):
--     pending → preparing | rejected
--     preparing → ready
--     ready → on_the_way (sólo delivery con driver asignado) | delivered (pos/pickup)
--     on_the_way → delivered
--     cualquier no-final → cancelled
--   driver (asignado): ready → on_the_way, on_the_way → delivered
-- Cancelar/rechazar repone stock.
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_to       public.order_status,
  p_note     text default null
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order     public.orders%rowtype;
  v_uid       uuid := (select auth.uid());
  v_is_staff  boolean;
  v_is_driver boolean;
  v_ok        boolean := false;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- 1) Autorizar con una lectura SIN lock (un tercero no puede bloquear filas ajenas).
  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_is_staff  := private.has_cafe_role(v_order.cafe_id, '{admin,receptionist}') or private.is_super_admin();
  v_is_driver := coalesce(v_order.driver_id = v_uid, false)
                 and private.has_cafe_role(v_order.cafe_id, '{driver}');

  if not v_is_staff and not v_is_driver then
    -- No revelamos existencia del pedido a terceros.
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- 2) Recién ahora bloquear y releer (el estado o el driver pudieron cambiar).
  select * into v_order from public.orders o where o.id = p_order_id for update;
  v_is_driver := coalesce(v_order.driver_id = v_uid, false)
                 and private.has_cafe_role(v_order.cafe_id, '{driver}');
  if not v_is_staff and not v_is_driver then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_order.status in ('delivered', 'cancelled', 'rejected') then
    raise exception 'ORDER_FINALIZED' using errcode = 'P0001';
  end if;

  if v_is_staff then
    v_ok := case
      when p_to = 'cancelled' then true
      when v_order.status = 'pending'    and p_to in ('preparing', 'rejected') then true
      when v_order.status = 'preparing'  and p_to = 'ready' then true
      when v_order.status = 'ready'      and p_to = 'on_the_way' then v_order.channel = 'delivery' and v_order.driver_id is not null
      when v_order.status = 'ready'      and p_to = 'delivered'  then v_order.channel <> 'delivery'
      when v_order.status = 'on_the_way' and p_to = 'delivered'  then true
      else false end;
  end if;

  if not v_ok and v_is_driver then
    v_ok := (v_order.status = 'ready' and p_to = 'on_the_way')
         or (v_order.status = 'on_the_way' and p_to = 'delivered');
  end if;

  if not v_ok then
    raise exception 'INVALID_TRANSITION: % -> %', v_order.status, p_to using errcode = 'P0001';
  end if;

  update public.orders set status = p_to where id = p_order_id;

  insert into public.order_status_history (cafe_id, order_id, from_status, to_status, changed_by, note)
  values (v_order.cafe_id, p_order_id, v_order.status, p_to, v_uid, left(p_note, 280));

  -- Reposición de stock al cancelar/rechazar: se repone exactamente lo que se
  -- descontó (movimientos 'sale' del pedido), no lo que diga track_stock hoy.
  if p_to in ('cancelled', 'rejected') then
    with restored as (
      select sm.product_id, (-sum(sm.delta))::integer as qty
        from public.stock_movements sm
       where sm.order_id = p_order_id and sm.reason = 'sale' and sm.product_id is not null
       group by sm.product_id
    ), upd as (
      update public.products p set stock_qty = p.stock_qty + r.qty
        from restored r
       where p.id = r.product_id and p.cafe_id = v_order.cafe_id
      returning p.id, r.qty
    )
    insert into public.stock_movements (cafe_id, product_id, delta, reason, order_id, created_by)
    select v_order.cafe_id, upd.id, upd.qty, 'cancellation', p_order_id, v_uid from upd;
  end if;

  return p_to;
end;
$$;

-- assign_driver -------------------------------------------------------------------
create or replace function public.assign_driver(p_order_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  -- Autorizar sin lock; después bloquear y releer.
  select * into v_order from public.orders o where o.id = p_order_id;
  if not found
     or not (private.has_cafe_role(v_order.cafe_id, '{admin,receptionist}') or private.is_super_admin()) then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if v_order.channel <> 'delivery' then
    raise exception 'NOT_A_DELIVERY_ORDER' using errcode = 'P0001';
  end if;
  if v_order.status not in ('pending', 'preparing', 'ready') then
    raise exception 'ORDER_NOT_ASSIGNABLE' using errcode = 'P0001';
  end if;
  -- validate_order_driver (trigger) garantiza que el driver es del mismo café.
  update public.orders set driver_id = p_driver_id where id = p_order_id;
end;
$$;

-- adjust_stock (admin) -----------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta      integer,
  p_reason     public.stock_reason,
  p_note       text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_new     integer;
begin
  if p_reason in ('sale', 'cancellation') then
    raise exception 'REASON_RESERVED_FOR_ORDERS' using errcode = 'P0001';
  end if;
  if p_delta = 0 then
    raise exception 'INVALID_DELTA' using errcode = 'P0001';
  end if;

  -- Autorizar ANTES de tomar el lock (evita que terceros bloqueen filas ajenas).
  select * into v_product from public.products p where p.id = p_product_id;
  if not found or not (private.has_cafe_role(v_product.cafe_id, '{admin}') or private.is_super_admin()) then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform 1 from public.products p where p.id = p_product_id for update;

  update public.products set stock_qty = stock_qty + p_delta, track_stock = true
   where id = p_product_id and stock_qty + p_delta >= 0
  returning stock_qty into v_new;
  if not found then
    raise exception 'NEGATIVE_STOCK' using errcode = 'P0001';
  end if;

  insert into public.stock_movements (cafe_id, product_id, delta, reason, note, created_by)
  values (v_product.cafe_id, p_product_id, p_delta, p_reason, left(p_note, 280), (select auth.uid()));

  return v_new;
end;
$$;

-- get_order_tracking (público, por token secreto) --------------------------------
-- Devuelve sólo datos necesarios para /track: sin teléfono ni datos de staff.
create or replace function public.get_order_tracking(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number',       o.order_number,
    'status',             o.status,
    'channel',            o.channel,
    'total',              o.total,
    'estimated_ready_at', o.estimated_ready_at,
    'created_at',         o.created_at,
    'has_driver',         o.driver_id is not null,
    'delivery',           case when o.channel = 'delivery' then
                            jsonb_build_object('address', o.delivery_address, 'lat', o.delivery_lat, 'lng', o.delivery_lng)
                          end,
    'cafe',               jsonb_build_object('name', c.name, 'slug', c.slug, 'lat', c.lat, 'lng', c.lng),
    'timeline',           coalesce((
                            select jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) order by h.created_at)
                            from public.order_status_history h where h.order_id = o.id
                          ), '[]'::jsonb)
  )
  from public.orders o
  join public.cafes c on c.id = o.cafe_id
  where o.tracking_token = p_token;
$$;

-- get_cafe_stock (staff) -----------------------------------------------------------
-- stock_qty no es legible por columna para anon/authenticated (ver 002): el staff
-- del café lo obtiene por acá. Otro café o un cliente recibe un set vacío.
create or replace function public.get_cafe_stock(p_cafe_id uuid)
returns table (product_id uuid, stock_qty integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.stock_qty
    from public.products p
   where p.cafe_id = p_cafe_id
     and (private.has_cafe_role(p_cafe_id, '{admin,receptionist}') or private.is_super_admin());
$$;

-- =============================================================================
-- Privilegios de funciones
-- =============================================================================
revoke execute on function public.get_cafe_stock(uuid) from public;
revoke execute on function public.get_cafe_stock(uuid) from anon;
grant execute on function public.get_cafe_stock(uuid) to authenticated;
revoke execute on function public.create_order(uuid, public.order_channel, jsonb, jsonb, jsonb, public.payment_method) from public;
revoke execute on function public.transition_order_status(uuid, public.order_status, text) from public;
revoke execute on function public.assign_driver(uuid, uuid) from public;
revoke execute on function public.adjust_stock(uuid, integer, public.stock_reason, text) from public;
revoke execute on function public.get_order_tracking(uuid) from public;

grant execute on function public.create_order(uuid, public.order_channel, jsonb, jsonb, jsonb, public.payment_method) to anon, authenticated;
grant execute on function public.transition_order_status(uuid, public.order_status, text) to authenticated;
revoke execute on function public.transition_order_status(uuid, public.order_status, text) from anon;
grant execute on function public.assign_driver(uuid, uuid) to authenticated;
revoke execute on function public.assign_driver(uuid, uuid) from anon;
grant execute on function public.adjust_stock(uuid, integer, public.stock_reason, text) to authenticated;
revoke execute on function public.adjust_stock(uuid, integer, public.stock_reason, text) from anon;
grant execute on function public.get_order_tracking(uuid) to anon, authenticated;

-- Helpers privados: el schema no está expuesto por la API, pero los roles
-- necesitan EXECUTE porque las políticas RLS se evalúan con sus privilegios.
grant usage on schema private to anon, authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.is_super_admin() to anon, authenticated;
grant execute on function private.my_cafe_ids(public.member_role[]) to anon, authenticated;
grant execute on function private.has_cafe_role(uuid, public.member_role[]) to anon, authenticated;
grant execute on function private.is_cafe_public(uuid) to anon, authenticated;
grant execute on function private.public_cafe_ids() to anon, authenticated;
revoke all on table private.order_counters from anon, authenticated;
