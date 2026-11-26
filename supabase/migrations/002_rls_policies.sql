-- =============================================================================
-- 002_rls_policies.sql
-- Row Level Security: aislamiento total por cafe_id + permisos por rol.
--
-- Modelo:
--   * anon / clientes: sólo LECTURA de la carta pública de cafés activos.
--     Nunca leen orders/order_items (el tracking usa get_order_tracking(token)).
--   * admin:        CRUD de menú, zonas, horarios y staff de SUS cafés.
--   * receptionist: lee pedidos/staff de su café; muta pedidos sólo vía RPC.
--   * driver:       lee únicamente los pedidos donde driver_id = auth.uid().
--   * super_admin:  bypass controlado vía private.is_super_admin().
--
-- Patrón de rendimiento: `cafe_id in (select private.my_cafe_ids(...))`
-- evalúa la membresía UNA vez por query y usa el índice sobre cafe_id.
--
-- Nota: NO usamos FORCE ROW LEVEL SECURITY porque las RPCs security definer
-- (owner postgres) necesitan escribir pedidos tras validar en su cuerpo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Activar RLS en todas las tablas expuestas
-- -----------------------------------------------------------------------------
alter table public.plans                 enable row level security;
alter table public.platform_admins       enable row level security;
alter table public.cafes                 enable row level security;
alter table public.cafe_members          enable row level security;
alter table public.cafe_subscriptions    enable row level security;
alter table public.cafe_hours            enable row level security;
alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.product_option_items  enable row level security;
alter table public.delivery_zones        enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.stock_movements       enable row level security;

-- -----------------------------------------------------------------------------
-- Privilegios de tabla (defensa en profundidad, además de RLS)
-- -----------------------------------------------------------------------------
-- Lectura pública de la carta.
grant select on public.plans, public.cafes, public.cafe_hours, public.categories,
               public.products, public.product_option_groups, public.product_option_items,
               public.delivery_zones
  to anon, authenticated;

-- Quitar privilegios por defecto de Supabase que no usamos (defensa en profundidad).
revoke insert, update, delete, truncate, references, trigger
  on public.plans, public.cafes, public.cafe_hours, public.categories, public.products,
     public.product_option_groups, public.product_option_items, public.delivery_zones
  from anon;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- stock_qty NO es legible por columna para nadie de la API (anon ni authenticated):
-- products_select muestra la carta de todos los cafés activos, así que un usuario
-- logueado de otro café podría calcular cuánto pedir para agotar un producto.
-- El staff lee el stock con la RPC get_cafe_stock(cafe_id).
-- ⇒ Consultar products con columnas explícitas, nunca `select=*`.
revoke select on public.products from anon, authenticated;
grant select (id, cafe_id, category_id, name, description, price, image_url, is_active,
              is_available, track_stock, sort_order, created_at, updated_at)
  on public.products to anon, authenticated;

-- Tablas internas: anon no tiene nada que hacer aquí.
revoke all on public.platform_admins, public.cafe_members, public.cafe_subscriptions,
              public.orders, public.order_items, public.order_status_history,
              public.stock_movements
  from anon;

grant select on public.platform_admins, public.cafe_members, public.cafe_subscriptions,
                public.orders, public.order_items, public.order_status_history,
                public.stock_movements
  to authenticated;

-- Pedidos, ítems, historial y stock: SIN escritura directa. Sólo RPCs.
revoke insert, update, delete on public.orders, public.order_items,
                                 public.order_status_history, public.stock_movements,
                                 public.platform_admins
  from authenticated;

-- Escritura de configuración/menú (RLS decide quién).
grant insert, update, delete on public.cafes, public.cafe_members, public.cafe_subscriptions,
                                public.cafe_hours, public.categories, public.products,
                                public.product_option_groups, public.product_option_items,
                                public.delivery_zones, public.plans
  to authenticated;

-- cafes: id y created_at son inmutables desde la API; updated_at lo pone el trigger.
-- is_active y slug quedan con grant pero el trigger cafes_guard los limita a super_admin.
revoke update on public.cafes from authenticated;
grant update (name, slug, address, lat, lng, timezone, is_active, accepts_orders, config)
  on public.cafes to authenticated;

-- cafe_members: no se puede reasignar id ni created_at.
revoke update on public.cafe_members from authenticated;
grant update (cafe_id, user_id, role, display_name, is_active)
  on public.cafe_members to authenticated;

