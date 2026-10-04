/* =========================================================
   Certificados, facturas y cobranza.
   Un documento de cobro puede ser:
     - certificado: avance mensual por ítem, con amortización
       del anticipo y retención del fondo de reparo.
     - anticipo: factura del anticipo financiero.
     - fondo: devolución del fondo de reparo retenido.
   Los montos del documento están en la moneda del contrato.
   Los cobros son movimientos de ingreso vinculados al documento
   (campo "certificado"): así un cobro borrado en Movimientos
   deja de contar solo, sin datos duplicados.
   ========================================================= */
import { S } from "./db.js";
import * as M from "./modelo.js";
import { avancesDe, ejecutado } from "./presupuesto.js";

export const TIPOS_DOC = {
  certificado: "Certificado",
  anticipo: "Factura de anticipo",
  fondo: "Devolución del fondo de reparo"
};
export const ESTADOS = {
  emitido: { nombre: "Emitido", clase: "tag-borde" },
  facturado: { nombre: "Facturado", clase: "" },
  parcial: { nombre: "Cobrado parcial", clase: "tag-alerta" },
  cobrado: { nombre: "Cobrado", clase: "tag-ok" }
};

const n = v => Number(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
export const hoy = () => new Date().toISOString().slice(0, 10);

export function sumarDias(iso, dias) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + (Number(dias) || 0));
  return d.toISOString().slice(0, 10);
}
export function diasEntre(desde, hasta) {
  if (!desde || !hasta) return 0;
  return Math.round((new Date(hasta + "T12:00:00") - new Date(desde + "T12:00:00")) / 86400000);
}

export const docsDe = pid => S.certificados.filter(c => c.proyecto === pid)
  .sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")) || n(a.numero) - n(b.numero));
export const cobrosDe = certId => S.movimientos.filter(m => m.tipo === "ingreso" && m.certificado === certId)
  .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

/* Importes del documento, en la moneda del contrato. */
export function importes(c, p) {
  const items = (p && p.items) || [];
  let itemsMonto = 0;
  if (c.tipo === "certificado") {
    Object.entries(c.items || {}).forEach(([id, q]) => {
      const it = items.find(x => x.id === id);
      const pu = it ? n(it.precioUnitario) : n((c.precios || {})[id]);
      itemsMonto += n(q) * pu;
    });
  } else itemsMonto = n(c.monto);
  const ajustes = (c.ajustes || []).reduce((a, x) => a + n(x.monto), 0);
  const bruto = itemsMonto + ajustes;
  const amort = c.tipo === "certificado" ? n(c.amortAnticipo) : 0;
  const fondo = c.tipo === "certificado" ? n(c.fondoReparo) : 0;
  const neto = bruto - amort - fondo;
  const alic = c.alicuotaIVA == null ? 21 : n(c.alicuotaIVA);
  const iva = neto * alic / 100;
  const total = neto + iva;
  const tc = n((c.factura || {}).tc);
  return { itemsMonto: r2(itemsMonto), ajustes: r2(ajustes), bruto: r2(bruto), amort: r2(amort), fondo: r2(fondo), neto: r2(neto), alic, iva: r2(iva), total: r2(total), totalARS: tc ? r2(total * tc) : null };
}

/* Cuánto cancela un cobro de la factura, en la moneda del contrato. */
export function cancelaDe(m, moneda) {
  const bruto = n(m.montoARS) + n(m.retencionesARS);
  if (moneda === "ARS") return bruto;
  const tc = n(m.tcPago) || n(m.cotizacion);
  return tc ? bruto / tc : 0;
}

/* Estado, saldo y vencimiento de un documento. */
export function estadoDe(c, p) {
  const mon = p && p.moneda === "ARS" ? "ARS" : "USD";
  const imp = importes(c, p);
  const cobros = cobrosDe(c.id);
  let cancelado = 0, cobradoARS = 0, retenciones = 0, difCambio = 0, netoCobradoMEP = 0;
  const proporcionNeto = imp.total ? imp.neto / imp.total : 1;
  cobros.forEach(m => {
    const canc = cancelaDe(m, mon);
    cancelado += canc;
    cobradoARS += n(m.montoARS);
    retenciones += n(m.retencionesARS);
    if (mon === "USD" && m.cotizacion > 0) {
      const brutoARS = n(m.montoARS) + n(m.retencionesARS);
      netoCobradoMEP += (brutoARS / m.cotizacion) * proporcionNeto;
      difCambio += (brutoARS / m.cotizacion - canc) * proporcionNeto;
    }
  });
  const saldo = r2(imp.total - cancelado);
  const tolerancia = Math.max(1, imp.total * 0.005);
  const f = c.factura || {};
  const facturado = !!(f.numero || f.fecha);
  let estado = "emitido";
  if (cobros.length && saldo <= tolerancia) estado = "cobrado";
  else if (cobros.length) estado = "parcial";
  else if (facturado) estado = "facturado";
  const venc = f.vencimiento || (f.fecha ? sumarDias(f.fecha, p ? p.plazoPago ?? 15 : 15) : "");
  const vencido = estado !== "cobrado" && facturado && venc && venc < hoy();
  return {
    imp, cobros, cancelado: r2(cancelado), saldo: Math.max(0, saldo), estado, facturado,
    vencimiento: venc, vencido, diasVencido: vencido ? diasEntre(venc, hoy()) : 0,
    cobradoARS, retenciones, difCambio: r2(difCambio), netoCobradoMEP
  };
}

