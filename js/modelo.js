/* =========================================================
   Lógica del negocio: bolsillos, clases de movimiento,
   valuación en dólares y resúmenes por proyecto, MICA y Magna.
   Todo se calcula desde los movimientos: nada se guarda dos veces.
   ========================================================= */
import { S } from "./db.js";
import { SOCIOS, TITULAR_MAGNA } from "./config.js";

/* ---------- bolsillos ---------- */
export const BOLS_FIJOS = [
  { id: "MAGNA", nombre: "Magna · Julio", grupo: "Magna" },
  { id: "RESERVA", nombre: "Magna · Reserva fiscal", grupo: "Magna" },
  { id: "ESTRUCTURA", nombre: "MICA · Estructura", grupo: "MICA" }
];
export const ESTADOS_PROYECTO = [
  { id: "cotizacion", nombre: "En cotización" },
  { id: "activo", nombre: "En ejecución" },
  { id: "cerrado", nombre: "Cerrado" }
];

export function proyectosOrdenados() {
  const orden = { activo: 0, cotizacion: 1, cerrado: 2 };
  return S.proyectos.slice().sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9) || String(a.nombre).localeCompare(b.nombre));
}
export const proyecto = id => S.proyectos.find(p => p.id === id) || null;

export function bolsillos() {
  return [...BOLS_FIJOS, ...proyectosOrdenados().map(p => ({ id: p.id, nombre: "Proyecto · " + p.nombre, grupo: "Proyectos", proyecto: true, estado: p.estado }))];
}
export function nombreBolsillo(id) {
  const f = BOLS_FIJOS.find(b => b.id === id);
  if (f) return f.nombre;
  const p = proyecto(id);
  return p ? "Proyecto · " + p.nombre : (id || "—");
}
export const esBolsilloProyecto = id => !!proyecto(id);

/* ---------- clases de movimiento ---------- */
export const CLASES = {
  egreso: [
    { id: "gasto", nombre: "Gasto" },
    { id: "devolucion", nombre: "Devolución de préstamo a un socio" },
    { id: "devaporte", nombre: "Devolución de aporte a un socio" },
    { id: "distribucion", nombre: "Distribución a un socio" },
    { id: "honorario", nombre: "Pago de honorarios a un socio" },
    { id: "retiro", nombre: "Retiro del titular de Magna" }
  ],
  ingreso: [
    { id: "cobro", nombre: "Cobro de factura" },
    { id: "anticipo", nombre: "Anticipo del cliente" },
    { id: "aporte", nombre: "Aporte de un socio" },
    { id: "prestamo", nombre: "Préstamo de un socio" },
    { id: "inicial", nombre: "Saldo inicial" },
    { id: "otro", nombre: "Otro ingreso" }
  ],
  pase: [
    { id: "prestamo", nombre: "Préstamo" },
    { id: "devolucion", nombre: "Devolución de préstamo" },
    { id: "aporte", nombre: "Aporte de un socio" },
    { id: "reserva", nombre: "Reserva de impuestos" },
    { id: "reintegro", nombre: "Reintegro a Julio de gastos de Magna" },
    { id: "distribucion", nombre: "Distribución de resultado" },
    { id: "honorario", nombre: "Pago de honorarios a Julio" },
    { id: "devaporte", nombre: "Devolución de aporte" },
    { id: "estructura", nombre: "Parte de estructura de MICA" },
    { id: "otro", nombre: "Otro pase" }
  ]
};
export const nombreClase = (tipo, clase) => ((CLASES[tipo] || []).find(c => c.id === clase) || {}).nombre || clase || "";
export const TIPOS = { egreso: "Gasto", ingreso: "Ingreso", pase: "Pase entre bolsillos" };

/* Qué clases piden socio y tasa. */
export const pideSocio = (tipo, clase) =>
  (tipo === "ingreso" && ["aporte", "prestamo"].includes(clase)) ||
  (tipo === "egreso" && ["devolucion", "devaporte", "distribucion", "honorario"].includes(clase)) ||
  (tipo === "pase" && ["aporte", "prestamo", "devolucion", "devaporte", "distribucion", "honorario"].includes(clase));
export const pideTasa = (tipo, clase) => clase === "prestamo" && (tipo === "ingreso" || tipo === "pase");
export const llevaIVA = (tipo, clase) => (tipo === "egreso" && clase === "gasto") || (tipo === "ingreso" && ["cobro", "anticipo"].includes(clase));

