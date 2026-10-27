/* =========================================================
   Certificados y cobranza: certificados mensuales, factura de
   anticipo, devolución del fondo de reparo, facturas, cobros
   con retenciones y avisos de vencimiento.
   ========================================================= */
import { S, guardar, mandarAPapelera } from "../db.js";
import { app } from "../contexto.js";
import * as M from "../modelo.js";
import * as C from "../certificados.js";
import { cotizacionMEP } from "../mep.js";
import { $, $$, esc, num, fmtMoneda, fmtARS, fmtUSD, fmtPct, fmtCant, fmtMiles, fmtFecha, mesLabel, parseMonto, hoyISO, toast, confirmar2, modal, cerrarModal, cabecera, ICONOS } from "../ui.js";
import { pedirProyecto } from "./comun.js";

let sucio = false;
export const fija = () => sucio;

export function render(el, params) {
  sucio = false;
  if (app.ctx.tipo !== "proyecto" || !M.proyecto(app.ctx.id)) return pedirProyecto(el, "Certificados y cobranza", "Certificados, facturas, cobros y vencimientos de cada proyecto.");
  const p = M.proyecto(app.ctx.id);
  if (params[0] === "nuevo") return formulario(el, p, null, C.TIPOS_DOC[params[1]] ? params[1] : "certificado");
  if (params[0]) {
    const c = S.certificados.find(x => x.id === params[0] && x.proyecto === p.id);
    if (!c) { el.innerHTML = cabecera("", "Documento no encontrado") + `<div class="panel vacio"><b>Ese documento no existe en este proyecto</b><a href="#certificados">Volver a certificados</a></div>`; return; }
    if (params[1] === "editar") return formulario(el, p, c, c.tipo);
    return detalle(el, p, c);
  }
  return lista(el, p);
}

const kpi = (rot, val, sub = "", extra = "") => `<div class="kpi"><div class="kpi-rot">${rot}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}${extra}</div>`;
const etiquetaEstado = e => {
  const s = C.ESTADOS[e.estado];
  return `<span class="tag ${s.clase}">${s.nombre}</span>${e.vencido ? ` <span class="tag tag-alerta">Vencida hace ${e.diasVencido} día${e.diasVencido === 1 ? "" : "s"}</span>` : ""}`;
};
const subDoc = c => c.tipo === "certificado" ? (c.periodo ? mesLabel(c.periodo) : "Sin período") : fmtFecha(c.fecha, true);

