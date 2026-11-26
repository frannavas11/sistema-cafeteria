-- =============================================================================
-- seed.sql — datos de prueba para validar el aislamiento multi-tenant.
-- SOLO desarrollo / ramas de prueba. Contraseña de todos: Demo1234!
--
--   super@demo.test            super_admin (platform_admins)
--   admin.norte@demo.test      admin        · Tostado Norte
--   recepcion.norte@demo.test  receptionist · Tostado Norte
--   driver.norte@demo.test     driver       · Tostado Norte
--   admin.sur@demo.test        admin        · Molienda Sur
--   recepcion.sur@demo.test    receptionist · Molienda Sur
--   driver.sur@demo.test       driver       · Molienda Sur
-- =============================================================================

-- ---------------------------------------------------------------- usuarios ---
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'super@demo.test'),
      ('00000000-0000-4000-8000-0000000000a1'::uuid, 'admin.norte@demo.test'),
      ('00000000-0000-4000-8000-0000000000a2'::uuid, 'recepcion.norte@demo.test'),
      ('00000000-0000-4000-8000-0000000000a3'::uuid, 'driver.norte@demo.test'),
      ('00000000-0000-4000-8000-0000000000b1'::uuid, 'admin.sur@demo.test'),
      ('00000000-0000-4000-8000-0000000000b2'::uuid, 'recepcion.sur@demo.test'),
      ('00000000-0000-4000-8000-0000000000b3'::uuid, 'driver.sur@demo.test')
    ) as t(id, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('Demo1234!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict (provider_id, provider) do nothing;
  end loop;
end $$;

insert into public.platform_admins (user_id)
values ('00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ------------------------------------------------------------------- planes ---
insert into public.plans (id, code, name, price_monthly, limits) values
  ('e0000000-0000-4000-8000-000000000001', 'starter', 'Starter', 0,     '{"max_products": 40,  "max_staff": 3}'),
  ('e0000000-0000-4000-8000-000000000002', 'pro',     'Pro',     24900, '{"max_products": 500, "max_staff": 20}')
on conflict (id) do nothing;

-- -------------------------------------------------------------------- cafés ---
insert into public.cafes (id, name, slug, address, lat, lng, config) values
  ('a0000000-0000-4000-8000-000000000001', 'Tostado Norte', 'tostado-norte',
   'Av. Arístides Villanueva 410, Mendoza', -32.8862, -68.8551,
   '{"brand_color": "#1E4D6B", "currency": "ARS", "prep_minutes": 12,
     "tagline": "Tostamos los martes. Se nota el resto de la semana."}'),
  ('b0000000-0000-4000-8000-000000000001', 'Molienda Sur', 'molienda-sur',
   'Calle Colón 1220, Godoy Cruz', -32.9246, -68.8443,
   '{"brand_color": "#4F6B52", "currency": "ARS", "prep_minutes": 15,
     "tagline": "Filtrados lentos, medialunas de manteca."}')
on conflict (id) do nothing;

insert into public.cafe_subscriptions (cafe_id, plan_id, status) values
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'active'),
  ('b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'trialing')
on conflict (cafe_id) do nothing;

insert into public.cafe_members (cafe_id, user_id, role, display_name) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'admin',        'Lucía (admin)'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'receptionist', 'Tomás (barra)'),
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a3', 'driver',       'Nico (moto)'),
  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'admin',        'Carla (admin)'),
  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'receptionist', 'Julián (barra)'),
  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', 'driver',       'Sofi (bici)')
on conflict (cafe_id, user_id) do nothing;

-- Horarios: todos los días 07:30–21:00 (Norte) y 08:00–20:00 (Sur).
insert into public.cafe_hours (cafe_id, weekday, opens_at, closes_at)
select 'a0000000-0000-4000-8000-000000000001', d, '07:30', '21:00' from generate_series(0, 6) d
on conflict (cafe_id, weekday, opens_at) do nothing;
insert into public.cafe_hours (cafe_id, weekday, opens_at, closes_at)
select 'b0000000-0000-4000-8000-000000000001', d, '08:00', '20:00' from generate_series(0, 6) d
on conflict (cafe_id, weekday, opens_at) do nothing;

