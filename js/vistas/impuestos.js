/* =========================================================
   Impuestos: IVA, Ingresos Brutos, impuesto al cheque y
   Ganancias estimada; los tres resultados de cada proyecto;
   retenciones sufridas y reserva fiscal.
   ========================================================= */
import { S, guardar } from "../db.js";
import { app } from "../contexto.js";
import * as M from "../modelo.js";
import * as I from "../impuestos.js";
import * as PER from "../permisos.js";
import { cotizacionMEP } from "../mep.js";
import { $, $$, esc, num, fmtUSD, fmtARS, fmtPct, fmtMiles, parseMonto, hoyISO, mesLabel, toast, cabecera, ICONOS } from "../ui.js";

const kpi = (rot, val, sub = "") => `<div class="kpi"><div class="kpi-rot">${rot}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
const u = v => num(v, fmtUSD);
const a = v => num(v, fmtARS);

export function render(el) {
  const ctx = app.ctx;
  if (ctx.tipo === "proyecto" && M.proyecto(ctx.id)) return vistaProyecto(el, M.proyecto(ctx.id));
  if (ctx.tipo === "magna") return vistaMagna(el);
  return vistaMica(el);
}

function avisoParametros() {
  const t = M.parametrosImpuestos();
  return !t.iibb ? `<div class="aviso aviso-info">${ICONOS.alerta}<div>La alícuota de <b>Ingresos Brutos</b> está en 0%. Cargala en <a href="#ajustes/impuestos">Ajustes → Impuestos e IA</a>. Conviene validar todas las tasas con la contadora: son estimaciones, no la liquidación.</div></div>` : "";
}

/* Cómo se calcula Ganancias en un proyecto, en palabras. */
export function textoGanancias(x) {
  const g = x.ganancias || {};
  if (g.modo === "monto") return `monto fijo de ${fmtARS(g.montoArs)}`;
  return `${String(g.pct).replace(".", ",")}% efectivo del resultado impositivo${g.propia ? ", propio del proyecto" : ""}`;
}

/* De dónde sale Ganancias: el resultado impositivo y lo que no se deduce. */
export function tablaBaseGanancias(r) {
  const b = I.baseGanancias(r);
  const cls = t => (t === "sub" ? ' class="sub"' : t === "total" ? ' class="total"' : "");
  return `<table class="tabla tabla-compacta tabla-ganancias"><tbody>
    ${b.filas.map(f => `<tr${cls(f.tipo)}><td>${f.tipo ? `<b>${esc(f.t)}</b>` : esc(f.t)}</td><td class="n">${u(f.usd)}</td></tr>`).join("")}
  </tbody></table>
  ${b.noDeducen.length ? `<p class="panel-sub" style="margin-top:10px"><b>No se deducen</b> (criterio prudente): ${b.noDeducen.map(f => `${esc(f.t.toLowerCase())} ${esc(fmtUSD(f.usd))}`).join(", ")}. Por eso Ganancias suma unos ${esc(fmtUSD(b.extraUsd))} más que si se dedujeran.</p>` : ""}`;
}

/* Cada impuesto: lo estimado, lo ya pagado a cuenta (retenciones, percepciones, cheque computable) y lo que falta. */
export function tablaPagosACuenta(r, mep) {
  const x = r.impuestos;
  const iva = I.ivaProyecto(r.proyecto);
  const fila = (nombre, est, pagado, falta, nota) => `<tr><td>${nombre}${nota ? `<small class="mute" style="display:block">${nota}</small>` : ""}</td><td class="n">${u(est)}</td><td class="n">${u(-pagado)}</td><td class="n"><b>${falta < -0.5 ? `<span class="tag tag-ok">a favor ${esc(fmtUSD(-falta))}</span>` : u(falta)}</b></td></tr>`;
  const ivaUsd = v => (mep > 0 ? v / mep : 0);
  return `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Impuesto</th><th class="n">Estimado</th><th class="n">Ya pagado a cuenta</th><th class="n">Falta pagar</th></tr></thead><tbody>
    ${fila("Ingresos Brutos", x.iibbUsd, x.iibbRetenidoUsd, x.iibbAPagarUsd, "Retenciones y percepciones")}
    ${fila("Ganancias", x.gananciasCostoUsd, x.retGanUsd + x.percGanUsd, x.gananciasAPagarUsd, "Retenciones y percepciones")}
    ${fila("Impuesto al cheque", x.chequeUsd, 0, x.chequeUsd, "Lo debita el banco: va como gasto de la Reserva fiscal")}
    ${fila("IVA", ivaUsd(iva.debito), ivaUsd(iva.credito + iva.ret), ivaUsd(iva.saldo), "No es costo")}
  </tbody></table></div>
  <p class="panel-sub" style="margin-top:8px">Lo retenido ya es impuesto pagado: por eso no se descuenta del resultado (se contaría dos veces), pero sí baja lo que falta pagar y lo que hay que reservar. En Ganancias, lo estimado ya tiene descontada la parte del impuesto al cheque que se computa a cuenta. El IVA estimado es el débito; lo pagado a cuenta, el crédito, las retenciones y las percepciones.${mep > 0 ? ` IVA pasado a dólares a ${esc(fmtARS(mep, 2))}.` : ""}</p>`;
}

function tablaResultados(r) {
  const x = r.impuestos;
  return `<table class="tabla tabla-compacta"><tbody>
    <tr><td>Cobrado, neto de IVA</td><td class="n">${u(r.ventasUsd)}</td></tr>
    <tr><td>Costos</td><td class="n">${u(-r.costosUsd)}</td></tr>
    ${r.honorariosUsd || r.interesesUsd ? `<tr><td>Honorarios e intereses</td><td class="n">${u(-(r.honorariosUsd + r.interesesUsd - r.interesesGanadosUsd))}</td></tr>` : ""}
    <tr class="sub"><td><b>Resultado antes de impuestos</b></td><td class="n"><b>${u(r.resultadoUsd)}</b></td></tr>
    <tr><td>Ingresos Brutos (${String(x.param.iibb).replace(".", ",")}%)</td><td class="n">${u(-x.iibbUsd)}</td></tr>
    <tr><td>Impuesto al cheque</td><td class="n">${u(-x.chequeUsd)}</td></tr>
    <tr class="sub"><td><b>Después de IIBB y cheque</b></td><td class="n"><b>${u(r.resultadoDespuesIIBBUsd)}</b></td></tr>
    <tr><td>Ganancias (${esc(textoGanancias(x))}, menos la parte computable del cheque)</td><td class="n">${u(-x.gananciasCostoUsd)}</td></tr>
    <tr class="total"><td>Neto para repartir</td><td class="n">${u(r.resultadoNetoUsd)}</td></tr>
  </tbody></table>`;
}

/* =================== PROYECTO =================== */
function vistaProyecto(el, p) {
  const r = M.resumenProyecto(p);
  const x = r.impuestos;
  const res = I.reservaProyecto(p, r);
  const iva = res.iva;
  let h = cabecera(p.codigo || "Proyecto", "Impuestos", `${esc(p.nombre)} · estimación de lo que genera el proyecto en Magna`,
    res.pendiente > 1 ? `<a class="btn btn-pri" href="#cargar/nuevo/pase/reserva/${Math.round(res.pendiente)}">${ICONOS.cargar}Reservar ${esc(fmtARS(res.pendiente))}</a>` : "");
  h += avisoParametros();
  h += `<div class="grid-kpi">
    ${kpi("IVA a pagar", a(iva.saldo), iva.saldo < 0 ? "Saldo a favor" : "Débito − crédito − retenciones")}
    ${kpi("Ingresos Brutos", u(x.iibbUsd), `Quedan por pagar ${fmtARS(x.iibbAPagarArs)}`)}
    ${kpi("Impuesto al cheque", u(x.chequeUsd), `${fmtARS(x.chequeArs)} en pesos`)}
    ${kpi("Ganancias estimada", u(x.gananciasCostoUsd), x.gananciasAPagarUsd < -0.5 ? `Saldo a favor ${fmtUSD(-x.gananciasAPagarUsd)}` : `Quedan por pagar ${fmtUSD(x.gananciasAPagarUsd)}`)}
  </div>`;
  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Estimado, pagado a cuenta y falta pagar</h2><p class="panel-sub">En dólares MEP.</p></div></div>${tablaPagosACuenta(r, res.mep)}</section>
    ${panelGanancias(p, x)}
  </div>`;
  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Tres resultados</h2><p class="panel-sub">En dólares MEP. El neto es lo que pueden repartir los socios, antes de la parte de estructura.</p></div></div>
      ${tablaResultados(r)}
      <h3 class="sub-tit">De dónde sale Ganancias</h3>
      ${tablaBaseGanancias(r)}</section>
    <section class="panel"><div class="panel-cab"><div><h2>Reserva fiscal</h2><p class="panel-sub">Lo que el proyecto tendría que haber pasado a Magna · Reserva fiscal, en pesos.</p></div></div>
      <table class="tabla tabla-compacta"><tbody>
        ${res.conceptos.map(c => `<tr><td>${c.nombre}</td><td class="n">${a(c.ars)}</td></tr>`).join("")}
        <tr class="sub"><td><b>A reservar</b></td><td class="n"><b>${a(res.aReservar)}</b></td></tr>
        <tr><td>Ya reservado</td><td class="n">${a(-res.reservado)}</td></tr>
        <tr class="total"><td>${res.pendiente >= 0 ? "Falta reservar" : "Reservado de más"}</td><td class="n">${a(Math.abs(res.pendiente))}</td></tr>
      </tbody></table>
      <p class="panel-sub" style="margin-top:10px">Ganancias se pasa a pesos al último dólar MEP cargado (${res.mep ? fmtARS(res.mep, 2) : "—"}). Los pagos de impuestos se cargan como gastos de Magna · Reserva fiscal.</p></section>
  </div>`;
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>IVA por mes</h2><p class="panel-sub">En pesos. El débito sale de cada factura emitida (al tipo de cambio de la factura); el crédito, de las compras con Factura A. Retenciones incluye las percepciones de IVA de las compras.</p></div></div>
    ${iva.meses.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Mes</th><th class="n">Débito</th><th class="n">Crédito</th><th class="n ocultar-movil">Retenciones</th><th class="n">Saldo</th></tr></thead><tbody>
      ${iva.meses.map(m => `<tr><td>${esc(mesLabel(m.mes))}</td><td class="n">${a(m.debito)}</td><td class="n">${a(-m.credito)}</td><td class="n ocultar-movil">${a(-m.ret)}</td><td class="n"><b>${a(m.saldo)}</b></td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="n">${a(iva.debito)}</td><td class="n">${a(-iva.credito)}</td><td class="n ocultar-movil">${a(-iva.ret)}</td><td class="n">${a(iva.saldo)}</td></tr>
    </tbody></table></div>` : `<div class="vacio">Todavía no hay facturas ni compras con IVA.</div>`}</section>`;
  const percTot = x.percGanArs + x.percIibbArs + x.percIvaArs;
  h += `<section class="panel"><div class="panel-cab"><div><h2>Retenciones y percepciones sufridas</h2><p class="panel-sub">Retenciones: las que hizo el cliente en cada cobro. Percepciones: las que vinieron en las facturas de compra. Son pagos a cuenta del impuesto: bajan lo que queda por pagar.</p></div></div>
    <table class="tabla tabla-compacta"><thead><tr><th></th><th class="n">Retenciones</th>${percTot ? `<th class="n">Percepciones</th>` : ""}</tr></thead><tbody>
      <tr><td>Ganancias</td><td class="n">${a(x.retGanArs)}</td>${percTot ? `<td class="n">${a(x.percGanArs)}</td>` : ""}</tr>
      <tr><td>Ingresos Brutos</td><td class="n">${a(x.retIibbArs)}</td>${percTot ? `<td class="n">${a(x.percIibbArs)}</td>` : ""}</tr>
      <tr><td>IVA</td><td class="n">${a(x.retIvaArs)}</td>${percTot ? `<td class="n">${a(x.percIvaArs)}</td>` : ""}</tr>
      ${x.retOtrasArs ? `<tr><td>Otras</td><td class="n">${a(x.retOtrasArs)}</td>${percTot ? `<td class="n">—</td>` : ""}</tr>` : ""}
      <tr class="total"><td>Total</td><td class="n">${a(x.retGanArs + x.retIibbArs + x.retIvaArs + x.retOtrasArs)}</td>${percTot ? `<td class="n">${a(percTot)}</td>` : ""}</tr>
    </tbody></table></section>`;
  el.innerHTML = h;
  enlazarGanancias(el, p);
}