/* =================== LISTA =================== */
function lista(el, p) {
  const r = C.resumenCobranza(p);
  const mon = r.moneda;
  const f = v => num(v, x => fmtMoneda(x, mon));
  const tieneAnticipoDoc = r.docs.some(d => d.doc.tipo === "anticipo");
  const acciones = [`<a class="btn btn-pri" href="#certificados/nuevo/certificado">${ICONOS.cargar}Nuevo certificado</a>`];
  if (P_anticipoPendiente(p, r) && !tieneAnticipoDoc) acciones.push(`<a class="btn btn-sec" href="#certificados/nuevo/anticipo">Factura de anticipo</a>`);
  if (r.fondo.saldo > 0.5) acciones.push(`<a class="btn btn-sec" href="#certificados/nuevo/fondo">Devolver fondo de reparo</a>`);
  let h = cabecera(p.codigo || "Proyecto", "Certificados y cobranza", `${esc(p.nombre)} · en ${mon === "ARS" ? "pesos" : "dólares"}`, acciones.join(""));

  r.vencidas.forEach(d => {
    h += `<div class="aviso" role="alert">${ICONOS.alerta}<div><b>${esc(C.tituloDoc(d.doc))} vencido hace ${d.diasVencido} día${d.diasVencido === 1 ? "" : "s"}.</b> Venció el ${fmtFecha(d.vencimiento, true)} y falta cobrar ${fmtMoneda(d.saldo, mon)} con IVA.
      <div style="margin-top:8px"><a class="btn btn-sec btn-chico" href="#certificados/${encodeURIComponent(d.doc.id)}">Ver y registrar cobro</a></div></div></div>`;
  });
  if (r.sinFacturar.length) h += `<div class="aviso aviso-info">${ICONOS.alerta}<div>${r.sinFacturar.length === 1 ? "Hay un documento sin factura" : `Hay ${r.sinFacturar.length} documentos sin factura`}: ${r.sinFacturar.map(d => `<a href="#certificados/${encodeURIComponent(d.doc.id)}">${esc(C.tituloDoc(d.doc))}</a>`).join(", ")}. Cargale el número y la fecha para que corra el plazo de pago.</div></div>`;

  const cobradoNeto = r.docs.reduce((a, d) => a + (d.imp.total ? d.cancelado * d.imp.neto / d.imp.total : 0), 0);
  h += `<div class="grid-kpi">
    ${kpi("Certificado", f(r.certificadoBruto), r.certificadoPct == null ? "" : `${fmtPct(r.certificadoPct, 0)} del contrato`, r.certificadoPct == null ? "" : `<div class="barra-prog" aria-hidden="true"><i style="width:${Math.min(100, r.certificadoPct * 100)}%"></i></div>`)}
    ${kpi("Facturado", f(r.facturadoNeto), "Sin IVA, incluye anticipo")}
    ${kpi("Cobrado", f(cobradoNeto), "Sin IVA, con retenciones")}
    ${kpi("Por cobrar", f(r.porCobrar), r.vencido > 0.5 ? `<span class="neg">${fmtMoneda(r.vencido, mon)} vencido</span>` : "Con IVA · nada vencido")}
  </div>`;

  const a = r.anticipo;
  const amortPct = (a.facturado || a.contrato) > 0 ? a.amortizado / (a.facturado || a.contrato) : 0;
  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Anticipo</h2><p class="panel-sub">${Number(p.anticipoCuotas) > 0 ? `Se amortiza en ${p.anticipoCuotas} certificados iguales.` : "Se amortiza en proporción a cada certificado."} <a href="#ajustes/proyectos/${encodeURIComponent(p.id)}">Cambiar</a></p></div></div>
      ${a.contrato || a.facturado ? `<table class="tabla"><tbody>
        <tr><td>Anticipo del contrato</td><td class="n">${f(a.contrato)}</td></tr>
        <tr><td>Facturado</td><td class="n">${f(a.facturado)}</td></tr>
        <tr><td>Cobrado</td><td class="n">${f(a.cobrado)}</td></tr>
        <tr><td>Amortizado en certificados</td><td class="n">${f(a.amortizado)}<div class="mini-barra"><i style="width:${Math.min(100, amortPct * 100)}%"></i></div></td></tr>
        <tr class="total"><td>Saldo a amortizar</td><td class="n">${f(a.saldo)}</td></tr></tbody></table>` : `<div class="vacio">Este contrato no tiene anticipo.</div>`}</section>
    <section class="panel"><div class="panel-cab"><div><h2>Fondo de reparo y cambio</h2><p class="panel-sub">${P_num(p.fondoReparoPct) ? `Se retiene el ${String(p.fondoReparoPct).replace(".", ",")}% de cada certificado.` : "Este contrato no tiene fondo de reparo."}</p></div></div>
      <table class="tabla"><tbody>
        <tr><td>Fondo de reparo retenido</td><td class="n">${f(r.fondo.retenido)}</td></tr>
        <tr><td>Devuelto</td><td class="n">${f(r.fondo.devuelto)}</td></tr>
        <tr class="total"><td>Saldo a cobrar</td><td class="n">${f(r.fondo.saldo)}</td></tr>
        ${mon === "USD" ? `<tr><td>Diferencia de cambio<small class="mute" style="display:block">Cobros al dólar MEP del día de acreditación contra el dólar de cada factura, sobre el neto.</small></td><td class="n">${num(r.difCambio, fmtUSD)}</td></tr>` : ""}
      </tbody></table></section>
  </div>`;

  const filas = r.docs.slice().reverse().map(d => `<tr class="clic" data-id="${esc(d.doc.id)}">
      <td><b>${esc(C.tituloDoc(d.doc))}</b><small class="mute" style="display:block">${esc(subDoc(d.doc))}</small></td>
      <td class="n ocultar-movil">${f(d.imp.neto)}</td><td class="n ocultar-movil">${f(d.imp.total)}</td>
      <td class="ocultar-movil">${d.facturado ? `${esc((d.doc.factura || {}).numero || "s/n")}<small class="mute" style="display:block">${fmtFecha((d.doc.factura || {}).fecha)}</small>` : '<span class="mute">Sin factura</span>'}</td>
      <td class="ocultar-movil">${d.vencimiento ? fmtFecha(d.vencimiento) : "—"}</td>
      <td class="n">${d.facturado || d.cobros.length ? f(d.saldo) : "—"}</td>
      <td>${etiquetaEstado(d)}</td></tr>`).join("");
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Certificados y facturas</h2><p class="panel-sub">El neto es sin IVA, después de amortizar el anticipo y retener el fondo de reparo. El saldo es lo que falta cobrar, con IVA.</p></div></div>
    ${filas ? `<div class="tabla-env"><table class="tabla"><thead><tr><th>Documento</th><th class="n ocultar-movil">Neto</th><th class="n ocultar-movil">Total con IVA</th><th class="ocultar-movil">Factura</th><th class="ocultar-movil">Vence</th><th class="n">Saldo</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>`
      : `<div class="vacio"><b>Todavía no hay certificados</b>${a.contrato ? "Empezá por la factura de anticipo o por el primer certificado." : "Creá el primer certificado del mes."}</div>`}</section>`;
  el.innerHTML = h;
  $$("tr[data-id]", el).forEach(tr => tr.addEventListener("click", () => app.ir("certificados/" + encodeURIComponent(tr.dataset.id))));
}
const P_num = v => Number(v) || 0;
const P_anticipoPendiente = (p, r) => P_num(p.anticipo) > 0 && r.anticipo.facturado < P_num(p.anticipo) - 0.5;