/* Categorías de costo de obra (fijas: alimentan la base de costos) y sus subcategorías (editables en Ajustes). */
export const TIPOS_COSTO = ["Materiales", "Mano de obra", "Equipos", "Subcontratos", "Indirectos"];
export const nombreCategoria = t => (t === "Indirectos" ? "Indirectos y gastos generales" : t || "");
export const SUBCATEGORIAS_DEF = {
  "Materiales": ["Materiales de obra", "Repuestos y accesorios", "EPP y ropa de trabajo", "Herramientas y consumibles", "Otros materiales"],
  "Mano de obra": ["Quincenas", "Sueldo mensual", "Honorarios (sin relación de dependencia)", "Aporte gremial", "Formulario 931 (cargas sociales)", "Otros de mano de obra"],
  "Equipos": ["Alquiler de equipos", "Combustible y lubricantes", "Mantenimiento y reparaciones", "Fletes de equipos", "Otros de equipos"],
  "Subcontratos": ["Subcontratos de obra", "Servicios técnicos y profesionales", "Ensayos y laboratorio", "Otros subcontratos"],
  "Indirectos": ["Combustible de movilidad", "Alojamiento", "Comidas y viáticos", "Traslados y pasajes", "Campamento y servicios", "Seguros", "Comunicaciones", "Otros gastos generales"]
};
export function subcategoriasDe(tipo) {
  const g = (S.config.general || {}).subcategorias || {};
  return Array.isArray(g[tipo]) ? g[tipo] : (SUBCATEGORIAS_DEF[tipo] || []);
}
export const FISCAL = [
  { id: "A", nombre: "Factura A", iva: true },
  { id: "B", nombre: "B o C", iva: false },
  { id: "S", nombre: "Sueldo o tasa", iva: false },
  { id: "X", nombre: "Sin factura", iva: false }
];
export const ALICUOTAS = [21, 10.5, 27, 0];
/* "varias": la factura tiene renglones con distintas alícuotas; el IVA total se carga a mano. */
export const nombreAlicuota = a => (a === "varias" ? "Varias" : a == null || a === "" ? "" : String(a).replace(".", ",") + "%");
/* Percepciones que vienen en las facturas de compra: son pagos a cuenta de impuestos de Magna, no costo. */
export const PERCEPCIONES = [
  { k: "percIIBB", nombre: "Percepción de IIBB" },
  { k: "percIVA", nombre: "Percepción de IVA" },
  { k: "percGan", nombre: "Percepción de Ganancias" }
];
export const percepciones = m => (Number(m.percIIBB) || 0) + (Number(m.percIVA) || 0) + (Number(m.percGan) || 0);
/* Tasa anual en dólares de los préstamos que nacen de gastos pagados por un socio. */
export const tasaGastosSocios = () => Number((S.config.general || {}).tasaGastosSocios) || 0;
/* Bolsillos donde un gasto pagado por un socio puede quedar como préstamo suyo. */
export const admitePrestamoSocio = bol => bol === "ESTRUCTURA" || esBolsilloProyecto(bol);

export const socioNombre = id => (SOCIOS.find(s => s.id === id) || {}).nombre || id || "";

/* Categorías para gastos que no son de una obra. */
export function categoriasDe(bolsillo) {
  const g = S.config.general || {};
  if (bolsillo === "ESTRUCTURA") return g.categoriasEstructura || [];
  if (bolsillo === "MAGNA") return g.categoriasMagna || [];
  if (bolsillo === "RESERVA") return g.categoriasReserva || [];
  return [];
}

/* ---------- imputación ---------- */
export function rubrosDe(p) {
  const r = [];
  (p && p.items || []).forEach(it => { if (it.rubro && !r.includes(it.rubro)) r.push(it.rubro); });
  return r;
}
export function nombreImputacion(m, largo = 999) {
  const k = m.imputacion || "";
  if (!k) return "";
  if (k === "g") return "General de obra";
  if (k.startsWith("c:")) return k.slice(2);
  if (k.startsWith("r:")) return "Rubro " + k.slice(2);
  if (k.startsWith("i:")) {
    const p = proyecto(m.bolsillo);
    const it = p && (p.items || []).find(x => x.id === k.slice(2));
    if (!it) return "Ítem borrado";
    const d = it.descripcion.length > largo ? it.descripcion.slice(0, largo - 1).trimEnd() + "…" : it.descripcion;
    return `Ítem ${it.numero} · ${d}`;
  }
  return k;
}

/* ---------- valuación ---------- */
export const usd = m => (m.cotizacion > 0 ? (Number(m.montoARS) || 0) / m.cotizacion : 0);
/* Neto de IVA. En los cobros se suman las retenciones sufridas: no entran al banco, pero son parte de lo facturado. */
/* En las compras se descuentan también las percepciones: van dentro del total de la factura pero no son costo. */
export const netoArs = m => (Number(m.montoARS) || 0) + (Number(m.retencionesARS) || 0) - (Number(m.ivaARS) || 0) - percepciones(m);
export const netoUsd = m => (m.cotizacion > 0 ? netoArs(m) / m.cotizacion : 0);
/* Monto neto de IVA en la moneda del contrato (pesos nominales o dólares MEP). */
export const netoEn = (m, moneda) => (moneda === "ARS" ? netoArs(m) : netoUsd(m));
export const esCosto = m => m.tipo === "egreso" && m.clase === "gasto";
export const esVenta = m => m.tipo === "ingreso" && (m.clase === "cobro" || m.clase === "anticipo");
export const mesDe = m => String(m.fecha || "").slice(0, 7);

