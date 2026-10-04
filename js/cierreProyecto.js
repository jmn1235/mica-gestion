/* =========================================================
   Cierre de proyecto.
   - Liquidación en el orden acordado: impuestos, préstamos con
     interés, aportes, honorarios, parte de estructura y el resto
     según la participación (o reinvertido).
   - Diferencia de cambio de la liquidación: la caja está en pesos
     y las cuentas en dólares del día de cada movimiento.
   - Fichas de la base de costos: lo imputado a rubro y a general
     se reparte entre los ítems según su peso en el costo directo
     cotizado, así cada ítem queda con su costo completo.
   ========================================================= */
import { S, guardar, borrar } from "./db.js";
import { SOCIOS, TITULAR_MAGNA } from "./config.js";
import * as M from "./modelo.js";
import * as P from "./presupuesto.js";
import * as I from "./impuestos.js";
import * as C from "./certificados.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
const r4 = v => Math.round(v * 10000) / 10000;
/* Por debajo de un dólar se considera saldado. */
export const TOL_USD = 1;

/* El proyecto como si se cerrara en una fecha: intereses y honorarios corren hasta ese día. */
export function simulado(p, fecha) {
  return Object.assign({}, p, { estado: "cerrado", fechaCierre: fecha, cierre: null });
}

/* Cálculos con movimientos que todavía no se registraron (para anticipar sus efectos). */
function conMovimientos(extra, fn) {
  if (!extra.length) return fn();
  const antes = S.movimientos;
  S.movimientos = antes.concat(extra);
  try { return fn(); } finally { S.movimientos = antes; }
}

/* Parte de estructura y gastos de Magna que le toca al proyecto (fija si ya cerró). */
export function asignadoDe(p) {
  const x = M.resumenMica().proyectos.find(r => r.proyecto.id === p.id);
  return x ? x.asignadoUsd || 0 : 0;
}

/* IVA de las facturas que todavía no se cobraron: ya está en la reserva (se debe al facturar),
   pero la plata vuelve recién con el cobro. No es pérdida: es un adelanto. */
function ivaPorCobrar(p) {
  const usdContrato = p.moneda !== "ARS";
  return C.docsDe(p.id).reduce((a, c) => {
    const f = c.factura || {};
    const tc = usdContrato ? n(f.tc) : 1;
    if (!f.fecha || !tc) return a;
    const e = C.estadoDe(c, p);
    return e.imp.total > 0 && e.saldo > 0 ? a + e.imp.iva * tc * e.saldo / e.imp.total : a;
  }, 0);
}

/* Foto de las cuentas del proyecto a la fecha de liquidación. */
function foto(p, fecha, asignado, extra = []) {
  return conMovimientos(extra, () => {
    const ps = p.estado === "cerrado" ? p : simulado(p, fecha);
    const r = M.resumenProyecto(ps, { corte: ps.fechaCierre || fecha });
    const cuenta = M.cuentaSociosProyecto(ps, r, asignado);
    const reserva = I.reservaProyecto(ps, r);
    const estructura = S.movimientos.reduce((a, m) => {
      if (m.tipo !== "pase" || m.clase !== "estructura") return a;
      if (m.bolsillo === p.id) return a + M.usd(m);
      if (m.destino === p.id) return a - M.usd(m);
      return a;
    }, 0);
    return { ps, r, cuenta, reserva, estructura, pagos: M.pagosASocios(p.id), caja: M.saldoBolsillo(p.id).ars, ivaPorCobrarArs: ivaPorCobrar(p) };
  });
}

/* Movimiento propuesto (todavía sin registrar). */
function propuesta(p, fecha, mep, o) {
  const ars = r2(o.ars);
  return {
    id: "sim_" + Math.random().toString(36).slice(2, 9), tipo: o.tipo, clase: o.clase, fecha,
    bolsillo: o.bolsillo, destino: o.destino || "", cuenta: (S.cuentas[0] || {}).id || "c_magna",
    montoARS: ars, cotizacion: mep, cotizacionFuente: "manual", montoUSD: mep > 0 ? r2(ars / mep) : 0,
    concepto: o.concepto || "", socio: o.socio || "", ivaARS: 0, fiscal: "", imputacion: "", tipoCosto: "", proveedor: "",
    notas: "Liquidación del cierre", liquidacion: p.id, quien: o.quien || ""
  };
}
/* Efecto de un movimiento sobre la caja del proyecto (en pesos). */
const efecto = (m, pid) => M.signo(m, new Set([pid])) * n(m.montoARS);
const esTitular = s => s === TITULAR_MAGNA;

