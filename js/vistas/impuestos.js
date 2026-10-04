/* =========================================================
   Impuestos: IVA, Ingresos Brutos, impuesto al cheque y
   Ganancias estimada; los tres resultados de cada proyecto;
   retenciones sufridas y reserva fiscal.
   ========================================================= */
import { app } from "../contexto.js";
import * as M from "../modelo.js";
import * as I from "../impuestos.js";
import { $, $$, esc, num, fmtUSD, fmtARS, fmtPct, mesLabel, cabecera, ICONOS } from "../ui.js";

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
    <tr><td>Ganancias (${String(x.param.ganancias).replace(".", ",")}% del resultado impositivo, menos la parte computable del cheque)</td><td class="n">${u(-x.gananciasCostoUsd)}</td></tr>
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
    ${kpi("Ganancias estimada", u(x.gananciasCostoUsd), `Quedan por pagar ${fmtUSD(x.gananciasAPagarUsd)}`)}
  </div>`;
  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Tres resultados</h2><p class="panel-sub">En dólares MEP. El neto es lo que pueden repartir los socios, antes de la parte de estructura.</p></div></div>
      ${tablaResultados(r)}
      ${x.extraInformalUsd > 0.5 ? `<p class="panel-sub" style="margin-top:12px"><b>Los gastos sin factura suman ${fmtUSD(x.extraInformalUsd)} de Ganancias:</b> no se deducen, así que ${fmtUSD(r.sinFacturaUsd)} sin comprobante generan ese impuesto extra.</p>` : ""}
      <p class="panel-sub" style="margin-top:8px">El resultado impositivo no deduce los gastos sin factura ni los honorarios e intereses entre socios.</p></section>
    <section class="panel"><div class="panel-cab"><div><h2>Reserva fiscal</h2><p class="panel-sub">Lo que el proyecto tendría que haber pasado a Magna · Reserva fiscal, en pesos.</p></div></div>
      <table class="tabla tabla-compacta"><tbody>
        ${res.conceptos.map(c => `<tr><td>${c.nombre}</td><td class="n">${a(c.ars)}</td></tr>`).join("")}
        <tr class="sub"><td><b>A reservar</b></td><td class="n"><b>${a(res.aReservar)}</b></td></tr>
        <tr><td>Ya reservado</td><td class="n">${a(-res.reservado)}</td></tr>
        <tr class="total"><td>${res.pendiente >= 0 ? "Falta reservar" : "Reservado de más"}</td><td class="n">${a(Math.abs(res.pendiente))}</td></tr>
      </tbody></table>
      <p class="panel-sub" style="margin-top:10px">Ganancias se pasa a pesos al último dólar MEP cargado (${res.mep ? fmtARS(res.mep, 2) : "—"}). Los pagos de impuestos se cargan como gastos de Magna · Reserva fiscal.</p></section>
  </div>`;
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>IVA por mes</h2><p class="panel-sub">En pesos. El débito sale de cada factura emitida (al tipo de cambio de la factura); el crédito, de las compras con Factura A.</p></div></div>
    ${iva.meses.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Mes</th><th class="n">Débito</th><th class="n">Crédito</th><th class="n ocultar-movil">Retenciones</th><th class="n">Saldo</th></tr></thead><tbody>
      ${iva.meses.map(m => `<tr><td>${esc(mesLabel(m.mes))}</td><td class="n">${a(m.debito)}</td><td class="n">${a(-m.credito)}</td><td class="n ocultar-movil">${a(-m.ret)}</td><td class="n"><b>${a(m.saldo)}</b></td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="n">${a(iva.debito)}</td><td class="n">${a(-iva.credito)}</td><td class="n ocultar-movil">${a(-iva.ret)}</td><td class="n">${a(iva.saldo)}</td></tr>
    </tbody></table></div>` : `<div class="vacio">Todavía no hay facturas ni compras con IVA.</div>`}</section>`;
  h += `<section class="panel"><div class="panel-cab"><div><h2>Retenciones sufridas</h2><p class="panel-sub">Las que hizo el cliente en cada cobro. Son pagos a cuenta del impuesto: bajan lo que queda por pagar.</p></div></div>
    <table class="tabla tabla-compacta"><tbody>
      <tr><td>Ganancias</td><td class="n">${a(x.retGanArs)}</td></tr>
      <tr><td>Ingresos Brutos</td><td class="n">${a(x.retIibbArs)}</td></tr>
      <tr><td>IVA</td><td class="n">${a(x.retIvaArs)}</td></tr>
      ${x.retOtrasArs ? `<tr><td>Otras</td><td class="n">${a(x.retOtrasArs)}</td></tr>` : ""}
      <tr class="total"><td>Total</td><td class="n">${a(x.retGanArs + x.retIibbArs + x.retIvaArs + x.retOtrasArs)}</td></tr>
    </tbody></table></section>`;
  el.innerHTML = h;
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
  el.innerHTML = h;
}