/* Efecto de un movimiento sobre un conjunto de bolsillos: +1 entra, −1 sale, 0 no lo toca o es interno. */
export function signo(m, conjunto) {
  const en = id => conjunto.has(id);
  if (m.tipo === "ingreso") return en(m.bolsillo) ? 1 : 0;
  if (m.tipo === "egreso") return en(m.bolsillo) ? -1 : 0;
  if (m.tipo === "pase") return (en(m.destino) ? 1 : 0) - (en(m.bolsillo) ? 1 : 0);
  return 0;
}
export function toca(m, conjunto) {
  return conjunto.has(m.bolsillo) || (m.tipo === "pase" && conjunto.has(m.destino));
}

/* ---------- contexto elegido arriba ---------- */
export function conjuntoDe(ctx) {
  if (ctx.tipo === "proyecto") return new Set([ctx.id]);
  if (ctx.tipo === "mica") return new Set(["ESTRUCTURA", ...S.proyectos.map(p => p.id)]);
  return new Set(bolsillos().map(b => b.id));
}
export function movimientosDe(ctx) {
  const c = conjuntoDe(ctx);
  return S.movimientos.filter(m => toca(m, c)).sort(ordenMov);
}
export const ordenMov = (a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.creadoEl || b.modificado || "").localeCompare(String(a.creadoEl || a.modificado || ""));

/* ---------- saldos ---------- */
export function saldoDe(conjunto, hasta) {
  let ars = 0, us = 0;
  S.movimientos.forEach(m => {
    if (hasta && m.fecha > hasta) return;
    const s = signo(m, conjunto);
    if (s) { ars += s * (Number(m.montoARS) || 0); us += s * usd(m); }
  });
  return { ars, usd: us };
}
export const saldoBolsillo = id => saldoDe(new Set([id]));
export function saldoCuenta(cuentaId) {
  let ars = 0;
  S.movimientos.forEach(m => {
    if ((m.cuenta || "c_magna") !== cuentaId) return;
    if (m.tipo === "ingreso") ars += Number(m.montoARS) || 0;
    if (m.tipo === "egreso") ars -= Number(m.montoARS) || 0;
  });
  return ars;
}

/* ---------- préstamos con interés ---------- */
const dia = 86400000;
export const hoyISO = () => new Date().toISOString().slice(0, 10);
export const diasEntre = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / dia)) : 0);
export const tasaDiaria = tea => (Number(tea) > 0 ? Math.pow(1 + Number(tea) / 100, 1 / 365) - 1 : 0);
/* Fecha hasta la que se devengan intereses: hoy, o el cierre si el proyecto está cerrado. */
export const fechaCorte = p => (p && p.estado === "cerrado" && p.fechaCierre ? p.fechaCierre : hoyISO());

/* Quién prestó, según el movimiento. Magna presta por cuenta de Julio. */
export function prestamistaDe(k) {
  if (k.startsWith("socio:")) return { nombre: socioNombre(k.slice(6)), socio: k.slice(6) };
  if (k === "bol:MAGNA") return { nombre: "Magna · " + socioNombre(TITULAR_MAGNA), socio: TITULAR_MAGNA };
  if (k.startsWith("bol:")) return { nombre: nombreBolsillo(k.slice(4)), socio: "", bolsillo: k.slice(4) };
  return { nombre: "Sin indicar", socio: "" };
}

/* Préstamos que recibió un bolsillo, por prestamista, con interés compuesto diario en dólares.
   Cada préstamo tiene su propia tasa efectiva anual. Las devoluciones pagan primero el interés
   y después el capital, empezando por el préstamo más viejo. */
