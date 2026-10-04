/* =========================================================
   Seguimiento: curva S, proyección de cierre por rubro y
   desvío por ítem contra lo cotizado.
   ========================================================= */
import { app } from "../contexto.js";
import * as M from "../modelo.js";
import * as P from "../presupuesto.js";
import { $, esc, num, fmtMoneda, fmtPct, fmtCant, mesLabel, cabecera, ICONOS } from "../ui.js";
import { lineas } from "../graficos.js";
import { pedirProyecto } from "./comun.js";

const C_PLAN = "#7A7B80", C_FIS = "#3F4045", C_GASTO = "#E1262D";

export function render(el) {
  if (app.ctx.tipo !== "proyecto" || !M.proyecto(app.ctx.id)) return pedirProyecto(el, "Seguimiento", "Curva S, proyección de cierre y desvíos de cada proyecto.");
  const p = M.proyecto(app.ctx.id);
  const sg = P.seguimiento(p);
  const mon = sg.moneda;
  const f = v => num(v, x => fmtMoneda(x, mon));
  const fU = v => num(v, x => fmtMoneda(x, mon, Math.abs(x) < 100 ? 2 : 0));
  const kpi = (rot, val, sub = "") => `<div class="kpi"><div class="kpi-rot">${rot}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
  const desvio = sg.costoProyectado - sg.costoCotizado;

  let h = cabecera(p.codigo || "Proyecto", "Seguimiento", `${esc(p.nombre)} · en ${mon === "ARS" ? "pesos" : "dólares MEP"}, sin IVA`,
    `<a class="btn btn-sec" href="#presupuesto/avance">Cargar avance</a>`);

  const faltan = [];
  if (!(p.items || []).length) faltan.push("los ítems de la cotización");
  if (!sg.hayCostos) faltan.push("los costos cotizados");
  if (!P.tieneVentanas(p)) faltan.push("la ventana de ejecución de los ítems");
  if (!P.mesesConAvance(p.id).length) faltan.push("el avance físico");
  if (faltan.length) h += `<div class="aviso aviso-info">${ICONOS.alerta}<div>Para que el seguimiento esté completo falta cargar ${faltan.join(", ").replace(/, ([^,]*)$/, " y $1")}. Se cargan en <a href="#presupuesto">Contrato y presupuesto</a>.</div></div>`;

  h += `<div class="grid-kpi">
    ${kpi("Avance físico", fmtPct(sg.avanceFisico, 0), sg.planHoy != null ? `Plan a ${mesLabel(sg.mesPlan).toLowerCase()}: ${fmtPct(sg.planHoy, 0)}` : "Sin plan cargado")}
    ${kpi("Avance de gasto", sg.avanceGasto == null ? "—" : fmtPct(sg.avanceGasto, 0), sg.hayCostos ? `${fmtMoneda(sg.costoReal, mon)} de ${fmtMoneda(sg.costoCotizado, mon)} cotizados` : "Falta el costo cotizado")}
    ${kpi("Costo proyectado al cierre", sg.hayCostos ? f(sg.costoProyectado) : "—", sg.hayCostos ? (Math.abs(desvio) < 1 ? "Igual a lo cotizado" : `${desvio > 0 ? "Por encima" : "Por debajo"} de lo cotizado en ${fmtMoneda(Math.abs(desvio), mon)}`) : "")}
    ${kpi("Margen proyectado", sg.hayCostos ? f(sg.margenProyectado) : "—", sg.hayCostos && sg.margenProyectadoPct != null ? `${fmtPct(sg.margenProyectadoPct)} · cotizado ${fmtPct(sg.margenCotizadoPct)}` : "")}
  </div>`;

  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Curva S</h2><p class="panel-sub">Acumulado en % del total. El plan y el avance físico se miden por el precio de venta de cada ítem; el gasto, contra el costo cotizado${p.lineaBase ? " de la línea base" : ""}.</p></div></div><div id="sg-curva"></div></section>`;

  const conf = c => `<span class="tag ${c === "alta" ? "tag-ok" : c === "sin avance" ? "tag-borde" : "tag-alerta"}">${c === "sin avance" ? "Según cotizado" : "Confianza " + c}</span>`;
  const filaR = r => {
    const d = r.cot - r.proyectado;
    return `<tr><td><b>${esc(r.nombre)}</b>${r.delRubro ? `<small class="mute" style="display:block">Incluye ${fmtMoneda(r.delRubro, mon)} cargado al rubro sin ítem</small>` : ""}</td>
      <td class="n">${r.cot ? f(r.cot) : "—"}</td><td class="n ocultar-movil">${f(r.real)}</td>
      <td class="n col-pct ocultar-movil">${fmtPct(r.avance, 0)}<div class="mini-barra"><i style="width:${Math.min(100, r.avance * 100)}%"></i></div></td>
      <td class="n">${f(r.proyectado)}</td><td class="n">${r.cot ? num(d, x => fmtMoneda(x, mon)) : "—"}</td><td class="ocultar-movil">${conf(r.confianza)}</td></tr>`;
  };
  h += `<section class="panel"><div class="panel-cab"><div><h2>Proyección de cierre por rubro</h2><p class="panel-sub">Con al menos 5% de avance y costo cargado, el costo final se estima como costo real ÷ avance físico. Si no, se toma lo cotizado. La diferencia es cotizado menos proyectado: en negro lo que queda a favor, en rojo el sobrecosto.</p></div></div>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Rubro</th><th class="n">Cotizado</th><th class="n ocultar-movil">Real</th><th class="n col-pct ocultar-movil">Avance</th><th class="n">Proyectado</th><th class="n">Dif<span class="ocultar-movil">erencia</span></th><th class="ocultar-movil"></th></tr></thead><tbody>
    ${sg.rubros.map(filaR).join("")}${filaR(sg.general)}
    ${sg.otros ? `<tr class="sub"><td>Gastos de ítems o rubros borrados</td><td class="n">—</td><td class="n ocultar-movil">${f(sg.otros)}</td><td class="ocultar-movil"></td><td class="n">${f(sg.otros)}</td><td></td><td class="ocultar-movil"></td></tr>` : ""}
    <tr class="total"><td>Total</td><td class="n">${sg.costoCotizado ? f(sg.costoCotizado) : "—"}</td><td class="n ocultar-movil">${f(sg.costoReal)}</td><td class="n col-pct ocultar-movil">${fmtPct(sg.avanceFisico, 0)}</td><td class="n">${f(sg.costoProyectado)}</td><td class="n">${sg.costoCotizado ? num(-desvio, x => fmtMoneda(x, mon)) : "—"}</td><td class="ocultar-movil"></td></tr>
    </tbody></table></div></section>`;

  h += `<section class="panel"><div class="panel-cab"><div><h2>Desvío por ítem</h2><p class="panel-sub">Costo unitario real = costo imputado directo al ítem ÷ cantidad ejecutada. La diferencia unitaria es cuánto más barato (negro) o más caro (rojo) sale cada unidad contra lo cotizado. Lo cargado a rubro o a general no entra acá; se reparte entre los ítems al cerrar el proyecto.</p></div></div>
    ${sg.filas.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Ítem</th><th class="n col-pct">Avance</th><th class="n ocultar-movil">Costo unit. cotizado</th><th class="n ocultar-movil">Costo unit. real</th><th class="n ocultar-movil">Dif. unit.</th><th class="n">Proyectado</th><th class="n">Dif<span class="ocultar-movil">erencia</span></th></tr></thead><tbody>
    ${sg.filas.map(x => {
      const du = x.cuReal != null && x.cuCot > 0 ? 1 - x.cuReal / x.cuCot : null;
      const d = x.cot - x.proyectado;
      return `<tr><td class="desc"><b>Ítem ${esc(x.item.numero)}</b> · <span class="desc-txt">${esc(x.item.descripcion)}</span><small>${esc(fmtCant(x.ejec))} de ${esc(fmtCant(x.cant))} ${esc(x.item.unidad || "")} · real ${esc(fmtMoneda(x.real, mon))}</small></td>
        <td class="n col-pct">${fmtPct(x.avance, 0)}<div class="mini-barra"><i class="${x.avance > 1.0001 ? "exceso" : ""}" style="width:${Math.min(100, x.avance * 100)}%"></i></div></td>
        <td class="n ocultar-movil">${x.cuCot ? fU(x.cuCot) : "—"}</td><td class="n ocultar-movil">${x.cuReal != null ? fU(x.cuReal) : "—"}</td>
        <td class="n ocultar-movil">${du == null ? "—" : num(du, fmtPct)}</td><td class="n">${f(x.proyectado)}</td><td class="n">${x.cot ? num(d, v => fmtMoneda(v, mon)) : "—"}</td></tr>`;
    }).join("")}</tbody></table></div>` : `<div class="vacio">Sin ítems.</div>`}</section>`;

  el.innerHTML = h;
  dibujarCurva($("#sg-curva", el), p);
}

function dibujarCurva(el, p) {
  const c = P.curvaS(p);
  if (!c.meses.length || (!c.hayPlan && !c.hayReal && !c.hayGasto)) {
    el.innerHTML = `<div class="vacio"><b>Todavía no hay curva</b>Se arma con la ventana de ejecución de los ítems, el avance físico y los gastos.</div>`;
    return;
  }
  const series = [];
  if (c.hayPlan) series.push({ nombre: p.lineaBase ? "Plan (línea base)" : "Plan", color: C_PLAN, valores: c.plan, punteada: true });
  if (c.hayReal) series.push({ nombre: "Avance físico", color: C_FIS, valores: c.real });
  if (c.hayGasto) series.push({ nombre: "Gasto", color: C_GASTO, valores: c.gasto });
  lineas(el, {
    etiquetas: c.meses.map(m => mesLabel(m, true)),
    titulosTip: c.meses.map(m => mesLabel(m)),
    series,
    fmt: v => fmtPct(v, 0),
    fmtEje: v => Math.round(v * 100) + "%",
    minTope: 1
  });
}
