/* =========================================================
   Presupuesto, avance físico, línea base y seguimiento.
   Los montos del presupuesto están en la moneda del contrato
   (dólares o pesos); lo real se compara en esa misma moneda:
   dólares MEP para contratos en dólares, pesos nominales para
   contratos en pesos.
   ========================================================= */
import { S, guardar } from "./db.js";
import * as M from "./modelo.js";

/* Desglose del costo directo unitario cotizado. */
export const PARTES_COSTO = [
  { k: "mat", nombre: "Materiales" },
  { k: "mo", nombre: "Mano de obra" },
  { k: "eq", nombre: "Equipos" },
  { k: "sub", nombre: "Subcontratos" }
];

export const n = v => Number(v) || 0;
export const costoUnit = it => PARTES_COSTO.reduce((a, c) => a + n((it.costo || {})[c.k]), 0);
export const costoItem = it => n(it.cantidad) * costoUnit(it);
export const ventaItem = it => n(it.cantidad) * n(it.precioUnitario);
export const tieneCostos = p => (p.items || []).some(it => costoUnit(it) > 0) || n(p.presupuestoGeneral) > 0;
export const tieneVentanas = p => (p.items || []).some(it => it.desde && it.hasta);

/* Totales cotizados de un juego de ítems. */
export function totales(p, items = p.items || [], general = p.presupuestoGeneral) {
  const t = { venta: 0, costoDirecto: 0, general: n(general), porParte: { mat: 0, mo: 0, eq: 0, sub: 0 } };
  items.forEach(it => {
    t.venta += ventaItem(it);
    t.costoDirecto += costoItem(it);
    PARTES_COSTO.forEach(c => { t.porParte[c.k] += n(it.cantidad) * n((it.costo || {})[c.k]); });
  });
  t.costo = t.costoDirecto + t.general;
  const precio = M.montoContrato(p) || t.venta;
  t.precio = precio;
  t.margen = precio - t.costo;
  t.margenPct = precio > 0 ? t.margen / precio : null;
  return t;
}

/* Proyecto más reciente, modificado y guardado. Evita pisar cambios de otra pantalla. */
export function actualizarProyecto(pid, fn, quien) {
  const actual = M.proyecto(pid);
  if (!actual) return null;
  const p = JSON.parse(JSON.stringify(actual));
  fn(p);
  if (quien) p.modificadoPor = quien;
  return guardar("proyectos", p);
}

/* ---------- avance físico ---------- */
export const idAvance = (pid, mes) => `${pid}__${mes}`;
export const avanceDelMes = (pid, mes) => S.avances.find(a => a.id === idAvance(pid, mes)) || null;

/* { itemId: { "AAAA-MM": cantidad } } */
export function avancesDe(pid) {
  const out = {};
  S.avances.filter(a => a.proyecto === pid).forEach(a => {
    Object.entries(a.cantidades || {}).forEach(([it, q]) => {
      if (!n(q)) return;
      (out[it] = out[it] || {})[a.mes] = n(q);
    });
  });
  return out;
}
export function mesesConAvance(pid) {
  return S.avances.filter(a => a.proyecto === pid && Object.values(a.cantidades || {}).some(q => n(q))).map(a => a.mes).sort();
}
/* Cantidad ejecutada acumulada hasta un mes (inclusive). Sin mes: todo. */
export function ejecutado(av, itemId, hasta) {
  const m = av[itemId] || {};
  return Object.entries(m).reduce((a, [mes, q]) => (!hasta || mes <= hasta ? a + q : a), 0);
}

/* Avance físico global, ponderado por el precio de venta de cada ítem. */
export function avanceGlobal(p, av, hasta) {
  let tot = 0, hecho = 0;
  (p.items || []).forEach(it => {
    const pu = n(it.precioUnitario);
    tot += n(it.cantidad) * pu;
    hecho += Math.min(ejecutado(av, it.id, hasta), n(it.cantidad)) * pu;
  });
  return tot > 0 ? hecho / tot : 0;
}

/* Plan: la cantidad de cada ítem repartida en partes iguales entre los meses de su ventana. */
export function planMensual(items) {
  const plan = {};
  items.forEach(it => {
    if (!it.desde || !it.hasta) return;
    const meses = M.mesesEntre(it.desde, it.hasta);
    if (!meses.length) return;
    const cuota = n(it.cantidad) / meses.length;
    meses.forEach(m => { (plan[m] = plan[m] || {})[it.id] = cuota; });
  });
  return plan;
}
/* Avance planificado acumulado a un mes, ponderado por venta (0 a 1). */
export function planAcumulado(items, hasta) {
  const plan = planMensual(items);
  const total = items.reduce((a, it) => a + ventaItem(it), 0);
  if (!total) return 0;
  let v = 0;
  Object.entries(plan).forEach(([mes, q]) => {
    if (mes > hasta) return;
    Object.entries(q).forEach(([id, c]) => { const it = items.find(x => x.id === id); if (it) v += c * n(it.precioUnitario); });
  });
  return v / total;
}