/* Pago a un socio: al titular de Magna se le deja en su bolsillo; a los demás sale de la cuenta. */
function pagoASocio(p, fecha, mep, clase, socio, ars, concepto) {
  if (esTitular(socio)) return propuesta(p, fecha, mep, { tipo: "pase", clase, bolsillo: p.id, destino: "MAGNA", socio, ars, concepto, quien: M.socioNombre(socio) });
  return propuesta(p, fecha, mep, { tipo: "egreso", clase, bolsillo: p.id, socio, ars, concepto, quien: M.socioNombre(socio) });
}

/* Los seis pasos a partir de una foto. ajusteReserva: impuestos que generan los propios pagos del cierre. */
function armarPasos(p, f, fecha, mep, asignado, destino, ajusteReserva) {
  const usdA = v => v * mep;
  const pasos = [];

  // 1. Impuestos
  const pend1 = f.reserva.pendiente + ajusteReserva;
  const m1 = [];
  if (pend1 > 1) m1.push(propuesta(p, fecha, mep, { tipo: "pase", clase: "reserva", bolsillo: p.id, destino: "RESERVA", ars: pend1, concepto: "Reserva de impuestos del cierre", quien: "Magna · Reserva fiscal" }));
  if (pend1 < -1) m1.push(propuesta(p, fecha, mep, { tipo: "pase", clase: "reserva", bolsillo: "RESERVA", destino: p.id, ars: -pend1, concepto: "Devolución de reserva sobrante", quien: "Magna · Reserva fiscal" }));
  pasos.push({ k: "impuestos", n: 1, titulo: "Reservar los impuestos", sub: "IVA, Ingresos Brutos, cheque y Ganancias del proyecto, en Magna · Reserva fiscal.",
    correspondeArs: f.reserva.aReservar + ajusteReserva, hechoArs: f.reserva.reservado, faltaArs: pend1, faltaUsd: mep > 0 ? pend1 / mep : 0,
    filas: [{ quien: "Magna · Reserva fiscal", ars: pend1 }], movs: m1, manual: [] });

  // 2. Préstamos con su interés
  const m2 = [], man2 = [], f2 = [];
  f.r.prestamos.forEach(g => {
    if (g.saldoUsd <= TOL_USD) return;
    const ars = usdA(g.saldoUsd);
    f2.push({ quien: g.nombre, usd: g.saldoUsd, ars, interes: g.saldoInteresUsd });
    if (g.quien.startsWith("bol:")) m2.push(propuesta(p, fecha, mep, { tipo: "pase", clase: "devolucion", bolsillo: p.id, destino: g.quien.slice(4), socio: g.socio || "", ars, concepto: "Devolución de préstamo con interés (cierre)", quien: g.nombre }));
    else if (g.quien.startsWith("socio:")) m2.push(propuesta(p, fecha, mep, { tipo: "egreso", clase: "devolucion", bolsillo: p.id, socio: g.socio, ars, concepto: "Devolución de préstamo con interés (cierre)", quien: g.nombre }));
    else man2.push({ quien: g.nombre, usd: g.saldoUsd, ars });
  });
  const pr = f.r.prestamos;
  pasos.push({ k: "prestamos", n: 2, titulo: "Devolver los préstamos con su interés", sub: "A cada uno lo que prestó, más el interés devengado hasta la fecha de liquidación.",
    correspondeUsd: pr.reduce((a, g) => a + g.recibidoUsd + g.interesUsd, 0), hechoUsd: pr.reduce((a, g) => a + g.devueltoUsd, 0),
    faltaUsd: f2.reduce((a, x) => a + x.usd, 0), filas: f2, movs: m2, manual: man2 });

  // 3, 4. Aportes y honorarios, socio por socio
  const hechoDe = clave => Object.values(f.pagos).reduce((a, x) => a + (x[clave] || 0), 0);
  const porSocio = (k, clase, n0, titulo, sub, concepto) => {
    const filas = [], movs = [];
    f.cuenta.filas.forEach(s => {
      const v = s[k];
      if (v <= TOL_USD) return;
      filas.push({ quien: s.nombre, usd: v, ars: usdA(v), socio: s.id });
      movs.push(pagoASocio(p, fecha, mep, clase, s.id, usdA(v), concepto));
    });
    pasos.push({ k, n: n0, titulo, sub, hechoUsd: hechoDe(k === "aportes" ? "aportesDevueltos" : "honorarios"), faltaUsd: filas.reduce((a, x) => a + x.usd, 0), filas, movs, manual: [] });
  };
  porSocio("aportes", "devaporte", 3, "Devolver los aportes de capital", "Sin interés, en dólares del día de cada aporte.", "Devolución de aporte (cierre)");
  porSocio("honorarios", "honorario", 4, "Pagar los honorarios reconocidos", "Lo acordado con cada socio y todavía no pagado.", "Honorarios (cierre)");

  // 5. Estructura de MICA y gastos de Magna
  const t = f.r.impuestos.param.ganancias / 100;
  const corresponde5 = asignado * (1 - t);
  const falta5 = corresponde5 - f.estructura;
  const m5 = [];
  if (falta5 > TOL_USD) m5.push(propuesta(p, fecha, mep, { tipo: "pase", clase: "estructura", bolsillo: p.id, destino: "ESTRUCTURA", ars: usdA(falta5), concepto: "Parte de estructura de MICA (cierre)", quien: "MICA · Estructura" }));
  if (falta5 < -TOL_USD) m5.push(propuesta(p, fecha, mep, { tipo: "pase", clase: "estructura", bolsillo: "ESTRUCTURA", destino: p.id, ars: usdA(-falta5), concepto: "Devolución de estructura pasada de más", quien: "MICA · Estructura" }));
  pasos.push({ k: "estructura", n: 5, titulo: "Cubrir la parte de estructura y de Magna", sub: "Lo que le toca al proyecto según lo cobrado, neto del ahorro de Ganancias. Va a MICA · Estructura, que después le reintegra a Julio los gastos de Magna.",
    correspondeUsd: corresponde5, hechoUsd: f.estructura, faltaUsd: falta5, asignadoBrutoUsd: asignado,
    filas: [{ quien: "MICA · Estructura", usd: falta5, ars: usdA(falta5) }], movs: m5, manual: [] });

  // 6. El resto, según la participación
  const previos = pasos.flatMap(x => x.movs);
  const manual = pasos.flatMap(x => x.manual);
  const cajaTras = f.caja + previos.reduce((a, m) => a + efecto(m, p.id), 0) - manual.reduce((a, x) => a + x.ars, 0);
  // El IVA adelantado de facturas por cobrar es plata del proyecto que todavía no volvió: cuenta para el resultado,
  // pero hoy se reparte solo lo que hay en caja; el resto queda a favor de cada socio hasta el cobro.
  const Y = mep > 0 ? (cajaTras + f.ivaPorCobrarArs) / mep : 0;
  const pend = f.cuenta.filas.map(s => ({ s, usd: s.resultado - s.distribuido }));
  const X = pend.reduce((a, x) => a + x.usd, 0);
  const dif = Y - X;
  const disponible = mep > 0 ? Math.max(0, cajaTras) / mep : 0;
  const factor = Y > disponible + TOL_USD && Y > 0 ? disponible / Y : 1;
  const filas6 = [], m6 = [], negativos = [];
  pend.forEach(({ s, usd }) => {
    const v = (usd + s.pct * dif) * factor;
    if (v < -TOL_USD) { negativos.push({ quien: s.nombre, usd: v }); return; }
    if (v <= TOL_USD) return;
    filas6.push({ quien: s.nombre, usd: v, ars: usdA(v), socio: s.id, pct: s.pct });
    if (destino && destino !== "repartir") {
      m6.push(propuesta(p, fecha, mep, { tipo: "pase", clase: "aporte", bolsillo: p.id, destino, socio: s.id, ars: usdA(v), concepto: "Resultado reinvertido (cierre de " + p.nombre + ")", quien: s.nombre }));
    } else m6.push(pagoASocio(p, fecha, mep, "distribucion", s.id, usdA(v), "Distribución del resultado (cierre)"));
  });
  pasos.push({ k: "resultado", n: 6, titulo: destino && destino !== "repartir" ? "Reinvertir el resultado" : "Repartir el resultado", sub: "Lo que queda en caja, según la participación de cada socio.",
    hechoUsd: hechoDe("distribuido"), faltaUsd: filas6.reduce((a, x) => a + x.usd, 0), filas: filas6, movs: m6, manual: [], negativos,
    parcial: factor < 1, aCobrarUsd: factor < 1 ? Y - disponible : 0 });

  return { pasos, cajaTrasUsd: Y, cajaTrasArs: cajaTras, resultadoPendienteUsd: X, difUsd: dif, ivaPorCobrarArs: f.ivaPorCobrarArs };
}

