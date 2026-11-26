# CLAUDE.md — Plataforma Multi-Tenant de Cafeterías (POS + Delivery)

## 1. Contexto del Proyecto
Sistema SaaS multi-tenant para gestionar múltiples cafeterías de una ciudad. Soporta venta digital (delivery/takeaway), venta presencial (POS en mostrador), gestión de roles, zonas de envío en mapa y tracking en tiempo real.

## 2. Stack Tecnológico
- **Framework:** Next.js (App Router, TypeScript estricto).
- **Estilos y UI:** Tailwind CSS + shadcn/ui + Lucide Icons.
- **Base de Datos y Auth:** Supabase (PostgreSQL, Auth, Realtime, Storage).
- **Validación:** Zod (obligatorio en Server Actions y Route Handlers).
- **Estado cliente:** Zustand (solo para carrito y estado temporal del POS).
- **Mapas:** Leaflet (`react-leaflet`) con OpenStreetMap (evitar Google Maps API salvo indicación explícita).

## 3. Arquitectura Escalable (Multi-Tenant)
- **Aislamiento de datos:** Modelo de base de datos compartida con columna `cafe_id` (UUID) en TODAS las tablas de negocio (`products`, `categories`, `orders`, `order_items`, `delivery_zones`, `cafe_members`).
- **Seguridad (RLS):** Row Level Security activado en todas las tablas. Ninguna query debe confiar solo en filtros del frontend. El `super_admin` tiene bypass controlado; el resto solo accede a filas de su `cafe_id`.
- **Ruteo:**
  - `/[slug]` -> Tienda pública digital de cada cafetería.
  - `/admin/[slug]` -> Panel de administración, POS y recepción de pedidos.
  - `/super-admin` -> Gestión global de cafeterías (tenants), planes y métricas.
  - `/driver/[orderId]` -> Vista móvil ligera para que el repartidor transmita GPS.
  - `/track/[orderId]` -> Vista pública de seguimiento en tiempo real para el cliente.
- **Estructura de carpetas (Feature-based):**
  - `src/app/` (solo rutas, layouts y pages delgados).
  - `src/features/` (`pos`, `orders`, `menu`, `delivery`, `tenants`, `auth`). Cada feature contiene sus `components/`, `actions/`, `hooks/` y `types.ts`.
  - `src/lib/supabase/` (`client.ts`, `server.ts`, `middleware.ts` usando `@supabase/ssr`; además `public.ts` sin cookies para datos públicos cacheables y `service.ts` con secret key, solo detrás de `requireSuperAdmin()`).
  - `src/lib/auth/guards.ts`: `requireCafeRole`, `requireSuperAdmin`, `requireDriver` (segunda línea de defensa tras el proxy; RLS es la definitiva).
- **Next.js 16:** `middleware.ts` ahora se llama **`src/proxy.ts`** (exporta `proxy()`). `src/lib/supabase/middleware.ts` contiene `updateSession`: refresca la sesión y sólo exige que haya sesión en rutas protegidas (sin consultas a la base); el rol lo validan los guards. `cacheComponents` está activo: toda lectura de cookies o sesión va dentro de `<Suspense>`, y `'use cache'` solo se usa con datos públicos.

## 4. Roles y Permisos (RBAC)
Tabla `cafe_members` vinculando `user_id`, `cafe_id` y `role`:
1. `super_admin`: Crea/suspende cafeterías, gestiona admins, ve métricas globales. **Se guarda en `platform_admins(user_id)`**, no en `cafe_members`, porque no pertenece a un café; es el único punto de bypass (`private.is_super_admin()`).
2. `admin`: Gestiona menú, precios, stock, horarios, zonas de delivery, staff y reportes de SU cafetería.
3. `receptionist`: Opera el POS presencial (venta rápida en mostrador), acepta/rechaza pedidos digitales, cambia estados (`pending` -> `preparing` -> `ready` -> `on_the_way` -> `delivered`) y asigna repartidores.
4. `driver`: Ve pedidos asignados y emite coordenadas GPS en tiempo real.

