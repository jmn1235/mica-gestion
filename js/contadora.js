/* =========================================================
   Planilla para la contadora: todo lo oficial de Magna en pesos,
   para el control de facturación y la declaración de IVA.
   - Compras con factura (A, B o C), con IVA por alícuota y percepciones.
   - Ventas: facturas emitidas (las de contratos en dólares, al tipo
     de cambio de cada factura) y cobros de factura cargados a mano.
   - Retenciones sufridas en los cobros.
   - Sueldos, cargas sociales y tasas.
   - Gastos sin factura (hoja aparte, solo para control interno).
   - Resumen mensual con fórmulas que suman las otras hojas.
   - Planilla completa de Magna (opciones.rc): suma las compras de
     Río Colorado y una hoja de IVA por origen.
   ========================================================= */
import { S } from "./db.js";
import * as M from "./modelo.js";
import * as C from "./certificados.js";
import { nuevoLibro, guardarLibro, hojaTabla, letra, COLOR, FMT } from "./excel.js";
import { mesLabel, fmtFecha, hoyISO } from "./ui.js";

const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const mesTxt = f => String(f || "").slice(0, 7);
/* El mes va como número AAAAMM (se ve AAAA-MM): así las fórmulas del resumen comparan números y no fechas. */
const mesNum = ym => Number(String(ym || "").replace("-", "").slice(0, 6)) || 0;
const mes = f => mesNum(mesTxt(f));
const enRango = (f, desde, hasta) => { const m = mesTxt(f); return m && m >= desde && m <= hasta; };
const FISCAL_TXT = { A: "Factura A", B: "Factura B o C", S: "Sueldo, cargas o tasa", X: "Sin factura" };

export function datosFiscales() {
  const g = (S.config.general || {}).magna || {};
  return { razonSocial: g.razonSocial || "Magna Desarrollos SRL", cuit: g.cuit || "" };
}
/* CUIT siempre como texto con guiones (30-66813329-7): así Excel no lo toma como número. */
export const formatoCuit = v => { const d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v || "").trim(); };
const cuitProveedor = nombre => { const p = S.proveedores.find(x => x.nombre && nombre && x.nombre.toLowerCase() === String(nombre).toLowerCase()); return p ? formatoCuit(p.cuit) : ""; };

/* Número de comprobante comparable: «0053-00009410» y «53-9410» son el mismo. */
const numeroClave = v => {
  const partes = String(v || "").split(/\D+/).filter(Boolean).map(x => String(Number(x)));
  return partes.length ? partes.join("-") : "";
};
const unicos = (filas, k) => Array.from(new Set(filas.map(f => String(f[k] || "").trim()).filter(Boolean)));
const NUM_COMPRA = ["netoGravado", "noGravado", "iva21", "iva105", "iva27", "ivaVarias", "ivaTotal", "otrosTrib", "percIVA", "percIIBB", "percGan", "neto", "total"];

/* Una fila por comprobante: los renglones de una misma factura (mismo tipo, proveedor o CUIT
   y número) se suman. Una factura se carga en varios renglones cuando va a distintos rubros
   o imputaciones; para la contadora es un solo comprobante. Sin número no se puede agrupar. */
