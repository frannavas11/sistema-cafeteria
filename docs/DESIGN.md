# Sistema de diseño: "Porcelana y cáscara"

Muestrario vivo: `/design` (solo en desarrollo). Tokens: `src/app/globals.css`.

## Idea
El sistema sale del mundo de la barra de especialidad, no de una plantilla SaaS. Lo componen
cuatro referencias: el bowl de porcelana de la cata, la cereza de café madura, la curva de
tueste y la comanda impresa.

**Por qué no crema y terracota:** es la estética por defecto de las interfaces generadas por IA,
la que hoy resulta intercambiable. La descartamos a propósito.

## Color
Cada color tiene un trabajo:

| Token | Hex | Uso |
|---|---|---|
| `porcelana` | #EDEFEA | Fondo. Mineral y frío, no crema. |
| `loza` | #FAFBF8 | Superficies elevadas: hojas, tickets, tarjetas. |
| `tueste` | #2A1A12 | Tinta, barra lateral. Reemplaza al negro. |
| `cascara` | #A3172F | Acción principal y "requiere atención" (pedido nuevo). |
| `crema` | #C47F1F | En preparación, avisos. |
| `grano` | #6F7D48 | Listo, confirmaciones. |
| `acequia` | #2D5F7A | En camino, foco e información. |

- **Color del tenant:** cada cafetería define `config.brand_color`, que se inyecta como
  `--cafe-primary` y reemplaza a cáscara en las acciones primarias (`bg-primary`, `bg-cafe`). El
  color de texto encima lo decide `contrastText()` según WCAG. Solo ocupa superficie en dos
  lugares: la franja de cabecera de la tienda y la tarjeta del café en el directorio de la home.
  En el resto, solo en acciones.
- **Modo oscuro "tueste":** los mismos roles con luminancias invertidas.

## Tipografía
Una sola familia, **Archivo** variable, con ejes de peso y ancho:

| Uso | Clase | Ancho / peso |
|---|---|---|
| Carteles: nombre del café, categorías de la carta, títulos de hoja | `font-wide` | 118 / 800 |
| Títulos de sección del panel | `text-title`, `text-heading` | 100 / 700 |
| Nombres de producto en la carta | `font-semibold` | 100 / 600 |
| Lectura | base 16 px, interlineado 1,6, máximo ~65 caracteres por línea | — |
| Descripciones y frase del café (la voz de la barra) | `italic` | 100 / 400 |
| POS, tickets, comanda del checkout, listas densas | `font-condensed` o `data-density="compact"` | 78–88 |
| Precios y números de pedido | `numeric` (cifras tabulares) | — |

**El ancho marca la superficie:** expandido para los carteles, normal para leer la carta y
condensado para la comanda. Los nombres de producto no van expandidos: en 390 px, con foto y
precio en el mismo renglón, el ancho 118 los partía en dos líneas y dejaba sin lugar a los
puntos guía.

Sin monoespaciada para datos y sin mayúsculas sostenidas para etiquetas.

## Elemento firma: la curva de tueste
`RoastProgress` muestra el estado del pedido como un grano que se tuesta: verde, amarillo,
canela, city y full city.
- Es el **único** recurso decorativo del sistema; nada compite con él.
- Se usa en el tracking (vista cliente), en el detalle del pedido y en la franja del login.
- Los badges (`OrderStatusBadge`) usan colores semánticos y no la rampa, para que el POS lea el
  estado de un vistazo.

## Forma
- **Radios:** 8 px en controles, 14 px en superficies, 24 px en hojas inferiores. Nunca un único
  radio para todo.
- **Sombras:** casi nunca. El ticket es la excepción: es un objeto que se apoya en la barra.
- **Divisores:** hairlines `border-border`. La perforación (`perforation`) y el corte dentado
  (`ticket-edge`) quedan solo para tickets.

## Superficies
- **Tienda `/[slug]`:**
  - Mobile-first y una columna.
  - Portada: foto del local (`config.cover_url`) a todo el ancho y, debajo, el "cartel" del café
    como un toldo: franja a todo el ancho en su color, sin radio ni sombra, con el nombre
    expandido, la frase en itálica y, tras un filete, el estado (punto lleno = abierto, aro =
    cerrado; forma y no color, porque el fondo es el color de cada café) y la dirección como
    enlace al mapa. La franja cierra con la rampa de tueste completa (`roast-0..4`).
  - "La barra recomienda": carrusel con foto vertical y el precio en una etiqueta de loza sobre
    la foto. Es lo primero de cada categoría, por eso no se llama "Lo más pedido" (no hay datos
    de ventas detrás).
  - Carta impresa: nombre, puntos guía y precio; descripción en itálica; miniatura con el "+"
    redondo superpuesto. Los puntos usan `carta-dots` en la columna del nombre y `carta-name`
    en el nombre: si el nombre baja a dos renglones, los puntos siguen al último.
  - Las fotos llevan un filete interior (`ring-ink/10`) para que una taza blanca no se funda con
    la porcelana.
  - Cada categoría toma un grado de la curva de tueste (punto en el chip de navegación y
    barra bajo el título), así el elemento firma recorre la carta. El chip de la categoría que se
    está leyendo se invierte (tinta sobre porcelana) y lleva `aria-current`.
  - Cierre: ticket de barra cortado del rollo (`ticket-edge`, borde dentado), con horarios en
    condensado y dirección (`StoreTicket`).
  - El color del café se inyecta como regla de documento (`<CafeTheme>`, que emite
    `cafeThemeCss()`): así lo reciben también las hojas (vaul) y los avisos (sonner), que se
    montan en un portal. En modo oscuro, si la marca no llega a 3:1 contra el fondo,
    `darkBrand()` la aclara para las acciones (el "+", los botones); la franja del cartel usa
    `bg-band` y conserva siempre el color original. El seguimiento usa el mismo tema.
  - Fotos de prueba: `public/mock/photos/` (Wikimedia Commons, créditos en `CREDITS.md`).
  - Compra en tres toques o menos; el carrito va en una hoja inferior (vaul).
  - El color del tenant aparece solo en las acciones.
- **POS y recepción `/admin/[slug]`:**
  - `data-density="compact"` y objetivos táctiles de 48 px o más (`min-h-tap`).
  - Atajos visibles (`kbd`).
  - Un pedido nuevo entra con `animate-pulse-ring` y un sonido.
  - La barra lateral es tueste oscuro.
- **Tracking `/track/[token]`:** el mapa ocupa entre el 60 y el 70 % del alto; la hoja inferior
  lleva la curva de tueste en vista cliente y el tiempo estimado.
- **Driver:** una sola mano, botones de ancho completo y alto contraste para usar en la calle.

## Motion
- Solo como respuesta a una acción (abrir una hoja, confirmar) o para un pedido entrante.
- Nada de entradas fade-up por sección.
- Se respeta siempre `prefers-reduced-motion`.

## Copy
- Español rioplatense con voseo y frases cortas.
- Los botones dicen lo que hacen ("Confirmar pedido", "Asignar repartidor").
- Los errores dicen qué pasó y cómo seguir, sin pedir disculpas.
- Los vacíos invitan a actuar.
- Evitar `·` como separador de metadatos y `→` en botones.