-- --------------------------------------------------------------- categorías ---
insert into public.categories (id, cafe_id, name, sort_order) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Espresso bar', 1),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Filtrados',    2),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Pastelería',   3),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Café',         1),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Desayunos',    2)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- productos ---
insert into public.products (id, cafe_id, category_id, name, description, price, track_stock, stock_qty, sort_order) values
  -- Tostado Norte
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Flat white', 'Doble ristretto de Huila con leche texturizada fina.', 3600, false, 0, 1),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Cortado', 'Espresso con una nube de leche.', 2900, false, 0, 2),
  ('a2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
   'V60 del día', 'Origen rotativo. Preguntá en barra cuál tostamos esta semana.', 4200, false, 0, 1),
  ('a2000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003',
   'Cardamom bun', 'Masa laminada, cardamomo y azúcar perlada.', 3200, true, 18, 1),
  ('a2000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003',
   'Budín de limón', 'Porción generosa con glaseado ácido.', 2700, true, 10, 2),
  -- Molienda Sur
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'Latte', 'Espresso brasileño, leche entera o vegetal.', 3300, false, 0, 1),
  ('b2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'Chemex para dos', 'Filtrado lento, 500 ml.', 6800, false, 0, 2),
  ('b2000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
   'Medialunas x3', 'De manteca, horneadas cada mañana.', 2400, true, 40, 1),
  ('b2000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
   'Tostado de campo', 'Pan de masa madre, jamón crudo y queso.', 5900, false, 0, 2)
on conflict (id) do nothing;

-- Fotos mock: ilustraciones propias en /public/mock (reemplazar por fotos reales en Storage).
update public.products p set image_url = v.url
from (values
  ('a2000000-0000-4000-8000-000000000001'::uuid, '/mock/flat-white.svg'),
  ('a2000000-0000-4000-8000-000000000002'::uuid, '/mock/cortado.svg'),
  ('a2000000-0000-4000-8000-000000000003'::uuid, '/mock/v60.svg'),
  ('a2000000-0000-4000-8000-000000000004'::uuid, '/mock/cardamom-bun.svg'),
  ('a2000000-0000-4000-8000-000000000005'::uuid, '/mock/budin-limon.svg'),
  ('b2000000-0000-4000-8000-000000000001'::uuid, '/mock/latte.svg'),
  ('b2000000-0000-4000-8000-000000000002'::uuid, '/mock/chemex.svg'),
  ('b2000000-0000-4000-8000-000000000003'::uuid, '/mock/medialunas.svg'),
  ('b2000000-0000-4000-8000-000000000004'::uuid, '/mock/tostado.svg')
) as v(id, url)
where p.id = v.id and p.image_url is null;

-- -------------------------------------------------------- variantes/extras ---
insert into public.product_option_groups (id, cafe_id, product_id, name, min_select, max_select, sort_order) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Leche',  1, 1, 1),
  ('a3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Extras', 0, 2, 2),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Tamaño', 1, 1, 1),
  ('b3000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Leche',  1, 1, 2)
on conflict (id) do nothing;

insert into public.product_option_items (id, cafe_id, group_id, name, price_delta, sort_order) values
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Entera',        0,   1),
  ('a4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Avena',         600, 2),
  ('a4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'Shot extra',    900, 1),
  ('a4000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'Jarabe de miel',400, 2),
  ('b4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Chico 240 ml',  0,   1),
  ('b4000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Grande 360 ml', 700, 2),
  ('b4000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000002', 'Entera',        0,   1),
  ('b4000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000002', 'Almendras',     800, 2)
on conflict (id) do nothing;

-- -------------------------------------------------------- zonas de delivery ---
insert into public.delivery_zones (id, cafe_id, name, zone_type, center_lat, center_lng, radius_km, fee, min_order, eta_minutes, priority) values
  ('a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Radio 2 km', 'radius', -32.8862, -68.8551, 2.0, 900, 4000, 25, 10),
  ('b5000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Radio 1,5 km', 'radius', -32.9246, -68.8443, 1.5, 700, 3500, 20, 10)
on conflict (id) do nothing;

insert into public.delivery_zones (id, cafe_id, name, zone_type, polygon, fee, min_order, eta_minutes, priority) values
  ('a5000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Centro (polígono)', 'polygon',
   '{"type":"Polygon","coordinates":[[[-68.8520,-32.8800],[-68.8330,-32.8800],[-68.8330,-32.8990],[-68.8520,-32.8990],[-68.8520,-32.8800]]]}',
   1400, 6000, 35, 5),
  ('b5000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Godoy Cruz este (polígono)', 'polygon',
   '{"type":"Polygon","coordinates":[[[-68.8420,-32.9150],[-68.8250,-32.9150],[-68.8250,-32.9330],[-68.8420,-32.9330],[-68.8420,-32.9150]]]}',
   1200, 5000, 30, 5)
on conflict (id) do nothing;

-- ---------------------------------------------------------- pedidos ejemplo ---
-- Insertados directamente (rol postgres) con totales coherentes.
-- `where not exists` (no `on conflict`): el trigger de numeración corre antes del
-- conflicto, así que re-ejecutar el seed con on conflict dejaría huecos en los números.
insert into public.orders (id, cafe_id, order_number, channel, status, customer_name, customer_phone,
                           delivery_address, delivery_lat, delivery_lng, delivery_zone_id, delivery_fee,
                           subtotal, total, payment_method, driver_id)
select * from (values
  ('a6000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, 0,
   'delivery'::public.order_channel, 'preparing'::public.order_status,
   'Martina R.', '2615550101', 'Sobremonte 120', -32.8890::double precision, -68.8500::double precision,
   'a5000000-0000-4000-8000-000000000001'::uuid, 900::numeric,
   7200::numeric, 8100::numeric, 'transfer'::public.payment_method, '00000000-0000-4000-8000-0000000000a3'::uuid),
  ('a6000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 0, 'pos', 'delivered',
   null, null, null, null, null, null, 0, 2900, 2900, 'cash', null),
  ('b6000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 0, 'pickup', 'pending',
   'Federico P.', '2615550202', null, null, null, null, 0, 4800, 4800, 'cash', null)
) v
where not exists (select 1 from public.orders o where o.id = v.column1);

insert into public.order_items (cafe_id, order_id, product_id, product_name, unit_price, quantity, line_total, options)
select * from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'a6000000-0000-4000-8000-000000000001'::uuid, 'a2000000-0000-4000-8000-000000000001'::uuid,
   'Flat white', 3600::numeric, 2, 7200::numeric, '[{"name":"Entera","group_name":"Leche","price_delta":0}]'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002',
   'Cortado', 2900, 1, 2900, '[]'),
  ('b0000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000003',
   'Medialunas x3', 2400, 2, 4800, '[]')
) v
where not exists (select 1 from public.order_items oi where oi.order_id = v.column2);

insert into public.order_status_history (cafe_id, order_id, from_status, to_status)
select * from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'a6000000-0000-4000-8000-000000000001'::uuid, null::public.order_status, 'pending'::public.order_status),
  ('a0000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'pending', 'preparing'),
  ('a0000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', null, 'preparing'),
  ('a0000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', 'preparing', 'delivered'),
  ('b0000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', null, 'pending')
) v
where not exists (select 1 from public.order_status_history h where h.order_id = v.column2);