/* =================== FORMULARIO =================== */
function formulario(el, p, c0, tipo) {
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const fm = v => fmtMoneda(v, mon);
  const items = p.items || [];
  const nuevo = !c0;
  const hoy = hoyISO();
  const mesActual = hoy.slice(0, 7);
  const ant = C.anticipoDe(p, c0 && c0.id);
  const fondo = C.fondoDe(p, c0 && c0.id);
  const c = c0 ? JSON.parse(JSON.stringify(c0)) : {
    proyecto: p.id, tipo, fecha: hoy, alicuotaIVA: p.alicuotaIVA ?? 21, ajustes: [], factura: {},
    numero: tipo === "certificado" ? C.siguienteNumero(p.id) : null,
    periodo: tipo === "certificado" ? mesActual : "",
    items: tipo === "certificado" ? C.sugerirCantidades(p, mesActual) : {},
    monto: tipo === "anticipo" ? Math.max(0, P_num(p.anticipo) - ant.facturado) : tipo === "fondo" ? fondo.saldo : 0
  };
  const titulo = nuevo ? (tipo === "certificado" ? "Nuevo certificado" : tipo === "anticipo" ? "Factura de anticipo" : "Devolución del fondo de reparo") : `Editar ${C.tituloDoc(c).toLowerCase()}`;
  const tieneCobros = c0 && C.cobrosDe(c0.id).length > 0;
  const v = x => (x ? fmtMiles(x) : "");

  const filaItem = it => {
    const prev = C.certificadoAcumulado(p.id, it.id, c.id);
    const q = P_num((c.items || {})[it.id]);
    return `<tr data-it="${esc(it.id)}" data-pu="${P_num(it.precioUnitario)}" data-prev="${prev}" data-cant="${P_num(it.cantidad)}">
      <td class="desc"><b>Ítem ${esc(it.numero)}</b> · <span class="desc-txt">${esc(it.descripcion)}</span><small>${esc(it.unidad || "")} · contratado ${esc(fmtCant(P_num(it.cantidad)))} · certificado antes ${esc(fmtCant(prev))}</small></td>
      <td class="n" style="width:110px"><input class="input n" data-q inputmode="decimal" value="${q ? String(q).replace(".", ",") : ""}" placeholder="0" aria-label="Cantidad a certificar, ítem ${esc(it.numero)}" style="text-align:right"></td>
      <td class="n ocultar-movil">${fm(P_num(it.precioUnitario))}</td><td class="n" data-imp></td></tr>`;
  };
  const filaAjuste = a => `<div class="con-boton fila-ajuste"><input class="input" data-aj-c value="${esc(a.concepto || "")}" placeholder="Concepto (por ejemplo, porción observada del certificado anterior)" aria-label="Concepto del ajuste"><input class="input n" data-aj-m inputmode="decimal" value="${a.monto ? String(a.monto).replace(".", ",") : ""}" placeholder="+ / −" aria-label="Monto del ajuste" style="max-width:150px;text-align:right"><button type="button" class="btn-icono" data-aj-x aria-label="Quitar ajuste">${ICONOS.cerrar}</button></div>`;

  el.innerHTML = cabecera(p.codigo || "Proyecto", titulo, esc(p.nombre)) + `
  <form class="form" id="fc" novalidate style="max-width:980px">
    ${tieneCobros ? `<div class="aviso aviso-info">${ICONOS.alerta}<div>Este documento ya tiene cobros. Si cambiás los importes, el saldo se recalcula con lo cobrado.</div></div>` : ""}
    <section class="panel form">
      <div class="fila">
        ${tipo === "certificado" ? `<div class="campo"><label for="c-num">Certificado N°</label><input id="c-num" type="number" min="1" value="${esc(c.numero)}"></div>
        <div class="campo"><label for="c-per">Período</label><input id="c-per" type="month" value="${esc(c.periodo || "")}" placeholder="AAAA-MM"></div>` : ""}
        <div class="campo"><label for="c-fecha">Fecha de emisión</label><input id="c-fecha" type="date" value="${esc(c.fecha || hoy)}"></div>
        <div class="campo"><label for="c-iva">IVA (%)</label><input id="c-iva" inputmode="decimal" value="${String(c.alicuotaIVA ?? 21).replace(".", ",")}"></div>
      </div>
      ${tipo !== "certificado" ? `<div class="campo"><label for="c-monto">${tipo === "anticipo" ? "Monto del anticipo" : "Fondo de reparo a devolver"}, sin IVA (${mon === "ARS" ? "pesos" : "dólares"})</label><input id="c-monto" class="monto" inputmode="decimal" value="${v(c.monto)}">
        <div class="hint">${tipo === "anticipo" ? `Anticipo del contrato: ${fm(P_num(p.anticipo))}${ant.facturado ? ` · ya facturado ${fm(ant.facturado)}` : ""}` : `Saldo retenido: ${fm(fondo.saldo)}`}</div></div>` : ""}
    </section>

    ${tipo === "certificado" ? `<section class="panel">
      <div class="panel-cab"><div><h2>Avance certificado</h2><p class="panel-sub">Cantidad que se certifica en este período, en la unidad de cada ítem. Se propone el avance físico cargado que falta certificar.</p></div><button type="button" class="btn btn-sec btn-chico" id="c-proponer">Proponer según el avance</button></div>
      ${items.length ? `<div class="tabla-env"><table class="tabla"><thead><tr><th>Ítem</th><th class="n">Cantidad</th><th class="n ocultar-movil">Precio unit.</th><th class="n">Importe</th></tr></thead><tbody>${items.map(filaItem).join("")}</tbody></table></div>`
        : `<div class="vacio">El proyecto no tiene ítems. Cargalos en <a href="#presupuesto">Contrato y presupuesto</a>, o usá un ajuste.</div>`}
      <div class="bloque" style="margin-top:16px"><div class="bloque-tit">Ajustes <span class="mute" style="font-weight:400">(adicionales, porción observada, redeterminaciones)</span></div>
        <div class="form" style="gap:8px" id="c-ajustes">${(c.ajustes || []).map(filaAjuste).join("")}</div>
        <div><button type="button" class="btn btn-sec btn-chico" id="c-aj-add">Agregar ajuste</button></div></div>
    </section>
    <section class="panel form">
      <div class="bloque-tit">Descuentos</div>
      <div class="fila fila-movil-2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="campo"><label for="c-amort">Amortización del anticipo</label><input id="c-amort" inputmode="decimal" value="${c0 ? v(c.amortAnticipo) : ""}"><div class="hint" id="c-amort-hint"></div></div>
        <div class="campo"><label for="c-fondo">Fondo de reparo retenido</label><input id="c-fondo" inputmode="decimal" value="${c0 ? v(c.fondoReparo) : ""}"><div class="hint">${P_num(p.fondoReparoPct) ? `${String(p.fondoReparoPct).replace(".", ",")}% del bruto` : "El contrato no tiene fondo de reparo"}</div></div>
      </div>
    </section>` : ""}

    <section class="panel">
      <div class="bloque-tit" style="margin-bottom:10px">Resumen</div>
      <table class="tabla" id="c-resumen"><tbody></tbody></table>
    </section>

    <section class="panel form">
      <div class="bloque-tit">Factura</div>
      <div class="fila">
        <div class="campo"><label for="c-fnum">N° de factura <span class="opc">(cuando se emita)</span></label><input id="c-fnum" value="${esc((c.factura || {}).numero || "")}" placeholder="0003-00000052"></div>
        <div class="campo"><label for="c-ffecha">Fecha de la factura</label><input id="c-ffecha" type="date" value="${esc((c.factura || {}).fecha || "")}"></div>
        ${mon === "USD" ? `<div class="campo"><label for="c-ftc">Tipo de cambio de la factura</label><input id="c-ftc" inputmode="decimal" value="${v((c.factura || {}).tc)}" placeholder="Pesos por dólar"><div class="hint">El que figura en la factura para convertir a pesos.</div></div>` : ""}
        <div class="campo"><label for="c-fvto">Vencimiento</label><input id="c-fvto" type="date" value="${esc((c.factura || {}).vencimiento || "")}"><div class="hint" id="c-fvto-hint">Se calcula con el plazo de pago de ${P_num(p.plazoPago ?? 15)} días; se puede cambiar.</div></div>
      </div>
      <div class="campo"><label for="c-notas">Notas <span class="opc">(opcional)</span></label><textarea id="c-notas" rows="2">${esc(c.notas || "")}</textarea></div>
      <div class="form-pie">
        <button type="submit" class="btn btn-pri">${nuevo ? "Guardar" : "Guardar cambios"}</button>
        <a class="btn btn-sec" href="#certificados${c0 ? "/" + encodeURIComponent(c0.id) : ""}">Cancelar</a>
      </div>
    </section>
  </form>`;

  const f = $("#fc", el);
  const q = id => $("#c-" + id, f);
  let amortManual = !!c0, fondoManual = !!c0, vtoManual = !!(c0 && (c.factura || {}).vencimiento);
  f.addEventListener("input", () => { sucio = true; });

  const leer = () => {
    const d = Object.assign({}, c);
    d.alicuotaIVA = isNaN(parseMonto(q("iva").value)) ? 21 : parseMonto(q("iva").value);
    d.fecha = q("fecha").value;
    if (tipo === "certificado") {
      d.numero = Number(q("num").value) || null;
      d.periodo = q("per").value.trim();
      d.items = {};
      $$("tr[data-it]", f).forEach(tr => { const x = parseMonto($("[data-q]", tr).value); if (x) d.items[tr.dataset.it] = x; });
      d.precios = {};
      items.forEach(it => { if (d.items[it.id]) d.precios[it.id] = P_num(it.precioUnitario); });
      d.ajustes = $$(".fila-ajuste", f).map(r => ({ concepto: $("[data-aj-c]", r).value.trim(), monto: parseMonto($("[data-aj-m]", r).value) || 0 })).filter(a => a.concepto || a.monto);
      d.amortAnticipo = parseMonto(q("amort").value) || 0;
      d.fondoReparo = parseMonto(q("fondo").value) || 0;
    } else d.monto = parseMonto(q("monto").value) || 0;
    d.factura = { numero: q("fnum").value.trim(), fecha: q("ffecha").value, tc: q("ftc") ? (parseMonto(q("ftc").value) || 0) : 0, vencimiento: q("fvto").value };
    d.notas = q("notas").value.trim();
    return d;
  };

  function recalcular() {
    if (tipo === "certificado") {
      $$("tr[data-it]", f).forEach(tr => {
        const x = parseMonto($("[data-q]", tr).value) || 0;
        const tot = Number(tr.dataset.prev) + x, cant = Number(tr.dataset.cant);
        $("[data-imp]", tr).innerHTML = x ? fm(x * Number(tr.dataset.pu)) + (tot > cant + 0.0001 ? `<small class="neg" style="display:block">Supera lo contratado</small>` : "") : '<span class="mute">—</span>';
      });
      const d0 = leer();
      const bruto = C.importes(Object.assign({}, d0, { amortAnticipo: 0, fondoReparo: 0 }), p).bruto;
      const sug = C.amortizacionSugerida(p, bruto, c.id);
      if (!amortManual) q("amort").value = sug ? fmtMiles(sug) : "";
      q("amort-hint").textContent = ant.facturado || ant.contrato ? `Saldo a amortizar ${fm(ant.saldo)} · sugerido ${fm(sug)}` : "El contrato no tiene anticipo";
      if (!fondoManual) { const fr = bruto * P_num(p.fondoReparoPct) / 100; q("fondo").value = fr ? fmtMiles(Math.round(fr * 100) / 100) : ""; }
    }
    if (!vtoManual && q("ffecha").value) q("fvto").value = C.sumarDias(q("ffecha").value, p.plazoPago ?? 15);
    const d = leer();
    const imp = C.importes(d, p);
    const filas = [];
    if (tipo === "certificado") {
      filas.push(["Avance certificado", imp.itemsMonto]);
      if (imp.ajustes) filas.push(["Ajustes", imp.ajustes]);
      filas.push(["Bruto del certificado", imp.bruto, "sub"]);
      if (imp.amort) filas.push(["Amortización del anticipo", -imp.amort]);
      if (imp.fondo) filas.push(["Fondo de reparo retenido", -imp.fondo]);
    }
    filas.push(["Neto a facturar", imp.neto, "total"]);
    filas.push([`IVA ${String(imp.alic).replace(".", ",")}%`, imp.iva]);
    filas.push(["Total de la factura", imp.total, "total"]);
    $("#c-resumen tbody", f).innerHTML = filas.map(([t, x, cl]) => `<tr${cl ? ` class="${cl}"` : ""}><td>${t}</td><td class="n">${num(x, fm)}</td></tr>`).join("")
      + (imp.totalARS ? `<tr class="sub"><td>En pesos, al tipo de cambio de la factura</td><td class="n">${fmtARS(imp.totalARS)}</td></tr>` : "");
  }

  const enlazarAjuste = r => { $("[data-aj-x]", r).addEventListener("click", () => { r.remove(); sucio = true; recalcular(); }); };
  $$(".fila-ajuste", f).forEach(enlazarAjuste);
  if (q("aj-add")) q("aj-add").addEventListener("click", () => { $("#c-ajustes", f).insertAdjacentHTML("beforeend", filaAjuste({})); const r = $("#c-ajustes", f).lastElementChild; enlazarAjuste(r); $("[data-aj-c]", r).focus(); });
  f.addEventListener("input", e => {
    if (e.target.id === "c-amort") amortManual = true;
    if (e.target.id === "c-fondo") fondoManual = true;
    if (e.target.id === "c-fvto") vtoManual = true;
    recalcular();
  });
  if (q("proponer")) q("proponer").addEventListener("click", () => {
    const per = q("per").value.trim() || mesActual;
    const sug = C.sugerirCantidades(p, per, c.id);
    $$("tr[data-it]", f).forEach(tr => { const x = sug[tr.dataset.it]; $("[data-q]", tr).value = x ? String(x).replace(".", ",") : ""; });
    amortManual = false; fondoManual = false; sucio = true;
    recalcular();
    toast(Object.keys(sug).length ? "Cantidades propuestas según el avance físico" : "No hay avance físico sin certificar hasta ese período");
  });
  $$('[inputmode="decimal"]', f).forEach(i => i.addEventListener("blur", () => { if (i.hasAttribute("data-q") || i.id === "c-iva") return; const x = parseMonto(i.value); if (!isNaN(x) && i.value.trim()) i.value = fmtMiles(x); }));
  f.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault(); });
  recalcular();

  f.addEventListener("submit", e => {
    e.preventDefault();
    const d = leer();
    const imp = C.importes(d, p);
    if (!d.fecha) return toast("Falta la fecha de emisión.", "error");
    if (tipo === "certificado") {
      if (!d.numero) return toast("Poné el número del certificado.", "error");
      if (!/^\d{4}-\d{2}$/.test(d.periodo)) return toast("El período va como AAAA-MM, por ejemplo 2026-09.", "error");
      if (S.certificados.some(x => x.proyecto === p.id && x.tipo === "certificado" && x.id !== d.id && Number(x.numero) === d.numero)) return toast(`Ya existe el certificado N° ${d.numero}.`, "error");
      if (!Object.keys(d.items).length && !d.ajustes.length) return toast("El certificado no tiene cantidades ni ajustes.", "error");
      if (d.amortAnticipo < 0 || d.fondoReparo < 0) return toast("Los descuentos no pueden ser negativos.", "error");
    }
    if (!(imp.neto > 0)) return toast("El neto a facturar tiene que ser mayor que cero.", "error");
    if (d.factura.numero && !d.factura.fecha) return toast("Poné la fecha de la factura.", "error");
    if (mon === "USD" && d.factura.fecha && !(d.factura.tc > 0)) return toast("Cargá el tipo de cambio que figura en la factura.", "error");
    if (d.factura.fecha && !d.factura.vencimiento) d.factura.vencimiento = C.sumarDias(d.factura.fecha, p.plazoPago ?? 15);
    if (nuevo) { d.creadoPor = app.usuario.socio; d.creadoEl = new Date().toISOString(); }
    else d.modificadoPor = app.usuario.socio;
    delete d.demo;
    const g = guardar("certificados", d);
    sucio = false;
    toast(nuevo ? `${C.tituloDoc(g)} guardado` : "Cambios guardados");
    app.ir("certificados/" + encodeURIComponent(g.id));
  });
}