export function agruparComprobantes(filas) {
  const grupos = new Map(), sueltas = [];
  filas.forEach(f => {
    const num = numeroClave(f.numero);
    if (!num) { sueltas.push(Object.assign({}, f, { renglones: 1, aviso: "Sin número de comprobante: no se pudo juntar con otros renglones" })); return; }
    const quien = String(f.cuit || "").replace(/\D/g, "") || String(f.proveedor || "").trim().toLowerCase();
    const k = [f.tipo, quien, num].join("|");
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  });
  const juntas = Array.from(grupos.values()).map(rs => {
    if (rs.length === 1) return Object.assign({}, rs[0], { renglones: 1, aviso: "" });
    const o = Object.assign({}, rs[0]);
    NUM_COMPRA.forEach(k => { o[k] = r2(rs.reduce((a, x) => a + n(x[k]), 0)); });
    const fechas = rs.map(x => x.fecha).sort();
    o.fecha = fechas[0]; o.mes = rs.find(x => x.fecha === o.fecha).mes;
    const al = unicos(rs, "alicuota").filter(x => x !== "—");
    o.alicuota = al.length === 1 ? al[0] : al.length ? "Varias" : o.alicuota;
    const conceptos = unicos(rs, "concepto");
    const txt = conceptos.join("; ");
    o.concepto = txt.length > 140 ? txt.slice(0, 137).trimEnd() + "…" : txt;
    ["origen", "asignado", "imputacion", "categoria", "subcategoria", "pagado", "cargado", "aprobado", "notas", "cuit", "proveedor"].forEach(k => { o[k] = unicos(rs, k).join(" · "); });
    o.renglones = rs.length;
    o.aviso = fechas[0] !== fechas[fechas.length - 1] ? "Los renglones tienen fechas distintas: se tomó la primera" : "";
    return o;
  });
  return juntas.concat(sueltas).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)) || String(x.numero).localeCompare(String(y.numero)));
}
const pagadoTxt = m => (m.fueraDeCaja ? `${M.socioNombre(M.quienPagoSinReintegro(m))}, con su plata (sin reintegro)` : m.pagadoPor ? `${M.socioNombre(m.pagadoPor)} (préstamo del socio)` : (S.cuentas.find(c => c.id === (m.cuenta || "c_magna")) || {}).nombre || "Cuenta de Magna");
/* De qué parte de Magna es cada movimiento. */
export function origenDe(bolsillo) {
  if (bolsillo === "RC") return "Río Colorado";
  if (bolsillo === "ESTRUCTURA") return "MICA · Estructura";
  if (bolsillo === "MAGNA") return "Magna (propio)";
  if (bolsillo === "RESERVA") return "Magna · Reserva fiscal";
  const p = M.proyecto(bolsillo);
  return p ? "MICA · " + p.nombre : bolsillo || "";
}