/* ---------- curva S ---------- */
export function curvaS(p) {
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const base = p.lineaBase ? p.lineaBase.items : (p.items || []);
  const ventaBase = base.reduce((a, it) => a + ventaItem(it), 0);
  const ventaAct = (p.items || []).reduce((a, it) => a + ventaItem(it), 0);
  const costoRef = p.lineaBase ? totales(p, base, p.lineaBase.presupuestoGeneral).costo : totales(p).costo;
  const av = avancesDe(p.id);
  const plan = planMensual(base);

  const planMes = {}, realMes = {}, gastoMes = {};
  Object.entries(plan).forEach(([mes, q]) => {
    Object.entries(q).forEach(([id, c]) => { const it = base.find(x => x.id === id); if (it) planMes[mes] = (planMes[mes] || 0) + c * n(it.precioUnitario); });
  });
  (p.items || []).forEach(it => Object.entries(av[it.id] || {}).forEach(([mes, q]) => { realMes[mes] = (realMes[mes] || 0) + q * n(it.precioUnitario); }));
  S.movimientos.forEach(m => { if (M.esCosto(m) && m.bolsillo === p.id) { const k = M.mesDe(m); gastoMes[k] = (gastoMes[k] || 0) + M.netoEn(m, mon); } });

  const claves = [...Object.keys(planMes), ...Object.keys(realMes), ...Object.keys(gastoMes)].filter(Boolean).sort();
  if (!claves.length) return { meses: [], plan: [], real: [], gasto: [], hayPlan: false, hayReal: false, hayGasto: false };
  const meses = M.mesesEntre(claves[0], claves[claves.length - 1]);
  const ultimoReal = Object.keys(realMes).sort().pop() || "";
  const ultimoGasto = Object.keys(gastoMes).sort().pop() || "";
  let ap = 0, ar = 0, ag = 0;
  const out = { meses, plan: [], real: [], gasto: [], hayPlan: ventaBase > 0 && Object.keys(planMes).length > 0, hayReal: !!ultimoReal, hayGasto: !!ultimoGasto && costoRef > 0, costoRef, mon };
  meses.forEach(mes => {
    ap += planMes[mes] || 0; ar += realMes[mes] || 0; ag += gastoMes[mes] || 0;
    out.plan.push(ventaBase > 0 ? ap / ventaBase : null);
    out.real.push(ventaAct > 0 && ultimoReal && mes <= ultimoReal ? ar / ventaAct : null);
    out.gasto.push(costoRef > 0 && ultimoGasto && mes <= ultimoGasto ? ag / costoRef : null);
  });
  if (!out.hayPlan) out.plan = out.plan.map(() => null);
  return out;
}

/* ---------- seguimiento y proyección de cierre ---------- */
/* Regla de proyección (la misma de Río Colorado): con al menos 5% de avance y costo cargado,
   el costo final se estima como costo real ÷ avance. Si no, se toma lo cotizado. */
function proyectar(cotizado, real, avance) {
  if (avance >= 0.05 && real > 0) {
    return { proyectado: real / Math.min(avance, 1), confianza: avance >= 0.25 ? "alta" : avance >= 0.12 ? "media" : "baja" };
  }
  return { proyectado: Math.max(cotizado, real), confianza: "sin avance" };
}