export function prestamosDe(bolsilloId, hasta) {
  const corte = hasta || fechaCorte(proyecto(bolsilloId));
  const grupos = {};
  const grupo = k => (grupos[k] = grupos[k] || { quien: k, tramos: [], devoluciones: [] });
  S.movimientos.forEach(m => {
    if (m.fecha > corte) return;
    if (m.tipo === "ingreso" && m.clase === "prestamo" && m.bolsillo === bolsilloId) grupo(m.socio ? "socio:" + m.socio : "otro").tramos.push(m);
    if (m.tipo === "pase" && m.clase === "prestamo" && m.destino === bolsilloId) grupo("bol:" + m.bolsillo).tramos.push(m);
    if (m.tipo === "egreso" && m.clase === "devolucion" && m.bolsillo === bolsilloId) grupo(m.socio ? "socio:" + m.socio : "otro").devoluciones.push(m);
    if (m.tipo === "pase" && m.clase === "devolucion" && m.bolsillo === bolsilloId) grupo("bol:" + m.destino).devoluciones.push(m);
  });
  return Object.values(grupos).map(g => {
    const tramos = g.tramos.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m => ({
      mov: m, fecha: m.fecha, tasa: Number(m.tasa) || 0, td: tasaDiaria(m.tasa), capital: usd(m), capitalArs: Number(m.montoARS) || 0,
      cap: usd(m), int: 0, devengado: 0, activo: false
    }));
    const eventos = tramos.map(t => ({ fecha: t.fecha, tramo: t })).concat(g.devoluciones.map(m => ({ fecha: m.fecha, pago: usd(m), mov: m })))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tramo ? -1 : 1));
    let ultima = eventos.length ? eventos[0].fecha : corte, aFavor = 0;
    const devengar = hastaF => {
      const d = diasEntre(ultima, hastaF);
      if (d > 0) tramos.forEach(t => {
        if (!t.activo || !t.td || t.cap + t.int <= 0) return;
        const g = (t.cap + t.int) * (Math.pow(1 + t.td, d) - 1);
        t.int += g; t.devengado += g;
      });
      if (hastaF > ultima) ultima = hastaF;
    };
    eventos.forEach(e => {
      devengar(e.fecha);
      if (e.tramo) { e.tramo.activo = true; return; }
      let resto = e.pago;
      tramos.forEach(t => {
        if (!t.activo || resto <= 0) return;
        const pi = Math.min(resto, t.int); t.int -= pi; resto -= pi;
        const pc = Math.min(resto, t.cap); t.cap -= pc; resto -= pc;
      });
      aFavor += resto;
    });
    devengar(corte);
    const sum = f => tramos.reduce((a, t) => a + f(t), 0);
    const pr = prestamistaDe(g.quien);
    const devueltoUsd = g.devoluciones.reduce((a, m) => a + usd(m), 0);
    return {
      quien: g.quien, nombre: pr.nombre, socio: pr.socio, bolsillo: pr.bolsillo || "", tramos, devoluciones: g.devoluciones,
      recibido: sum(t => t.capitalArs), devuelto: g.devoluciones.reduce((a, m) => a + (Number(m.montoARS) || 0), 0),
      recibidoUsd: sum(t => t.capital), devueltoUsd, interesUsd: sum(t => t.devengado),
      saldoCapitalUsd: sum(t => t.cap), saldoInteresUsd: sum(t => t.int),
      saldoUsd: sum(t => t.cap + t.int) - aFavor, sinTasa: tramos.some(t => !t.tasa),
      saldo: sum(t => t.capitalArs) - g.devoluciones.reduce((a, m) => a + (Number(m.montoARS) || 0), 0)
    };
  }).sort((a, b) => b.saldoUsd - a.saldoUsd);
}
/* Intereses que ganó un bolsillo por prestar a otros (proyectos o Estructura). */
export function interesesGanadosDe(bolsilloId) {
  let total = 0;
  ["ESTRUCTURA", ...S.proyectos.map(p => p.id)].forEach(id => {
    if (id === bolsilloId) return;
    prestamosDe(id).forEach(x => { if (x.quien === "bol:" + bolsilloId) total += x.interesUsd; });
  });
  return total;
}

/* Aportes de capital a un bolsillo, por socio (en dólares del día de cada aporte). */
export function aportesDe(bolsilloId) {
  const por = {};
  S.movimientos.forEach(m => {
    const entra = (m.tipo === "ingreso" && m.clase === "aporte" && m.bolsillo === bolsilloId) || (m.tipo === "pase" && m.clase === "aporte" && m.destino === bolsilloId);
    if (!entra) return;
    const s = m.socio || (m.tipo === "pase" && m.bolsillo === "MAGNA" ? TITULAR_MAGNA : "");
    por[s] = por[s] || { ars: 0, usd: 0, movs: [] };
    por[s].ars += Number(m.montoARS) || 0; por[s].usd += usd(m); por[s].movs.push(m);
  });
  return por;
}

/* Lo que salió de un bolsillo hacia un socio: distribuciones, honorarios y devoluciones de aportes.
   Un aporte que sale de un proyecto hacia otro bolsillo es resultado reinvertido por ese socio:
   cuenta como distribuido en el proyecto de origen y como aporte en el de destino. */
export function pagosASocios(bolsilloId) {
  const por = {};
  const sumar = (socio, clave, m) => {
    if (!socio) return;
    por[socio] = por[socio] || { distribuido: 0, honorarios: 0, aportesDevueltos: 0, reinvertido: 0 };
    por[socio][clave] += usd(m);
  };
  S.movimientos.forEach(m => {
    if (m.bolsillo !== bolsilloId) return;
    const socio = m.socio || (m.tipo === "pase" && m.destino === "MAGNA" ? TITULAR_MAGNA : "");
    const sale = m.tipo === "egreso" || m.tipo === "pase";
    if (sale && m.clase === "distribucion") sumar(socio, "distribuido", m);
    if (sale && m.clase === "honorario") sumar(socio, "honorarios", m);
    if (sale && m.clase === "devaporte") sumar(socio, "aportesDevueltos", m);
    if (m.tipo === "pase" && m.clase === "aporte") { sumar(socio, "distribuido", m); sumar(socio, "reinvertido", m); }
  });
  return por;
}

