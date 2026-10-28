/* =========================================================
   IVA de toda Magna Desarrollos SRL, por origen.
   Orígenes: cada proyecto de MICA, MICA · Estructura, Magna
   (propio, con la Reserva fiscal) y Río Colorado.
   - Mes a mes: débito, crédito, retenciones y percepciones de IVA
     (pagos a cuenta) y el saldo de Magna, con el saldo a favor que
     pasa al mes siguiente (técnico y de libre disponibilidad).
   - Pagos a cuenta de IIBB y de Ganancias que vienen en las
     facturas (percepciones) y en los cobros (retenciones).
   - Compensación entre proyectos: el que aporta crédito fiscal
     que otro usó cobra ese IVA. Magna (propio) no participa: sus
     compras las paga Julio sin reintegro.
   Todo en pesos (el IVA es en pesos).
   ========================================================= */
import { S } from "./db.js";
import * as M from "./modelo.js";
import * as I from "./impuestos.js";
import { comprasRC, hayDatos } from "./rioColorado.js";
import { origenDe } from "./contadora.js";
import { mesLabel } from "./ui.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;

/* Orígenes, en orden. compensa: participa de la compensación entre proyectos. */
export function origenes(conRC = hayDatos()) {
  const out = M.proyectosOrdenados().map(p => ({ id: p.id, nombre: "MICA · " + p.nombre, tipo: "mica", compensa: true, estado: p.estado }));
  out.push({ id: "ESTRUCTURA", nombre: "MICA · Estructura", tipo: "estructura", compensa: true });
  out.push({ id: "MAGNA", nombre: "Magna (propio)", tipo: "magna", compensa: false });
  if (conRC) out.push({ id: "RC", nombre: "Río Colorado", tipo: "rc", compensa: true });
  return out;
}
export const nombreOrigen = id => (id === "RC" ? "Río Colorado" : origenDe(id));

const vacio = () => ({ debito: 0, credito: 0, ret: 0, iibb: 0, gan: 0 });

/* Mapa origen → mes → importes. */
export function porOrigenYMes(conRC = hayDatos()) {
  const out = {};
  const celda = (o, mes) => { if (!mes) return null; out[o] = out[o] || {}; return (out[o][mes] = out[o][mes] || vacio()); };
  // IVA de los proyectos: el mismo cálculo de la pantalla Impuestos.
  S.proyectos.forEach(p => {
    const iva = I.ivaProyecto(p);
    iva.meses.forEach(x => { const c = celda(p.id, x.mes); c.debito += x.debito; c.credito += x.credito; c.ret += x.ret; });
  });
  S.movimientos.forEach(m => {
    const mes = M.mesDe(m);
    const esProy = !!M.proyecto(m.bolsillo);
    const fijo = m.bolsillo === "ESTRUCTURA" ? "ESTRUCTURA" : (m.bolsillo === "MAGNA" || m.bolsillo === "RESERVA") ? "MAGNA" : null;
    const o = esProy ? m.bolsillo : fijo;
    if (!o) return;
    if (M.esCosto(m)) {
      const c = celda(o, mes);
      if (!esProy) {
        if (m.fiscal === "A") c.credito += n(m.ivaARS);
        c.ret += n(m.percIVA);
      }
      c.iibb += n(m.percIIBB); c.gan += n(m.percGan);
    }
    if (M.esVenta(m) && esProy) {
      const c = celda(o, mes);
      c.iibb += n(m.retIIBB); c.gan += n(m.retGan);
    }
  });
  if (conRC) comprasRC().forEach(cp => {
    const c = celda("RC", cp.fecha.slice(0, 7));
    if (cp.letra === "A") c.credito += cp.iva;
    c.ret += cp.percIVA; c.iibb += cp.percIIBB; c.gan += cp.percGan;
  });
  return out;
}

/* Meses con datos, ordenados. */
function mesesDe(mapa) {
  const s = new Set();
  Object.values(mapa).forEach(o => Object.keys(o).forEach(m => s.add(m)));
  return Array.from(s).sort();
}