/* =================== DETALLE =================== */
function detalle(el, p, c) {
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const fm = v => num(v, x => fmtMoneda(x, mon));
  const e = C.estadoDe(c, p);
  const imp = e.imp;
  const items = p.items || [];
  const fac = c.factura || {};
  const sub = `${esc(p.nombre)} · ${esc(subDoc(c))} · ${etiquetaEstado(e)}`;
  let h = cabecera(C.TIPOS_DOC[c.tipo], C.tituloDoc(c) + (c.tipo === "certificado" && c.periodo ? " · " + mesLabel(c.periodo) : ""), sub,
    `${e.saldo > 0.005 ? `<button class="btn btn-pri" id="d-cobro">${ICONOS.cargar}Registrar cobro</button>` : ""}<a class="btn btn-sec" href="#certificados/${encodeURIComponent(c.id)}/editar">${ICONOS.editar}Editar</a>`);
  if (e.vencido) h += `<div class="aviso" role="alert">${ICONOS.alerta}<div><b>Vencida hace ${e.diasVencido} día${e.diasVencido === 1 ? "" : "s"}.</b> Venció el ${fmtFecha(e.vencimiento, true)}. Falta cobrar ${fmtMoneda(e.saldo, mon)} con IVA.</div></div>`;
  if (!e.facturado) h += `<div class="aviso aviso-info">${ICONOS.alerta}<div>Todavía no tiene factura. Cuando se emita, cargá el número, la fecha${mon === "USD" ? " y el tipo de cambio" : ""} en <a href="#certificados/${encodeURIComponent(c.id)}/editar">Editar</a> para que corra el plazo de pago.</div></div>`;

  const lineas = [];
  if (c.tipo === "certificado") {
    Object.entries(c.items || {}).forEach(([id, qv]) => {
      const it = items.find(x => x.id === id);
      const pu = it ? P_num(it.precioUnitario) : P_num((c.precios || {})[id]);
      lineas.push(`<tr><td class="desc">${it ? `<b>Ítem ${esc(it.numero)}</b> · <span class="desc-txt">${esc(it.descripcion)}</span>` : "Ítem borrado"}<small>${esc(fmtCant(qv))} ${esc(it ? it.unidad || "" : "")} × ${esc(fmtMoneda(pu, mon))}</small></td><td class="n">${fm(qv * pu)}</td></tr>`);
    });
    (c.ajustes || []).forEach(a => lineas.push(`<tr><td>${esc(a.concepto || "Ajuste")}</td><td class="n">${fm(a.monto)}</td></tr>`));
    lineas.push(`<tr class="sub"><td>Bruto del certificado</td><td class="n">${fm(imp.bruto)}</td></tr>`);
    if (imp.amort) lineas.push(`<tr><td>Amortización del anticipo</td><td class="n">${fm(-imp.amort)}</td></tr>`);
    if (imp.fondo) lineas.push(`<tr><td>Fondo de reparo retenido</td><td class="n">${fm(-imp.fondo)}</td></tr>`);
  } else {
    lineas.push(`<tr><td>${c.tipo === "anticipo" ? "Anticipo financiero" : "Devolución del fondo de reparo"}</td><td class="n">${fm(imp.bruto)}</td></tr>`);
  }
  lineas.push(`<tr class="total"><td>Neto</td><td class="n">${fm(imp.neto)}</td></tr>`);
  lineas.push(`<tr><td>IVA ${String(imp.alic).replace(".", ",")}%</td><td class="n">${fm(imp.iva)}</td></tr>`);
  lineas.push(`<tr class="total"><td>Total</td><td class="n">${fm(imp.total)}</td></tr>`);

  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Detalle</h2><p class="panel-sub">Emitido el ${fmtFecha(c.fecha, true)}${c.creadoPor ? ` por ${esc(M.socioNombre(c.creadoPor))}` : ""}.</p></div></div><div class="tabla-env"><table class="tabla"><tbody>${lineas.join("")}</tbody></table></div>
      ${c.notas ? `<p class="panel-sub" style="margin-top:12px">${esc(c.notas)}</p>` : ""}</section>
    <section class="panel"><div class="panel-cab"><div><h2>Factura y cobranza</h2></div></div>
      <table class="tabla"><tbody>
        <tr><td>Factura</td><td class="n">${e.facturado ? esc(fac.numero || "s/n") : '<span class="mute">Sin factura</span>'}</td></tr>
        <tr><td>Fecha</td><td class="n">${fac.fecha ? fmtFecha(fac.fecha) : "—"}</td></tr>
        ${mon === "USD" ? `<tr><td>Tipo de cambio de la factura</td><td class="n">${fac.tc ? fmtARS(fac.tc, 2) : "—"}</td></tr><tr><td>Total en pesos</td><td class="n">${imp.totalARS ? fmtARS(imp.totalARS) : "—"}</td></tr>` : ""}
        <tr><td>Vencimiento</td><td class="n">${e.vencimiento ? fmtFecha(e.vencimiento) : "—"}</td></tr>
        <tr class="sub"><td>Cobrado (cancela de la factura)</td><td class="n">${fm(e.cancelado)}</td></tr>
        <tr><td>Retenciones sufridas</td><td class="n">${fmtARS(e.retenciones)}</td></tr>
        ${mon === "USD" && e.cobros.length ? `<tr><td>Diferencia de cambio<small class="mute" style="display:block">Al dólar MEP del día de cobro, sobre el neto</small></td><td class="n">${num(e.difCambio, fmtUSD)}</td></tr>` : ""}
        <tr class="total"><td>Saldo a cobrar</td><td class="n">${fm(e.saldo)}</td></tr>
      </tbody></table></section>
  </div>`;

  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Cobros</h2><p class="panel-sub">Cada cobro es un ingreso en el bolsillo del proyecto por lo acreditado en el banco. Las retenciones quedan registradas para la etapa de impuestos.</p></div></div>
    ${e.cobros.length ? `<div class="tabla-env"><table class="tabla"><thead><tr><th>Fecha</th><th class="n">Acreditado</th><th class="n ocultar-movil">Retenciones</th>${mon === "USD" ? `<th class="n ocultar-movil">TC de pago</th>` : ""}<th class="n">Cancela</th><th class="n ocultar-movil">Dólar MEP</th><th></th></tr></thead><tbody>
      ${e.cobros.map(m => `<tr><td>${fmtFecha(m.fecha)}</td><td class="n">${fmtARS(m.montoARS)}</td><td class="n ocultar-movil">${fmtARS(m.retencionesARS || 0)}</td>${mon === "USD" ? `<td class="n ocultar-movil">${m.tcPago ? fmtARS(m.tcPago, 2) : "—"}</td>` : ""}
        <td class="n">${fm(C.cancelaDe(m, mon))}</td><td class="n ocultar-movil">${fmtARS(m.cotizacion, 2)}</td>
        <td class="n" style="white-space:nowrap"><button class="btn-icono" data-ed="${esc(m.id)}" title="Editar cobro" aria-label="Editar cobro">${ICONOS.editar}</button><button class="btn-icono" data-del="${esc(m.id)}" title="Borrar cobro" aria-label="Borrar cobro">${ICONOS.borrar}</button></td></tr>`).join("")}
    </tbody></table></div>` : `<div class="vacio">Todavía no se registraron cobros.</div>`}
    <div class="form-pie" style="margin-top:14px"><a class="btn btn-fant btn-chico" href="#certificados">← Todos los certificados</a>
      ${!e.cobros.length ? `<button class="btn btn-peligro btn-chico der" id="d-borrar">${ICONOS.borrar}Borrar documento</button>` : ""}</div>
  </section>`;
  el.innerHTML = h;
  const bc = $("#d-cobro", el); if (bc) bc.addEventListener("click", () => modalCobro(p, c, null));
  $$("[data-ed]", el).forEach(b => b.addEventListener("click", () => modalCobro(p, c, S.movimientos.find(m => m.id === b.dataset.ed))));
  $$("[data-del]", el).forEach(b => b.addEventListener("click", ev => confirmar2(ev.currentTarget, () => {
    const m = S.movimientos.find(x => x.id === b.dataset.del);
    if (m) { mandarAPapelera("movimientos", m, app.usuario.socio); toast("Cobro enviado a la papelera"); }
  })));
  const bb = $("#d-borrar", el);
  if (bb) bb.addEventListener("click", ev => confirmar2(ev.currentTarget, () => {
    mandarAPapelera("certificados", c, app.usuario.socio);
    toast("Documento enviado a la papelera");
    app.ir("certificados");
  }, "Tocá otra vez para borrar"));
}

