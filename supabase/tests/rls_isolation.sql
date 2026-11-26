-- =============================================================================
-- rls_isolation.sql — verificación de aislamiento multi-tenant (requiere seed).
-- Ejecutar completo con `psql -f` o con el SQL editor / MCP execute_sql (no es pgTAP,
-- no usar `supabase test db`). Corre en una transacción y hace ROLLBACK al final.
-- Cualquier fallo aborta con "ASSERT FAILED: <motivo>".
-- =============================================================================
begin;

-- Helper para impersonar usuarios (claims JWT + rol), vive sólo en esta sesión.
create or replace function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;

grant execute on function pg_temp.act_as(uuid) to anon, authenticated;

-- Sin horarios cargados = abierto 24 h. Así el camino feliz se prueba a cualquier hora
-- (se deshace con el rollback final).
delete from public.cafe_hours where cafe_id = 'a0000000-0000-4000-8000-000000000001';

-- ------------------------------------------------------------------ ANON ---
select pg_temp.act_as(null);
do $$ begin
  assert (select count(*) from public.cafes) = 2, 'anon debe ver 2 cafés activos';
  assert (select count(*) from public.products) = 9, 'anon ve la carta pública';
  begin
    perform 1 from public.orders;
    raise exception 'ASSERT FAILED: anon no debe poder leer orders';
  exception when insufficient_privilege then null; end;
  begin
    perform stock_qty from public.products;
    raise exception 'ASSERT FAILED: anon no debe poder leer stock_qty';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.cafe_members;
    raise exception 'ASSERT FAILED: anon no debe poder leer cafe_members';
  exception when insufficient_privilege then null; end;
end $$;

-- Cliente anónimo crea pedido pickup: el precio sale de la DB.
do $$
declare r record;
begin
  select * into r from public.create_order(
    'a0000000-0000-4000-8000-000000000001', 'pickup',
    '[{"product_id":"a2000000-0000-4000-8000-000000000001","quantity":2,
       "option_item_ids":["a4000000-0000-4000-8000-000000000002","a4000000-0000-4000-8000-000000000003"],
       "price": 1, "unit_price": 1}]',
    '{"name":"Test","phone":"2610000000"}');
  -- (3600 + 600 avena + 900 shot) * 2 = 10200 — ignora "price": 1
  assert r.total = 10200, format('ASSERT FAILED: total recalculado esperado 10200, obtenido %s', r.total);

  -- Delivery dentro del radio de 2 km: fee de la zona (900), no del cliente.
  select * into r from public.create_order(
    'a0000000-0000-4000-8000-000000000001', 'delivery',
    '[{"product_id":"a2000000-0000-4000-8000-000000000001","quantity":2,
       "option_item_ids":["a4000000-0000-4000-8000-000000000001"]}]',
    '{"name":"Test delivery","phone":"2610000001"}',
    '{"address":"Sobremonte 120","lat":-32.8890,"lng":-68.8500,"fee":0}');
  assert r.total = 8100, format('ASSERT FAILED: delivery esperado 8100, obtenido %s', r.total);

  -- Fuera de toda zona.
  begin
    perform public.create_order('a0000000-0000-4000-8000-000000000001', 'delivery',
      '[{"product_id":"a2000000-0000-4000-8000-000000000001","quantity":2,
         "option_item_ids":["a4000000-0000-4000-8000-000000000001"]}]',
      '{"name":"Test","phone":"2610000002"}', '{"address":"Lejos 1","lat":-32.9500,"lng":-68.9000}');
    raise exception 'ASSERT FAILED: aceptó delivery fuera de zona';
  exception when others then assert sqlerrm like 'OUT_OF_DELIVERY_AREA%', sqlerrm; end;

  -- Pedido sin ítems.
  begin
    perform public.create_order('a0000000-0000-4000-8000-000000000001', 'pickup', null,
      '{"name":"Test","phone":"2610000003"}');
    raise exception 'ASSERT FAILED: aceptó pedido sin ítems';
  exception when others then assert sqlerrm like 'INVALID_ITEMS%', sqlerrm; end;

  -- anon no puede cambiar estados.
  begin
    perform public.transition_order_status('a6000000-0000-4000-8000-000000000001', 'ready');
    raise exception 'ASSERT FAILED: anon pudo llamar transition_order_status';
  exception when insufficient_privilege then null; end;

  -- Producto de OTRA cafetería en el pedido → rechazado.
  begin
    perform public.create_order('a0000000-0000-4000-8000-000000000001', 'pickup',
      '[{"product_id":"b2000000-0000-4000-8000-000000000001","quantity":1}]',
      '{"name":"Test","phone":"2610000000"}');
    raise exception 'ASSERT FAILED: aceptó producto de otro café';
  exception when others then
    assert sqlerrm like 'PRODUCT_UNAVAILABLE%', sqlerrm;
  end;

  -- Opción de otro producto → rechazada.
  begin
    perform public.create_order('a0000000-0000-4000-8000-000000000001', 'pickup',
      '[{"product_id":"a2000000-0000-4000-8000-000000000002","quantity":1,
         "option_item_ids":["a4000000-0000-4000-8000-000000000003"]}]',
      '{"name":"Test","phone":"2610000000"}');
    raise exception 'ASSERT FAILED: aceptó opción ajena al producto';
  exception when others then
    assert sqlerrm like 'INVALID_OPTIONS%', sqlerrm;
  end;

  -- POS desde anon → prohibido.
  begin
    perform public.create_order('a0000000-0000-4000-8000-000000000001', 'pos',
      '[{"product_id":"a2000000-0000-4000-8000-000000000002","quantity":1}]');
    raise exception 'ASSERT FAILED: anon pudo usar POS';
  exception when insufficient_privilege then null; end;

  -- Límite anti-abuso: máximo 3 pendientes por teléfono en 30 min.
  for i in 1..3 loop
    perform public.create_order('a0000000-0000-4000-8000-000000000001', 'pickup',
      '[{"product_id":"a2000000-0000-4000-8000-000000000002","quantity":1}]',
      '{"name":"Spam","phone":"2619999999"}');
  end loop;
  begin
    perform public.create_order('a0000000-0000-4000-8000-000000000001', 'pickup',
      '[{"product_id":"a2000000-0000-4000-8000-000000000002","quantity":1}]',
      '{"name":"Spam","phone":"2619999999"}');
    raise exception 'ASSERT FAILED: no limitó pendientes por teléfono';
  exception when others then assert sqlerrm like 'TOO_MANY_PENDING_ORDERS%', sqlerrm; end;

  -- anon no puede leer stock.
  begin
    perform * from public.get_cafe_stock('a0000000-0000-4000-8000-000000000001');
    raise exception 'ASSERT FAILED: anon pudo llamar get_cafe_stock';
  exception when insufficient_privilege then null; end;