/* Gastos de Magna que Julio pagó con su plata y MICA le tiene que reintegrar. */
export function reintegroPendiente() {
  let gastado = 0, gastadoUsd = 0, devuelto = 0, devueltoUsd = 0;
  S.movimientos.forEach(m => {
    if (m.tipo === "egreso" && m.clase === "gasto" && m.bolsillo === "MAGNA" && m.recuperable) { gastado += Number(m.montoARS) || 0; gastadoUsd += usd(m); }
    if (m.tipo === "pase" && m.clase === "reintegro" && m.destino === "MAGNA") { devuelto += Number(m.montoARS) || 0; devueltoUsd += usd(m); }
  });
  return { gastado, gastadoUsd, devuelto, devueltoUsd, ars: gastado - devuelto, usd: gastadoUsd - devueltoUsd };
}

/* ---------- honorarios de socios ---------- */
export const MODOS_HONORARIO = [
  { id: "mensual", nombre: "Monto fijo por mes", pct: false },
  { id: "unico", nombre: "Monto único", pct: false },
  { id: "mo", nombre: "% de la mano de obra del mes", pct: true },
  { id: "costos", nombre: "% de los costos del mes", pct: true },
  { id: "cobrado", nombre: "% de lo cobrado en el mes", pct: true }
];
const mesAnterior = ym => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };

/* Base de un mes para los honorarios por porcentaje, en dólares MEP netos de IVA. */
function baseHonorario(pid, modo, mes) {
  let b = 0;
  S.movimientos.forEach(m => {
    if (m.bolsillo !== pid || mesDe(m) !== mes) return;
    if (modo === "mo" && esCosto(m) && m.tipoCosto === "Mano de obra") b += netoUsd(m);
    if (modo === "costos" && esCosto(m)) b += netoUsd(m);
    if (modo === "cobrado" && esVenta(m)) b += netoUsd(m);
  });
  return b;
}

/* Honorarios reconocidos: no se pagan durante la obra; son costo del proyecto y crédito del socio.
   Se computan los meses cerrados (hasta el mes anterior al actual), o hasta el cierre del proyecto. */
export function honorariosDe(p) {
  const tope = p.estado === "cerrado" && p.fechaCierre ? p.fechaCierre.slice(0, 7) : mesAnterior(hoyISO().slice(0, 7));
  const porAcuerdo = (p.honorarios || []).map(a => {
    const modo = MODOS_HONORARIO.find(x => x.id === a.modo) || MODOS_HONORARIO[0];
    const fin = a.hasta && a.hasta < tope ? a.hasta : tope;
    let meses = [];
    if (a.desde) meses = modo.id === "unico" ? (a.desde <= tope ? [a.desde] : []) : mesesEntre(a.desde, fin);
    const detalle = meses.map(mes => {
      const base = modo.pct ? baseHonorario(p.id, modo.id, mes) : null;
      const monto = modo.pct ? base * (Number(a.porcentaje) || 0) / 100 : (Number(a.monto) || 0);
      return { mes, base, monto };
    }).filter(d => d.monto > 0 || !modo.pct);
    return { acuerdo: a, modo, detalle, total: detalle.reduce((s, d) => s + d.monto, 0) };
  });
  const porSocio = {}, porMes = {};
  porAcuerdo.forEach(x => {
    porSocio[x.acuerdo.socio] = (porSocio[x.acuerdo.socio] || 0) + x.total;
    x.detalle.forEach(d => { porMes[d.mes] = (porMes[d.mes] || 0) + d.monto; });
  });
  return { porAcuerdo, porSocio, porMes, total: porAcuerdo.reduce((s, x) => s + x.total, 0), tope };
}

/* ---------- impuestos de Magna asignados a cada proyecto ---------- */
export const IMPUESTOS_DEF = { iibb: 0, ganancias: 35, chequeCredito: 0.6, chequeDebito: 0.6, chequeComputable: 33 };
export function parametrosImpuestos() {
  return Object.assign({}, IMPUESTOS_DEF, (S.config.general || {}).impuestos || {});
}
const esBanco = m => { const c = S.cuentas.find(x => x.id === (m.cuenta || "c_magna")); return !c || c.tipo !== "efectivo"; };

/* IIBB, impuesto al cheque y Ganancias que genera un proyecto. Se calculan sobre lo cobrado
   (igual que el resultado), movimiento por movimiento, con la cotización de cada uno.
   Las retenciones sufridas son pagos a cuenta: bajan lo que queda por pagar, no el costo. */