-- products.stock_qty sólo cambia vía create_order / adjust_stock / cancelación
-- (ni al crear el producto: todo stock inicial pasa por adjust_stock y queda auditado).
revoke insert, update on public.products from authenticated;
grant insert (id, cafe_id, category_id, name, description, price, image_url, is_active,
              is_available, track_stock, sort_order)
  on public.products to authenticated;
grant update (category_id, name, description, price, image_url, is_active, is_available,
              track_stock, sort_order)
  on public.products to authenticated;

-- delivery_zones.area la calcula el trigger.
revoke update on public.delivery_zones from authenticated;
grant update (name, zone_type, center_lat, center_lng, radius_km, polygon, fee, min_order,
              eta_minutes, priority, is_active)
  on public.delivery_zones to authenticated;

-- =============================================================================
-- PLANS — catálogo de planes del SaaS.
-- Público lee activos; sólo super_admin escribe.
-- =============================================================================
-- (grant de lectura arriba; `revoke ... from anon` quitó la escritura)
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select to anon, authenticated
  using (is_active or (select private.is_super_admin()));

drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

-- =============================================================================
-- PLATFORM_ADMINS — cada usuario sólo puede ver SU propia fila (para que el
-- proxy sepa si es super admin). Altas/bajas sólo con service_role.
-- =============================================================================
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_super_admin()));

-- =============================================================================
-- CAFES — tenants.
-- Público y staff ven sólo cafés activos: un café suspendido desaparece
-- también para su staff (my_cafe_ids filtra is_active). super_admin ve todos.
-- Admin edita su café (el trigger cafes_guard impide tocar is_active/slug).
-- Alta y baja de cafés: sólo super_admin.
-- =============================================================================
drop policy if exists cafes_select on public.cafes;
create policy cafes_select on public.cafes
  for select to anon, authenticated
  using (is_active or (select private.is_super_admin()));

drop policy if exists cafes_insert on public.cafes;
create policy cafes_insert on public.cafes
  for insert to authenticated
  with check ((select private.is_super_admin()));

drop policy if exists cafes_update on public.cafes;
create policy cafes_update on public.cafes
  for update to authenticated
  using (id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()))
  with check (id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()));

drop policy if exists cafes_delete on public.cafes;
create policy cafes_delete on public.cafes
  for delete to authenticated
  using ((select private.is_super_admin()));

-- =============================================================================
-- CAFE_MEMBERS — staff.
-- Cada usuario ve sus propias membresías; admin y recepción ven el staff de
-- su café (recepción lo necesita para asignar repartidores).
-- Sólo admin (de ESE café) o super_admin dan de alta/modifican/eliminan.
-- Un admin no puede modificarse ni borrarse a sí mismo (evita auto-lockout
-- y escalamiento) — eso queda para otro admin o super_admin.
-- =============================================================================
drop policy if exists cafe_members_select on public.cafe_members;
create policy cafe_members_select on public.cafe_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
  );

drop policy if exists cafe_members_insert on public.cafe_members;
create policy cafe_members_insert on public.cafe_members
  for insert to authenticated
  with check (
    cafe_id in (select private.my_cafe_ids('{admin}'))
    or (select private.is_super_admin())
  );

drop policy if exists cafe_members_update on public.cafe_members;
create policy cafe_members_update on public.cafe_members
  for update to authenticated
  using (
    (cafe_id in (select private.my_cafe_ids('{admin}')) and user_id <> (select auth.uid()))
    or (select private.is_super_admin())
  )
  with check (
    (cafe_id in (select private.my_cafe_ids('{admin}')) and user_id <> (select auth.uid()))
    or (select private.is_super_admin())
  );

drop policy if exists cafe_members_delete on public.cafe_members;
create policy cafe_members_delete on public.cafe_members
  for delete to authenticated
  using (
    (cafe_id in (select private.my_cafe_ids('{admin}')) and user_id <> (select auth.uid()))
    or (select private.is_super_admin())
  );

-- =============================================================================
-- CAFE_SUBSCRIPTIONS — admin lee la de su café; sólo super_admin escribe.
-- =============================================================================
drop policy if exists cafe_subscriptions_select on public.cafe_subscriptions;
create policy cafe_subscriptions_select on public.cafe_subscriptions
  for select to authenticated
  using (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()));

drop policy if exists cafe_subscriptions_write on public.cafe_subscriptions;
create policy cafe_subscriptions_write on public.cafe_subscriptions
  for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