/* Liquidación completa a una fecha y a un dólar. destino: "repartir" o el bolsillo donde se reinvierte. */
export function liquidacion(p, fecha, mep, destino = "repartir") {
  const asignado = asignadoDe(p);
  const f0 = foto(p, fecha, asignado);
  let ajuste = 0;
  let res = armarPasos(p, f0, fecha, mep, asignado, destino, ajuste);
  // Los pagos del cierre pagan impuesto al cheque y mueven Ganancias: se anticipan en la reserva.
  for (let i = 0; i < 4 && mep > 0; i++) {
    const plan = res.pasos.flatMap(x => x.movs);
    if (!plan.length) break;
    const extra = foto(p, fecha, asignado, plan).reserva.pendiente;
    if (Math.abs(extra) <= 1) break;
    ajuste += extra;
    res = armarPasos(p, f0, fecha, mep, asignado, destino, ajuste);
  }
  const r = f0.r;
  const t = r.impuestos.param.ganancias / 100;
  const cerrado = p.estado === "cerrado" && p.cierre;
  const difCierre = cerrado ? n(p.cierre.difCambioUsd) : 0;
  const asignadoNeto = asignado * (1 - t);
  const pendientes = res.pasos.filter(x => x.k !== "resultado" && Math.abs(x.faltaUsd) > TOL_USD);
  return {
    ...res, foto: f0, r, asignado, asignadoNeto, ajusteReserva: ajuste, fecha, mep, destino,
    caja: f0.caja, cajaUsd: mep > 0 ? f0.caja / mep : 0,
    alcanza: res.cajaTrasArs >= -1,
    // Resultado final: neto de impuestos, menos estructura, más la diferencia de cambio de la liquidación.
    difTotalUsd: difCierre + res.difUsd,
    finalUsd: r.resultadoNetoUsd - asignadoNeto + difCierre + res.difUsd,
    pendientes, saldado: !pendientes.length && res.pasos.find(x => x.k === "resultado").faltaUsd <= TOL_USD
  };
}