/* =================== COBRO =================== */
function modalCobro(p, c, m0) {
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const e = C.estadoDe(c, p);
  const imp = e.imp;
  const fac = c.factura || {};
  const ret = p.retenciones || {};
  const saldoSinEste = m0 ? e.saldo + C.cancelaDe(m0, mon) : e.saldo;
  const v = x => (x ? fmtMiles(Math.round(x * 100) / 100) : "");
  const md = modal(m0 ? "Editar cobro" : "Registrar cobro", `<form class="form" id="fco" novalidate>
    <p class="mute" style="margin:0">${esc(C.tituloDoc(c))} · saldo ${esc(fmtMoneda(saldoSinEste, mon))} con IVA${fac.numero ? ` · factura ${esc(fac.numero)}` : ""}</p>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="co-fecha">Fecha de acreditación</label><input id="co-fecha" type="date" value="${esc(m0 ? m0.fecha : hoyISO())}"></div>
      ${mon === "USD" ? `<div class="campo"><label for="co-tc">Tipo de cambio de pago</label><input id="co-tc" inputmode="decimal" value="${v(m0 ? m0.tcPago : fac.tc)}" placeholder="Pesos por dólar"></div>` : ""}
    </div>
    ${mon === "USD" ? `<p class="hint" style="margin:-6px 0 0">El que usó el cliente para pagar en pesos (en Tres Cruces, divisa vendedor del Banco Nación del día de pago). Con él se calcula cuánto de la factura queda cancelado.</p>` : ""}
    <div class="campo"><label for="co-monto">Acreditado en el banco (pesos)</label><input id="co-monto" class="monto" inputmode="decimal" value="${v(m0 ? m0.montoARS : 0)}"></div>
    <div class="bloque"><div class="bloque-tit">Retenciones sufridas (pesos)</div>
      <div class="fila fila-movil-2" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <div class="campo"><label for="co-gan">Ganancias</label><input id="co-gan" data-ret inputmode="decimal" value="${v(m0 ? m0.retGan : 0)}"></div>
        <div class="campo"><label for="co-iibb">Ingresos Brutos</label><input id="co-iibb" data-ret inputmode="decimal" value="${v(m0 ? m0.retIIBB : 0)}"></div>
        <div class="campo"><label for="co-iva">IVA</label><input id="co-iva" data-ret inputmode="decimal" value="${v(m0 ? m0.retIVA : 0)}"></div>
        <div class="campo"><label for="co-otras">Otras</label><input id="co-otras" data-ret inputmode="decimal" value="${v(m0 ? m0.retOtras : 0)}"></div>
      </div></div>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="co-mep">Dólar MEP del día</label><div class="con-boton"><input id="co-mep" inputmode="decimal" value="${v(m0 ? m0.cotizacion : 0)}"><button type="button" class="btn btn-sec" id="co-buscar" aria-label="Buscar cotización">${ICONOS.restaurar}</button></div><div class="hint" id="co-mep-hint"></div></div>
      <div class="campo campo-ancho-movil"><span class="rotulo">Resultado</span><div class="equiv" id="co-res"><b>—</b><span></span></div></div>
    </div>
    <div class="campo"><label for="co-notas">Notas <span class="opc">(opcional)</span></label><input id="co-notas" value="${esc(m0 ? m0.notas || "" : "")}"></div>
    <div class="form-pie"><button class="btn btn-pri" type="submit">${m0 ? "Guardar cambios" : "Guardar cobro"}</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div>
  </form>`, { ancho: 720 });
  const q = id => $("#co-" + id, md);
  let montoManual = !!m0, retManual = !!m0, mepManual = !!m0, fuente = m0 ? m0.cotizacionFuente || "manual" : "";
  let pedido = 0;

  /* Propuesta: cobrar todo el saldo, con las retenciones habituales del cliente. */
  const proponer = () => {
    const tc = mon === "USD" ? (parseMonto((q("tc") || {}).value) || 0) : 1;
    if (!tc) return;
    const prop = imp.total ? saldoSinEste / imp.total : 0;
    const netoARS = imp.neto * prop * tc, ivaARS = imp.iva * prop * tc;
    if (!retManual) {
      q("gan").value = v(netoARS * P_num(ret.gan) / 100);
      q("iibb").value = v(netoARS * P_num(ret.iibb) / 100);
      q("iva").value = v(ivaARS * P_num(ret.iva) / 100);
    }
    if (!montoManual) {
      const r = $$("[data-ret]", md).reduce((a, i) => a + (parseMonto(i.value) || 0), 0);
      q("monto").value = v(netoARS + ivaARS - r);
    }
  };
  const resultado = () => {
    const acred = parseMonto(q("monto").value) || 0;
    const r = $$("[data-ret]", md).reduce((a, i) => a + (parseMonto(i.value) || 0), 0);
    const tc = mon === "USD" ? (parseMonto(q("tc").value) || 0) : 1;
    const mep = parseMonto(q("mep").value) || 0;
    const box = q("res");
    if (!acred || !tc) { box.querySelector("b").textContent = "—"; box.querySelector("span").textContent = mon === "USD" && !tc ? "Falta el tipo de cambio de pago" : ""; return; }
    const cancela = (acred + r) / tc;
    const queda = Math.max(0, saldoSinEste - cancela);
    box.querySelector("b").textContent = `Cancela ${fmtMoneda(cancela, mon, 2)}`;
    let txt = queda > 0.5 ? `Queda un saldo de ${fmtMoneda(queda, mon)}` : "La factura queda cobrada";
    if (mon === "USD" && mep) {
      const prop = imp.total ? imp.neto / imp.total : 1;
      const dif = ((acred + r) / mep - cancela) * prop;
      txt += ` · al MEP equivale a ${fmtUSD((acred + r) / mep)} (diferencia de cambio ${fmtUSD(dif)} sobre el neto)`;
    }
    box.querySelector("span").textContent = txt;
  };
  const buscarMep = async forzar => {
    if (mepManual && !forzar) return;
    const fecha = q("fecha").value;
    if (!fecha) return;
    const n = ++pedido;
    q("mep-hint").textContent = "Buscando cotización…";
    const r = await cotizacionMEP(fecha);
    if (n !== pedido) return;
    if (r) { q("mep").value = v(r.valor); mepManual = false; fuente = r.aproximada ? "aprox" : "api"; q("mep-hint").textContent = r.aproximada ? "Sin dato para esa fecha: se usó la de hoy." : "MEP venta de esa fecha."; q("mep-hint").className = "hint" + (r.aproximada ? " warn" : ""); }
    else { q("mep-hint").textContent = "No se pudo consultar. Cargala a mano."; q("mep-hint").className = "hint warn"; }
    resultado();
  };

  if (!m0) proponer();
  resultado();
  if (!m0) buscarMep(true); else q("mep-hint").textContent = "Cotización guardada con el cobro.";
  md.addEventListener("input", ev => {
    const id = ev.target.id;
    if (id === "co-monto") montoManual = true;
    if (ev.target.hasAttribute("data-ret")) { retManual = true; if (!montoManual) proponer(); }
    if (id === "co-tc") proponer();
    if (id === "co-mep") { mepManual = true; fuente = "manual"; q("mep-hint").textContent = "Cotización cargada a mano."; q("mep-hint").className = "hint"; }
    resultado();
  });
  q("fecha").addEventListener("change", () => buscarMep(false));
  q("buscar").addEventListener("click", () => buscarMep(true));
  $$('[inputmode="decimal"]', md).forEach(i => i.addEventListener("blur", () => { const x = parseMonto(i.value); if (!isNaN(x) && i.value.trim()) i.value = fmtMiles(x); }));

  $("#fco", md).addEventListener("submit", ev => {
    ev.preventDefault();
    const fecha = q("fecha").value;
    const acred = parseMonto(q("monto").value) || 0;
    const rG = parseMonto(q("gan").value) || 0, rI = parseMonto(q("iibb").value) || 0, rV = parseMonto(q("iva").value) || 0, rO = parseMonto(q("otras").value) || 0;
    const rTot = rG + rI + rV + rO;
    const tc = mon === "USD" ? (parseMonto(q("tc").value) || 0) : 0;
    const mep = parseMonto(q("mep").value) || 0;
    if (!fecha) return toast("Falta la fecha.", "error");
    if (!(acred > 0)) return toast("Cargá lo acreditado en pesos.", "error");
    if (mon === "USD" && !(tc > 0)) return toast("Cargá el tipo de cambio de pago.", "error");
    if (!(mep > 0)) return toast("Falta el dólar MEP del día para congelar el valor.", "error");
    if ([rG, rI, rV, rO].some(x => x < 0)) return toast("Las retenciones no pueden ser negativas.", "error");
    const brutoARS = acred + rTot;
    const ivaARS = imp.total ? brutoARS * imp.iva / imp.total : 0;
    const d = Object.assign({}, m0 || {}, {
      tipo: "ingreso", clase: c.tipo === "anticipo" ? "anticipo" : "cobro", fecha,
      bolsillo: p.id, destino: "", cuenta: (m0 && m0.cuenta) || (S.cuentas[0] || {}).id || "c_magna",
      montoARS: Math.round(acred * 100) / 100, cotizacion: mep, cotizacionFuente: fuente || "manual", montoUSD: Math.round(acred / mep * 100) / 100,
      retGan: rG, retIIBB: rI, retIVA: rV, retOtras: rO, retencionesARS: Math.round(rTot * 100) / 100,
      tcPago: tc || null, ivaARS: Math.round(ivaARS * 100) / 100, alicuota: imp.alic, fiscal: "A",
      certificado: c.id, comprobante: fac.numero || "",
      concepto: C.tituloDoc(c) + (c.tipo === "certificado" && c.periodo ? ` (${mesLabel(c.periodo).toLowerCase()})` : ""),
      notas: q("notas").value.trim()
    });
    if (!m0) { d.creadoPor = app.usuario.socio; d.creadoEl = new Date().toISOString(); }
    else d.modificadoPor = app.usuario.socio;
    delete d.demo;
    guardar("movimientos", d);
    cerrarModal();
    toast(`Cobro guardado · ${fmtARS(acred)}`);
  });
}