/* IVA de Magna mes a mes, con los saldos a favor que pasan de un mes al otro.
   Saldo técnico: débito − crédito (si da negativo, queda a favor para el mes siguiente).
   Libre disponibilidad: retenciones y percepciones de IVA, que bajan lo que queda a pagar. */
export function mensual(conRC = hayDatos()) {
  const mapa = porOrigenYMes(conRC);
  const meses = mesesDe(mapa);
  let favorTec = 0, favorLibre = 0;
  const filas = meses.map(mes => {
    const t = vacio();
    Object.values(mapa).forEach(o => { const c = o[mes]; if (c) Object.keys(t).forEach(k => { t[k] += c[k]; }); });
    const tecAnt = favorTec, libreAnt = favorLibre;
    let tec = t.debito - t.credito - favorTec;
    favorTec = tec < 0 ? -tec : 0;
    tec = Math.max(0, tec);
    let pagar = tec - t.ret - favorLibre;
    favorLibre = pagar < 0 ? Math.min(-pagar, t.ret + libreAnt) : 0;
    pagar = Math.max(0, pagar);
    return { mes, ...t, tecAnt, libreAnt, saldoMes: t.debito - t.credito - t.ret, pagar: r2(pagar), favorTec: r2(favorTec), favorLibre: r2(favorLibre) };
  });
  return { meses, filas, mapa };
}

/* Totales por origen en un rango de meses. */
export function totalesPorOrigen(desde, hasta, conRC = hayDatos()) {
  const mapa = porOrigenYMes(conRC);
  return origenes(conRC).map(o => {
    const t = vacio();
    Object.entries(mapa[o.id] || {}).forEach(([mes, c]) => { if (mes >= desde && mes <= hasta) Object.keys(t).forEach(k => { t[k] += c[k]; }); });
    return { ...o, ...t, saldo: t.debito - t.credito - t.ret };
  });
}

/* Compras propias de Magna en un rango de meses, según quién las pagó:
   cada socio que pagó con su plata sin reintegro, o la cuenta de Magna.
   Sirve para ver cuánto crédito fiscal aportó cada uno. */
export function comprasMagnaPorQuien(desde, hasta) {
  const por = {};
  S.movimientos.forEach(m => {
    if (!M.esCosto(m) || m.bolsillo !== "MAGNA") return;
    const mes = M.mesDe(m);
    if (mes < desde || mes > hasta) return;
    const k = m.fueraDeCaja ? M.quienPagoSinReintegro(m) : "CUENTA";
    const x = (por[k] = por[k] || { quien: k, nombre: k === "CUENTA" ? "La cuenta de Magna" : M.socioNombre(k), sinReintegro: k !== "CUENTA", facturas: 0, total: 0, iva: 0, percIVA: 0 });
    x.facturas++;
    x.total += n(m.montoARS);
    if (m.fiscal === "A") x.iva += n(m.ivaARS);
    x.percIVA += n(m.percIVA);
  });
  return Object.values(por).map(x => ({ ...x, credito: x.iva + x.percIVA })).sort((a, b) => (a.quien === "CUENTA") - (b.quien === "CUENTA") || b.credito - a.credito);
}

/* Filas para la hoja «IVA por origen» de la planilla. */
export function filasPorOrigen(desde, hasta, conRC = hayDatos()) {
  const mapa = porOrigenYMes(conRC);
  const out = [];
  mesesDe(mapa).filter(m => m >= desde && m <= hasta).forEach(mes => origenes(conRC).forEach(o => {
    const c = (mapa[o.id] || {})[mes];
    if (!c || !(c.debito || c.credito || c.ret || c.iibb || c.gan)) return;
    out.push({ mesTxt: mesLabel(mes), origen: o.nombre, debito: r2(c.debito), credito: r2(c.credito), ret: r2(c.ret), saldo: r2(c.debito - c.credito - c.ret), iibb: r2(c.iibb), gan: r2(c.gan) });
  }));
  return out;
}