-- =============================================================================
-- Tablas de CARTA PÚBLICA: cafe_hours, categories, products, option groups,
-- option items, delivery_zones.
-- SELECT: público si el café está activo (y la fila activa cuando aplica);
--         staff del café ve todo (incluye inactivos para editarlos).
-- WRITE:  sólo admin del café (with check impide mover filas a otro café).
-- =============================================================================

-- cafe_hours ------------------------------------------------------------------
drop policy if exists cafe_hours_select on public.cafe_hours;
create policy cafe_hours_select on public.cafe_hours
  for select to anon, authenticated
  using (cafe_id in (select private.public_cafe_ids()));

drop policy if exists cafe_hours_write on public.cafe_hours;
create policy cafe_hours_write on public.cafe_hours
  for all to authenticated
  using (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()))
  with check (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()));

-- categories ------------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to anon, authenticated
  using (
    (is_active and cafe_id in (select private.public_cafe_ids()))
    or cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
  );

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all to authenticated
  using (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()))
  with check (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()));

-- products --------------------------------------------------------------------
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to anon, authenticated
  using (
    -- público: producto activo de café activo y de categoría activa (o sin categoría)
    (is_active and cafe_id in (select private.public_cafe_ids())
      and (category_id is null or exists (
            select 1 from public.categories c where c.id = products.category_id and c.is_active)))
    or cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
  );

drop policy if exists products_write on public.products;
create policy products_write on public.products
  for all to authenticated
  using (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()))
  with check (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()));

-- product_option_groups -------------------------------------------------------
drop policy if exists pog_select on public.product_option_groups;
create policy pog_select on public.product_option_groups
  for select to anon, authenticated
  using (
    -- público: sólo variantes de productos visibles (no filtra recargos de productos ocultos)
    (cafe_id in (select private.public_cafe_ids())
      and exists (select 1 from public.products p
                  where p.id = product_option_groups.product_id and p.is_active))
    or cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
  );

drop policy if exists pog_write on public.product_option_groups;
create policy pog_write on public.product_option_groups
  for all to authenticated
  using (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()))
  with check (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()));

-- product_option_items --------------------------------------------------------
drop policy if exists poi_select on public.product_option_items;
create policy poi_select on public.product_option_items
  for select to anon, authenticated
  using (
    (cafe_id in (select private.public_cafe_ids())
      and exists (select 1 from public.product_option_groups g
                  join public.products p on p.id = g.product_id
                  where g.id = product_option_items.group_id and p.is_active))
    or cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
  );

drop policy if exists poi_write on public.product_option_items;
create policy poi_write on public.product_option_items
  for all to authenticated
  using (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()))
  with check (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()));

-- delivery_zones --------------------------------------------------------------
drop policy if exists delivery_zones_select on public.delivery_zones;
create policy delivery_zones_select on public.delivery_zones
  for select to anon, authenticated
  using (
    (is_active and cafe_id in (select private.public_cafe_ids()))
    or cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
  );

drop policy if exists delivery_zones_write on public.delivery_zones;
create policy delivery_zones_write on public.delivery_zones
  for all to authenticated
  using (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()))
  with check (cafe_id in (select private.my_cafe_ids('{admin}')) or (select private.is_super_admin()));

-- =============================================================================
-- ORDERS — sólo lectura vía RLS; escritura exclusivamente por RPC.
--   staff (admin|receptionist): todos los pedidos de su café.
--   driver: sólo los asignados a él, y sólo si sigue siendo driver activo
--           del café (al darlo de baja pierde acceso de inmediato).
-- =============================================================================
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (
    cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (driver_id = (select auth.uid()) and cafe_id in (select private.my_cafe_ids('{driver}')))
    or (select private.is_super_admin())
  );

-- ORDER_ITEMS / ORDER_STATUS_HISTORY — mismo alcance que el pedido padre.
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to authenticated
  using (
    cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.driver_id = (select auth.uid())
        and o.cafe_id in (select private.my_cafe_ids('{driver}'))
    )
  );

drop policy if exists osh_select on public.order_status_history;
create policy osh_select on public.order_status_history
  for select to authenticated
  using (
    cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
    or exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id
        and o.driver_id = (select auth.uid())
        and o.cafe_id in (select private.my_cafe_ids('{driver}'))
    )
  );

-- STOCK_MOVEMENTS — auditoría: admin y recepción de su café.
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using (
    cafe_id in (select private.my_cafe_ids('{admin,receptionist}'))
    or (select private.is_super_admin())
  );

-- =============================================================================
-- Realtime: Postgres Changes del tablero de recepción. Realtime aplica RLS
-- (orders_select), así que cada suscriptor sólo recibe pedidos de su café.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
     ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