## 5. Reglas de Diseño y UX (Design Skills)
Aplicar criterios distintos según el tipo de usuario:
- **Tienda Digital (`/[slug]`):** Mobile-first estricto. Estética cálida y moderna de cafetería de especialidad (tipografía limpia, mucho espacio en blanco, fotos protagonistas, CTAs claros). Flujo de compra en máximo 3 clics. Prohibido usar gradientes genéricos "estilo IA".
- **POS Presencial y Recepción (`/admin/[slug]/pos`):** Diseño de alta densidad, orientado a velocidad en tablet o desktop. Botones grandes táctiles, atajos de teclado, colores semánticos claros para estados de pedido y alertas sonoras/visuales cuando entra un pedido online por Realtime.
- **Tracking (`/track/[orderId]`):** Mapa ocupando 60-70% de la pantalla en móvil, tarjeta inferior deslizable con estado del pedido y tiempo estimado.
- **Componentes:** Reutilizar primitivos de `shadcn/ui`. Mantener consistencia de tokens en `globals.css`.
- **Sistema de diseño "Porcelana y cáscara":** ver `docs/DESIGN.md` y el muestrario `/design`. Fuente única: Archivo (`font-wide`, `font-condensed`, `numeric`). El elemento firma es la curva de tueste (`RoastProgress`). Prohibido introducir hex sueltos fuera de `globals.css`.

## 6. Buenas Prácticas y Estándares de Código
- **Zero Trust en precios:** Nunca aceptar totales o precios enviados desde el cliente. Recalcular siempre en el servidor leyendo desde `products` en Supabase.
- **Server Components por defecto:** Usar `'use client'` solo en componentes interactivos (mapas, carrito, POS, suscripciones Realtime).
- **Supabase Realtime:**
  - Usar **Postgres Changes** filtrado por `cafe_id` para el tablero de recepción de pedidos.
  - Usar **Supabase Broadcast** (canales efímeros por `order_id`) para emitir lat/lng del repartidor cada 5 segundos sin saturar la base de datos con escrituras constantes.
- **Tipado:** Generar tipos de Supabase (`supabase gen types typescript`) y no usar `any`.
- **Migraciones:** Todo cambio en DB debe quedar documentado en `supabase/migrations/` con SQL idempotente.
- **Pedidos solo por RPC:** `orders`, `order_items`, `order_status_history` y `stock_movements` no tienen escritura directa. Se usan `create_order`, `transition_order_status`, `assign_driver` y `adjust_stock` (security definer, validan rol y `cafe_id`). El tracking público usa `get_order_tracking(tracking_token)`; el segmento `/track/[orderId]` recibe el token, nunca el id.
- **Tests de aislamiento:** cada regla RLS nueva agrega su caso en `supabase/tests/rls_isolation.sql`.

## 7. Flujo de Trabajo Obligatorio
1. Antes de escribir código para una feature nueva, presentar un plan breve (archivos a crear/modificar y cambios de esquema).
2. No implementar múltiples módulos complejos a la vez. Completar y verificar una fase antes de pasar a la siguiente.
3. Al tocar RLS o Auth, explicar explícitamente qué política se aplicó y cómo protege el aislamiento entre cafeterías.

## 8. Agentes del proyecto (`.claude/agents/`)
- `design-director`: proponer una pantalla antes de construirla y criticarla después (skill `frontend-design`).
- `rls-auditor`: obligatorio ante cualquier cambio en `supabase/` (skills de Supabase).
- `code-reviewer`: revisión contra estas reglas al cerrar cada feature. Complementar con `/code-review` (bugs) y `/security-review`.
- `phase-verifier`: al final de cada fase. Corre typecheck, lint, build y el test RLS, y emite el veredicto.