/* Siguiente número de certificado del proyecto. */
export function siguienteNumero(pid) {
  const nums = docsDe(pid).filter(c => c.tipo === "certificado").map(c => n(c.numero));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/* Cantidad ya certificada de un ítem, sin contar un documento. */
export function certificadoAcumulado(pid, itemId, excluirId, hastaPeriodo) {
  return docsDe(pid).filter(c => c.tipo === "certificado" && c.id !== excluirId && (!hastaPeriodo || (c.periodo || "") <= hastaPeriodo))
    .reduce((a, c) => a + n((c.items || {})[itemId]), 0);
}

/* Propuesta de cantidades para un certificado nuevo: avance físico acumulado al período menos lo ya certificado. */
export function sugerirCantidades(p, periodo, excluirId) {
  const av = avancesDe(p.id);
  const out = {};
  (p.items || []).forEach(it => {
    const hecho = ejecutado(av, it.id, periodo);
    const cert = certificadoAcumulado(p.id, it.id, excluirId);
    const q = Math.min(hecho, n(it.cantidad)) - cert;
    if (q > 0.0001) out[it.id] = Math.round(q * 10000) / 10000;
  });
  return out;
}

/* Anticipo: cuánto se facturó, cobró y amortizó. */
export function anticipoDe(p, excluirId) {
  const docs = docsDe(p.id);
  const amortizado = docs.filter(c => c.tipo === "certificado" && c.id !== excluirId).reduce((a, c) => a + n(c.amortAnticipo), 0);
  const fact = docs.filter(c => c.tipo === "anticipo");
  const facturado = fact.reduce((a, c) => a + importes(c, p).neto, 0);
  const cobrado = fact.reduce((a, c) => { const e = estadoDe(c, p); return a + (e.imp.total ? e.cancelado * e.imp.neto / e.imp.total : 0); }, 0);
  const base = n(p.anticipo) || facturado;
  return { contrato: n(p.anticipo), facturado: r2(facturado), cobrado: r2(cobrado), amortizado: r2(amortizado), saldo: r2(Math.max(0, (facturado || base) - amortizado)), base };
}

/* Amortización sugerida para un certificado de cierto bruto. */
export function amortizacionSugerida(p, bruto, excluirId) {
  const a = anticipoDe(p, excluirId);
  const base = a.facturado || a.contrato;
  if (!base || a.saldo <= 0) return 0;
  const cuotas = n(p.anticipoCuotas);
  const contrato = M.montoContrato(p);
  const v = cuotas > 0 ? base / cuotas : (contrato > 0 ? base * bruto / contrato : 0);
  return r2(Math.min(v, a.saldo));
}

/* Fondo de reparo retenido y devuelto. */
export function fondoDe(p, excluirId) {
  const docs = docsDe(p.id);
  const retenido = docs.filter(c => c.tipo === "certificado" && c.id !== excluirId).reduce((a, c) => a + n(c.fondoReparo), 0);
  const devuelto = docs.filter(c => c.tipo === "fondo" && c.id !== excluirId).reduce((a, c) => a + importes(c, p).neto, 0);
  return { retenido: r2(retenido), devuelto: r2(devuelto), saldo: r2(retenido - devuelto) };
}

/* Resumen de cobranza de un proyecto. */
export function resumenCobranza(p) {
  const docs = docsDe(p.id).map(c => ({ doc: c, ...estadoDe(c, p) }));
  const certs = docs.filter(d => d.doc.tipo === "certificado");
  const r = {
    docs, moneda: p.moneda === "ARS" ? "ARS" : "USD",
    certificadoBruto: certs.reduce((a, d) => a + d.imp.bruto, 0),
    facturadoNeto: docs.filter(d => d.facturado).reduce((a, d) => a + d.imp.neto, 0),
    facturadoTotal: docs.filter(d => d.facturado).reduce((a, d) => a + d.imp.total, 0),
    cobradoTotal: docs.reduce((a, d) => a + d.cancelado, 0),
    porCobrar: docs.filter(d => d.facturado).reduce((a, d) => a + d.saldo, 0),
    vencidas: docs.filter(d => d.vencido),
    sinFacturar: docs.filter(d => !d.facturado),
    difCambio: docs.reduce((a, d) => a + d.difCambio, 0),
    anticipo: anticipoDe(p), fondo: fondoDe(p)
  };
  r.vencido = r.vencidas.reduce((a, d) => a + d.saldo, 0);
  const contrato = M.montoContrato(p);
  r.certificadoPct = contrato > 0 ? r.certificadoBruto / contrato : null;
  return r;
}

/* Facturas vencidas de todos los proyectos abiertos (para avisos en el menú y en MICA). */
export function vencidasTodas() {
  const out = [];
  S.proyectos.filter(p => p.estado !== "cerrado").forEach(p => {
    docsDe(p.id).forEach(c => { const e = estadoDe(c, p); if (e.vencido) out.push({ proyecto: p, doc: c, ...e }); });
  });
  return out;
}

export const tituloDoc = c => c.tipo === "certificado" ? `Certificado N° ${c.numero}` : TIPOS_DOC[c.tipo] || "Documento";