/* Filas de cada hoja (también sirven para probar sin generar el archivo). */
export function armarDatos(desde, hasta, opciones = {}) {
  const gastos = S.movimientos.filter(m => M.esCosto(m) && enRango(m.fecha, desde, hasta)).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const baseGasto = m => ({
    fecha: m.fecha, mes: mes(m.fecha), origen: origenDe(m.bolsillo), proveedor: m.proveedor || "", cuit: cuitProveedor(m.proveedor), concepto: m.concepto || "",
    asignado: M.nombreBolsillo(m.bolsillo), imputacion: M.nombreImputacion(m, 60), categoria: M.nombreCategoria(m.tipoCosto), subcategoria: m.subcategoria || "",
    pagado: pagadoTxt(m), cargado: M.socioNombre(m.creadoPor) || "", aprobado: m.aprobadoPor ? M.socioNombre(m.aprobadoPor) : "", notas: m.notas || ""
  });
  const compras = gastos.filter(m => m.fiscal === "A" || m.fiscal === "B").map(m => {
    const iva = m.fiscal === "A" ? n(m.ivaARS) : 0;
    const a = m.alicuota;
    const ivaEn = x => (iva && (a === x || Number(a) === x) ? r2(iva) : 0);
    const o = Object.assign(baseGasto(m), {
      tipo: FISCAL_TXT[m.fiscal], numero: m.comprobante || "", alicuota: iva ? M.nombreAlicuota(a) : m.fiscal === "A" ? "0%" : "—",
      netoGravado: r2(M.netoGravadoArs(m)), noGravado: r2(M.noGravado(m)), otrosTrib: r2(M.otrosTributos(m)), iva21: ivaEn(21), iva105: ivaEn(10.5), iva27: ivaEn(27), ivaVarias: a === "varias" ? r2(iva) : 0,
      percIVA: r2(m.percIVA), percIIBB: r2(m.percIIBB), percGan: r2(m.percGan)
    });
    // IVA de una alícuota que no está en las columnas (por si acaso): va a "varias" para no perderlo.
    if (iva && !o.iva21 && !o.iva105 && !o.iva27 && !o.ivaVarias) o.ivaVarias = r2(iva);
    o.ivaTotal = r2(o.iva21 + o.iva105 + o.iva27 + o.ivaVarias);
    o.neto = r2(o.netoGravado + o.noGravado);
    o.total = r2(o.netoGravado + o.noGravado + o.ivaTotal + o.otrosTrib + o.percIVA + o.percIIBB + o.percGan);
    return o;
  });
  // Planilla completa: compras de Río Colorado (ya normalizadas, en pesos).
  const rc = (opciones.rc || []).filter(c => enRango(c.fecha, desde, hasta));
  rc.filter(c => c.letra !== "X").forEach(c => {
    const iva = c.letra === "A" ? n(c.iva) : 0;
    const a = c.alicuota;
    const ivaEn = x => (iva && Number(a) === x ? r2(iva) : 0);
    const o = {
      fecha: c.fecha, mes: mes(c.fecha), origen: "Río Colorado", proveedor: c.proveedor || "", cuit: formatoCuit(c.cuit), concepto: c.concepto || "",
      asignado: "Río Colorado", imputacion: c.rubro || "", categoria: c.tipo || "", subcategoria: "", pagado: c.financia ? "Río Colorado · " + c.financia : "Río Colorado",
      cargado: c.cargadoPor || "", aprobado: "", notas: c.notas || "",
      tipo: { A: "Factura A", B: "Factura B", C: "Factura C" }[c.letra] || "Factura", numero: c.numero || "", alicuota: iva ? M.nombreAlicuota(a) : c.letra === "A" ? "0%" : "—",
      netoGravado: r2(c.netoGravado), noGravado: r2(c.noGravado), otrosTrib: r2(c.otrosTrib), iva21: ivaEn(21), iva105: ivaEn(10.5), iva27: ivaEn(27), ivaVarias: 0,
      percIVA: r2(c.percIVA), percIIBB: r2(c.percIIBB), percGan: r2(c.percGan)
    };
    if (iva && !o.iva21 && !o.iva105 && !o.iva27) o.ivaVarias = r2(iva);
    o.ivaTotal = r2(o.iva21 + o.iva105 + o.iva27 + o.ivaVarias);
    o.neto = r2(o.netoGravado + o.noGravado);
    o.total = r2(o.netoGravado + o.noGravado + o.ivaTotal + o.otrosTrib + o.percIVA + o.percIIBB + o.percGan);
    compras.push(o);
  });
  compras.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
  // La hoja de compras va con una fila por comprobante; el detalle por renglón, aparte.
  const comprasDetalle = compras;
  const comprasJuntas = agruparComprobantes(compras);
  const sueldos = gastos.filter(m => m.fiscal === "S").map(m => Object.assign(baseGasto(m), { numero: m.comprobante || "", monto: r2(m.montoARS) }));
  const sinFactura = gastos.filter(m => !m.fiscal || m.fiscal === "X").map(m => Object.assign(baseGasto(m), { monto: r2(m.montoARS) }));
  rc.filter(c => c.letra === "X").forEach(c => sinFactura.push({ fecha: c.fecha, mes: mes(c.fecha), origen: "Río Colorado", proveedor: c.proveedor || "", cuit: c.cuit || "", concepto: c.concepto || "",
    asignado: "Río Colorado", imputacion: c.rubro || "", categoria: c.tipo || "", subcategoria: "", pagado: c.financia ? "Río Colorado · " + c.financia : "Río Colorado", cargado: c.cargadoPor || "", aprobado: "", notas: c.notas || "", monto: r2(c.total) }));
  sinFactura.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));

  // Ventas: facturas emitidas desde Certificados y cobros de factura cargados a mano.
  const ventas = [];
  S.proyectos.forEach(p => C.docsDe(p.id).forEach(c => {
    const f = c.factura || {};
    if (!f.fecha || !enRango(f.fecha, desde, hasta)) return;
    const imp = C.importes(c, p);
    const usd = p.moneda !== "ARS";
    const tc = usd ? n(f.tc) : 1;
    ventas.push({
      fecha: f.fecha, mes: mes(f.fecha), tipo: "Factura A", numero: f.numero || "", cliente: p.cliente || "", cuit: p.cuitCliente || "", proyecto: p.nombre,
      concepto: C.tituloDoc(c) + (c.periodo ? " · " + mesLabel(c.periodo) : ""), moneda: usd ? "USD" : "ARS", netoMon: usd ? r2(imp.neto) : null, tc: usd ? tc : null,
      alicuota: M.nombreAlicuota(imp.alic), neto: r2(imp.neto * tc), iva: r2(imp.iva * tc), total: r2((imp.neto + imp.iva) * tc), origen: "Certificados", aviso: usd && !tc ? "Falta el tipo de cambio de la factura" : ""
    });
  }));
  S.movimientos.filter(m => M.esVenta(m) && !m.certificado && enRango(m.fecha, desde, hasta)).forEach(m => {
    const p = M.proyecto(m.bolsillo) || {};
    const neto = r2(n(m.montoARS) + n(m.retencionesARS) - n(m.ivaARS));
    ventas.push({
      fecha: m.fecha, mes: mes(m.fecha), tipo: "Factura A", numero: m.comprobante || "", cliente: p.cliente || "", cuit: p.cuitCliente || "", proyecto: p.nombre || M.nombreBolsillo(m.bolsillo),
      concepto: m.concepto || M.nombreClase(m.tipo, m.clase), moneda: "ARS", netoMon: null, tc: null, alicuota: m.ivaARS ? M.nombreAlicuota(m.alicuota) : "0%",
      neto, iva: r2(m.ivaARS), total: r2(neto + n(m.ivaARS)), origen: "Cobro cargado a mano", aviso: ""
    });
  });
  ventas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  const retenciones = S.movimientos.filter(m => M.esVenta(m) && enRango(m.fecha, desde, hasta) && (n(m.retGan) || n(m.retIIBB) || n(m.retIVA) || n(m.retOtras)))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).map(m => {
      const p = M.proyecto(m.bolsillo) || {};
      const cert = m.certificado ? S.certificados.find(c => c.id === m.certificado) : null;
      const o = {
        fecha: m.fecha, mes: mes(m.fecha), cliente: p.cliente || "", cuit: p.cuitCliente || "", proyecto: p.nombre || "",
        factura: cert ? ((cert.factura || {}).numero || C.tituloDoc(cert)) : (m.comprobante || m.concepto || ""), cobrado: r2(m.montoARS),
        retGan: r2(m.retGan), retIIBB: r2(m.retIIBB), retIVA: r2(m.retIVA), retOtras: r2(m.retOtras)
      };
      o.total = r2(o.retGan + o.retIIBB + o.retIVA + o.retOtras);
      return o;
    });
  const meses = M.mesesEntre(desde, hasta);
  return { compras: comprasJuntas, comprasDetalle, ventas, retenciones, sueldos, sinFactura, meses, porOrigen: opciones.porOrigen || null };
}

