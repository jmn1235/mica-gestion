/* =========================================================
   Tablero: resumen del contexto elegido (proyecto, MICA o Magna).
   ========================================================= */
import { S } from "../db.js";
import { app, fijarCtx } from "../contexto.js";
import * as M from "../modelo.js";
import * as P from "../presupuesto.js";
import * as C from "../certificados.js";
import * as PER from "../permisos.js";
import { $, $$, esc, num, fmtUSD, fmtARS, fmtPct, fmtMoneda, fmtCant, fmtFecha, mesLabel, hoyISO, cabecera, ICONOS } from "../ui.js";
import { barrasAgrupadas, barrasHorizontales } from "../graficos.js";

const HEX_COBROS = "#3F4045", HEX_COSTOS = "#E1262D";

export function render(el) {
  const ctx = app.ctx;
  if (ctx.tipo === "proyecto") {
    const p = M.proyecto(ctx.id);
    if (!p) { el.innerHTML = `<div class="vacio"><b>No hay proyectos todavía</b>Creá el primero en Ajustes.</div>`; return; }
    return tableroProyecto(el, p);
  }
  if (ctx.tipo === "mica") return tableroMica(el);
  return tableroMagna(el);
}

function kpi(rotulo, valorHtml, sub = "", extra = "") {
  return `<div class="kpi"><div class="kpi-rot">${rotulo}</div><div class="kpi-val">${valorHtml}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}${extra}</div>`;
}
const prog = f => `<div class="barra-prog" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, f * 100))}%"></i></div>`;

