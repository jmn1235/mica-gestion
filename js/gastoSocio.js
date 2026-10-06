/* =========================================================
   Gastos pagados por un socio con su plata.
   El gasto se carga normal (cuenta como costo del proyecto) y la
   app genera sola un préstamo de ese socio al mismo bolsillo, por
   el mismo monto, fecha y dólar MEP. Los dos quedan vinculados:
   si se edita o se borra el gasto, el préstamo lo acompaña.
   La tasa es la de Ajustes → Impuestos e IA, y se congela en el
   préstamo al crearlo.
   ========================================================= */
import { S, guardar, mandarAPapelera, borrar } from "./db.js";
import * as M from "./modelo.js";

export const idPrestamo = gastoId => String(gastoId) + "__prest";
export const prestamoDe = gasto => (gasto && gasto.id ? S.movimientos.find(x => x.id === idPrestamo(gasto.id)) || null : null);
export const gastoDe = prestamo => (prestamo && prestamo.gastoVinculado ? S.movimientos.find(x => x.id === prestamo.gastoVinculado) || null : null);

/* Crea, actualiza o quita el préstamo de un gasto ya guardado (con id). */
export function sincronizarPrestamo(g, quien) {
  if (!g || !g.id) return null;
  const actual = prestamoDe(g);
  const corresponde = M.esCosto(g) && g.pagadoPor && M.admitePrestamoSocio(g.bolsillo);
  if (!corresponde) {
    if (actual) mandarAPapelera("movimientos", actual, quien);
    return null;
  }
  const mismoSocio = actual && actual.socio === g.pagadoPor;
  const d = Object.assign({}, actual || {}, {
    id: idPrestamo(g.id), tipo: "ingreso", clase: "prestamo", fecha: g.fecha, bolsillo: g.bolsillo, destino: "",
    cuenta: g.cuenta, montoARS: g.montoARS, montoUSD: g.montoUSD, cotizacion: g.cotizacion, cotizacionFuente: g.cotizacionFuente,
    socio: g.pagadoPor, tasa: mismoSocio && actual.tasa != null ? actual.tasa : M.tasaGastosSocios(),
    concepto: "Pagó un gasto: " + M.tituloMov(g).slice(0, 90), gastoVinculado: g.id,
    proveedor: "", imputacion: "", tipoCosto: "", subcategoria: "", fiscal: "", alicuota: 0, ivaARS: 0, comprobante: "", recuperable: false,
    notas: "Generado por la app a partir del gasto. Se edita o borra desde el gasto."
  });
  if (!actual) { d.creadoPor = g.creadoPor || quien || ""; d.creadoEl = new Date().toISOString(); }
  else d.modificadoPor = quien || "";
  if (g.aprobadoPor) { d.aprobadoPor = g.aprobadoPor; d.aprobadoEl = g.aprobadoEl; }
  return guardar("movimientos", d);
}

/* Borra un movimiento a la papelera junto con lo que tenga vinculado. */
export function borrarMovimiento(m, quien) {
  const p = M.esCosto(m) ? prestamoDe(m) : null;
  mandarAPapelera("movimientos", m, quien);
  if (p) mandarAPapelera("movimientos", p, quien);
}

/* Al restaurar un gasto de la papelera, vuelve también su préstamo (y se limpia la entrada vieja). */
export function alRestaurar(col, datos, quien) {
  if (col !== "movimientos" || !M.esCosto(datos) || !datos.pagadoPor) return;
  const g = S.movimientos.find(x => x.id === datos.id) || datos;
  sincronizarPrestamo(g, quien);
  S.papelera.filter(t => t.col === "movimientos" && t.docId === idPrestamo(datos.id)).forEach(t => borrar("papelera", t.id));
}