export function impuestosDe(p, r) {
  const t = parametrosImpuestos();
  const x = { param: t, iibbArs: 0, iibbUsd: 0, retIibbArs: 0, retIibbUsd: 0, percIibbArs: 0, percGanArs: 0, percGanUsd: 0, percIvaArs: 0, chequeArs: 0, chequeUsd: 0, retGanArs: 0, retGanUsd: 0, retIvaArs: 0, retOtrasArs: 0, deduciblesUsd: 0 };
  S.movimientos.forEach(m => {
    if (m.bolsillo !== p.id) return;
    if (esVenta(m)) {
      x.iibbArs += netoArs(m) * t.iibb / 100;
      x.iibbUsd += netoUsd(m) * t.iibb / 100;
      x.retIibbArs += Number(m.retIIBB) || 0; x.retGanArs += Number(m.retGan) || 0;
      x.retIvaArs += Number(m.retIVA) || 0; x.retOtrasArs += Number(m.retOtras) || 0;
      if (m.cotizacion > 0) { x.retIibbUsd += (Number(m.retIIBB) || 0) / m.cotizacion; x.retGanUsd += (Number(m.retGan) || 0) / m.cotizacion; }
    }
    // Percepciones sufridas en las compras: pagos a cuenta, igual que las retenciones de los cobros.
    if (esCosto(m)) {
      const pi = Number(m.percIIBB) || 0, pg = Number(m.percGan) || 0;
      x.percIibbArs += pi; x.percGanArs += pg; x.percIvaArs += Number(m.percIVA) || 0;
      if (m.cotizacion > 0) x.percGanUsd += pg / m.cotizacion;
    }
    // Un gasto pagado por un socio y su préstamo no pasan por el banco: no generan impuesto al cheque.
    if ((m.tipo === "ingreso" || m.tipo === "egreso") && esBanco(m) && !m.pagadoPor && !m.gastoVinculado) {
      const pct = (m.tipo === "ingreso" ? t.chequeCredito : t.chequeDebito) / 100;
      x.chequeArs += (Number(m.montoARS) || 0) * pct;
      x.chequeUsd += usd(m) * pct;
    }
    if (esCosto(m) && m.fiscal !== "X") x.deduciblesUsd += netoUsd(m);
  });
  x.chequeComputableUsd = x.chequeUsd * t.chequeComputable / 100;
  x.chequeComputableArs = x.chequeArs * t.chequeComputable / 100;
  // Resultado impositivo: no se deducen los gastos sin factura ni los honorarios e intereses entre socios.
  x.baseGananciasUsd = r.ventasUsd - x.deduciblesUsd - x.iibbUsd - (x.chequeUsd - x.chequeComputableUsd);
  x.gananciasUsd = Math.max(0, x.baseGananciasUsd * t.ganancias / 100);
  x.gananciasCostoUsd = Math.max(0, x.gananciasUsd - x.chequeComputableUsd);
  x.gananciasAPagarUsd = x.gananciasUsd - x.retGanUsd - x.percGanUsd - x.chequeComputableUsd;
  x.iibbAPagarArs = x.iibbArs - x.retIibbArs - x.percIibbArs;
  x.extraInformalUsd = r.sinFacturaUsd * t.ganancias / 100;
  return x;
}

/* ---------- resumen de un proyecto ---------- */
export function subtotalItem(it) { return (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0); }
export function montoContrato(p) {
  const items = (p.items || []).reduce((a, it) => a + subtotalItem(it), 0);
  return Number(p.montoContrato) || items;
}

/* opciones.corte: fecha hasta la que se devengan los intereses (para simular un cierre). */
export function resumenProyecto(p, opciones = {}) {
  const conj = new Set([p.id]);
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const movs = S.movimientos.filter(m => toca(m, conj));
  const r = {
    proyecto: p, moneda: mon, contrato: montoContrato(p),
    ventasUsd: 0, ventasMon: 0, costosUsd: 0, costosMon: 0, ivaCompras: 0, ivaVentas: 0,
    sinFacturaUsd: 0, nCostos: 0, porImputacion: {}, porImputacionMon: {}, porTipo: {}, porSubcat: {}, porMes: {},
    saldo: saldoDe(conj), prestamos: prestamosDe(p.id, opciones.corte), aportes: aportesDe(p.id), movs
  };
  movs.forEach(m => {
    const mes = mesDe(m);
    r.porMes[mes] = r.porMes[mes] || { ventas: 0, costos: 0 };
    if (esVenta(m) && m.bolsillo === p.id) {
      const v = netoUsd(m);
      r.ventasUsd += v; r.ventasMon += netoEn(m, mon); r.ivaVentas += Number(m.ivaARS) || 0;
      r.porMes[mes].ventas += v;
    }
    if (esCosto(m) && m.bolsillo === p.id) {
      const c = netoUsd(m);
      r.costosUsd += c; r.costosMon += netoEn(m, mon); r.nCostos++;
      r.ivaCompras += Number(m.ivaARS) || 0;
      if (m.fiscal === "X") r.sinFacturaUsd += c;
      const k = m.imputacion || "g";
      r.porImputacion[k] = (r.porImputacion[k] || 0) + c;
      r.porImputacionMon[k] = (r.porImputacionMon[k] || 0) + netoEn(m, mon);
      const t = m.tipoCosto || "Sin tipo";
      r.porTipo[t] = (r.porTipo[t] || 0) + c;
      const sc = t + "|" + (m.subcategoria || "Sin subcategoría");
      r.porSubcat[sc] = (r.porSubcat[sc] || 0) + c;
      r.porMes[mes].costos += c;
    }
  });
  r.honorarios = honorariosDe(p);
  r.honorariosUsd = r.honorarios.total;
  r.interesesUsd = r.prestamos.reduce((a, x) => a + x.interesUsd, 0);
  r.interesesGanadosUsd = interesesGanadosDe(p.id);
  r.resultadoOperativoUsd = r.ventasUsd - r.costosUsd;
  r.resultadoUsd = r.resultadoOperativoUsd - r.honorariosUsd - r.interesesUsd + r.interesesGanadosUsd;
  r.margen = r.ventasUsd > 0 ? r.resultadoUsd / r.ventasUsd : null;
  r.impuestos = impuestosDe(p, r);
  r.resultadoDespuesIIBBUsd = r.resultadoUsd - r.impuestos.iibbUsd - r.impuestos.chequeUsd;
  r.resultadoNetoUsd = r.resultadoDespuesIIBBUsd - r.impuestos.gananciasCostoUsd;
  // Al cerrar el proyecto se fija la diferencia de cambio de la liquidación (tenencia de pesos y redondeos).
  r.difCambioCierreUsd = p.estado === "cerrado" && p.cierre ? Number(p.cierre.difCambioUsd) || 0 : 0;
  r.resultadoFinalUsd = r.resultadoNetoUsd + r.difCambioCierreUsd;
  r.cobradoPct = r.contrato > 0 ? r.ventasMon / r.contrato : null;
  r.deudaUsd = r.prestamos.reduce((a, x) => a + x.saldoUsd, 0);
  return r;
}