end $$;

-- Opciones de un producto oculto: invisibles para el público.
reset role;
update public.products set is_active = false where id = 'a2000000-0000-4000-8000-000000000001';
select pg_temp.act_as(null);
do $$ begin
  assert (select count(*) from public.product_option_items
          where cafe_id = 'a0000000-0000-4000-8000-000000000001') = 0,
    'ASSERT FAILED: anon ve opciones de producto oculto';
end $$;
reset role;
update public.products set is_active = true where id = 'a2000000-0000-4000-8000-000000000001';

-- Categoría inactiva: sus productos dejan de ser públicos y no se pueden pedir.
update public.categories set is_active = false where id = 'a1000000-0000-4000-8000-000000000002';
select pg_temp.act_as(null);
do $$ begin
  assert (select count(*) from public.products where id = 'a2000000-0000-4000-8000-000000000003') = 0,
    'ASSERT FAILED: producto de categoría inactiva visible';
  begin
    perform public.create_order('a0000000-0000-4000-8000-000000000001', 'pickup',
      '[{"product_id":"a2000000-0000-4000-8000-000000000003","quantity":1}]',
      '{"name":"Test","phone":"2610000004"}');
    raise exception 'ASSERT FAILED: se pudo pedir un producto de categoría inactiva';
  exception when others then assert sqlerrm like 'PRODUCT_UNAVAILABLE%', sqlerrm; end;
end $$;
reset role;
update public.categories set is_active = true where id = 'a1000000-0000-4000-8000-000000000002';

-- Tracking por token: no expone teléfono.
reset role;
select set_config('test.token', (select tracking_token::text from public.orders
  where id = 'a6000000-0000-4000-8000-000000000001'), true);
select pg_temp.act_as(null);
do $$
declare j jsonb;
begin
  j := public.get_order_tracking(current_setting('test.token')::uuid);
  assert j is not null, 'ASSERT FAILED: tracking por token debe funcionar';
  assert not (j::text like '%2615550101%'), 'ASSERT FAILED: tracking filtra el teléfono';
  assert not (j::text like '%Martina%'), 'ASSERT FAILED: tracking filtra el nombre del cliente';
  assert not (j ? 'order_id'), 'ASSERT FAILED: tracking expone el id interno del pedido';
  assert public.get_order_tracking(gen_random_uuid()) is null, 'ASSERT FAILED: token inventado devuelve datos';
