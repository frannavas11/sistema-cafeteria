import type { CSSProperties } from "react";
import type { CafeConfig } from "../types";

/**
 * Valores fijos para calcular contraste. Mantener sincronizados con
 * `--ink-fixed` (#2a1a12) y el fondo de la barra lateral (`--sidebar`, tueste) de globals.css.
 */
const INK_HEX = "#2a1a12";
const SIDEBAR_HEX = "#2a1a12";
/** Fondo del modo oscuro (`--porcelana` dentro de `.dark` en globals.css). */
const DARK_BG_HEX = "#15100c";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Token de texto (claro u oscuro) con mejor contraste WCAG sobre el color de marca. */
export function contrastText(hex: string): "var(--paper-fixed)" | "var(--ink-fixed)" {
  const onPaper = contrastRatio(hex, "#ffffff");
  const onInk = contrastRatio(hex, INK_HEX);
  return onPaper >= onInk ? "var(--paper-fixed)" : "var(--ink-fixed)";
}

/** Mezcla un hex con blanco (`amount` 0–1) y devuelve hex. */
function lighten(hex: string, amount: number): string {
  const mixed = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * amount)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${mixed.join("")}`;
}

/**
 * Variante del color de marca para modo oscuro: si no llega a 3:1 contra el fondo
 * tueste (WCAG 1.4.11, componentes de interfaz), se aclara de a poco hasta cumplir.
 * Así el "+" y los botones de un café con marca oscura no se pierden de noche.
 */
export function darkBrand(hex: string): string {
  let out = hex;
  for (let step = 1; step <= 20 && contrastRatio(out, DARK_BG_HEX) < 3; step++) {
    out = lighten(hex, step * 0.05);
  }
  return out;
}

type ThemeVars = CSSProperties & Record<`--${string}`, string>;

/**
 * Variables CSS del tenant, aplicadas en el `style` del layout de la cafetería.
 * Se redefinen también `--primary` (las custom properties se resuelven donde se
 * declaran; cambiar sólo `--cafe-primary` en un descendiente no alcanzaría a shadcn).
 * El acento de la barra lateral oscura sólo toma la marca si cumple 3:1 (WCAG 1.4.11);
 * si no, queda en crema.
 */
export function cafeThemeStyle(config: Pick<CafeConfig, "brand_color">): ThemeVars {
  if (!config.brand_color) return {};
  const fg = contrastText(config.brand_color);
  const sidebarOk = contrastRatio(config.brand_color, SIDEBAR_HEX) >= 3;
  return {
    // La franja del cartel conserva siempre el color original de la marca.
    "--cafe-band": config.brand_color,
    "--cafe-band-fg": fg,
    "--cafe-primary": config.brand_color,
    "--cafe-primary-fg": fg,
    "--primary": config.brand_color,
    "--primary-foreground": fg,
    "--sidebar-primary": sidebarOk ? config.brand_color : "var(--crema)",
    "--sidebar-primary-foreground": sidebarOk ? fg : "var(--ink-fixed)",
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Las mismas variables como regla de documento. Hace falta en la tienda porque las hojas
 * (vaul) y los avisos (sonner) se montan en un portal dentro de `body`, fuera del contenedor
 * con `style`: sin esto, la ficha y el checkout pierden el color del café.
 * `:root:root` le gana a `.dark` (que también redefine `--cafe-primary-fg`), y
 * `:root:root.dark` aplica la variante clara de la marca en modo oscuro.
 * Sólo acepta hex: el resultado se inserta como CSS.
 */
export function cafeThemeCss(config: Pick<CafeConfig, "brand_color">): string {
  if (!config.brand_color || !HEX.test(config.brand_color)) return "";
  const decl = (vars: object) =>
    Object.entries(vars)
      .map(([k, v]) => `${k}:${String(v)}`)
      .join(";");

  const light = decl(cafeThemeStyle(config));
  const dark = darkBrand(config.brand_color);
  if (dark === config.brand_color) return `:root:root{${light}}`;

  const darkFg = contrastText(dark);
  const darkVars = decl({
    "--cafe-primary": dark,
    "--cafe-primary-fg": darkFg,
    "--primary": dark,
    "--primary-foreground": darkFg,
  });
  return `:root:root{${light}}:root:root.dark{${darkVars}}`;
}