export function seguimiento(p) {
  const r = M.resumenProyecto(p);
  const mon = r.moneda;
  const av = avancesDe(p.id);
  const items = p.items || [];
  const imp = r.porImputacionMon;

  const filas = items.map(it => {
    const ejec = ejecutado(av, it.id);
    const cant = n(it.cantidad);
    const avance = cant > 0 ? ejec / cant : 0;
    const cot = costoItem(it);
    const real = imp["i:" + it.id] || 0;
    const cuCot = costoUnit(it);
    const cuReal = ejec > 0 && real > 0 ? real / ejec : null;
    return { item: it, ejec, cant, avance, venta: ventaItem(it), cot, real, cuCot, cuReal, ...proyectar(cot, real, avance) };
  });

  // Rubros: suma de sus ítems más lo imputado directo al rubro.
  const nombres = [];
  items.forEach(it => { const k = it.rubro || "Sin rubro"; if (!nombres.includes(k)) nombres.push(k); });
  const rubros = nombres.map(nombre => {
    const fs = filas.filter(f => (f.item.rubro || "Sin rubro") === nombre);
    const cot = fs.reduce((a, f) => a + f.cot, 0);
    const delRubro = nombre === "Sin rubro" ? 0 : (imp["r:" + nombre] || 0);
    const real = fs.reduce((a, f) => a + f.real, 0) + delRubro;
    const pesoCot = fs.reduce((a, f) => a + f.cot, 0);
    const pesoVenta = fs.reduce((a, f) => a + f.venta, 0);
    const avance = pesoCot > 0
      ? fs.reduce((a, f) => a + Math.min(f.avance, 1) * f.cot, 0) / pesoCot
      : pesoVenta > 0 ? fs.reduce((a, f) => a + Math.min(f.avance, 1) * f.venta, 0) / pesoVenta : 0;
    return { nombre, cot, real, delRubro, avance, ...proyectar(cot, real, avance) };
  });

  const avFis = avanceGlobal(p, av);
  const general = (() => {
    const cot = n(p.presupuestoGeneral), real = imp["g"] || 0;
    return { nombre: "Gastos generales de obra", cot, real, avance: avFis, ...proyectar(cot, real, avFis) };
  })();

  // Costos imputados a ítems o rubros que ya no existen: se suman tal cual.
  let otros = 0;
  Object.entries(imp).forEach(([k, v]) => {
    if (k.startsWith("i:") && !items.some(it => "i:" + it.id === k)) otros += v;
    if (k.startsWith("r:") && !nombres.includes(k.slice(2))) otros += v;
    if (k.startsWith("c:")) otros += v;
  });

  const cot = rubros.reduce((a, x) => a + x.cot, 0) + general.cot;
  const real = rubros.reduce((a, x) => a + x.real, 0) + general.real + otros;
  const proyectado = rubros.reduce((a, x) => a + x.proyectado, 0) + general.proyectado + otros;
  const t = totales(p);
  // El plan se compara al mismo mes que el último avance cargado (o al mes actual si no hay avance).
  const mesPlan = mesesConAvance(p.id).pop() || new Date().toISOString().slice(0, 7);
  const base = p.lineaBase ? p.lineaBase.items : items;
  return {
    resumen: r, moneda: mon, filas, rubros, general, otros, avances: av,
    avanceFisico: avFis, planHoy: tieneVentanasEn(base) ? planAcumulado(base, mesPlan) : null, mesPlan,
    costoCotizado: cot, costoReal: real, costoProyectado: proyectado,
    avanceGasto: cot > 0 ? real / cot : null,
    precio: t.precio, margenCotizado: t.precio - cot, margenProyectado: t.precio - proyectado,
    margenCotizadoPct: t.precio > 0 ? (t.precio - cot) / t.precio : null,
    margenProyectadoPct: t.precio > 0 ? (t.precio - proyectado) / t.precio : null,
    hayCostos: cot > 0
  };
}
const tieneVentanasEn = items => items.some(it => it.desde && it.hasta);

/* Si un rubro cambió de nombre en todos sus ítems, los gastos imputados a ese rubro pasan al nombre nuevo. */
export function reimputarRubros(pid, antes, despues, quien) {
  const vigentes = new Set(despues.map(it => it.rubro || ""));
  const mapa = {};
  antes.forEach(a => {
    const r = a.rubro || "";
    if (!r || vigentes.has(r)) return;
    const d = despues.find(x => x.id === a.id);
    if (!d || !d.rubro) return;
    (mapa[r] = mapa[r] || new Set()).add(d.rubro);
  });
  let n = 0;
  Object.entries(mapa).forEach(([viejo, nuevos]) => {
    if (nuevos.size !== 1) return;
    const nuevo = [...nuevos][0];
    S.movimientos.filter(m => m.bolsillo === pid && m.imputacion === "r:" + viejo).forEach(m => {
      guardar("movimientos", Object.assign({}, m, { imputacion: "r:" + nuevo, modificadoPor: quien || m.modificadoPor || "" }));
      n++;
    });
  });
  return n;
}

/* ---------- línea base ---------- */
export function congelar(p, quien) {
  p.lineaBase = {
    fecha: new Date().toISOString(), por: quien || "",
    items: JSON.parse(JSON.stringify(p.items || [])),
    presupuestoGeneral: n(p.presupuestoGeneral),
    montoContrato: M.montoContrato(p)
  };
}

/* Compara ítem por ítem la línea base contra el presupuesto vigente. */
export function compararConBase(p) {
  const lb = p.lineaBase;
  if (!lb) return null;
  const filas = [];
  const vistos = new Set();
  (p.items || []).forEach(it => {
    const b = lb.items.find(x => x.id === it.id);
    vistos.add(it.id);
    if (!b) { filas.push({ estado: "nuevo", item: it, base: null }); return; }
    const cambios = [];
    if (n(b.cantidad) !== n(it.cantidad)) cambios.push("cantidad");
    if (n(b.precioUnitario) !== n(it.precioUnitario)) cambios.push("precio");
    if (Math.abs(costoUnit(b) - costoUnit(it)) > 0.005) cambios.push("costo");
    if ((b.desde || "") !== (it.desde || "") || (b.hasta || "") !== (it.hasta || "")) cambios.push("ventana");
    filas.push({ estado: cambios.length ? "cambiado" : "igual", cambios, item: it, base: b });
  });
  lb.items.forEach(b => { if (!vistos.has(b.id)) filas.push({ estado: "quitado", item: null, base: b }); });
  const tb = totales(p, lb.items, lb.presupuestoGeneral);
  const ta = totales(p);
  return { filas, base: tb, actual: ta, contratoBase: lb.montoContrato, contratoActual: M.montoContrato(p) };
}