/* ---------- fichas de la base de costos ---------- */
const PARTE = { "Materiales": "mat", "Mano de obra": "mo", "Equipos": "eq", "Subcontratos": "sub" };
const vacio = () => ({ mat: 0, mo: 0, eq: 0, sub: 0, ind: 0 });
const suma = o => o.mat + o.mo + o.eq + o.sub + o.ind;

export function fichasDe(p, fecha) {
  const items = p.items || [];
  if (!items.length) return { fichas: [], ggUsd: 0, ggPct: null, indPct: null, sinRepartirUsd: 0 };
  const av = P.avancesDe(p.id);
  const porItem = {}, porRubro = {}, gen = vacio();
  const rubros = new Set(items.map(it => it.rubro).filter(Boolean));
  let ars = 0, usd = 0;
  S.movimientos.forEach(m => {
    if (!M.esCosto(m) || m.bolsillo !== p.id) return;
    const v = M.netoUsd(m), k = m.imputacion || "g", pt = PARTE[m.tipoCosto] || "ind";
    ars += M.netoArs(m); usd += v;
    if (k.startsWith("i:") && items.some(it => it.id === k.slice(2))) (porItem[k.slice(2)] = porItem[k.slice(2)] || vacio())[pt] += v;
    else if (k.startsWith("r:") && rubros.has(k.slice(2))) (porRubro[k.slice(2)] = porRubro[k.slice(2)] || vacio())[pt] += v;
    else gen[pt] += v;
  });
  // Contratos en pesos: lo cotizado se pasa a dólares al promedio de los gastos del proyecto.
  const mepRef = usd > 0 ? ars / usd : 0;
  const aUsd = p.moneda === "ARS" ? (v => (mepRef > 0 ? v / mepRef : 0)) : (v => v);
  const peso = it => P.costoItem(it) || P.ventaItem(it) || 0;
  const pesoTot = items.reduce((a, it) => a + peso(it), 0);
  const pesoRubro = {};
  items.forEach(it => { if (it.rubro) pesoRubro[it.rubro] = (pesoRubro[it.rubro] || 0) + peso(it); });
  Object.entries(porRubro).forEach(([rb, c]) => {
    if (pesoRubro[rb] > 0) return;
    Object.keys(c).forEach(k => { gen[k] += c[k]; });
    delete porRubro[rb];
  });
  const ggTot = suma(gen);
  const filas = items.map(it => {
    const d = vacio();
    const pi = porItem[it.id];
    if (pi) Object.keys(d).forEach(k => { d[k] += pi[k]; });
    if (it.rubro && porRubro[it.rubro]) Object.keys(d).forEach(k => { d[k] += porRubro[it.rubro][k] * peso(it) / pesoRubro[it.rubro]; });
    const gg = pesoTot > 0 ? ggTot * peso(it) / pesoTot : 0;
    const ejec = P.ejecutado(av, it.id);
    return { it, d, gg, ejec, cant: ejec > 0 ? ejec : n(it.cantidad) };
  });
  const directo = filas.reduce((a, f) => a + f.d.mat + f.d.mo + f.d.eq + f.d.sub, 0);
  const ind = filas.reduce((a, f) => a + f.d.ind, 0);
  const ggPct = directo + ind > 0 ? ggTot / (directo + ind) : null;
  const indPct = directo > 0 ? ind / directo : null;
  const sinRepartir = pesoTot > 0 ? 0 : ggTot;
  const fichas = filas.filter(f => f.cant > 0 && suma(f.d) + f.gg > 0).map(f => {
    const it = f.it, q = f.cant, c = it.costo || {};
    const cot = { mat: aUsd(n(c.mat)), mo: aUsd(n(c.mo)), eq: aUsd(n(c.eq)), sub: aUsd(n(c.sub)) };
    cot.total = cot.mat + cot.mo + cot.eq + cot.sub;
    const real = { mat: f.d.mat / q, mo: f.d.mo / q, eq: f.d.eq / q, sub: f.d.sub / q, ind: f.d.ind / q, gg: f.gg / q };
    real.item = real.mat + real.mo + real.eq + real.sub + real.ind;
    real.total = real.item + real.gg;
    const puVenta = aUsd(n(it.precioUnitario));
    const red = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r4(v)]));
    return {
      id: `fi_${p.id}_${it.id}`, origen: "cierre", proyecto: p.id, obra: p.nombre, codigo: p.codigo || "", cliente: p.cliente || "",
      tipoObra: p.tipoObra || "", ubicacion: p.ubicacion || "", fecha, anio: String(fecha).slice(0, 4),
      moneda: p.moneda === "ARS" ? "ARS" : "USD", mepRef: p.moneda === "ARS" ? r2(mepRef) : null,
      item: it.id, numero: String(it.numero || ""), rubro: it.rubro || "", descripcion: it.descripcion || "", unidad: it.unidad || "",
      cantidadCotizada: n(it.cantidad), cantidad: r4(q), sinAvance: !(f.ejec > 0),
      puVenta: r4(puVenta), cot: red(cot), real: red(real),
      ggPct: ggPct == null ? null : r4(ggPct), indPct: indPct == null ? null : r4(indPct),
      desvioPct: cot.total > 0 ? r4(real.item / cot.total - 1) : null,
      margenPct: puVenta > 0 ? r4(1 - real.total / puVenta) : null
    };
  });
  return { fichas, ggUsd: ggTot, ggPct, indPct, sinRepartirUsd: sinRepartir, directoUsd: directo, indUsd: ind };
}