/* ---------- compensación de IVA entre proyectos ----------
   Con el saldo acumulado hasta el mes elegido: los que tienen IVA a pagar (débito mayor que
   su crédito) usaron el crédito de los que tienen saldo a favor. Lo usado se reparte en
   proporción: cada uno paga según su IVA a pagar y cada uno cobra según su crédito. */
export function compensacion(hasta, conRC = hayDatos()) {
  const mapa = porOrigenYMes(conRC);
  const os = origenes(conRC).filter(o => o.compensa);
  const saldos = os.map(o => {
    let s = 0;
    Object.entries(mapa[o.id] || {}).forEach(([mes, c]) => { if (mes <= hasta) s += c.debito - c.credito - c.ret; });
    return { ...o, saldo: s };
  });
  const deudores = saldos.filter(x => x.saldo > 1), acreedores = saldos.filter(x => x.saldo < -1);
  const D = deudores.reduce((a, x) => a + x.saldo, 0), Cr = acreedores.reduce((a, x) => -x.saldo + a, 0);
  const usado = Math.min(D, Cr);
  const hechos = registradas();
  const pares = [];
  deudores.forEach(d => acreedores.forEach(c => {
    const corresponde = D > 0 && Cr > 0 ? usado * (d.saldo / D) * (-c.saldo / Cr) : 0;
    const hecho = hechos[d.id + ">" + c.id] || 0;
    pares.push({ de: d.id, deNombre: d.nombre, a: c.id, aNombre: c.nombre, corresponde: r2(corresponde), hecho: r2(hecho), falta: r2(corresponde - hecho) });
  }));
  // Lo registrado entre pares que ya no corresponden (por ejemplo, si cambió el saldo) también se muestra.
  Object.entries(hechos).forEach(([k, v]) => {
    if (pares.some(p => p.de + ">" + p.a === k)) return;
    const [de, a] = k.split(">");
    pares.push({ de, deNombre: nombreOrigen(de), a, aNombre: nombreOrigen(a), corresponde: 0, hecho: r2(v), falta: r2(-v) });
  });
  return { hasta, saldos, deudores, acreedores, usado: r2(usado), pares };
}

/* Compensaciones ya registradas, por par «de>a», en pesos. */
export function registradas() {
  const out = {};
  S.movimientos.forEach(m => {
    if (m.clase !== "compiva" || !m.compiva) return;
    const k = m.compiva.de + ">" + m.compiva.a;
    out[k] = (out[k] || 0) + n(m.montoARS);
  });
  return out;
}

/* Movimiento que registra una compensación en esta app.
   - Paga un proyecto de MICA (o Estructura): el IVA ya está apartado en Magna · Reserva fiscal,
     así que sale de ahí. A otro bolsillo de MICA va como pase; a Río Colorado, como egreso de la cuenta.
   - Paga Río Colorado: entra a la cuenta, al bolsillo que cobra. */
export function movimientoCompensacion(par, { fecha, montoARS, cotizacion, cuenta }) {
  const base = {
    fecha, montoARS: r2(montoARS), cotizacion, cotizacionFuente: "manual", montoUSD: cotizacion > 0 ? r2(montoARS / cotizacion) : 0,
    cuenta: cuenta || (S.cuentas[0] || {}).id || "c_magna", clase: "compiva", compiva: { de: par.de, a: par.a },
    concepto: `Compensación de IVA: ${par.deNombre} → ${par.aNombre}`, notas: "Crédito fiscal usado por otro proyecto de Magna",
    proveedor: "", imputacion: "", fiscal: "", ivaARS: 0, socio: "", tasa: null
  };
  if (par.de === "RC") return Object.assign(base, { tipo: "ingreso", bolsillo: par.a, destino: "" });
  if (par.a === "RC") return Object.assign(base, { tipo: "egreso", bolsillo: "RESERVA", destino: "" });
  return Object.assign(base, { tipo: "pase", bolsillo: "RESERVA", destino: par.a });
}