/* ----- Ganancias del proyecto: general, % propio o monto fijo ----- */
function panelGanancias(p, x) {
  const g = M.gananciasDe(p);
  const modo = !g.propia ? "general" : g.modo;
  const admin = PER.esAdmin();
  const gen = String(M.tasaGananciasGeneral()).replace(".", ",");
  return `<section class="panel"><div class="panel-cab"><div><h2>Ganancias de este proyecto</h2><p class="panel-sub">Ganancias se determina por año para toda Magna. Acá se estima la parte del proyecto: hoy, ${esc(textoGanancias(x))}.</p></div></div>
    <form class="form" id="fgan" novalidate>
      <div class="seg seg-chico" id="g-modo" role="radiogroup" aria-label="Cómo se calcula">
        <button type="button" data-m="general"${modo === "general" ? ' class="activo"' : ""}>General (${gen}%)</button>
        <button type="button" data-m="pct"${modo === "pct" ? ' class="activo"' : ""}>% propio</button>
        <button type="button" data-m="monto"${modo === "monto" ? ' class="activo"' : ""}>Monto fijo</button>
      </div>
      <div class="campo" data-gm="pct"><label for="g-pct">Tasa efectiva del proyecto (% del resultado impositivo)</label><input id="g-pct" inputmode="decimal" value="${g.modo === "pct" && g.propia ? String(g.pct).replace(".", ",") : ""}" placeholder="${gen}"></div>
      <div class="campo" data-gm="monto"><label for="g-monto">Ganancias del proyecto, en pesos</label><input id="g-monto" inputmode="decimal" value="${g.modo === "monto" ? fmtMiles(g.montoArs) : ""}" placeholder="Lo que indique la contadora"><div class="hint">Se pasa a dólares al último MEP cargado (${esc(fmtARS(M.ultimaCotizacion(p.id), 2))}).</div></div>
      <p class="hint" style="margin:0">El resultado impositivo del proyecto es ${esc(fmtUSD(x.baseGananciasUsd))}. Lo ya retenido o percibido se descuenta de lo que falta pagar.</p>
      ${admin ? `<div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button></div>` : `<p class="hint" style="margin:0">Lo cambia Julio.</p>`}
    </form></section>`;
}
function enlazarGanancias(el, p) {
  const f = $("#fgan", el);
  if (!f) return;
  let modo = $("#g-modo .activo", f) ? $("#g-modo .activo", f).dataset.m : "general";
  const pintar = () => {
    $$("#g-modo button", f).forEach(b => b.classList.toggle("activo", b.dataset.m === modo));
    $$("[data-gm]", f).forEach(n => { n.hidden = n.dataset.gm !== modo; });
  };
  $$("#g-modo button", f).forEach(b => b.addEventListener("click", () => { if (!PER.esAdmin()) return; modo = b.dataset.m; pintar(); }));
  pintar();
  if (!PER.esAdmin()) $$("input", f).forEach(i => { i.disabled = true; });
  f.addEventListener("submit", e => {
    e.preventDefault();
    let ge = null;
    if (modo === "pct") {
      const v = parseMonto($("#g-pct", f).value);
      if (isNaN(v) || v < 0 || v > 100) return toast("Poné un porcentaje entre 0 y 100.", "error");
      ge = { modo: "pct", pct: v };
    } else if (modo === "monto") {
      const v = parseMonto($("#g-monto", f).value);
      if (isNaN(v) || v < 0) return toast("Poné el monto en pesos.", "error");
      ge = { modo: "monto", montoArs: v, mep: M.ultimaCotizacion(p.id), fijadoEl: hoyISO() };
    }
    const actual = M.proyecto(p.id);
    guardar("proyectos", Object.assign({}, actual, { gananciasEfectiva: ge, modificadoPor: app.usuario.socio }));
    toast(ge ? "Ganancias del proyecto guardada" : "El proyecto usa la tasa general");
  });
}