/* Meses corridos entre dos AAAA-MM, inclusive. */
export function mesesEntre(desde, hasta) {
  const out = [];
  if (!desde || !hasta || desde > hasta) return out;
  let [y, m] = desde.split("-").map(Number);
  const [yh, mh] = hasta.split("-").map(Number);
  while (y < yh || (y === yh && m <= mh)) {
    out.push(y + "-" + String(m).padStart(2, "0"));
    m++; if (m > 12) { m = 1; y++; }
    if (out.length > 240) break;
  }
  return out;
}

/* Cuenta de cada socio en un proyecto: lo que se le debe y su parte del resultado. */
export function cuentaSociosProyecto(p, r = resumenProyecto(p), asignado = 0) {
  const pagos = pagosASocios(p.id);
  const filas = SOCIOS.map(s => {
    const pct = (Number((p.participacion || {})[s.id]) || 0) / 100;
    const pg = pagos[s.id] || {};
    const aportes = ((r.aportes || {})[s.id] || { usd: 0 }).usd - (pg.aportesDevueltos || 0);
    const prestamos = r.prestamos.filter(x => x.socio === s.id).reduce((a, x) => a + x.saldoUsd, 0);
    const honorarios = (r.honorarios.porSocio[s.id] || 0) - (pg.honorarios || 0);
    // El neto de impuestos es lo que se puede repartir. La estructura asignada baja Ganancias, por eso se toma neta.
    const tasaGan = (r.impuestos ? r.impuestos.param.ganancias : 0) / 100;
    const neto = (r.resultadoNetoUsd ?? r.resultadoUsd) + (r.difCambioCierreUsd || 0);
    const resultado = (neto - asignado * (1 - tasaGan)) * pct;
    const distribuido = pg.distribuido || 0;
    return { ...s, pct, aportes, prestamos, honorarios, resultado, distribuido, reinvertido: pg.reinvertido || 0, aFavor: aportes + prestamos + honorarios + resultado - distribuido };
  });
  const otrosPrestamistas = r.prestamos.filter(x => !x.socio);
  return { filas, otrosPrestamistas };
}

