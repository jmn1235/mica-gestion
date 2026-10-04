/* =========================================================
   Cierre de proyecto: controles previos, resultado final,
   liquidación en el orden acordado, pase a la base de costos
   e informe de cierre.
   ========================================================= */
import { S } from "../db.js";
import { app } from "../contexto.js";
import * as M from "../modelo.js";
import * as P from "../presupuesto.js";
import * as C from "../certificados.js";
import * as I from "../impuestos.js";
import * as IA from "../ia.js";
import * as L from "../cierreProyecto.js";
import { cotizacionMEP } from "../mep.js";
import { contextoProyecto } from "../contextoIA.js";
import { $, $$, esc, num, fmtUSD, fmtARS, fmtPct, fmtCant, fmtMiles, fmtFecha, fmtMoneda, parseMonto, hoyISO, toast, confirmar2, modal, cerrarModal, cabecera, ICONOS } from "../ui.js";
import { pedirProyecto } from "./comun.js";
import { formatear } from "./cierre.js";

const est = {};       // fecha, dólar y destino elegidos, por proyecto
const informes = {};  // informes generados en esta sesión
const u = v => num(v, fmtUSD);
const kpi = (rot, val, sub = "") => `<div class="kpi"><div class="kpi-rot">${rot}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;

export function render(el) {
  if (app.ctx.tipo !== "proyecto" || !M.proyecto(app.ctx.id)) return pedirProyecto(el, "Cierre de proyecto", "Liquidación final, reparto entre los socios y pase de los costos a la base histórica.");
  const p = M.proyecto(app.ctx.id);
  const cerrado = p.estado === "cerrado" && !!p.cierre;
  const s = est[p.id] = est[p.id] || {};
  if (cerrado) { s.fecha = p.cierre.fecha; s.mep = p.cierre.mep; s.destino = p.cierre.destino || "repartir"; }
  else {
    if (!s.fecha || s.cerradoAntes) { s.fecha = hoyISO(); s.mep = 0; s.mepBuscado = ""; s.cerradoAntes = false; }
    if (!s.mep) s.mep = I.ultimoMep(p.id) || I.ultimoMep() || 0;
    if (!s.destino) s.destino = "repartir";
    if (s.mepBuscado !== s.fecha && !s.mepManual) buscarMep(p, s);
  }
  if (cerrado) s.cerradoAntes = true;
  const liq = L.liquidacion(p, s.fecha, s.mep, s.destino);
  const r = liq.r;
  const sg = P.seguimiento(cerrado ? p : L.simulado(p, s.fecha));

  let h = cabecera(p.codigo || "Proyecto", "Cierre de proyecto", `${esc(p.nombre)}${p.cliente ? " · " + esc(p.cliente) : ""} · <span class="tag${cerrado ? "" : " tag-ok"}">${cerrado ? "Cerrado" : esc((M.ESTADOS_PROYECTO.find(e => e.id === p.estado) || {}).nombre || "")}</span>`,
    `<button class="btn btn-sec" id="lq-imprimir">${ICONOS.imprimir}Imprimir o guardar PDF</button>`);

  if (cerrado) {
    h += `<div class="aviso aviso-info">${ICONOS.ok}<div><b>Proyecto cerrado el ${esc(fmtFecha(p.cierre.fecha, true))}</b>${p.cierre.cerradoPor ? ` por ${esc(M.socioNombre(p.cierre.cerradoPor))}` : ""}, al dólar de ${esc(fmtARS(p.cierre.mep, 2))}. Los intereses y los honorarios se calcularon hasta esa fecha y la parte de estructura quedó fija. ${p.cierre.fichas || 0} ítem${p.cierre.fichas === 1 ? "" : "s"} pasaron a la base de costos.
      <div class="form-pie no-imprimir" style="margin-top:10px"><a class="btn btn-sec btn-chico" href="#base">Ver la base de costos</a><button class="btn btn-fant btn-chico" id="lq-reabrir">Reabrir el proyecto</button></div></div></div>`;
  } else {
    h += `<div class="aviso aviso-info no-imprimir">${ICONOS.alerta}<div>La liquidación sigue el orden acordado: impuestos, préstamos con su interés, aportes, honorarios, parte de estructura y el resto según la participación. Registrá cada paso cuando hagas el movimiento en el banco. Al final, cerrá el proyecto: sus costos pasan a la base para cotizar.</div></div>`;
    h += panelParametros(p, s);
  }

  h += `<div class="grid-2"${cerrado ? "" : ' style="margin-top:16px"'}>
    ${cerrado ? panelReparto(p, liq) : panelControles(p, liq)}
    ${panelResultado(p, liq, sg)}
  </div>`;
  h += panelLiquidacion(p, liq, cerrado);
  h += panelFichas(p, s.fecha, cerrado);
  if (!cerrado) h += panelCerrar(p, liq);
  h += `<section class="panel no-imprimir"><div class="panel-cab"><div><h2>Informe de cierre</h2><p class="panel-sub">La IA lo redacta con el resultado, los desvíos por ítem y la liquidación, con lecciones para la próxima cotización. Revisalo antes de mandarlo.</p></div>
    <div class="cab-acciones">${informes[p.id] ? `<button class="btn btn-sec btn-chico" id="lq-copiar">Copiar</button>` : ""}<button class="btn btn-pri btn-chico" id="lq-informe">${informes[p.id] ? "Volver a generar" : "Generar informe"}</button></div></div>
    <div id="lq-texto">${informes[p.id] ? `<div class="informe">${formatear(informes[p.id])}</div>` : IA.hayClave() ? `<div class="vacio">Tocá «Generar informe».</div>` : `<div class="aviso aviso-info" style="margin:0">${ICONOS.alerta}<div>Para generar el informe hace falta la clave de IA en <a href="#ajustes/impuestos">Ajustes → Impuestos e IA</a>.</div></div>`}</div></section>`;
  if (informes[p.id]) h += `<section class="panel solo-imprimir"><h2>Informe de cierre</h2><div class="informe">${formatear(informes[p.id])}</div></section>`;
  el.innerHTML = h;
  cablear(el, p, s, liq, cerrado);
}

/* ---------- fecha, dólar y destino ---------- */
function panelParametros(p, s) {
  const otros = M.proyectosOrdenados().filter(x => x.id !== p.id && x.estado !== "cerrado");
  return `<section class="panel no-imprimir"><div class="panel-cab"><div><h2>Fecha y dólar de la liquidación</h2><p class="panel-sub">Los intereses y honorarios corren hasta esa fecha. Las cuentas en dólares se pasan a pesos a ese dólar.</p></div></div>
    <div class="fila fila-3">
      <div class="campo"><label for="lq-fecha">Fecha de liquidación</label><input type="date" id="lq-fecha" value="${esc(s.fecha)}"></div>
      <div class="campo"><label for="lq-mep">Dólar MEP</label><div class="con-boton"><input id="lq-mep" inputmode="decimal" value="${s.mep ? esc(fmtMiles(s.mep)) : ""}"><button type="button" class="btn btn-sec" id="lq-buscar" title="Buscar la cotización de la fecha" aria-label="Buscar cotización">${ICONOS.restaurar}</button></div>
        <div class="hint">${esc(s.mepHint || (s.mepManual ? "Cargado a mano." : "Último dólar cargado en el proyecto."))}</div></div>
      <div class="campo"><label for="lq-destino">Qué se hace con el resultado</label><select id="lq-destino">
        <option value="repartir"${s.destino === "repartir" ? " selected" : ""}>Repartir entre los socios</option>
        <option value="ESTRUCTURA"${s.destino === "ESTRUCTURA" ? " selected" : ""}>Dejarlo en MICA · Estructura</option>
        ${otros.map(x => `<option value="${esc(x.id)}"${s.destino === x.id ? " selected" : ""}>Reinvertirlo en ${esc(x.nombre)}</option>`).join("")}
      </select><div class="hint">${s.destino === "repartir" ? "A Julio se le deja en Magna · Julio; a los demás se les transfiere." : "Queda como aporte de cada socio, en su porcentaje."}</div></div>
    </div></section>`;
}

async function buscarMep(p, s) {
  const fecha = s.fecha;
  s.mepBuscado = fecha;
  s.mepHint = "Buscando la cotización…";
  const r = await cotizacionMEP(fecha);
  if (s.fecha !== fecha || s.mepManual) return;
  if (r && r.valor) { s.mep = r.valor; s.mepHint = r.aproximada ? "Sin dato para esa fecha: es la de hoy." : `Dólar MEP del ${fmtFecha(r.fecha)}.`; }
  else s.mepHint = "No se pudo consultar: se usa el último cargado. Podés corregirlo.";
  if (app.ctx.tipo === "proyecto" && app.ctx.id === p.id && location.hash.startsWith("#liquidacion")) app.refrescar();
}

/* ---------- controles antes de cerrar ---------- */
function controles(p, liq) {
  const out = [];
  const items = p.items || [];
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  if (items.length) {
    const av = P.avanceGlobal(p, P.avancesDe(p.id));
    out.push({ ok: av >= 0.995, titulo: "Avance físico completo", detalle: av >= 0.995 ? "" : `Avance cargado: ${fmtPct(av, 0)}. Para la base de costos se usa la cantidad ejecutada; los ítems sin avance toman la cotizada.`, accion: ["Cargar", "#presupuesto/avance"] });
  }
  const cob = C.resumenCobranza(p);
  const okCob = !cob.sinFacturar.length && cob.porCobrar <= 0.5;
  const det = [];
  if (cob.sinFacturar.length) det.push(`${cob.sinFacturar.length} sin facturar`);
  if (cob.porCobrar > 0.5) det.push(`por cobrar ${fmtMoneda(cob.porCobrar, mon)}`);
  out.push({ ok: okCob, titulo: "Todo facturado y cobrado", detalle: det.join(" · "), accion: okCob ? null : ["Ver", "#certificados"] });
  if (cob.anticipo.facturado || n(p.anticipo)) out.push({ ok: cob.anticipo.saldo <= 1, titulo: "Anticipo amortizado", detalle: cob.anticipo.saldo > 1 ? `Falta amortizar ${fmtMoneda(cob.anticipo.saldo, mon)} en un certificado.` : "" });
  if (cob.fondo.retenido > 0) out.push({ ok: cob.fondo.saldo <= 1, titulo: "Fondo de reparo devuelto", detalle: cob.fondo.saldo > 1 ? `Quedan ${fmtMoneda(cob.fondo.saldo, mon)} retenidos: facturá la devolución.` : "", accion: cob.fondo.saldo > 1 ? ["Facturar", "#certificados/nuevo/fondo"] : null });
  const incompletos = S.movimientos.filter(m => M.esCosto(m) && m.bolsillo === p.id && (!m.imputacion || !m.tipoCosto || m.cotizacionFuente === "aprox"));
  out.push({ ok: !incompletos.length, titulo: "Gastos completos", detalle: incompletos.length ? `${incompletos.length} gasto${incompletos.length === 1 ? "" : "s"} sin imputar, sin tipo de costo o con la cotización a revisar. La base de costos depende de esto.` : "", accion: incompletos.length ? ["Revisar", "#movimientos"] : null });
  if (liq.r.prestamos.length) {
    const sinTasa = liq.r.prestamos.some(x => x.sinTasa);
    out.push({ ok: !sinTasa, titulo: "Préstamos con tasa", detalle: sinTasa ? "Hay préstamos sin tasa: no generan interés." : "", accion: sinTasa ? ["Revisar", "#socios"] : null });
  }
  out.push({ ok: liq.alcanza, titulo: "La caja alcanza para liquidar", detalle: liq.alcanza ? "" : `Faltan ${fmtARS(-liq.cajaTrasArs)}. Cobrá lo pendiente o registrá un aporte antes de cerrar.` });
  return out;
}
const n = v => Number(v) || 0;

function panelControles(p, liq) {
  const c = controles(p, liq);
  return `<section class="panel"><div class="panel-cab"><div><h2>Antes de cerrar</h2><p class="panel-sub">${c.filter(x => x.ok).length} de ${c.length} puntos al día. Se puede cerrar igual: lo pendiente queda a la vista.</p></div></div>
    <ul class="control">${c.map(x => `<li class="${x.ok ? "ok" : "falta"}"><span class="marca" aria-hidden="true">${x.ok ? ICONOS.ok : ICONOS.alerta}</span><div><b>${esc(x.titulo)}</b>${x.detalle ? `<small>${esc(x.detalle)}</small>` : ""}</div>${x.accion ? `<a class="btn btn-sec btn-chico no-imprimir" href="${x.accion[1]}">${esc(x.accion[0])}</a>` : ""}</li>`).join("")}</ul></section>`;
}

/* ---------- reparto final (proyecto cerrado) ---------- */
function panelReparto(p, liq) {
  const filas = liq.foto.cuenta.filas;
  const tot = k => filas.reduce((a, f) => a + f[k], 0);
  return `<section class="panel"><div class="panel-cab"><div><h2>Reparto final</h2><p class="panel-sub">Lo que le tocó a cada socio del resultado final y lo que ya recibió${filas.some(f => f.reinvertido > 0.5) ? " (incluye lo reinvertido)" : ""}. Si queda algo a favor, falta registrar un pago.</p></div></div>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Socio</th><th class="n">%</th><th class="n">Resultado</th><th class="n">Recibido</th><th class="n">A favor</th></tr></thead><tbody>
      ${filas.map(f => `<tr><td><b>${esc(f.nombre)}</b></td><td class="n">${fmtPct(f.pct, 0)}</td><td class="n">${u(f.resultado)}</td><td class="n">${u(-f.distribuido)}</td><td class="n"><b>${u(f.aFavor)}</b></td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="n">${fmtPct(tot("pct"), 0)}</td><td class="n">${u(tot("resultado"))}</td><td class="n">${u(-tot("distribuido"))}</td><td class="n">${u(tot("aFavor"))}</td></tr>
    </tbody></table></div></section>`;
}

/* ---------- resultado final ---------- */
function panelResultado(p, liq, sg) {
  const r = liq.r, x = r.impuestos;
  const margen = r.ventasUsd > 0 ? liq.finalUsd / r.ventasUsd : null;
  const fila = (t, v, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><td>${t}</td><td class="n">${u(v)}</td></tr>`;
  return `<section class="panel"><div class="panel-cab"><div><h2>Resultado final</h2><p class="panel-sub">En dólares MEP, netos de IVA.${margen != null ? ` Margen final ${esc(fmtPct(margen))}${sg.margenCotizadoPct != null ? ` contra ${esc(fmtPct(sg.margenCotizadoPct))} cotizado` : ""}.` : ""}</p></div></div>
    <table class="tabla tabla-compacta"><tbody>
      ${fila("Cobrado, neto de IVA", r.ventasUsd)}
      ${fila("Costos", -r.costosUsd)}
      ${r.honorariosUsd ? fila("Honorarios de socios", -r.honorariosUsd) : ""}
      ${r.interesesUsd ? fila("Intereses de préstamos", -r.interesesUsd) : ""}
      ${r.interesesGanadosUsd ? fila("Intereses ganados", r.interesesGanadosUsd) : ""}
      ${fila("<b>Resultado antes de impuestos</b>", r.resultadoUsd, "sub")}
      ${fila(`Ingresos Brutos (${String(x.param.iibb).replace(".", ",")}%)`, -x.iibbUsd)}
      ${fila("Impuesto al cheque", -x.chequeUsd)}
      ${fila("Ganancias", -x.gananciasCostoUsd)}
      ${fila("<b>Neto de impuestos</b>", r.resultadoNetoUsd, "sub")}
      ${liq.asignado ? fila("Parte de estructura y de Magna, neta de Ganancias", -liq.asignadoNeto) : ""}
      <tr><td>Diferencia de cambio y redondeos<small class="mute" style="display:block">La caja está en pesos y las cuentas en dólares de cada día: es lo que se ganó o perdió por tener pesos.</small></td><td class="n">${u(liq.difTotalUsd)}</td></tr>
      ${fila("Resultado final para los socios", liq.finalUsd, "total")}
    </tbody></table></section>`;
}

/* ---------- liquidación en orden ---------- */
function panelLiquidacion(p, liq, cerrado) {
  const pagos = liq.pasos.flatMap(x => x.movs);
  const estado = x => {
    if (x.k === "resultado") return x.faltaUsd > L.TOL_USD ? ["falta", "Falta"] : x.parcial ? ["falta", "Espera cobros"] : ["ok", "Hecho"];
    if (x.faltaUsd > L.TOL_USD) return ["falta", "Falta"];
    if (x.faltaUsd < -L.TOL_USD) return ["sobra", "Sobra"];
    return ["ok", "Hecho"];
  };
  const pasoHtml = x => {
    const [cls, tag] = estado(x);
    const nada = cls === "ok" && !x.filas.some(f => Math.abs(f.usd ?? f.ars) > 0.5) && !(x.hechoUsd > 0.5 || x.hechoArs > 0.5);
    const arsF = Math.abs(x.faltaUsd) > L.TOL_USD ? (x.k === "impuestos" ? x.faltaArs : x.faltaUsd * liq.mep) : 0;
    const det = x.filas.filter(f => Math.abs(f.usd ?? (f.ars / (liq.mep || 1))) > L.TOL_USD);
    return `<div class="paso ${cls}"><div class="paso-n">${cls === "ok" ? ICONOS.ok : x.n}</div>
      <div><div class="paso-tit">${esc(x.titulo)} <span class="tag ${cls === "ok" ? "tag-ok" : cls === "falta" ? "tag-alerta" : ""}">${nada ? "No corresponde" : tag}</span></div><div class="paso-sub">${esc(x.sub)}</div></div>
      <div class="paso-monto">${Math.abs(arsF) > 0.5 ? `<b>${esc(fmtARS(Math.abs(arsF)))}</b><span>${esc(fmtUSD(Math.abs(x.faltaUsd)))}${cls === "sobra" ? " de más" : ""}</span>` : `<b class="mute">—</b>`}</div>
      ${det.length > 1 || (det.length === 1 && x.k !== "impuestos" && x.k !== "estructura") ? `<div class="paso-det"><table class="tabla tabla-compacta"><tbody>${det.map(f => `<tr><td>${esc(f.quien)}${f.interes > 0.5 ? `<small class="mute" style="display:block">incluye ${esc(fmtUSD(f.interes))} de interés</small>` : ""}</td><td class="n">${f.usd != null ? esc(fmtUSD(f.usd)) : ""}</td><td class="n">${esc(fmtARS(f.ars))}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${x.manual.length ? `<div class="paso-det"><div class="aviso" style="margin:0">${ICONOS.alerta}<div>Hay préstamos sin prestamista identificado (${x.manual.map(m => esc(fmtUSD(m.usd))).join(", ")}). Registrá la devolución a mano desde Cargar.</div></div></div>` : ""}
      ${x.parcial ? `<div class="paso-det"><div class="aviso aviso-info" style="margin:0">${ICONOS.alerta}<div>Hay facturas por cobrar con su IVA ya reservado (${esc(fmtARS(liq.ivaPorCobrarArs))}). Ahora se reparte lo que hay en caja; los otros ${esc(fmtUSD(x.aCobrarUsd))} quedan a favor de cada socio hasta que se cobren.</div></div></div>` : ""}
      ${x.negativos && x.negativos.length ? `<div class="paso-det"><div class="aviso" style="margin:0">${ICONOS.alerta}<div>${x.negativos.map(m => `${esc(m.quien)} recibió ${esc(fmtUSD(-m.usd))} de más`).join("; ")}: se compensa con lo que tenga a favor en otros proyectos o reponiendo la diferencia.</div></div></div>` : ""}
      ${x.movs.length ? `<div class="paso-acc no-imprimir"><button class="btn btn-sec btn-chico" data-registrar="${x.k}">Registrar ${x.movs.length === 1 ? "el movimiento" : `${x.movs.length} movimientos`}</button></div>` : ""}
    </div>`;
  };
  return `<section class="panel"><div class="panel-cab"><div><h2>Liquidación en orden</h2><p class="panel-sub">Al ${esc(fmtFecha(liq.fecha, true))}, dólar ${esc(fmtARS(liq.mep, 2))}. Cada paso propone los movimientos; al registrarlos quedan cargados en Movimientos.${liq.ajusteReserva > 1 ? ` La reserva incluye ${esc(fmtARS(liq.ajusteReserva))} por el impuesto al cheque de los pagos del cierre.` : ""}</p></div>
      ${pagos.length > 1 ? `<button class="btn btn-pri btn-chico no-imprimir" id="lq-todo">Registrar todo (${pagos.length})</button>` : ""}</div>
    <div class="resumen-filtro">
      <div><span>Caja del proyecto</span><b>${num(liq.caja, fmtARS)}</b></div>
      <div><span>Pasos 1 a 5</span><b>${num(-(liq.caja - liq.cajaTrasArs), fmtARS)}</b></div>
      <div><span>Queda para el resultado</span><b>${num(liq.cajaTrasArs, fmtARS)}</b></div>
    </div>
    ${!liq.alcanza ? `<div class="aviso" role="alert">${ICONOS.alerta}<div><b>La caja no alcanza.</b> Después de los pasos 1 a 5 faltan ${esc(fmtARS(-liq.cajaTrasArs))}. Cobrá lo pendiente o registrá un aporte; mientras tanto, conviene registrar los pasos en orden.</div></div>` : ""}
    <div class="pasos">${liq.pasos.map(pasoHtml).join("")}</div></section>`;
}

/* ---------- base de costos ---------- */
function panelFichas(p, fecha, cerrado) {
  let fichas, fx = null;
  if (cerrado) fichas = S.fichas.filter(x => x.proyecto === p.id && x.origen === "cierre").sort((a, b) => String(a.numero).localeCompare(String(b.numero), "es", { numeric: true }));
  else { fx = L.fichasDe(p, fecha); fichas = fx.fichas; }
  const ggPct = cerrado ? (fichas[0] || {}).ggPct : fx.ggPct;
  const desv = v => v == null ? "—" : num(v, fmtPct);
  return `<section class="panel"><div class="panel-cab"><div><h2>${cerrado ? "En la base de costos" : "Lo que pasa a la base de costos"}</h2><p class="panel-sub">Costo real por unidad ejecutada, en dólares MEP sin IVA. Lo imputado a un rubro se reparte entre sus ítems y lo general entre todos, según el peso de cada uno en el costo directo cotizado.${ggPct != null ? ` Los gastos generales fueron ${esc(fmtPct(ggPct))} del costo de los ítems.` : ""}</p></div>${cerrado && fichas.length ? `<a class="btn btn-fant btn-chico no-imprimir" href="#base/obra:${encodeURIComponent(p.nombre)}">Abrir en la base</a>` : ""}</div>
    ${fichas.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Ítem</th><th class="n ocultar-movil">Cantidad</th><th class="n ocultar-movil">Cotizado</th><th class="n">Real</th><th class="n ocultar-movil">Con generales</th><th class="n">Desvío</th></tr></thead><tbody>
      ${fichas.map(f => `<tr><td class="desc"><b>Ítem ${esc(f.numero)}</b> · <span class="desc-txt">${esc(f.descripcion)}</span><small>${esc(f.unidad || "s/u")}${f.sinAvance ? " · sin avance cargado: se tomó la cantidad cotizada" : ""}</small></td>
        <td class="n ocultar-movil">${esc(fmtCant(f.cantidad))} ${esc(f.unidad || "")}</td><td class="n ocultar-movil">${f.cot.total ? esc(fmtUSD(f.cot.total, 2)) : "—"}</td><td class="n">${esc(fmtUSD(f.real.item, 2))}</td><td class="n ocultar-movil">${esc(fmtUSD(f.real.total, 2))}</td><td class="n">${desv(f.desvioPct)}</td></tr>`).join("")}
    </tbody></table></div>${fx && fx.sinRepartirUsd > 0.5 ? `<p class="panel-sub" style="margin-top:10px">${esc(fmtUSD(fx.sinRepartirUsd))} de gastos generales no se pudieron repartir porque los ítems no tienen costo ni precio.</p>` : ""}`
      : `<div class="vacio">${(p.items || []).length ? "Ningún ítem tiene costos imputados todavía." : "El proyecto no tiene ítems de cotización."}</div>`}</section>`;
}

/* ---------- cerrar ---------- */
function panelCerrar(p, liq) {
  const pend = liq.pendientes.length + (liq.pasos[5].faltaUsd > L.TOL_USD ? 1 : 0);
  return `<section class="panel no-imprimir"><div class="panel-cab"><div><h2>Cerrar el proyecto</h2><p class="panel-sub">Al cerrar:</p></div></div>
    <ul class="lista-simple">
      <li>Los intereses y los honorarios dejan de correr al ${esc(fmtFecha(liq.fecha, true))}.</li>
      <li>La parte de estructura y de Magna queda fija en ${esc(fmtUSD(liq.asignado))}; lo que venga después se reparte entre los demás proyectos.</li>
      <li>La diferencia de cambio de la liquidación (${esc(fmtUSD(liq.difUsd))}) queda en el resultado final.</li>
      <li>Los costos reales de cada ítem pasan a la base de costos.</li>
      <li>El proyecto sale de la lista de proyectos abiertos. Se puede reabrir.</li>
    </ul>
    ${pend ? `<div class="aviso" style="margin:12px 0 0">${ICONOS.alerta}<div>Quedan ${pend} paso${pend === 1 ? "" : "s"} de la liquidación sin registrar. Si cerrás igual, lo pendiente queda a favor de cada uno en Socios.</div></div>` : ""}
    <div class="form-pie" style="margin-top:14px"><button class="btn btn-pri" id="lq-cerrar">${ICONOS.bandera}Cerrar el proyecto</button></div></section>`;
}

/* ---------- eventos ---------- */
function cablear(el, p, s, liq, cerrado) {
  $("#lq-imprimir", el).addEventListener("click", () => window.print());
  const qf = $("#lq-fecha", el);
  if (qf) qf.addEventListener("change", () => { if (!qf.value) return; s.fecha = qf.value; s.mepManual = false; s.mepBuscado = ""; app.refrescar(); });
  const qm = $("#lq-mep", el);
  if (qm) qm.addEventListener("change", () => { const v = parseMonto(qm.value); if (v > 0) { s.mep = v; s.mepManual = true; s.mepHint = "Cargado a mano."; app.refrescar(); } else toast("Revisá el dólar.", "error"); });
  const qb = $("#lq-buscar", el);
  if (qb) qb.addEventListener("click", () => { s.mepManual = false; buscarMep(p, s); app.refrescar(); });
  const qd = $("#lq-destino", el);
  if (qd) qd.addEventListener("change", () => { s.destino = qd.value; app.refrescar(); });

  $$("[data-registrar]", el).forEach(b => b.addEventListener("click", () => {
    const x = liq.pasos.find(y => y.k === b.dataset.registrar);
    if (x) modalRegistrar(p, `Paso ${x.n}: ${x.titulo.toLowerCase()}`, x.movs, liq);
  }));
  const bt = $("#lq-todo", el);
  if (bt) bt.addEventListener("click", () => modalRegistrar(p, "Registrar la liquidación", liq.pasos.flatMap(x => x.movs), liq));

  const bc = $("#lq-cerrar", el);
  if (bc) bc.addEventListener("click", e => {
    if (!(s.mep > 0)) return toast("Falta el dólar de la liquidación.", "error");
    confirmar2(e.currentTarget, () => {
      const res = L.cerrarProyecto(p, s.fecha, s.mep, s.destino, app.usuario.socio);
      toast(`Proyecto cerrado. ${res.fichas} ítem${res.fichas === 1 ? "" : "s"} pasaron a la base de costos.`);
      window.scrollTo(0, 0);
    }, "Tocá de nuevo para cerrar");
  });
  const br = $("#lq-reabrir", el);
  if (br) br.addEventListener("click", e => confirmar2(e.currentTarget, () => {
    L.reabrirProyecto(p, app.usuario.socio);
    toast("Proyecto reabierto. Sus fichas salieron de la base de costos hasta que se vuelva a cerrar.");
  }, "Tocá de nuevo para reabrir"));

  $("#lq-informe", el).addEventListener("click", async ev => {
    const b = ev.currentTarget;
    if (!IA.hayClave()) return toast("Falta la clave de IA en Ajustes → Impuestos e IA.", "error");
    b.disabled = true; b.textContent = "Redactando…";
    $("#lq-texto", el).innerHTML = `<div class="vacio"><span class="punto"></span>La IA está leyendo el cierre del proyecto…</div>`;
    try {
      const fichas = cerrado ? S.fichas.filter(f => f.proyecto === p.id && f.origen === "cierre") : L.fichasDe(p, s.fecha).fichas;
      const r0 = v => Math.round(Number(v) || 0);
      const datos = {
        fecha_liquidacion: s.fecha, dolar_liquidacion: s.mep, cerrado,
        resultado_usd: { cobrado: r0(liq.r.ventasUsd), costos: r0(liq.r.costosUsd), honorarios: r0(liq.r.honorariosUsd), intereses: r0(liq.r.interesesUsd), antes_de_impuestos: r0(liq.r.resultadoUsd), iibb: r0(liq.r.impuestos.iibbUsd), cheque: r0(liq.r.impuestos.chequeUsd), ganancias: r0(liq.r.impuestos.gananciasCostoUsd), neto_impuestos: r0(liq.r.resultadoNetoUsd), estructura_neta: r0(liq.asignadoNeto), diferencia_cambio: r0(liq.difTotalUsd), final: r0(liq.finalUsd) },
        liquidacion: liq.pasos.map(x => ({ paso: x.n, que: x.titulo, falta_usd: r0(x.faltaUsd), detalle: x.filas.map(f => ({ quien: f.quien, usd: r0(f.usd ?? (f.ars / (s.mep || 1))) })) })),
        items_costo_unitario_usd: fichas.map(f => ({ item: f.numero, descripcion: f.descripcion.slice(0, 70), unidad: f.unidad, cantidad: f.cantidad, cotizado_u: Math.round(f.cot.total * 100) / 100, real_u: Math.round(f.real.item * 100) / 100, con_generales_u: Math.round(f.real.total * 100) / 100, desvio_pct: f.desvioPct == null ? null : Math.round(f.desvioPct * 1000) / 10, mano_obra_u: Math.round(f.real.mo), equipos_u: Math.round(f.real.eq), materiales_u: Math.round(f.real.mat), subcontratos_u: Math.round(f.real.sub) })),
        gastos_generales_pct: fichas[0] && fichas[0].ggPct != null ? Math.round(fichas[0].ggPct * 1000) / 10 : null,
        proyecto: contextoProyecto(p)
      };
      const sistema = "Sos el asistente de gestión de MICA (Minería Integral Catamarca), una empresa de servicios mineros con cuatro socios. Redactás el informe de cierre de una obra para los socios: claro, sobrio, en español rioplatense y con oraciones cortas. Usás solo los datos que te pasan; si algo falta, lo decís. Los montos van en dólares MEP salvo que se indique pesos. No inventes cifras.";
      const pedido = `Redactá el informe de cierre del proyecto ${p.nombre}. Estructura: 1) Resultado en tres líneas (final para los socios y margen contra lo cotizado). 2) Cómo terminó contra lo cotizado: ítems con mayor desvío y por qué parte del costo (mano de obra, equipos, materiales, subcontratos). 3) Gastos generales e indirectos. 4) Cobranza y financiamiento: anticipo, préstamos, intereses y diferencia de cambio. 5) Liquidación y reparto entre los socios. 6) Lecciones para cotizar la próxima obra: qué costos unitarios conviene corregir y en cuánto, con números. Usá títulos cortos y viñetas. Máximo 500 palabras.\n\nDatos:\n${JSON.stringify(datos)}`;
      informes[p.id] = await IA.texto([{ role: "user", content: pedido }], { sistema, maxTokens: 2000 });
      app.refrescar();
    } catch (err) {
      $("#lq-texto", el).innerHTML = `<div class="aviso" style="margin:0">${ICONOS.alerta}<div>${esc(err.message)}</div></div>`;
      b.disabled = false; b.textContent = "Generar informe";
    }
  });
  const bco = $("#lq-copiar", el);
  if (bco) bco.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(informes[p.id]); toast("Informe copiado"); }
    catch (e) { const rg = document.createRange(); rg.selectNodeContents($(".informe", el)); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); toast("Texto seleccionado: copialo con Ctrl+C"); }
  });
}