/* ---------- importación desde Excel ---------- */
const sinAcentos = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const CAMPOS_IMPORT = [
  { k: "numero", nombre: "N° de ítem", claves: ["item", "nro", "n°", "no.", "codigo", "cod", "#"] },
  { k: "descripcion", nombre: "Descripción", claves: ["descripcion", "designacion", "detalle", "concepto", "tarea", "denominacion"] },
  { k: "rubro", nombre: "Rubro", claves: ["rubro", "grupo", "capitulo", "seccion", "partida"] },
  { k: "unidad", nombre: "Unidad", claves: ["unidad", "unid", "ud", "un."] },
  { k: "cantidad", nombre: "Cantidad", claves: ["cantidad", "cant"] },
  { k: "precioUnitario", nombre: "Precio unitario", claves: ["precio unitario", "p. unitario", "p.unit", "p. unit", "precio unit", "p.u", "unitario"] },
  { k: "mat", nombre: "Costo materiales", claves: ["material"] },
  { k: "mo", nombre: "Costo mano de obra", claves: ["mano de obra", "m.o", "m. de o"] },
  { k: "eq", nombre: "Costo equipos", claves: ["equipo"] },
  { k: "sub", nombre: "Costo subcontratos", claves: ["subcontrat", "terceros"] }
];

/* Busca la fila de encabezados y adivina qué columna es cada campo. */
export function detectarColumnas(filas) {
  let mejor = { fila: 0, puntos: -1, mapa: {} };
  filas.slice(0, 40).forEach((fila, i) => {
    const mapa = {};
    let puntos = 0;
    fila.forEach((celda, c) => {
      const t = sinAcentos(celda);
      if (!t || t.length > 60) return;
      CAMPOS_IMPORT.forEach(campo => {
        if (mapa[campo.k] != null) return;
        if (campo.claves.some(k => t === k || t.startsWith(k) || (k.length > 4 && t.includes(k)))) {
          // "Precio unitario" no debe tomarse como cantidad ni como subtotal.
          if (campo.k === "precioUnitario" && /total|subtotal/.test(t)) return;
          if (campo.k === "cantidad" && /precio/.test(t)) return;
          mapa[campo.k] = c; puntos++;
        }
      });
    });
    if (puntos > mejor.puntos) mejor = { fila: i, puntos, mapa };
  });
  return mejor;
}

/* Convierte las filas de la planilla en ítems según el mapa de columnas. */
export function leerItemsPlanilla(filas, filaEnc, mapa, costosTotales) {
  const num = v => {
    if (typeof v === "number") return v;
    const t = String(v || "").replace(/[^\d,.\-]/g, "");
    if (!t) return NaN;
    let x = t;
    if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
    else { const pp = x.split("."); if (pp.length > 2 || (pp.length === 2 && pp[1].length === 3)) x = pp.join(""); }
    return parseFloat(x);
  };
  const val = (fila, k) => (mapa[k] != null && mapa[k] !== "" ? fila[mapa[k]] : "");
  const out = [];
  let rubroActual = "";
  filas.slice(filaEnc + 1).forEach(fila => {
    const desc = String(val(fila, "descripcion") || "").trim();
    if (!desc) return;
    const cant = num(val(fila, "cantidad"));
    const pu = num(val(fila, "precioUnitario"));
    const esTitulo = !(cant > 0) && !(pu > 0);
    if (/^total|^subtotal/i.test(sinAcentos(desc))) return;
    if (esTitulo) { if (mapa.rubro == null || mapa.rubro === "") rubroActual = desc; return; }
    const c = isFinite(cant) && cant > 0 ? cant : 1;
    const costo = {};
    PARTES_COSTO.forEach(pc => {
      const v = num(val(fila, pc.k));
      if (isFinite(v) && v) costo[pc.k] = costosTotales ? v / c : v;
    });
    out.push({
      numero: String(val(fila, "numero") || "").trim() || String(out.length + 1),
      descripcion: desc,
      rubro: String(val(fila, "rubro") || "").trim() || rubroActual,
      unidad: String(val(fila, "unidad") || "").trim(),
      cantidad: c,
      precioUnitario: isFinite(pu) ? pu : 0,
      costo
    });
  });
  return out;
}