end $$;

-- ------------------------------------------------- RECEPCIÓN NORTE (A) ---
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
do $$ begin
  assert (select count(*) from public.orders where cafe_id = 'b0000000-0000-4000-8000-000000000001') = 0,
    'ASSERT FAILED: recepción Norte ve pedidos de Sur';
  assert (select count(*) from public.orders where cafe_id = 'a0000000-0000-4000-8000-000000000001') >= 2,
    'ASSERT FAILED: recepción Norte no ve sus pedidos';
  assert (select count(*) from public.order_items where cafe_id = 'b0000000-0000-4000-8000-000000000001') = 0,
    'ASSERT FAILED: recepción Norte ve ítems de Sur';
  assert (select count(*) from public.cafe_members where cafe_id = 'b0000000-0000-4000-8000-000000000001') = 0,
    'ASSERT FAILED: recepción Norte ve staff de Sur';

  -- No puede escribir directo en orders.
  begin
    update public.orders set total = 1 where id = 'a6000000-0000-4000-8000-000000000001';
    raise exception 'ASSERT FAILED: UPDATE directo en orders permitido';
  exception when insufficient_privilege then null; end;

  -- No puede editar el menú (solo admin).
  update public.products set price = 1 where id = 'a2000000-0000-4000-8000-000000000001';
  assert (select price from public.products where id = 'a2000000-0000-4000-8000-000000000001') = 3600,
    'ASSERT FAILED: recepción pudo cambiar precios';

  -- Transición válida y transición sobre pedido ajeno.
  perform public.transition_order_status('a6000000-0000-4000-8000-000000000001', 'ready');
  begin
    perform public.transition_order_status('b6000000-0000-4000-8000-000000000001', 'preparing');
    raise exception 'ASSERT FAILED: recepción Norte cambió estado de pedido de Sur';
  exception when others then
    assert sqlerrm like 'ORDER_NOT_FOUND%', sqlerrm;
  end;

  -- Asignar driver de OTRO café → rechazado por trigger.
  begin
    perform public.assign_driver('a6000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3');
    raise exception 'ASSERT FAILED: asignó driver de otro café';
  exception when others then
    assert sqlerrm like 'DRIVER_NOT_IN_CAFE%' or sqlerrm like 'ORDER_NOT_ASSIGNABLE%', sqlerrm;
  end;

  -- Recepción lee el stock de su café por RPC, pero no puede ajustarlo (sólo admin).
  assert (select count(*) from public.get_cafe_stock('a0000000-0000-4000-8000-000000000001')) = 5,
    'ASSERT FAILED: recepción no obtiene el stock de su café';
  begin
    perform public.adjust_stock('a2000000-0000-4000-8000-000000000004', 1, 'restock');
    raise exception 'ASSERT FAILED: recepción ajustó stock';
  exception when others then assert sqlerrm like 'PRODUCT_NOT_FOUND%', sqlerrm; end;
end $$;

-- Cancelar repone exactamente lo descontado.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
do $$
declare r record;
begin
  select * into r from public.create_order('a0000000-0000-4000-8000-000000000001', 'pickup',
    '[{"product_id":"a2000000-0000-4000-8000-000000000004","quantity":3}]',
    '{"name":"Stock","phone":"2610000099"}');
  perform set_config('test.cancel_order', r.order_id::text, true);
  perform public.transition_order_status(r.order_id, 'cancelled');
end $$;
reset role;
do $$ begin
  assert (select stock_qty from public.products where id = 'a2000000-0000-4000-8000-000000000004') = 18,
    'ASSERT FAILED: cancelar no repuso el stock';
  assert (select count(*) from public.stock_movements
          where order_id = current_setting('test.cancel_order')::uuid
            and reason = 'cancellation' and delta = 3) = 1,
    'ASSERT FAILED: falta el movimiento de cancelación';
end $$;

