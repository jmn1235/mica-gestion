/* =========================================================
   IVA y reserva fiscal.
   - IVA débito: por factura emitida (fecha de la factura), más
     los cobros cargados a mano sin certificado.
   - IVA crédito: compras con Factura A.
   - Retenciones de IVA sufridas en los cobros y percepciones de IVA de las compras.
   El IVA no es resultado: el saldo a pagar se reserva en Magna.
   IIBB, cheque y Ganancias se calculan en modelo.impuestosDe.
   ========================================================= */
import { S } from "./db.js";
import * as M from "./modelo.js";
import { docsDe, importes } from "./certificados.js";

const n = v => Number(v) || 0;
const mesDeF = f => String(f || "").slice(0, 7);

function sumar(meses, mes, k, v) {
  if (!mes) return;
  meses[mes] = meses[mes] || { debito: 0, credito: 0, ret: 0 };
  meses[mes][k] += v;
}
const cerrar = meses => {
  const lista = Object.keys(meses).sort().map(mes => ({ mes, ...meses[mes], saldo: meses[mes].debito - meses[mes].credito - meses[mes].ret }));
  const tot = lista.reduce((a, x) => ({ debito: a.debito + x.debito, credito: a.credito + x.credito, ret: a.ret + x.ret }), { debito: 0, credito: 0, ret: 0 });
  tot.saldo = tot.debito - tot.credito - tot.ret;
  return { meses: lista, ...tot };
};

/* IVA de un proyecto, en pesos. */
export function ivaProyecto(p, meses = {}) {
  const usdContrato = p.moneda !== "ARS";
  docsDe(p.id).forEach(c => {
    const f = c.factura || {};
    if (!f.fecha) return;
    const imp = importes(c, p);
    const tc = usdContrato ? n(f.tc) : 1;
    if (tc) sumar(meses, mesDeF(f.fecha), "debito", imp.iva * tc);
  });
  S.movimientos.forEach(m => {
    if (m.bolsillo !== p.id) return;
    if (M.esVenta(m)) {
      if (!m.certificado) sumar(meses, M.mesDe(m), "debito", n(m.ivaARS));
      sumar(meses, M.mesDe(m), "ret", n(m.retIVA));
    }
    if (M.esCosto(m) && m.fiscal === "A") sumar(meses, M.mesDe(m), "credito", n(m.ivaARS));
    if (M.esCosto(m)) sumar(meses, M.mesDe(m), "ret", n(m.percIVA));
  });
  return cerrar(meses);
}

/* IVA de toda Magna: proyectos más el crédito de los gastos de Estructura y de Magna con Factura A. */
export function ivaMagna() {
  const meses = {};
  S.proyectos.forEach(p => ivaProyecto(p, meses));
  S.movimientos.forEach(m => {
    if ((m.bolsillo === "ESTRUCTURA" || m.bolsillo === "MAGNA") && M.esCosto(m) && m.fiscal === "A") sumar(meses, M.mesDe(m), "credito", n(m.ivaARS));
    if ((m.bolsillo === "ESTRUCTURA" || m.bolsillo === "MAGNA" || m.bolsillo === "RESERVA") && M.esCosto(m)) sumar(meses, M.mesDe(m), "ret", n(m.percIVA));
  });
  return cerrar(meses);
}

/* Última cotización MEP conocida en los movimientos (para pasar a pesos lo calculado en dólares). */
export function ultimoMep(pid) {
  const ms = S.movimientos.filter(m => (!pid || m.bolsillo === pid) && m.cotizacion > 0).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return ms.length ? ms[0].cotizacion : 0;
}

