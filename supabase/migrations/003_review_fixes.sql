-- =============================================================================
-- 003_review_fixes.sql
-- Correcciones de la revisión de migraciones aplicadas sobre 001/002 ya ejecutadas.
-- (001/002 ya incluyen estos cambios para instalaciones nuevas; esto es idempotente.)
--
-- 1. create_order: el bloqueo de stock en orden fijo leía `e->>'product_id'` sobre
--    jsonb_array_elements(...) e, cuya columna se llama `value` → `e` es la fila,
--    no el jsonb, y la función fallaba. Ahora usa `as e(v)` / `e.v->>...`.
-- 2. cafes / cafe_members: id y created_at dejan de ser editables desde la API.
-- 3. Índices compuestos para los FK (x_id, cafe_id) que marcó el advisor de rendimiento.
-- =============================================================================
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

-- create or replace conserva los grants existentes, pero se reafirman por claridad.
revoke execute on function public.create_order(uuid, public.order_channel, jsonb, jsonb, jsonb, public.payment_method) from public;
grant execute on function public.create_order(uuid, public.order_channel, jsonb, jsonb, jsonb, public.payment_method) to anon, authenticated;

revoke update on public.cafes from authenticated;
grant update (name, slug, address, lat, lng, timezone, is_active, accepts_orders, config)
  on public.cafes to authenticated;

revoke update on public.cafe_members from authenticated;
grant update (cafe_id, user_id, role, display_name, is_active)
  on public.cafe_members to authenticated;

-- 3. Índices que cubren los FK compuestos (x_id, cafe_id) (advisor 0001).
--    Reemplazan a los índices de una sola columna con el mismo prefijo.
create index if not exists order_items_order_cafe_idx      on public.order_items (order_id, cafe_id);
create index if not exists order_items_product_cafe_idx    on public.order_items (product_id, cafe_id);
create index if not exists osh_order_cafe_idx              on public.order_status_history (order_id, cafe_id);
create index if not exists orders_zone_cafe_idx            on public.orders (delivery_zone_id, cafe_id);
create index if not exists pog_product_cafe_idx            on public.product_option_groups (product_id, cafe_id);
create index if not exists poi_group_cafe_idx              on public.product_option_items (group_id, cafe_id);
create index if not exists products_category_cafe_idx      on public.products (category_id, cafe_id);
create index if not exists stock_movements_order_cafe_idx  on public.stock_movements (order_id, cafe_id);
create index if not exists stock_movements_product_cafe_idx on public.stock_movements (product_id, cafe_id);

drop index if exists public.order_items_order_id_idx;
drop index if exists public.order_items_product_id_idx;
drop index if exists public.osh_order_id_idx;
drop index if exists public.orders_zone_idx;
drop index if exists public.pog_product_id_idx;
drop index if exists public.poi_group_id_idx;
drop index if exists public.products_category_id_idx;
drop index if exists public.stock_movements_order_idx;
drop index if exists public.stock_movements_product_idx;