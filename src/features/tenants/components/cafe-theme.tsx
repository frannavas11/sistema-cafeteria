import { cafeThemeCss } from "../lib/theme";
import type { CafeConfig } from "../types";

/**
 * Inyecta el color de la cafetería (claro y oscuro) como regla de documento.
 * Alcanza también a los portales (hojas vaul, avisos sonner). Se monta y desmonta
 * con la página, así no queda pegado al navegar a otra ruta.
 */
export function CafeTheme({ config }: { config: Pick<CafeConfig, "brand_color"> }) {
  const css = cafeThemeCss(config);
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
}