/* Lo que el proyecto tendría que tener reservado para impuestos, en pesos. */
export function reservaProyecto(p, r = M.resumenProyecto(p)) {
  const x = r.impuestos;
  const iva = ivaProyecto(p);
  const mep = ultimoMep(p.id) || ultimoMep();
  const conceptos = [
    { k: "iva", nombre: "IVA", ars: Math.max(0, iva.saldo) },
    { k: "iibb", nombre: "Ingresos Brutos", ars: Math.max(0, x.iibbAPagarArs) },
    { k: "cheque", nombre: "Impuesto al cheque", ars: x.chequeArs },
    { k: "ganancias", nombre: "Ganancias", ars: Math.max(0, x.gananciasAPagarArs != null ? x.gananciasAPagarArs : x.gananciasAPagarUsd * mep) }
  ];
  const aReservar = conceptos.reduce((a, c) => a + c.ars, 0);
  const reservado = S.movimientos.filter(m => m.tipo === "pase" && m.clase === "reserva" && m.bolsillo === p.id && m.destino === "RESERVA").reduce((a, m) => a + n(m.montoARS), 0)
    - S.movimientos.filter(m => m.tipo === "pase" && m.bolsillo === "RESERVA" && m.destino === p.id && m.clase !== "compiva").reduce((a, m) => a + n(m.montoARS), 0);
  return { conceptos, aReservar, reservado, pendiente: aReservar - reservado, iva, mep };
}

/* De dónde sale Ganancias de un proyecto, renglón por renglón (en dólares MEP).
   tipo: "" renglón común, "sub" subtotal, "total" resultado, "nota" lo que no se deduce. */
export function baseGanancias(r) {
  const x = r.impuestos, g = x.ganancias || {};
  const chequeNoComp = x.chequeUsd - x.chequeComputableUsd;
  const filas = [
    { t: "Cobrado, neto de IVA", usd: r.ventasUsd },
    { t: "Gastos deducibles (Factura A, B o C, sueldos y tasas)", usd: -x.deduciblesUsd },
    { t: "Ingresos Brutos", usd: -x.iibbUsd },
    { t: "Impuesto al cheque que no se computa (" + String(100 - x.param.chequeComputable).replace(".", ",") + "%)", usd: -chequeNoComp },
    { t: "Resultado impositivo", usd: x.baseGananciasUsd, tipo: "sub" },
    g.modo === "monto"
      ? { t: "Ganancias: monto fijo que pasó la contadora", usd: -x.gananciasUsd }
      : { t: "Ganancias: " + String(g.pct).replace(".", ",") + "% del resultado impositivo", usd: -x.gananciasUsd },
    { t: "Menos la parte del cheque que se toma a cuenta", usd: x.chequeComputableUsd },
    { t: "Ganancias a cargo del proyecto", usd: -x.gananciasCostoUsd, tipo: "total" }
  ];
  const noDeducen = [
    { t: "Gastos sin factura", usd: r.sinFacturaUsd },
    { t: "Intereses de préstamos de socios", usd: r.interesesUsd },
    { t: "Honorarios de socios", usd: r.honorariosUsd }
  ].filter(f => f.usd > 0.5);
  // Lo que suman a Ganancias los gastos que no se deducen (con la tasa efectiva).
  const extraUsd = noDeducen.reduce((a, f) => a + f.usd, 0) * (x.tasaGanEf || 0);
  return { filas, noDeducen, extraUsd };
}

/* Reserva fiscal de Magna: lo reservado, lo pagado por impuesto y el saldo. */
export function reservaMagna() {
  const pagos = {};
  let pagado = 0, entro = 0;
  S.movimientos.forEach(m => {
    if (m.tipo === "egreso" && m.clase === "gasto" && m.bolsillo === "RESERVA") {
      const k = String(m.imputacion || "c:Otros impuestos").replace(/^c:/, "");
      pagos[k] = (pagos[k] || 0) + n(m.montoARS);
      pagado += n(m.montoARS);
    }
    if (m.tipo === "pase" && m.destino === "RESERVA") entro += n(m.montoARS);
    if (m.tipo === "pase" && m.bolsillo === "RESERVA") entro -= n(m.montoARS);
  });
  const proyectos = S.proyectos.filter(p => p.estado !== "cerrado").map(p => ({ proyecto: p, ...reservaProyecto(p) }));
  return { pagos, pagado, reservado: entro, saldo: M.saldoBolsillo("RESERVA").ars, proyectos, aReservar: proyectos.reduce((a, x) => a + x.aReservar, 0) };
}