/* ---------- registrar movimientos de la liquidación ---------- */
const descMov = m => m.tipo === "pase"
  ? `${M.nombreClase("pase", m.clase)} · de ${M.nombreBolsillo(m.bolsillo)} a ${M.nombreBolsillo(m.destino)}`
  : `${M.nombreClase("egreso", m.clase)} · sale de la cuenta de Magna`;

function modalRegistrar(p, titulo, movs, liq) {
  if (!movs.length) return;
  const md = modal(titulo, `<div class="form">
    <p class="mute" style="margin:0">Fecha ${esc(fmtFecha(liq.fecha, true))} · dólar ${esc(fmtARS(liq.mep, 2))}. Hacé las transferencias en el banco por estos montos y registralas acá. Si el banco debitó otro importe, corregilo antes de registrar.</p>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th><span class="sr">Incluir</span></th><th>Movimiento</th><th class="n">Pesos</th><th class="n ocultar-movil">Dólares</th></tr></thead><tbody>
      ${movs.map((m, i) => `<tr><td><input type="checkbox" data-inc="${i}" checked aria-label="Incluir"></td><td><b>${esc(m.quien || M.nombreBolsillo(m.destino))}</b><small class="mute" style="display:block">${esc(descMov(m))}</small></td>
        <td class="n"><input class="input" data-ars="${i}" inputmode="decimal" value="${esc(fmtMiles(m.montoARS))}" style="max-width:150px;text-align:right" aria-label="Monto en pesos"></td><td class="n ocultar-movil" data-usd="${i}"></td></tr>`).join("")}
      <tr class="total"><td></td><td>Total</td><td class="n" id="rg-tot"></td><td class="n ocultar-movil" id="rg-tot-usd"></td></tr>
    </tbody></table></div>
    <div class="form-pie"><button class="btn btn-pri" id="rg-ok">Registrar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div></div>`, { ancho: 760 });
  const leer = () => movs.map((m, i) => ({ m, inc: $(`[data-inc="${i}"]`, md).checked, ars: parseMonto($(`[data-ars="${i}"]`, md).value) }));
  const totales = () => {
    let t = 0;
    leer().forEach((x, i) => {
      $(`[data-usd="${i}"]`, md).textContent = x.ars > 0 ? fmtUSD(x.ars / liq.mep, 2) : "—";
      if (x.inc && x.ars > 0) t += x.ars;
    });
    $("#rg-tot", md).textContent = fmtARS(t);
    $("#rg-tot-usd", md).textContent = fmtUSD(t / liq.mep);
  };
  $$("[data-ars], [data-inc]", md).forEach(i => i.addEventListener("input", totales));
  totales();
  $("#rg-ok", md).addEventListener("click", () => {
    const sel = leer().filter(x => x.inc);
    if (!sel.length) return toast("No hay movimientos elegidos.", "error");
    if (sel.some(x => !(x.ars > 0))) return toast("Revisá los montos: tienen que ser mayores que cero.", "error");
    L.registrar(sel.map(x => Object.assign({}, x.m, { montoARS: x.ars })), app.usuario.socio);
    cerrarModal();
    toast(sel.length === 1 ? "Movimiento registrado" : `${sel.length} movimientos registrados`);
  });
}