/* ---------- cerrar y reabrir ---------- */
export function cerrarProyecto(p, fecha, mep, destino, quien) {
  const liq = liquidacion(p, fecha, mep, destino);
  const fx = fichasDe(p, fecha);
  const ahora = new Date().toISOString();
  const nuevas = new Set(fx.fichas.map(x => x.id));
  S.fichas.filter(x => x.proyecto === p.id && x.origen === "cierre" && !nuevas.has(x.id)).forEach(x => borrar("fichas", x.id));
  fx.fichas.forEach(x => {
    const vieja = S.fichas.find(y => y.id === x.id);
    // Se conservan las notas y etiquetas que se hayan cargado a mano en la ficha.
    guardar("fichas", Object.assign(x, vieja ? { notas: vieja.notas || "", tipoObra: vieja.tipoObraManual ? vieja.tipoObra : x.tipoObra } : {}, { creadoPor: quien, creadoEl: ahora }));
  });
  const r = liq.r;
  const sg = P.seguimiento(simulado(p, fecha));
  const x = r.impuestos;
  const dif = liq.difUsd;
  const final = r.resultadoNetoUsd - liq.asignadoNeto + dif;
  P.actualizarProyecto(p.id, pp => {
    pp.estado = "cerrado";
    pp.fechaCierre = fecha;
    pp.cierre = {
      fecha, mep, destino: destino || "repartir", asignadoUsd: r2(liq.asignado), difCambioUsd: r2(dif),
      cerradoPor: quien, cerradoEl: ahora, fichas: fx.fichas.length,
      resumen: {
        contrato: r2(r.contrato), moneda: r.moneda, ventasUsd: r2(r.ventasUsd), costosUsd: r2(r.costosUsd), honorariosUsd: r2(r.honorariosUsd),
        interesesUsd: r2(r.interesesUsd), interesesGanadosUsd: r2(r.interesesGanadosUsd), resultadoUsd: r2(r.resultadoUsd),
        iibbUsd: r2(x.iibbUsd), chequeUsd: r2(x.chequeUsd), gananciasUsd: r2(x.gananciasCostoUsd), netoUsd: r2(r.resultadoNetoUsd),
        estructuraUsd: r2(liq.asignadoNeto), difCambioUsd: r2(dif), finalUsd: r2(final),
        margenRealPct: r.ventasUsd > 0 ? r4(final / r.ventasUsd) : null,
        margenCotizadoPct: sg.margenCotizadoPct == null ? null : r4(sg.margenCotizadoPct),
        avanceFisico: r4(sg.avanceFisico), costoCotizado: r2(sg.costoCotizado), costoReal: r2(sg.costoReal),
        ggPct: fx.ggPct == null ? null : r4(fx.ggPct),
        socios: SOCIOS.map(s => ({ id: s.id, pct: n((p.participacion || {})[s.id]), finalUsd: r2(final * n((p.participacion || {})[s.id]) / 100) }))
      }
    };
  }, quien);
  return { liq, fichas: fx.fichas.length };
}

export function reabrirProyecto(p, quien) {
  S.fichas.filter(x => x.proyecto === p.id && x.origen === "cierre").forEach(x => borrar("fichas", x.id));
  P.actualizarProyecto(p.id, pp => {
    pp.estado = "activo";
    pp.reabiertoEl = new Date().toISOString();
    pp.reabiertoPor = quien;
    delete pp.fechaCierre;
    delete pp.cierre;
  }, quien);
}

/* Movimientos propuestos listos para guardar. */
export function registrar(movs, quien) {
  const ahora = new Date().toISOString();
  movs.forEach(m => {
    const d = Object.assign({}, m);
    delete d.id; delete d.quien;
    d.montoARS = r2(d.montoARS);
    d.montoUSD = d.cotizacion > 0 ? r2(d.montoARS / d.cotizacion) : 0;
    d.creadoPor = quien; d.creadoEl = ahora;
    guardar("movimientos", d);
  });
}