/* ---------- proyecto ---------- */
function tableroProyecto(el, p) {
  const r = M.resumenProyecto(p);
  const sg = P.seguimiento(p);
  const mon = r.moneda;
  const estado = (M.ESTADOS_PROYECTO.find(e => e.id === p.estado) || {}).nombre || "";
  const sub = [p.cliente, p.ubicacion].filter(Boolean).map(esc).join(" · ") + (estado ? ` · <span class="tag${p.estado === "activo" ? " tag-ok" : ""}">${esc(estado)}</span>` : "");
  let h = cabecera(p.codigo || "Proyecto", p.nombre, sub,
    `${PER.esAdmin() || PER.proyectoPermitido(p.id) ? `<a class="btn btn-pri" href="#cargar">${ICONOS.cargar}${PER.esAdmin() ? "Cargar" : "Proponer gasto"}</a>` : ""}<a class="btn btn-sec btn-sec-escritorio" href="#movimientos">Movimientos</a>`);
  h += PER.avisoPendientesHtml(x => ((x.datos || x.anterior || {}).bolsillo || (x.datos || x.anterior || {}).proyecto) === p.id);

  if (p.estado === "cerrado" && p.cierre) {
    const z = p.cierre.resumen || {};
    h += `<div class="aviso aviso-info">${ICONOS.ok}<div><b>Proyecto cerrado el ${esc(fmtFecha(p.cierre.fecha, true))}.</b> Resultado final para los socios: ${esc(fmtUSD(z.finalUsd || 0))}${z.margenRealPct != null ? ` (margen ${esc(fmtPct(z.margenRealPct))})` : ""}. <a href="#liquidacion">Ver el cierre</a></div></div>`;
  }
  if (r.saldo.ars < -0.5) {
    h += `<div class="aviso" role="alert">${ICONOS.alerta}<div><b>El bolsillo del proyecto está en ${fmtARS(r.saldo.ars)}.</b> Se pagó con plata de otro bolsillo. Registrá un préstamo (por ejemplo, de Magna · Julio) para que quede claro de quién es la plata.
      <div style="margin-top:8px"><a class="btn btn-sec btn-chico" href="#cargar/nuevo/pase/prestamo">Registrar préstamo</a></div></div></div>`;
  }
  const cob = C.resumenCobranza(p);
  if (cob.vencidas.length) {
    h += `<div class="aviso" role="alert">${ICONOS.alerta}<div><b>${cob.vencidas.length === 1 ? "Hay una factura vencida" : `Hay ${cob.vencidas.length} facturas vencidas`} por ${fmtMoneda(cob.vencido, mon)}.</b> ${cob.vencidas.map(d => `${esc(C.tituloDoc(d.doc))}, vencida hace ${d.diasVencido} día${d.diasVencido === 1 ? "" : "s"}`).join("; ")}.
      <div style="margin-top:8px"><a class="btn btn-sec btn-chico" href="#certificados">Ver certificados y cobranza</a></div></div></div>`;
  }
  if (!(p.items || []).length) {
    h += `<div class="aviso aviso-info">${ICONOS.alerta}<div>Este proyecto no tiene ítems de cotización. Cargalos o importalos en <a href="#presupuesto">Contrato y presupuesto</a> para imputar los gastos por ítem.</div></div>`;
  }

  const deuda = r.deudaUsd;
  h += `<div class="grid-kpi">
    ${kpi("Cobrado", num(r.ventasUsd, fmtUSD), (r.contrato ? `${fmtPct(r.cobradoPct, 0)} del contrato de ${fmtMoneda(r.contrato, mon)}` : "Sin monto de contrato") + (cob.porCobrar > 0.5 ? ` · por cobrar ${fmtMoneda(cob.porCobrar, mon)}` : ""), r.contrato ? prog(r.cobradoPct || 0) : "")}
    ${kpi("Costos", num(r.costosUsd, fmtUSD), `${r.nCostos} ${r.nCostos === 1 ? "gasto" : "gastos"}${r.sinFacturaUsd > 0 ? ` · ${fmtUSD(r.sinFacturaUsd)} sin factura` : ""}`)}
    ${kpi("Resultado antes de impuestos", num(r.resultadoUsd, fmtUSD), (r.margen == null ? "Sin cobros todavía" : `Margen ${fmtPct(r.margen)}`) + ` · neto de impuestos <a href="#impuestos">${fmtUSD(r.resultadoNetoUsd)}</a>`)}
    ${kpi("Saldo del bolsillo", num(r.saldo.ars, fmtARS), deuda > 0.5 ? `Préstamos a devolver: ${fmtUSD(deuda)}` : "Sin préstamos pendientes")}
  </div>`;

  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Avance de obra</h2><p class="panel-sub">Cuánto se ejecutó contra cuánto se gastó.</p></div><a class="btn btn-fant btn-chico" href="#seguimiento">Seguimiento</a></div>${panelAvance(sg)}</section>
    <section class="panel"><div class="panel-cab"><div><h2>Costos por tipo</h2><p class="panel-sub">En dólares MEP.</p></div></div>${barrasHorizontales(M.TIPOS_COSTO.concat(["Sin tipo"]).map(t => ({ rotulo: t, valor: r.porTipo[t] || 0 })).filter(f => f.valor > 0), v => fmtUSD(v))}</section>
    <section class="panel grid-ancho"><div class="panel-cab"><div><h2>Cobros y costos por mes</h2><p class="panel-sub">En dólares MEP, netos de IVA.</p></div></div><div id="g-mes"></div></section>
    <section class="panel grid-ancho"><div class="panel-cab"><div><h2>Avance y costo por ítem</h2><p class="panel-sub">Costo real imputado contra el costo cotizado, en ${mon === "ARS" ? "pesos" : "dólares"} sin IVA. La barra de consumo se marca en rojo cuando el gasto va más rápido que el avance físico.</p></div></div>${tablaItems(p, sg)}</section>
    <section class="panel grid-ancho"><div class="panel-cab"><div><h2>Últimos movimientos</h2></div><a class="btn btn-fant btn-chico" href="#movimientos">Ver todos</a></div>${ultimos(r.movs, new Set([p.id]))}</section>
  </div>`;
  el.innerHTML = h;
  graficoMensual($("#g-mes", el), r.porMes, p.inicio);
}

function panelAvance(sg) {
  const mon = sg.moneda;
  const filas = [];
  if (sg.planHoy != null) filas.push({ rotulo: "Plan a " + mesLabel(sg.mesPlan, true).toLowerCase(), v: sg.planHoy, color: "#B4B5B9" });
  filas.push({ rotulo: "Avance físico", v: sg.avanceFisico, color: "#3F4045" });
  if (sg.avanceGasto != null) filas.push({ rotulo: "Avance de gasto", v: sg.avanceGasto, color: "#E1262D" });
  const max = Math.max(1, ...filas.map(f => f.v));
  let h = `<div class="barras-h">${filas.map(f => `<div class="barra-h"><span class="r">${f.rotulo}</span><span class="pista"><i style="width:${Math.max(0.5, (f.v / max) * 100)}%;background:${f.color}"></i></span><span class="n">${fmtPct(f.v, 0)}</span></div>`).join("")}</div>`;
  if (sg.hayCostos) {
    const d = sg.costoProyectado - sg.costoCotizado;
    h += `<p class="panel-sub" style="margin-top:14px">Costo proyectado al cierre: <b>${fmtMoneda(sg.costoProyectado, mon)}</b> contra ${fmtMoneda(sg.costoCotizado, mon)} cotizados${Math.abs(d) >= 1 ? ` (${d > 0 ? `<span class="neg">${fmtMoneda(d, mon)} de sobrecosto</span>` : `${fmtMoneda(-d, mon)} a favor`})` : ""}. Margen proyectado ${sg.margenProyectadoPct == null ? "—" : fmtPct(sg.margenProyectadoPct)}.</p>`;
  } else {
    h += `<p class="panel-sub" style="margin-top:14px">Cargá el costo cotizado de los ítems en <a href="#presupuesto">Contrato y presupuesto</a> para ver el avance de gasto y la proyección de cierre.</p>`;
  }
  return h;
}

function graficoMensual(el, porMes, inicio) {
  const claves = Object.keys(porMes).filter(Boolean).sort();
  if (!claves.length) { el.innerHTML = `<div class="vacio">Todavía no hay cobros ni costos cargados.</div>`; return; }
  const desde = inicio ? [inicio.slice(0, 7), claves[0]].sort()[0] : claves[0];
  const meses = M.mesesEntre(desde, [claves[claves.length - 1], hoyISO().slice(0, 7)].sort()[1]).slice(-18);
  barrasAgrupadas(el, {
    etiquetas: meses.map(m => mesLabel(m, true)),
    titulosTip: meses.map(m => mesLabel(m)),
    series: [
      { nombre: "Cobros", color: HEX_COBROS, valores: meses.map(m => (porMes[m] || {}).ventas || 0) },
      { nombre: "Costos", color: HEX_COSTOS, valores: meses.map(m => (porMes[m] || {}).costos || 0) }
    ],
    fmt: v => fmtUSD(v)
  });
}

function tablaItems(p, sg) {
  const mon = sg.moneda;
  const f = v => num(v, x => fmtMoneda(x, mon));
  const barra = (pct, exceso) => `${fmtPct(pct, 0)}<div class="mini-barra"><i class="${exceso ? "exceso" : ""}" style="width:${Math.min(100, Math.max(0, pct) * 100)}%"></i></div>`;
  const consumo = (real, cot, avance) => {
    if (!(cot > 0)) return "—";
    const c = real / cot;
    return barra(c, c > 0.05 && c > avance * 1.1 + 0.02);
  };
  const filas = sg.filas.map(x => `<tr><td class="desc"><b>Ítem ${esc(x.item.numero)}</b> · <span class="desc-txt">${esc(x.item.descripcion)}</span><small>${esc(x.item.rubro || "Sin rubro")} · ${esc(fmtCant(x.ejec))} de ${esc(fmtCant(x.cant))} ${esc(x.item.unidad || "")}</small></td>
    <td class="n col-pct">${barra(x.avance, x.avance > 1.0001)}</td><td class="n">${f(x.real)}</td><td class="n ocultar-movil">${x.cot ? f(x.cot) : "—"}</td><td class="n col-pct">${consumo(x.real, x.cot, x.avance)}</td></tr>`);
  sg.rubros.forEach(rb => { if (rb.delRubro) filas.push(`<tr class="sub"><td>Rubro ${esc(rb.nombre)}, sin ítem</td><td></td><td class="n">${f(rb.delRubro)}</td><td class="n ocultar-movil">—</td><td class="n">—</td></tr>`); });
  if (sg.general.real || sg.general.cot) filas.push(`<tr class="sub"><td>Gastos generales de obra</td><td class="n col-pct">${barra(sg.avanceFisico, false)}</td><td class="n">${f(sg.general.real)}</td><td class="n ocultar-movil">${sg.general.cot ? f(sg.general.cot) : "—"}</td><td class="n col-pct">${consumo(sg.general.real, sg.general.cot, sg.avanceFisico)}</td></tr>`);
  if (sg.otros) filas.push(`<tr class="sub"><td>Ítems o rubros borrados</td><td></td><td class="n">${f(sg.otros)}</td><td class="n ocultar-movil">—</td><td class="n">—</td></tr>`);
  if (!filas.length) return `<div class="vacio">Sin ítems ni costos todavía.</div>`;
  return `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Ítem</th><th class="n col-pct">Avance</th><th class="n">Costo real</th><th class="n ocultar-movil">Cotizado</th><th class="n col-pct">Consumo</th></tr></thead>
    <tbody>${filas.join("")}<tr class="total"><td>Total</td><td class="n col-pct">${fmtPct(sg.avanceFisico, 0)}</td><td class="n">${f(sg.costoReal)}</td><td class="n ocultar-movil">${sg.costoCotizado ? f(sg.costoCotizado) : "—"}</td><td class="n col-pct">${sg.avanceGasto == null ? "—" : fmtPct(sg.avanceGasto, 0)}</td></tr></tbody></table></div>`;
}

function ultimos(movs, conj, n = 6) {
  if (!movs.length) return `<div class="vacio"><b>Sin movimientos</b>Cargá el primer gasto desde «Cargar».</div>`;
  return `<div class="lista-mov">${movs.slice(0, n).map(m => {
    const s = M.signo(m, conj);
    const v = s === 0 ? Math.abs(m.montoARS) : s * m.montoARS;
    return `<a class="mov mov-corto" href="#cargar/${encodeURIComponent(m.id)}">
      <span class="mov-fecha">${fmtFecha(m.fecha)}</span>
      <span class="mov-cuerpo"><div class="mov-tit">${esc(M.tituloMov(m))}</div><div class="mov-sub">${esc(m.tipo === "pase" ? M.nombreBolsillo(m.bolsillo) + " → " + M.nombreBolsillo(m.destino) : (M.nombreImputacion(m, 40) || M.nombreClase(m.tipo, m.clase)))}</div></span>
      <span class="mov-ars">${num(v, fmtARS)}</span></a>`;
  }).join("")}</div>`;
}

/* ---------- MICA ---------- */
function tableroMica(el) {
  const r = M.resumenMica();
  let h = cabecera("Vista general", "MICA", "Todos los proyectos y la estructura común, en dólares MEP netos de IVA.",
    PER.esAdmin() ? `<a class="btn btn-pri" href="#cargar">${ICONOS.cargar}Cargar gasto de estructura</a>` : "");
  h += PER.avisoPendientesHtml();
  const venc = C.vencidasTodas();
  if (venc.length) {
    h += `<div class="aviso" role="alert">${ICONOS.alerta}<div><b>${venc.length === 1 ? "Hay una factura vencida" : `Hay ${venc.length} facturas vencidas`}.</b> ${venc.map(d => `${esc(d.proyecto.nombre)}: ${esc(C.tituloDoc(d.doc))}, ${fmtMoneda(d.saldo, d.proyecto.moneda)} hace ${d.diasVencido} día${d.diasVencido === 1 ? "" : "s"}`).join("; ")}.</div></div>`;
  }
  h += `<div class="grid-kpi">
    ${kpi("Cobrado en proyectos", num(r.ventasUsd, fmtUSD), `${r.proyectos.length} ${r.proyectos.length === 1 ? "proyecto" : "proyectos"}`)}
    ${kpi("Costos de obra", num(r.costosUsd, fmtUSD))}
    ${kpi("Gastos de estructura", num(r.estructura.gastosUsd, fmtUSD), `Saldo del bolsillo: ${fmtARS(r.estructura.saldo.ars)}`)}
    ${kpi("Resultado antes de impuestos", num(r.resultadoUsd, fmtUSD), `Proyectos menos estructura · neto de impuestos <a href="#impuestos">${fmtUSD(r.resultadoNetoUsd)}</a>`)}
  </div>`;
  const filas = r.proyectos.map(x => {
    const p = x.proyecto;
    const est = (M.ESTADOS_PROYECTO.find(e => e.id === p.estado) || {}).nombre || "";
    return `<tr class="clic" data-p="${esc(p.id)}"><td><b>${esc(p.nombre)}</b> <span class="tag${p.estado === "activo" ? " tag-ok" : ""}">${esc(est)}</span><small class="mute" style="display:block">${esc(p.cliente || "")}</small></td>
      <td class="n ocultar-movil">${fmtMoneda(x.contrato, x.moneda)}</td><td class="n">${num(x.ventasUsd, fmtUSD)}</td><td class="n ocultar-movil">${(() => { const cb = C.resumenCobranza(p); return cb.porCobrar > 0.5 ? fmtMoneda(cb.porCobrar, x.moneda) + (cb.vencido > 0.5 ? `<small class="neg" style="display:block">${fmtMoneda(cb.vencido, x.moneda)} vencido</small>` : "") : "—"; })()}</td><td class="n ocultar-movil">${num(x.costosUsd, fmtUSD)}</td>
      <td class="n">${num(x.resultadoUsd, fmtUSD)}</td><td class="n ocultar-movil">${x.margen == null ? "—" : fmtPct(x.margen)}</td><td class="n ocultar-movil">${num(x.saldo.ars, fmtARS)}</td></tr>`;
  }).join("");
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Proyectos</h2><p class="panel-sub">Tocá un proyecto para abrir su tablero.</p></div></div>
    ${filas ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Proyecto</th><th class="n ocultar-movil">Contrato</th><th class="n">Cobrado</th><th class="n ocultar-movil">Por cobrar</th><th class="n ocultar-movil">Costos</th><th class="n">Resultado</th><th class="n ocultar-movil">Margen</th><th class="n ocultar-movil">Saldo bolsillo</th></tr></thead><tbody>${filas}</tbody></table></div>` : `<div class="vacio">No hay proyectos.</div>`}</section>`;
  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Cuenta de cada socio</h2><p class="panel-sub">Lo que le correspondería a cada uno hoy: aportes, préstamos, honorarios y su parte del resultado neto de impuestos.</p></div><a class="btn btn-fant btn-chico" href="#socios">Socios</a></div>
      <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Socio</th><th class="n">Resultado</th><th class="n">A favor</th></tr></thead><tbody>
      ${r.socios.map(s => `<tr><td>${esc(s.nombre)}</td><td class="n">${num(s.resultado, fmtUSD)}</td><td class="n"><b>${num(s.aFavor, fmtUSD)}</b></td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="n">${num(r.socios.reduce((a, s) => a + s.resultado, 0), fmtUSD)}</td><td class="n">${num(r.socios.reduce((a, s) => a + s.aFavor, 0), fmtUSD)}</td></tr></tbody></table></div></section>
    <section class="panel"><div class="panel-cab"><div><h2>Estructura por categoría</h2><p class="panel-sub">Gastos comunes de MICA, en dólares MEP. Se reparten entre proyectos según lo facturado.</p></div></div>
      ${barrasHorizontales(Object.entries(r.estructura.porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })), v => fmtUSD(v))}</section>
  </div>`;
  el.innerHTML = h;
  $$("tr[data-p]", el).forEach(tr => tr.addEventListener("click", () => { fijarCtx({ tipo: "proyecto", id: tr.dataset.p }); $$(".sel-ctx").forEach(s => { s.value = "p:" + tr.dataset.p; }); app.refrescar(); }));
}

/* ---------- Magna ---------- */
function tableroMagna(el) {
  const r = M.resumenMagna();
  const b = id => r.bolsillos.find(x => x.id === id) || { saldo: { ars: 0, usd: 0 } };
  let h = cabecera("Razón social", "Magna Desarrollos SRL", "La cuenta bancaria de Magna separada en bolsillos. La suma de los bolsillos es el saldo que tiene que mostrar el banco.",
    PER.esAdmin() ? `<a class="btn btn-pri" href="#cargar">${ICONOS.cargar}Cargar</a><a class="btn btn-sec btn-sec-escritorio" href="#cargar/nuevo/pase/prestamo">Pase entre bolsillos</a>` : "");
  h += PER.avisoPendientesHtml();
  r.negativos.forEach(x => {
    h += `<div class="aviso" role="alert">${ICONOS.alerta}<div><b>${esc(x.nombre)} está en ${fmtARS(x.saldo.ars)}.</b> Usó plata de otro bolsillo (seguramente de Magna · Julio). Registrá el préstamo para que quede la deuda a favor de quien puso la plata.
      <div style="margin-top:8px"><a class="btn btn-sec btn-chico" href="#cargar/nuevo/pase/prestamo">Registrar préstamo</a></div></div></div>`;
  });
  if (r.total < -0.5 || b("MAGNA").saldo.ars < -0.5) {
    h += `<div class="aviso aviso-info">${ICONOS.alerta}<div><b>${r.total < -0.5 ? "La cuenta da negativa." : "Magna · Julio da negativo."}</b> Seguramente falta cargar el saldo que tenía la cuenta al empezar a usar la app: cargalo como ingreso «Saldo inicial» en Magna · Julio (y en los bolsillos que corresponda).
      <div style="margin-top:8px"><a class="btn btn-sec btn-chico" href="#cargar/nuevo/ingreso/inicial">Cargar saldo inicial</a></div></div></div>`;
  }
  const rein = r.reintegro;
  h += `<div class="grid-kpi">
    ${kpi("Saldo de la cuenta", num(r.total, fmtARS), "Suma de todos los bolsillos")}
    ${kpi("Magna · Julio", num(b("MAGNA").saldo.ars, fmtARS), "Plata propia de Julio")}
    ${kpi("Reserva fiscal", num(b("RESERVA").saldo.ars, fmtARS), "Para pagar impuestos")}
    ${kpi("A reintegrar a Julio", num(rein.ars, fmtARS), `Gastos de Magna recuperables · ${fmtUSD(rein.usd)}`)}
  </div>`;
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Bolsillos de la cuenta</h2><p class="panel-sub">En pesos, y en dólares a la cotización de cada movimiento.</p></div></div>
    <div class="tabla-env"><table class="tabla"><thead><tr><th>Bolsillo</th><th class="n">Saldo en pesos</th><th class="n">En dólares</th></tr></thead><tbody>
    ${r.bolsillos.filter(x => !x.proyecto || x.estado !== "cerrado" || Math.abs(x.saldo.ars) > 0.5).map(x => `<tr><td>${esc(x.nombre)}${x.proyecto && x.estado === "cerrado" ? ' <span class="tag">Cerrado</span>' : ""}</td><td class="n">${num(x.saldo.ars, fmtARS)}</td><td class="n">${num(x.saldo.usd, fmtUSD)}</td></tr>`).join("")}
    <tr class="total"><td>Total de la cuenta</td><td class="n">${num(r.total, fmtARS)}</td><td class="n">${num(r.bolsillos.reduce((a, x) => a + x.saldo.usd, 0), fmtUSD)}</td></tr></tbody></table></div></section>`;
  const pd = r.prestamosDados;
  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Préstamos de Magna a proyectos</h2><p class="panel-sub">En dólares del día de cada movimiento, con interés compuesto diario a la tasa de cada préstamo.</p></div><a class="btn btn-fant btn-chico" href="#socios">Detalle</a></div>
      ${pd.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Proyecto</th><th class="n">Prestado</th><th class="n ocultar-movil">Devuelto</th><th class="n ocultar-movil">Interés</th><th class="n">Saldo</th></tr></thead><tbody>
      ${pd.map(x => `<tr><td>${esc(x.proyecto.nombre)}</td><td class="n">${num(x.recibidoUsd, fmtUSD)}</td><td class="n ocultar-movil">${num(-x.devueltoUsd, fmtUSD)}</td><td class="n ocultar-movil">${num(x.interesUsd, fmtUSD)}</td><td class="n">${num(x.saldoUsd, fmtUSD)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="vacio">Magna no prestó plata a ningún proyecto.</div>`}</section>
    <section class="panel"><div class="panel-cab"><div><h2>Gastos de Magna</h2><p class="panel-sub">Contadora de la SRL, CASEMICA y otros, en dólares MEP. Los recuperables se le reintegran a Julio.</p></div></div>
      ${barrasHorizontales(Object.entries(r.magnaGastos.porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })), v => fmtUSD(v))}
      ${rein.gastado > 0 ? `<p class="panel-sub" style="margin-top:14px">Recuperables cargados: ${fmtARS(rein.gastado)} · reintegrados: ${fmtARS(rein.devuelto)}. ${rein.ars > 0.5 ? `<a href="#cargar/nuevo/pase/reintegro">Registrar reintegro</a>` : ""}</p>` : ""}</section>
  </div>`;
  el.innerHTML = h;
}