/* =================== MICA =================== */
function vistaMica(el) {
  const mica = M.resumenMica();
  const ps = mica.proyectos;
  const tot = k => ps.reduce((s, r) => s + k(r), 0);
  let h = cabecera("Vista general", "Impuestos de MICA", "Lo que generan todos los proyectos, en dólares MEP.");
  h += avisoParametros();
  h += `<div class="grid-kpi">
    ${kpi("Ingresos Brutos", u(tot(r => r.impuestos.iibbUsd)))}
    ${kpi("Impuesto al cheque", u(tot(r => r.impuestos.chequeUsd)))}
    ${kpi("Ganancias estimada", u(tot(r => r.impuestos.gananciasCostoUsd)), "Por proyecto, antes de deducir estructura")}
    ${kpi("Neto para repartir", u(mica.resultadoNetoUsd), "Proyectos menos estructura, después de impuestos")}
  </div>`;
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Tres resultados por proyecto</h2><p class="panel-sub">Antes de impuestos, después de IIBB y cheque, y neto de Ganancias.</p></div></div>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Proyecto</th><th class="n">Antes</th><th class="n ocultar-movil">IIBB y cheque</th><th class="n ocultar-movil">Ganancias</th><th class="n">Neto</th></tr></thead><tbody>
    ${ps.map(r => `<tr class="clic" data-p="${esc(r.proyecto.id)}"><td>${esc(r.proyecto.nombre)}</td><td class="n">${u(r.resultadoUsd)}</td><td class="n ocultar-movil">${u(-(r.impuestos.iibbUsd + r.impuestos.chequeUsd))}</td><td class="n ocultar-movil">${u(-r.impuestos.gananciasCostoUsd)}</td><td class="n"><b>${u(r.resultadoNetoUsd)}</b></td></tr>`).join("")}
    <tr class="total"><td>Total proyectos</td><td class="n">${u(tot(r => r.resultadoUsd))}</td><td class="n ocultar-movil">${u(-tot(r => r.impuestos.iibbUsd + r.impuestos.chequeUsd))}</td><td class="n ocultar-movil">${u(-tot(r => r.impuestos.gananciasCostoUsd))}</td><td class="n">${u(tot(r => r.resultadoNetoUsd))}</td></tr>
    </tbody></table></div>
    <p class="panel-sub" style="margin-top:10px">La estructura y los gastos de Magna (${fmtUSD(mica.aRepartir)}) bajan el resultado y también la Ganancias: en el neto de MICA se descuentan netos de ese impuesto.</p></section>`;
  el.innerHTML = h;
  $$("tr[data-p]", el).forEach(tr => tr.addEventListener("click", () => {
    app.ctx = { tipo: "proyecto", id: tr.dataset.p }; try { localStorage.setItem("mica_ctx", "p:" + tr.dataset.p); } catch (e) { /* nada */ }
    $$(".sel-ctx").forEach(s => { s.value = "p:" + tr.dataset.p; });
    app.refrescar();
  }));
}

/* =================== MAGNA =================== */
function vistaMagna(el) {
  const rm = I.reservaMagna();
  const iva = I.ivaMagna();
  let h = cabecera("Razón social", "Impuestos de Magna", "Reserva fiscal y posición de IVA de toda la razón social, en pesos.",
    `<a class="btn btn-pri" href="#cargar/nuevo/egreso/gasto/RESERVA">${ICONOS.cargar}Cargar pago de impuesto</a>`);
  h += avisoParametros();
  h += `<div class="grid-kpi">
    ${kpi("Saldo de la reserva fiscal", a(rm.saldo), "Bolsillo Magna · Reserva fiscal")}
    ${kpi("Reservado", a(rm.reservado), "Pases desde los proyectos")}
    ${kpi("Pagado", a(rm.pagado), "Gastos de la reserva fiscal")}
    ${kpi("IVA a pagar", a(iva.saldo), "Todos los proyectos y gastos de Magna")}
  </div>`;
  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Reserva por proyecto</h2><p class="panel-sub">Lo que cada proyecto tendría que haber reservado contra lo que pasó.</p></div></div>
      ${rm.proyectos.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Proyecto</th><th class="n">A reservar</th><th class="n ocultar-movil">Reservado</th><th class="n">Falta</th></tr></thead><tbody>
        ${rm.proyectos.map(x => `<tr><td>${esc(x.proyecto.nombre)}</td><td class="n">${a(x.aReservar)}</td><td class="n ocultar-movil">${a(x.reservado)}</td><td class="n">${a(x.pendiente)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="vacio">No hay proyectos abiertos.</div>`}</section>
    <section class="panel"><div class="panel-cab"><div><h2>Pagos de impuestos</h2><p class="panel-sub">Gastos cargados en Magna · Reserva fiscal, por impuesto.</p></div></div>
      ${Object.keys(rm.pagos).length ? `<table class="tabla tabla-compacta"><tbody>${Object.entries(rm.pagos).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${a(v)}</td></tr>`).join("")}<tr class="total"><td>Total</td><td class="n">${a(rm.pagado)}</td></tr></tbody></table>` : `<div class="vacio">Todavía no se cargaron pagos de impuestos.</div>`}</section>
  </div>`;
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Posición de IVA por mes</h2><p class="panel-sub">Débito de todas las facturas emitidas, menos el crédito de las compras con Factura A (proyectos, Estructura y Magna) y las retenciones sufridas.</p></div></div>
    ${iva.meses.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Mes</th><th class="n">Débito</th><th class="n">Crédito</th><th class="n ocultar-movil">Retenciones</th><th class="n">Saldo</th></tr></thead><tbody>
      ${iva.meses.map(m => `<tr><td>${esc(mesLabel(m.mes))}</td><td class="n">${a(m.debito)}</td><td class="n">${a(-m.credito)}</td><td class="n ocultar-movil">${a(-m.ret)}</td><td class="n"><b>${a(m.saldo)}</b></td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="n">${a(iva.debito)}</td><td class="n">${a(-iva.credito)}</td><td class="n ocultar-movil">${a(-iva.ret)}</td><td class="n">${a(iva.saldo)}</td></tr>
    </tbody></table></div>` : `<div class="vacio">Sin movimientos con IVA.</div>`}</section>`;
  h += panelCierreAnual();
  el.innerHTML = h;
  enlazarCierreAnual(el);
}

/* =================== CIERRE DEL EJERCICIO =================== */
/* Proyectos que tienen (o tuvieron) reserva fiscal: los abiertos y los cerrados con plata reservada. */
function proyectosConReserva() {
  return M.proyectosOrdenados().map(p => {
    const r = M.resumenProyecto(p);
    return { p, r, res: I.reservaProyecto(p, r) };
  }).filter(x => x.p.estado !== "cerrado" || Math.abs(x.res.reservado) > 1);
}
function panelCierreAnual() {
  const lista = proyectosConReserva();
  const admin = PER.esAdmin();
  const anio = Number(hoyISO().slice(0, 4)) - (Number(hoyISO().slice(5, 7)) <= 6 ? 1 : 0);
  const sobra = lista.reduce((a, x) => a + Math.max(0, -x.res.pendiente), 0);
  return `<section class="panel" style="margin-top:16px" id="cierre-anual"><div class="panel-cab"><div><h2>Cierre del ejercicio: Ganancias y reserva</h2><p class="panel-sub">Cuando la contadora cierra el balance, cargá la Ganancias que se determinó. La app la reparte entre los proyectos según su resultado impositivo, recalcula lo que cada uno tiene que tener reservado y te deja liberar lo que sobra.</p></div></div>
    ${admin ? `<form class="form" id="ca-form" novalidate style="margin-bottom:14px">
      <div class="fila fila-movil-2" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="campo"><label for="ca-anio">Ejercicio</label><input id="ca-anio" type="number" min="2020" max="2100" value="${anio}"></div>
        <div class="campo"><label for="ca-monto">Ganancias determinada, en pesos</label><input id="ca-monto" inputmode="decimal" placeholder="Según la declaración jurada"></div>
        <div class="campo" style="align-self:end"><button class="btn btn-sec" type="submit" id="ca-repartir">Repartir entre los proyectos</button></div>
      </div>
      <div id="ca-prev"></div>
    </form>` : ""}
    ${lista.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Proyecto</th><th class="ocultar-movil">Ganancias</th><th class="n">A reservar</th><th class="n ocultar-movil">Reservado</th><th class="n">Diferencia</th><th></th></tr></thead><tbody>
      ${lista.map(x => `<tr><td><b>${esc(x.p.nombre)}</b>${x.p.estado === "cerrado" ? `<small class="mute" style="display:block">cerrado</small>` : ""}</td><td class="ocultar-movil chico">${esc(textoGanancias(x.r.impuestos))}</td>
        <td class="n">${a(x.res.aReservar)}</td><td class="n ocultar-movil">${a(x.res.reservado)}</td>
        <td class="n">${x.res.pendiente < -1 ? `<span class="tag tag-ok">sobran ${esc(fmtARS(-x.res.pendiente))}</span>` : x.res.pendiente > 1 ? `<span class="tag tag-alerta">faltan ${esc(fmtARS(x.res.pendiente))}</span>` : "Al día"}</td>
        <td class="n">${admin && x.res.pendiente < -1 ? `<button class="btn btn-sec btn-chico" data-liberar="${esc(x.p.id)}">Liberar</button>` : admin && x.res.pendiente > 1 && x.p.estado !== "cerrado" ? `<a class="btn btn-fant btn-chico" href="#cargar/nuevo/pase/reserva/${Math.round(x.res.pendiente)}">Reservar</a>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    ${admin && sobra > 1 ? `<div class="form-pie" style="margin-top:12px"><button class="btn btn-pri" id="ca-liberar-todo">Liberar todo lo que sobra (${esc(fmtARS(sobra))})</button></div>` : ""}
    <p class="panel-sub" style="margin-top:10px">Liberar es un pase de Magna · Reserva fiscal al bolsillo del proyecto: esa plata vuelve a estar disponible para el proyecto y, al cerrarlo, para los socios. Si un proyecto cruza dos ejercicios, revisá su monto en Impuestos del proyecto.</p>`
    : `<div class="vacio">No hay proyectos con reserva fiscal.</div>`}</section>`;
}
async function liberar(lista) {
  const hoy = hoyISO();
  const r = await cotizacionMEP(hoy).catch(() => null);
  const mep = r && r.valor ? r.valor : M.ultimaCotizacion();
  let total = 0;
  lista.forEach(x => {
    const ars = Math.round(-x.res.pendiente * 100) / 100;
    if (!(ars > 1)) return;
    total += ars;
    guardar("movimientos", {
      tipo: "pase", clase: "reserva", fecha: hoy, bolsillo: "RESERVA", destino: x.p.id, cuenta: (S.cuentas[0] || {}).id || "c_magna",
      montoARS: ars, cotizacion: mep, cotizacionFuente: r ? (r.aproximada ? "aprox" : "api") : "manual", montoUSD: mep > 0 ? Math.round(ars / mep * 100) / 100 : 0,
      concepto: "Liberación de reserva fiscal (cierre del ejercicio)", notas: "", socio: "", tasa: null,
      creadoPor: app.usuario.socio, creadoEl: new Date().toISOString()
    });
  });
  return total;
}
function enlazarCierreAnual(el) {
  const sec = $("#cierre-anual", el);
  if (!sec || !PER.esAdmin()) return;
  $$("[data-liberar]", sec).forEach(b => b.addEventListener("click", async () => {
    b.disabled = true;
    const x = proyectosConReserva().find(y => y.p.id === b.dataset.liberar);
    const t = x ? await liberar([x]) : 0;
    toast(t ? `Liberados ${fmtARS(t)} de la reserva` : "No había nada para liberar");
  }));
  const todo = $("#ca-liberar-todo", sec);
  if (todo) todo.addEventListener("click", async () => {
    todo.disabled = true;
    const t = await liberar(proyectosConReserva());
    toast(t ? `Liberados ${fmtARS(t)} de la reserva` : "No había nada para liberar");
  });
  const f = $("#ca-form", sec);
  let plan = null;
  f.addEventListener("submit", e => {
    e.preventDefault();
    const monto = parseMonto($("#ca-monto", f).value);
    const anio = $("#ca-anio", f).value;
    if (isNaN(monto) || monto < 0) return toast("Cargá la Ganancias determinada en pesos (puede ser 0).", "error");
    const lista = proyectosConReserva();
    const bases = lista.map(x => Math.max(0, x.r.impuestos.baseGananciasUsd));
    const suma = bases.reduce((s2, v) => s2 + v, 0);
    if (!lista.length) return toast("No hay proyectos para repartir.", "error");
    plan = lista.map((x, i) => ({ p: x.p, ars: Math.round((suma > 0 ? monto * bases[i] / suma : monto / lista.length) * 100) / 100, antes: x.r.impuestos.gananciasUsd * (M.ultimaCotizacion(x.p.id) || 0) }));
    $("#ca-prev", f).innerHTML = `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Proyecto</th><th class="n">Estimado hasta hoy</th><th class="n">Le toca del ejercicio ${esc(anio)}</th></tr></thead><tbody>
      ${plan.map(x => `<tr><td>${esc(x.p.nombre)}</td><td class="n">${a(x.antes)}</td><td class="n"><b>${a(x.ars)}</b></td></tr>`).join("")}
    </tbody></table></div><div class="form-pie"><button type="button" class="btn btn-pri" id="ca-aplicar">Aplicar a los proyectos</button></div>`;
    $("#ca-aplicar", f).addEventListener("click", () => {
      plan.forEach(x => {
        const actual = M.proyecto(x.p.id);
        guardar("proyectos", Object.assign({}, actual, { gananciasEfectiva: { modo: "monto", montoArs: x.ars, mep: M.ultimaCotizacion(x.p.id), ejercicio: anio, fijadoEl: hoyISO() }, modificadoPor: app.usuario.socio }));
      });
      toast(`Ganancias del ejercicio ${anio} repartida en ${plan.length} proyecto${plan.length > 1 ? "s" : ""}`);
    });
  });
}