/* ---------- vista MICA ---------- */
export function resumenMica() {
  const proyectos = proyectosOrdenados().map(resumenProyecto);
  const est = { gastosUsd: 0, porCategoria: {}, saldo: saldoBolsillo("ESTRUCTURA"), prestamos: prestamosDe("ESTRUCTURA") };
  S.movimientos.forEach(m => {
    if (esCosto(m) && m.bolsillo === "ESTRUCTURA") {
      const c = netoUsd(m);
      est.gastosUsd += c;
      const k = (m.imputacion || "c:Otros").replace(/^c:/, "");
      est.porCategoria[k] = (est.porCategoria[k] || 0) + c;
    }
  });
  est.interesesUsd = est.prestamos.reduce((a, x) => a + x.interesUsd, 0);
  const rein = reintegroPendiente();
  // Estructura y gastos de Magna recuperables se reparten entre proyectos según lo cobrado por cada uno.
  // Un proyecto cerrado queda con la parte que se le asignó al cerrarlo; el resto se reparte entre los demás.
  const aRepartir = est.gastosUsd + est.interesesUsd + rein.gastadoUsd - interesesGanadosDe("ESTRUCTURA");
  const fijo = r => r.proyecto.estado === "cerrado" && r.proyecto.cierre && r.proyecto.cierre.asignadoUsd != null;
  const asignadoFijo = proyectos.filter(fijo).reduce((a, r) => a + (Number(r.proyecto.cierre.asignadoUsd) || 0), 0);
  const resto = aRepartir - asignadoFijo;
  const totalVentas = proyectos.filter(r => !fijo(r)).reduce((a, r) => a + Math.max(0, r.ventasUsd), 0);
  proyectos.forEach(r => {
    if (fijo(r)) { r.asignadoUsd = Number(r.proyecto.cierre.asignadoUsd) || 0; r.pesoVentas = null; r.asignadoFijo = true; return; }
    r.asignadoUsd = totalVentas > 0 ? resto * Math.max(0, r.ventasUsd) / totalVentas : 0;
    r.pesoVentas = totalVentas > 0 ? Math.max(0, r.ventasUsd) / totalVentas : 0;
  });
  const sinAsignar = totalVentas > 0 ? 0 : resto;
  // Capital que los socios dejaron en Estructura (resultado reinvertido o aportes directos).
  est.aportes = aportesDe("ESTRUCTURA");
  const pagosEst = pagosASocios("ESTRUCTURA");
  const socios = SOCIOS.map(s => {
    const acc = { ...s, aportes: 0, prestamos: 0, honorarios: 0, resultado: 0, distribuido: 0, reintegro: s.id === TITULAR_MAGNA ? rein.usd : 0 };
    proyectos.forEach(r => {
      const c = cuentaSociosProyecto(r.proyecto, r, r.asignadoUsd).filas.find(x => x.id === s.id);
      ["aportes", "prestamos", "honorarios", "resultado", "distribuido"].forEach(k => { acc[k] += c[k]; });
    });
    const pe = pagosEst[s.id] || {};
    acc.aportes += ((est.aportes[s.id] || { usd: 0 }).usd) - (pe.aportesDevueltos || 0);
    acc.distribuido += pe.distribuido || 0;
    acc.prestamos += est.prestamos.filter(x => x.socio === s.id).reduce((a, x) => a + x.saldoUsd, 0);
    acc.resultado -= sinAsignar * (1 - parametrosImpuestos().ganancias / 100) / SOCIOS.length;
    acc.aFavor = acc.aportes + acc.prestamos + acc.honorarios + acc.resultado + acc.reintegro - acc.distribuido;
    // compatibilidad con la etapa 1
    acc.resultadoUsd = acc.resultado; acc.aportesUsd = acc.aportes;
    return acc;
  });
  const tot = proyectos.reduce((a, r) => ({ ventas: a.ventas + r.ventasUsd, costos: a.costos + r.costosUsd, resultado: a.resultado + r.resultadoUsd, neto: a.neto + r.resultadoFinalUsd }), { ventas: 0, costos: 0, resultado: 0, neto: 0 });
  return {
    proyectos, estructura: est, socios, reintegro: rein, aRepartir, sinAsignar,
    ventasUsd: tot.ventas, costosUsd: tot.costos, resultadoUsd: tot.resultado - aRepartir,
    resultadoNetoUsd: tot.neto - aRepartir * (1 - parametrosImpuestos().ganancias / 100)
  };
}

/* ---------- vista Magna ---------- */
export function resumenMagna() {
  const bols = bolsillos().map(b => ({ ...b, saldo: saldoBolsillo(b.id) }));
  const cuentas = S.cuentas.map(c => ({ ...c, saldo: saldoCuenta(c.id) }));
  const prestamosDados = [];
  ["ESTRUCTURA", ...S.proyectos.map(p => p.id)].forEach(id => {
    prestamosDe(id).filter(x => x.socio === TITULAR_MAGNA).forEach(x => prestamosDados.push({ proyecto: proyecto(id) || { id, nombre: nombreBolsillo(id) }, ...x }));
  });
  const magnaGastos = { usd: 0, porCategoria: {} };
  S.movimientos.forEach(m => {
    if (esCosto(m) && m.bolsillo === "MAGNA") {
      const c = netoUsd(m);
      magnaGastos.usd += c;
      const k = (m.imputacion || "c:Otros").replace(/^c:/, "");
      magnaGastos.porCategoria[k] = (magnaGastos.porCategoria[k] || 0) + c;
    }
  });
  return {
    bolsillos: bols, cuentas, total: bols.reduce((a, b) => a + b.saldo.ars, 0),
    negativos: bols.filter(b => b.saldo.ars < -0.5 && b.id !== "MAGNA"),
    reintegro: reintegroPendiente(), prestamosDados, magnaGastos
  };
}

/* ---------- etiqueta corta de un movimiento ---------- */
export function tituloMov(m) {
  if (m.tipo === "pase") return m.concepto || nombreClase("pase", m.clase);
  if (esCosto(m)) return m.proveedor ? m.proveedor + (m.concepto ? " · " + m.concepto : "") : (m.concepto || "Gasto");
  const base = nombreClase(m.tipo, m.clase);
  const socio = m.socio ? " · " + socioNombre(m.socio) : "";
  return (m.concepto ? m.concepto : base) + (m.concepto ? "" : socio);
}
