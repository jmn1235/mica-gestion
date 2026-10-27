/* =========================================================
   Ficha de préstamos de cada socio y devolución detallada.
   Una devolución es una sola operación (una transferencia) que
   puede cancelar préstamos de varios proyectos: se guarda un
   movimiento por proyecto, todos con el mismo número de
   operación, y cada uno dice qué préstamos cancela ("aplica").
   ========================================================= */
import { S, guardar, mandarAPapelera, nuevoId } from "./db.js";
import { TITULAR_MAGNA } from "./config.js";
import * as M from "./modelo.js";

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const hoy = () => new Date().toISOString().slice(0, 10);

/* Bolsillos que pueden recibir préstamos. */
const bolsillosDeudores = () => ["ESTRUCTURA", ...M.proyectosOrdenados().map(p => p.id)];

/* Fecha hasta la que corre el interés en un bolsillo: la pedida, o el cierre si el proyecto cerró antes. */
function corteDe(bol, fecha) {
  const p = M.proyecto(bol);
  return p && p.estado === "cerrado" && p.fechaCierre && p.fechaCierre < fecha ? p.fechaCierre : fecha;
}

/* Préstamos de un socio en todos los bolsillos, con su estado a una fecha. */
export function fichaSocio(socio, fecha = hoy()) {
  const prestamos = [], devs = [];
  bolsillosDeudores().forEach(b => {
    M.prestamosDe(b, corteDe(b, fecha)).filter(g => g.socio === socio).forEach(g => {
      g.tramos.forEach(t => prestamos.push({
        id: t.mov.id, bolsillo: b, proyecto: M.nombreBolsillo(b).replace(/^Proyecto · /, ""), quien: g.quien, mov: t.mov,
        fecha: t.fecha, capitalArs: t.capitalArs, capitalUsd: t.capital, tasa: t.tasa, devengado: t.devengado,
        saldoCap: Math.max(0, t.cap), saldoInt: Math.max(0, t.int), saldo: t.saldo, estado: t.estado, pagos: t.pagos,
        origen: t.mov.gastoVinculado ? "gasto" : t.mov.tipo === "pase" ? "magna" : "directo",
        detalle: detalleOrigen(t.mov)
      }));
      g.devoluciones.forEach(m => devs.push({ m, bolsillo: b }));
    });
  });
  prestamos.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.proyecto.localeCompare(b.proyecto));
  // Devoluciones agrupadas por operación (una transferencia puede cubrir varios proyectos).
  const ops = {};
  devs.forEach(({ m, bolsillo }) => {
    const k = m.operacion || m.id;
    const o = ops[k] = ops[k] || { id: k, fecha: m.fecha, comprobante: m.comprobante || "", movs: [], usd: 0, ars: 0, detallada: !!m.operacion };
    o.movs.push(m); o.usd += M.usd(m); o.ars += Number(m.montoARS) || 0;
    if (m.comprobante && !o.comprobante) o.comprobante = m.comprobante;
  });
  const devoluciones = Object.values(ops).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  devoluciones.forEach(o => {
    o.lineas = prestamos.flatMap(p => p.pagos.filter(x => o.movs.some(m => m.id === x.mov.id)).map(x => ({ prestamo: p, int: x.int, cap: x.cap })));
  });
  const sum = f => prestamos.reduce((a, p) => a + f(p), 0);
  return {
    socio, fecha, prestamos, devoluciones,
    prestadoUsd: sum(p => p.capitalUsd), prestadoArs: sum(p => p.capitalArs), interesUsd: sum(p => p.devengado),
    devueltoUsd: devoluciones.reduce((a, o) => a + o.usd, 0), saldoUsd: sum(p => p.saldo),
    saldoCapUsd: sum(p => p.saldoCap), saldoIntUsd: sum(p => p.saldoInt)
  };
}

function detalleOrigen(m) {
  if (m.gastoVinculado) {
    const g = S.movimientos.find(x => x.id === m.gastoVinculado);
    return g ? "Pagó un gasto: " + M.tituloMov(g) : "Pagó un gasto";
  }
  return m.concepto || (m.tipo === "pase" ? "Préstamo desde Magna" : "Préstamo");
}

/* Reparte el monto de cada préstamo elegido entre interés y capital (primero el interés). */
export function lineasDevolucion(ficha, elegidos) {
  return elegidos.map(e => {
    const p = ficha.prestamos.find(x => x.id === e.id);
    if (!p) return null;
    const usd = Math.min(Number(e.usd) || 0, p.saldo);
    if (!(usd > 0.005)) return null;
    const int = Math.min(usd, p.saldoInt);
    return { p, usd, int, cap: usd - int, total: usd >= p.saldo - 0.01 };
  }).filter(Boolean);
}

/* Registra la devolución: un movimiento por bolsillo y prestamista, todos con el mismo número de operación. */
export function registrarDevolucion({ socio, fecha, mep, cotizacionFuente, cuenta, comprobante, notas, lineas, quien }) {
  const operacion = nuevoId("dv");
  const grupos = {};
  lineas.forEach(l => {
    const k = l.p.bolsillo + "|" + l.p.quien;
    (grupos[k] = grupos[k] || { bolsillo: l.p.bolsillo, quien: l.p.quien, lineas: [] }).lineas.push(l);
  });
  const ahora = new Date().toISOString();
  const movs = Object.values(grupos).map(g => {
    const usd = g.lineas.reduce((a, l) => a + l.usd, 0);
    const deMagna = g.quien === "bol:MAGNA";
    const n = g.lineas.length;
    return guardar("movimientos", {
      tipo: deMagna ? "pase" : "egreso", clase: "devolucion", fecha, bolsillo: g.bolsillo, destino: deMagna ? "MAGNA" : "",
      cuenta: cuenta || (S.cuentas[0] || {}).id || "c_magna", socio: deMagna ? TITULAR_MAGNA : socio,
      montoARS: r2(usd * mep), cotizacion: mep, cotizacionFuente: cotizacionFuente || "manual", montoUSD: r2(usd),
      concepto: `Devolución de ${n} préstamo${n > 1 ? "s" : ""} a ${M.socioNombre(socio)}`,
      comprobante: comprobante || "", notas: notas || "",
      operacion, aplica: g.lineas.map(l => ({ p: l.p.id, usd: Math.round(l.usd * 1e6) / 1e6 })),
      detalle: g.lineas.map(l => ({ p: l.p.id, fecha: l.p.fecha, int: r2(l.int), cap: r2(l.cap), usd: r2(l.usd) })),
      proveedor: "", imputacion: "", tipoCosto: "", fiscal: "", ivaARS: 0, tasa: null,
      creadoPor: quien || "", creadoEl: ahora
    });
  });
  return { operacion, movs };
}

/* Anula una devolución entera (todos sus movimientos van a la papelera). */
export function anularDevolucion(opId, quien) {
  S.movimientos.filter(m => m.operacion === opId || m.id === opId).forEach(m => mandarAPapelera("movimientos", m, quien));
}