export async function exportarContadora(desde, hasta, usuario, opciones = {}) {
  const d = armarDatos(desde, hasta, opciones);
  const completa = !!opciones.rc;
  const fis = datosFiscales();
  const wb = await nuevoLibro();
  const periodo = desde === hasta ? mesLabel(desde) : `${mesLabel(desde)} a ${mesLabel(hasta)}`;
  const sub = `${fis.cuit ? "CUIT " + formatoCuit(fis.cuit) + " · " : ""}Período: ${periodo} · Montos en pesos · ${completa ? "Todo Magna: obras de MICA, Río Colorado y compras propias · " : ""}Emitida el ${fmtFecha(hoyISO(), true)}${usuario ? " por " + usuario : ""} desde MICA · Gestión`;

  // El resumen va primero pero se completa al final, cuando ya se sabe dónde quedó cada hoja.
  const wsRes = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }], properties: { tabColor: { argb: COLOR.negro } } });

  const colsGasto = [
    { t: "Fecha", k: "fecha", f: "fecha", w: 11 }, { t: "Mes", k: "mes", f: "mes", w: 9 }
  ];
  const colsCompras = [
    ...colsGasto,
    { t: "Comprobante", k: "tipo", f: "texto", w: 13 }, { t: "N° comprobante", k: "numero", f: "texto", w: 17 },
    { t: "Proveedor", k: "proveedor", f: "texto", w: 26 }, { t: "CUIT", k: "cuit", f: "texto", w: 14 }, { t: "Origen", k: "origen", f: "texto", w: 20 }, { t: "Concepto", k: "concepto", f: "texto", w: 30 },
    { t: "Neto gravado", k: "netoGravado", f: "ars", w: 14, total: true }, { t: "No gravado o exento", k: "noGravado", f: "ars", w: 12, total: true },
    { t: "Alícuota", k: "alicuota", f: "texto", w: 9, a: "center" },
    { t: "IVA 21%", k: "iva21", f: "ars", w: 12, total: true }, { t: "IVA 10,5%", k: "iva105", f: "ars", w: 12, total: true }, { t: "IVA 27%", k: "iva27", f: "ars", w: 12, total: true },
    { t: "IVA varias alícuotas", k: "ivaVarias", f: "ars", w: 13, total: true },
    { t: "IVA total", k: "ivaTotal", f: "ars", w: 13, total: true, formula: (r, c, col) => `SUM(${col("iva21")}${r}:${col("ivaVarias")}${r})` },
    { t: "Impuestos internos y otros tributos", k: "otrosTrib", f: "ars", w: 13, total: true },
    { t: "Percepción IVA", k: "percIVA", f: "ars", w: 12, total: true }, { t: "Percepción IIBB", k: "percIIBB", f: "ars", w: 12, total: true }, { t: "Percepción Ganancias", k: "percGan", f: "ars", w: 12, total: true },
    { t: "Total comprobante", k: "total", f: "ars", w: 15, total: true, formula: (r, c, col) => `${col("netoGravado")}${r}+${col("noGravado")}${r}+${col("ivaTotal")}${r}+${col("otrosTrib")}${r}+${col("percIVA")}${r}+${col("percIIBB")}${r}+${col("percGan")}${r}` },
    { t: "Asignado a", k: "asignado", f: "texto", w: 24 }, { t: "Imputación", k: "imputacion", f: "texto", w: 26 }, { t: "Categoría", k: "categoria", f: "texto", w: 16 }, { t: "Subcategoría", k: "subcategoria", f: "texto", w: 22 },
    { t: "Pagado con", k: "pagado", f: "texto", w: 22 }, { t: "Cargado por", k: "cargado", f: "texto", w: 11 }, { t: "Aprobado por", k: "aprobado", f: "texto", w: 11 }, { t: "Notas", k: "notas", f: "texto", w: 30 }
  ];
  // Una fila por comprobante: «Renglones» dice de cuántos renglones cargados sale cada factura.
  const colsJuntas = colsCompras.slice(0, 8).concat([{ t: "Renglones", k: "renglones", f: "entero", w: 9, a: "center" }], colsCompras.slice(8), [{ t: "Observación", k: "aviso", f: "texto", w: 30 }]);
  const hc = hojaTabla(wb, "Compras con factura", colsJuntas, d.compras, { titulo: `${fis.razonSocial} · Compras con factura`, subtitulo: sub, totales: true, congelarCol: 3, notas: [
    "Una fila por comprobante. Si una factura se cargó en varios renglones (por ejemplo, porque fue a varios rubros o imputaciones), acá se suman; el detalle está en la hoja «Compras · detalle».",
    "Neto gravado: total del comprobante menos IVA, percepciones, impuestos internos y lo no gravado. En las facturas B o C el IVA no se discrimina y queda dentro del neto gravado.",
    "Impuestos internos y otros tributos: por ejemplo, el impuesto a los combustibles de las cargas de nafta o gasoil. Son costo, no son IVA ni pago a cuenta.",
    "«Pagado con»: si dice «préstamo del socio», el socio la pagó con su plata y Magna se la debe. Si dice «sin reintegro», la pagó ese socio con su plata y Magna no se la devuelve. En los dos casos la factura es a nombre de Magna.",
    ...(completa ? ["«Origen»: a qué parte de Magna corresponde: cada obra de MICA, MICA · Estructura, Magna (propio) o Río Colorado."] : [])
  ] });
  // Detalle por renglón, como está cargado (para ver a qué rubro o imputación fue cada parte).
  if (d.comprasDetalle.length > d.compras.length) {
    hojaTabla(wb, "Compras · detalle", colsCompras, d.comprasDetalle, { titulo: `${fis.razonSocial} · Compras con factura · detalle por renglón`, subtitulo: sub, totales: true, congelarCol: 3, tabColor: COLOR.grisMedio, notas: [
      "Cada renglón tal como se cargó. Los totales son los mismos que en «Compras con factura»."
    ] });
  }

  const hv = hojaTabla(wb, "Ventas", [
    ...colsGasto,
    { t: "Comprobante", k: "tipo", f: "texto", w: 12 }, { t: "N° factura", k: "numero", f: "texto", w: 17 }, { t: "Cliente", k: "cliente", f: "texto", w: 26 }, { t: "CUIT cliente", k: "cuit", f: "texto", w: 14 },
    { t: "Proyecto", k: "proyecto", f: "texto", w: 20 }, { t: "Concepto", k: "concepto", f: "texto", w: 30 },
    { t: "Moneda", k: "moneda", f: "texto", w: 8 }, { t: "Neto en dólares", k: "netoMon", f: "usd", w: 13 }, { t: "Tipo de cambio de la factura", k: "tc", f: "tc", w: 12 },
    { t: "Alícuota", k: "alicuota", f: "texto", w: 9, a: "center" },
    { t: "Neto en pesos", k: "neto", f: "ars", w: 15, total: true }, { t: "IVA débito", k: "iva", f: "ars", w: 14, total: true },
    { t: "Total en pesos", k: "total", f: "ars", w: 15, total: true, formula: (r, c, col) => `${col("neto")}${r}+${col("iva")}${r}` },
    { t: "Origen", k: "origen", f: "texto", w: 18 }, { t: "Observación", k: "aviso", f: "texto", w: 28 }
  ], d.ventas, { titulo: `${fis.razonSocial} · Ventas (facturas emitidas)`, subtitulo: sub, totales: true, congelarCol: 4, notas: [
    "Las facturas de contratos en dólares se pasan a pesos con el tipo de cambio que figura en cada factura.",
    "Los cobros de facturas emitidas desde Certificados no se repiten acá: la venta se toma por la factura."
  ] });

  const hr = hojaTabla(wb, "Retenciones sufridas", [
    ...colsGasto,
    { t: "Cliente", k: "cliente", f: "texto", w: 26 }, { t: "CUIT cliente", k: "cuit", f: "texto", w: 14 }, { t: "Proyecto", k: "proyecto", f: "texto", w: 20 }, { t: "Factura", k: "factura", f: "texto", w: 18 },
    { t: "Cobrado (neto de retenciones)", k: "cobrado", f: "ars", w: 16, total: true },
    { t: "Ret. Ganancias", k: "retGan", f: "ars", w: 13, total: true }, { t: "Ret. IIBB", k: "retIIBB", f: "ars", w: 13, total: true }, { t: "Ret. IVA", k: "retIVA", f: "ars", w: 13, total: true }, { t: "Otras", k: "retOtras", f: "ars", w: 12, total: true },
    { t: "Total retenido", k: "total", f: "ars", w: 14, total: true, formula: (r, c, col) => `SUM(${col("retGan")}${r}:${col("retOtras")}${r})` }
  ], d.retenciones, { titulo: `${fis.razonSocial} · Retenciones sufridas en los cobros`, subtitulo: sub, totales: true, notas: ["Pedir al cliente los certificados de retención de cada cobro."] });

  const colsSimple = [
    ...colsGasto, { t: "Proveedor o beneficiario", k: "proveedor", f: "texto", w: 26 }, { t: "CUIT", k: "cuit", f: "texto", w: 14 }, { t: "Origen", k: "origen", f: "texto", w: 20 }, { t: "Concepto", k: "concepto", f: "texto", w: 32 },
    { t: "Monto", k: "monto", f: "ars", w: 15, total: true }, { t: "Asignado a", k: "asignado", f: "texto", w: 24 }, { t: "Categoría", k: "categoria", f: "texto", w: 16 }, { t: "Subcategoría", k: "subcategoria", f: "texto", w: 24 },
    { t: "Pagado con", k: "pagado", f: "texto", w: 22 }, { t: "Cargado por", k: "cargado", f: "texto", w: 11 }, { t: "Notas", k: "notas", f: "texto", w: 30 }
  ];
  const hs = hojaTabla(wb, "Sueldos, cargas y tasas", colsSimple.slice(0, 2).concat([{ t: "N° comprobante", k: "numero", f: "texto", w: 16 }], colsSimple.slice(2)), d.sueldos,
    { titulo: `${fis.razonSocial} · Sueldos, cargas sociales y tasas`, subtitulo: sub, totales: true });
  const hx = hojaTabla(wb, "Gastos sin factura", colsSimple, d.sinFactura,
    { titulo: `${fis.razonSocial} · Gastos sin factura (control interno)`, subtitulo: sub, totales: true, tabColor: COLOR.grisMedio, notas: ["No tienen comprobante válido: no computan IVA ni se deducen en Ganancias. Se informan solo para control."] });

  /* ----- Resumen mensual con fórmulas ----- */
  const ref = (h, k) => { const L = h.col(k); return `'${h.ws.name}'!$${L}$${h.primera}:$${L}$${Math.max(h.ultima, h.primera)}`; };
  const refMes = h => ref(h, "mes");
  const sumaMes = (h, k, filas, celdaMes) => ({ formula: `SUMIFS(${ref(h, k)},${refMes(h)},${celdaMes})`, result: r2(filas.reduce((a, o) => a + n(o[k]), 0)) });
  const sumaDos = (h, k1, k2, filas, celdaMes) => ({ formula: `SUMIFS(${ref(h, k1)},${refMes(h)},${celdaMes})+SUMIFS(${ref(h, k2)},${refMes(h)},${celdaMes})`, result: r2(filas.reduce((a, o) => a + n(o[k1]) + n(o[k2]), 0)) });
  wsRes.columns = [{ width: 16 }, ...Array(13).fill({ width: 15 })];
  wsRes.getCell("A1").value = `${fis.razonSocial} · Resumen para la contadora`;
  wsRes.getCell("A1").font = { name: "Arial", size: 14, bold: true };
  wsRes.getCell("A2").value = sub;
  wsRes.getCell("A2").font = { name: "Arial", size: 9, color: { argb: COLOR.gris } };
  const encRes = ["Mes", "Ventas netas", "IVA débito", "Compras netas con factura (sin impuestos internos)", "IVA crédito", "Percepciones de IVA", "Retenciones de IVA", "Saldo de IVA del mes", "Percepciones de IIBB", "Retenciones de IIBB", "Percepciones de Ganancias", "Retenciones de Ganancias", "Sueldos, cargas y tasas", "Gastos sin factura"];
  for (let c = 1; c <= encRes.length; c++) wsRes.getRow(3).getCell(c).border = { top: { style: "medium", color: { argb: COLOR.rojo } } };
  wsRes.getRow(3).height = 6;
  const fe = 4;
  encRes.forEach((t, i) => {
    const cell = wsRes.getRow(fe).getCell(i + 1);
    cell.value = t;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: COLOR.blanco } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i === 7 ? COLOR.negro : COLOR.rojo } };
    cell.alignment = { vertical: "middle", horizontal: i ? "right" : "left", wrapText: true };
  });
  wsRes.getRow(fe).height = 32;
  d.meses.forEach((m, j) => {
    const r = fe + 1 + j;
    const row = wsRes.getRow(r);
    const cm = `$P${r}`;
    const delMes = arr => arr.filter(o => o.mes === mesNum(m));
    const vals = [
      sumaMes(hv, "neto", delMes(d.ventas), cm), sumaMes(hv, "iva", delMes(d.ventas), cm),
      sumaDos(hc, "netoGravado", "noGravado", delMes(d.compras), cm), sumaMes(hc, "ivaTotal", delMes(d.compras), cm),
      sumaMes(hc, "percIVA", delMes(d.compras), cm), sumaMes(hr, "retIVA", delMes(d.retenciones), cm),
      null,
      sumaMes(hc, "percIIBB", delMes(d.compras), cm), sumaMes(hr, "retIIBB", delMes(d.retenciones), cm),
      sumaMes(hc, "percGan", delMes(d.compras), cm), sumaMes(hr, "retGan", delMes(d.retenciones), cm),
      sumaMes(hs, "monto", delMes(d.sueldos), cm), sumaMes(hx, "monto", delMes(d.sinFactura), cm)
    ];
    const saldo = vals[1].result - vals[3].result - vals[4].result - vals[5].result;
    vals[6] = { formula: `C${r}-E${r}-F${r}-G${r}`, result: r2(saldo) };
    vals.forEach((v, i) => { const cell = row.getCell(i + 2); cell.value = v; cell.numFmt = FMT.ars; });
    for (let c = 1; c <= encRes.length; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 9, bold: c === 8 };
      cell.border = { bottom: { style: "thin", color: { argb: COLOR.grisClaro } } };
      if (j % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.fondo } };
    }
    // La A muestra el nombre del mes; la P (oculta) tiene AAAAMM para las fórmulas.
    row.getCell(1).value = mesLabel(m);
    row.getCell(16).value = mesNum(m);
  });
  wsRes.getColumn(16).hidden = true;
  const ft = fe + 1 + d.meses.length;
  const tot = wsRes.getRow(ft);
  tot.getCell(1).value = "Total del período";
  for (let c = 2; c <= encRes.length; c++) {
    const L = letra(c);
    let res = 0;
    for (let r = fe + 1; r < ft; r++) { const v = wsRes.getRow(r).getCell(c).value; res += v && v.result ? v.result : 0; }
    tot.getCell(c).value = { formula: `SUM(${L}${fe + 1}:${L}${ft - 1})`, result: r2(res) };
    tot.getCell(c).numFmt = FMT.ars;
  }
  for (let c = 1; c <= encRes.length; c++) {
    const cell = tot.getCell(c);
    cell.font = { name: "Arial", size: 9, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.grisClaro } };
    cell.border = { top: { style: "thin", color: { argb: COLOR.negro } }, bottom: { style: "thin", color: { argb: COLOR.negro } } };
  }
  const notas = [
    "Todos los montos están en pesos. Las ventas de contratos en dólares se pasan a pesos con el tipo de cambio de cada factura.",
    "Las columnas suman las otras hojas con fórmulas: si se corrige un dato en una hoja, el resumen se actualiza solo.",
    "Saldo de IVA del mes = IVA débito − IVA crédito − percepciones de IVA − retenciones de IVA. Es un saldo técnico: no incluye saldos a favor de meses anteriores.",
    "Las percepciones y retenciones de IIBB y Ganancias son pagos a cuenta de esos impuestos.",
    "Los gastos sin factura se listan aparte solo para control interno: no computan IVA ni se deducen."
  ];
  notas.forEach((t, i) => { const c = wsRes.getRow(ft + 2 + i).getCell(1); c.value = t; c.font = { name: "Arial", size: 8, italic: true, color: { argb: COLOR.gris } }; });
  wsRes.views = [{ state: "frozen", ySplit: fe, xSplit: 1, showGridLines: false }];
  wsRes.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  wsRes.headerFooter = { oddFooter: "&L&8" + fis.razonSocial + " — Resumen&R&8Página &P de &N" };

  /* ----- IVA por origen (solo en la planilla completa de Magna) ----- */
  if (d.porOrigen && d.porOrigen.length) {
    hojaTabla(wb, "IVA por origen", [
      { t: "Mes", k: "mesTxt", f: "texto", w: 11 }, { t: "Origen", k: "origen", f: "texto", w: 26 },
      { t: "IVA débito", k: "debito", f: "ars", w: 15, total: true }, { t: "IVA crédito", k: "credito", f: "ars", w: 15, total: true },
      { t: "Retenciones y percepciones de IVA", k: "ret", f: "ars", w: 15, total: true },
      { t: "Saldo del mes", k: "saldo", f: "ars", w: 15, total: true, formula: (r, c, col) => `${col("debito")}${r}-${col("credito")}${r}-${col("ret")}${r}` },
      { t: "Percepciones y retenciones de IIBB", k: "iibb", f: "ars", w: 15, total: true }, { t: "Percepciones y retenciones de Ganancias", k: "gan", f: "ars", w: 15, total: true }
    ], d.porOrigen, { titulo: `${fis.razonSocial} · IVA por origen`, subtitulo: sub, totales: true, tabColor: COLOR.grisMedio, notas: [
      "Cada fila es una parte de Magna en un mes. La suma de todas es el IVA de Magna: ARCA ve una sola declaración.",
      "Saldo del mes positivo: esa parte generó IVA a pagar. Negativo: aportó crédito fiscal que usaron las otras."
    ] });
  }

  const nombre = `${fis.razonSocial.replace(/[^\wÁÉÍÓÚáéíóúñÑ]+/g, "_")}_contadora_${completa ? "completa_" : ""}${desde}${desde !== hasta ? "_a_" + hasta : ""}.xlsx`;
  await guardarLibro(wb, nombre);
  return { compras: d.compras.length, ventas: d.ventas.length, sueldos: d.sueldos.length, sinFactura: d.sinFactura.length, retenciones: d.retenciones.length };
}