-- ------------------------------------------------------ ADMIN SUR (B) ---
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
do $$
declare n int;
begin
  update public.products set price = 1 where cafe_id = 'a0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'ASSERT FAILED: admin Sur modificó productos de Norte';

  -- Mover un producto propio a otro café → with check lo bloquea.
  begin
    update public.categories set cafe_id = 'a0000000-0000-4000-8000-000000000001'
     where id = 'b1000000-0000-4000-8000-000000000001';
    raise exception 'ASSERT FAILED: admin Sur movió una categoría a Norte';
  exception when insufficient_privilege or foreign_key_violation then null; end;

  -- Insertar en café ajeno → bloqueado.
  begin
    insert into public.categories (cafe_id, name) values ('a0000000-0000-4000-8000-000000000001', 'Hack');
    raise exception 'ASSERT FAILED: admin Sur insertó categoría en Norte';
  exception when insufficient_privilege then null; end;

  -- Suspenderse / cambiar slug → sólo super_admin.
  begin
    update public.cafes set is_active = false where id = 'b0000000-0000-4000-8000-000000000001';
    raise exception 'ASSERT FAILED: admin pudo suspender su café';
  exception when insufficient_privilege then null; end;

  -- Puede editar lo suyo.
  update public.products set price = 3400 where id = 'b2000000-0000-4000-8000-000000000001';
  assert (select price from public.products where id = 'b2000000-0000-4000-8000-000000000001') = 3400,
    'ASSERT FAILED: admin Sur no puede editar su carta';

  -- stock_qty no es editable directo.
  begin
    update public.products set stock_qty = 999 where id = 'b2000000-0000-4000-8000-000000000003';
    raise exception 'ASSERT FAILED: stock_qty editable directo';
  exception when insufficient_privilege then null; end;

  assert public.adjust_stock('b2000000-0000-4000-8000-000000000003', 5, 'restock') = 45,
    'ASSERT FAILED: adjust_stock';

  -- No puede darse rol super_admin ni agregarse a Norte.
  begin
    insert into public.cafe_members (cafe_id, user_id, role)
    values ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'admin');
    raise exception 'ASSERT FAILED: admin Sur se agregó a Norte';
  exception when insufficient_privilege then null; end;
end $$;

-- --------------------------------------------------------- DRIVER NORTE ---
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
do $$ begin
  assert (select count(*) from public.orders) = 1, 'ASSERT FAILED: driver debe ver sólo su pedido asignado';
  assert (select count(*) from public.order_items) = 1, 'ASSERT FAILED: driver ve ítems ajenos';
  -- ready → on_the_way → delivered (el pedido quedó en ready por recepción)
  perform public.transition_order_status('a6000000-0000-4000-8000-000000000001', 'on_the_way');
  perform public.transition_order_status('a6000000-0000-4000-8000-000000000001', 'delivered');
  -- Pedido de su café pero NO asignado a él: ni siquiera revela el estado.
  begin
    perform public.transition_order_status('a6000000-0000-4000-8000-000000000002', 'delivered');
    raise exception 'ASSERT FAILED: driver tocó un pedido no asignado';
  exception when others then assert sqlerrm like 'ORDER_NOT_FOUND%', sqlerrm; end;
end $$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b3');
do $$ begin
  assert (select count(*) from public.orders) = 0, 'ASSERT FAILED: driver Sur ve pedidos no asignados';
  -- Un usuario autenticado de otro café no lee stock_qty ni por columna ni por RPC.
  begin
    perform stock_qty from public.products where cafe_id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'ASSERT FAILED: authenticated ajeno lee stock_qty';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.get_cafe_stock('a0000000-0000-4000-8000-000000000001')) = 0,
    'ASSERT FAILED: get_cafe_stock devuelve stock a otro café';
  begin
    perform public.transition_order_status('a6000000-0000-4000-8000-000000000001', 'delivered');
    raise exception 'ASSERT FAILED: driver Sur tocó pedido de Norte';
  exception when others then assert sqlerrm like 'ORDER_NOT_FOUND%', sqlerrm; end;
end $$;

-- ------------------------------------------------------------ SUPER ADMIN ---
select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
do $$ begin
  assert (select count(*) from public.orders) >= 3, 'ASSERT FAILED: super_admin debe ver todos los pedidos';
  update public.cafes set is_active = false where id = 'b0000000-0000-4000-8000-000000000001';
end $$;

-- Café suspendido: su staff pierde acceso, el público deja de verlo.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
do $$ begin
  assert (select count(*) from public.orders) = 0, 'ASSERT FAILED: staff de café suspendido sigue viendo pedidos';
end $$;
select pg_temp.act_as(null);
do $$ begin
  assert (select count(*) from public.cafes) = 1, 'ASSERT FAILED: café suspendido visible al público';
  assert (select count(*) from public.products where cafe_id = 'b0000000-0000-4000-8000-000000000001') = 0,
    'ASSERT FAILED: carta de café suspendido visible';
end $$;

reset role;
select 'RLS isolation: OK' as result;
rollback;
