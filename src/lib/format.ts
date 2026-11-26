const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** Precio en pesos sin decimales: $ 3.600 */
export function formatARS(value: number): string {
  return ars.format(value);
}
