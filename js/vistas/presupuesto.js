/* =========================================================
   Contrato y presupuesto: ítems con su precio y su costo
   cotizado, importación desde Excel, avance físico mensual
   y línea base congelada.
   ========================================================= */
import { S, guardar, nuevoId } from "../db.js";
import { app } from "../contexto.js";
import * as M from "../modelo.js";
import * as P from "../presupuesto.js";
import { $, $$, esc, num, fmtMoneda, fmtPct, fmtCant, fmtMiles, fmtFecha, fmtFechaHora, mesLabel, parseMonto, hoyISO, toast, confirmar2, modal, cerrarModal, cargarScript, cabecera, ICONOS } from "../ui.js";
import { pedirProyecto, letraColumna } from "./comun.js";

const PESTANAS = [
  { id: "items", nombre: "Ítems y costos" },
  { id: "avance", nombre: "Avance físico" },
  { id: "base", nombre: "Línea base" }
];
const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

let sucio = false, avisado = false;
/* Mientras se carga el avance del mes, la pantalla no se redibuja sola. */
export const fija = () => sucio;

export function render(el, params) {
  sucio = false;
  if (app.ctx.tipo !== "proyecto" || !M.proyecto(app.ctx.id)) return pedirProyecto(el, "Contrato y presupuesto", "Ítems, costos cotizados, avance físico y línea base de cada proyecto.");
  const p = M.proyecto(app.ctx.id);
  const tab = PESTANAS.some(t => t.id === params[0]) ? params[0] : "items";
  el.innerHTML = cabecera(p.codigo || "Proyecto", "Contrato y presupuesto", `${esc(p.nombre)}${p.cliente ? " · " + esc(p.cliente) : ""}`,
    `<button class="btn btn-sec" id="pr-importar">${ICONOS.subir}Importar desde Excel</button>`) +
    `<nav class="pestanas">${PESTANAS.map(t => `<a href="#presupuesto/${t.id}" class="${t.id === tab ? "activo" : ""}">${t.nombre}</a>`).join("")}</nav><div id="pr"></div>`;
  $("#pr-importar", el).addEventListener("click", () => importarExcel(p.id));
  const cont = $("#pr", el);
  if (tab === "avance") return pestanaAvance(cont, p, params[1]);
  if (tab === "base") return pestanaBase(cont, p);
  return pestanaItems(cont, p);
}

const fmtU = (v, mon) => fmtMoneda(v, mon, Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2);
const kpi = (rot, val, sub = "") => `<div class="kpi"><div class="kpi-rot">${rot}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
const ventanaTxt = it => (it.desde && it.hasta ? (it.desde === it.hasta ? mesLabel(it.desde, true) : `${mesLabel(it.desde, true)} – ${mesLabel(it.hasta, true)}`) : "sin ventana");

/* =================== ÍTEMS Y COSTOS =================== */
function pestanaItems(cont, p) {
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const items = p.items || [];
  const t = P.totales(p);
  const av = P.avancesDe(p.id);
  const avFis = P.avanceGlobal(p, av);
  const f = v => num(v, x => fmtMoneda(x, mon));
  const sumaItems = items.reduce((a, it) => a + P.ventaItem(it), 0);

  let h = `<div class="grid-kpi">
    ${kpi("Precio del contrato", f(t.precio), Math.abs(sumaItems - t.precio) > 1 && sumaItems > 0 ? `Suma de ítems: ${fmtMoneda(sumaItems, mon)}` : `${items.length} ítems`)}
    ${kpi("Costo cotizado", t.costo ? f(t.costo) : "—", t.costo ? `Directo ${fmtMoneda(t.costoDirecto, mon)} · generales ${fmtMoneda(t.general, mon)}` : "Falta cargar los costos")}
    ${kpi("Margen cotizado", t.costo ? f(t.margen) : "—", t.costo && t.margenPct != null ? `${fmtPct(t.margenPct)} del precio` : "")}
    ${kpi("Avance físico", fmtPct(avFis, 0), `<a href="#presupuesto/avance">Cargar avance</a>`)}
  </div>`;
  if (items.length && !P.tieneCostos(p)) h += `<div class="aviso aviso-info" style="margin-top:16px">${ICONOS.alerta}<div>Cargá el <b>costo directo cotizado</b> de cada ítem (materiales, mano de obra, equipos y subcontratos) y los gastos generales. Con eso la app compara lo real contra lo cotizado y proyecta el cierre. Tocá un ítem para editarlo o importá la planilla de cotización.</div></div>`;
  if (items.length && !P.tieneVentanas(p)) h += `<div class="aviso aviso-info" style="margin-top:16px">${ICONOS.alerta}<div>Ningún ítem tiene <b>ventana de ejecución</b> (mes de inicio y de fin). Sin eso no se puede dibujar el plan de la curva S. <button class="btn btn-sec btn-chico" id="pr-ventana-aviso" style="margin-left:6px">Asignar ventana</button></div></div>`;

  const grupos = [];
  items.forEach(it => { const k = it.rubro || "Sin rubro"; let g = grupos.find(x => x.nombre === k); if (!g) { g = { nombre: k, items: [] }; grupos.push(g); } g.items.push(it); });
  const fila = it => {
    const v = P.ventaItem(it), c = P.costoItem(it), cu = P.costoUnit(it);
    const mg = v > 0 && c > 0 ? (v - c) / v : null;
    const ejec = P.ejecutado(av, it.id);
    return `<tr class="clic" data-it="${esc(it.id)}"><td class="desc"><b>Ítem ${esc(it.numero)}</b> · <span class="desc-txt">${esc(it.descripcion)}</span>
      <small>${esc(fmtCant(P.n(it.cantidad)))} ${esc(it.unidad || "")} · ${esc(ventanaTxt(it))}${ejec ? ` · ejecutado ${esc(fmtCant(ejec))}` : ""}</small></td>
      <td class="n ocultar-movil">${fmtU(P.n(it.precioUnitario), mon)}</td><td class="n">${f(v)}</td>
      <td class="n ocultar-movil">${cu ? fmtU(cu, mon) : "—"}</td><td class="n">${c ? f(c) : '<span class="mute">—</span>'}</td>
      <td class="n ocultar-movil">${mg == null ? "—" : num(mg, fmtPct)}</td></tr>`;
  };
  let filas = "";
  grupos.forEach(g => {
    if (grupos.length > 1 || g.nombre !== "Sin rubro") filas += `<tr class="grupo${g.nombre !== "Sin rubro" ? " clic" : ""}"${g.nombre !== "Sin rubro" ? ` data-rubro="${esc(g.nombre)}" title="Cambiar el nombre del rubro"` : ""}><td colspan="6">${esc(g.nombre)}${g.nombre !== "Sin rubro" ? ` <span class="editar-rubro" aria-hidden="true">${ICONOS.editar}</span>` : ""}</td></tr>`;
    filas += g.items.map(fila).join("");
    if (grupos.length > 1) {
      const v = g.items.reduce((a, it) => a + P.ventaItem(it), 0), c = g.items.reduce((a, it) => a + P.costoItem(it), 0);
      filas += `<tr class="sub"><td>Subtotal ${esc(g.nombre)}</td><td class="ocultar-movil"></td><td class="n">${f(v)}</td><td class="ocultar-movil"></td><td class="n">${c ? f(c) : "—"}</td><td class="n ocultar-movil">${v > 0 && c > 0 ? num((v - c) / v, fmtPct) : "—"}</td></tr>`;
    }
  });
  filas += `<tr class="clic sub" id="pr-generales"><td class="desc"><b>Gastos generales de obra</b><small class="ocultar-movil">Camioneta, campamento, seguros, HSSO y lo que no es de un ítem. Es el presupuesto de lo que se imputa a «General de obra».</small></td><td class="ocultar-movil"></td><td class="n">—</td><td class="ocultar-movil"></td><td class="n">${t.general ? f(t.general) : '<span class="mute">—</span>'}</td><td class="n ocultar-movil">—</td></tr>`;
  filas += `<tr class="total"><td>Total</td><td class="ocultar-movil"></td><td class="n">${f(sumaItems)}</td><td class="ocultar-movil"></td><td class="n">${t.costo ? f(t.costo) : "—"}</td><td class="n ocultar-movil">${sumaItems > 0 && t.costo > 0 ? num((sumaItems - t.costo) / sumaItems, fmtPct) : "—"}</td></tr>`;

  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Ítems de la cotización</h2><p class="panel-sub">Precios y costos en ${mon === "ARS" ? "pesos" : "dólares"}, sin IVA. Tocá un ítem para editar su costo cotizado y su ventana de ejecución.</p></div></div>
    ${items.length ? `<div class="tabla-env"><table class="tabla"><thead><tr><th>Ítem</th><th class="n ocultar-movil">Precio unit.</th><th class="n">Venta</th><th class="n ocultar-movil">Costo unit.</th><th class="n">Costo<span class="ocultar-movil"> cotizado</span></th><th class="n ocultar-movil">Margen</th></tr></thead><tbody>${filas}</tbody></table></div>`
      : `<div class="vacio"><b>Sin ítems</b>Importá la planilla de cotización o agregalos uno por uno.</div>`}
    <div class="form-pie" style="margin-top:14px">
      <button class="btn btn-pri" id="pr-nuevo">Agregar ítem</button>
      ${items.length ? `<button class="btn btn-sec" id="pr-ventana">Ventana de ejecución</button>` : ""}
    </div></section>`;
  if (t.costo) {
    const partes = P.PARTES_COSTO.map(c => ({ nombre: c.nombre, v: t.porParte[c.k] })).concat([{ nombre: "Gastos generales", v: t.general }]).filter(x => x.v > 0);
    h += `<section class="panel"><div class="panel-cab"><div><h2>Composición del costo cotizado</h2><p class="panel-sub">Es la referencia para comparar los gastos reales por tipo de costo.</p></div></div>
      <div class="barras-h">${partes.map(x => `<div class="barra-h"><span class="r">${esc(x.nombre)}</span><span class="pista"><i style="width:${Math.max(0.5, (x.v / t.costo) * 100)}%"></i></span><span class="n">${esc(fmtPct(x.v / t.costo, 0))}</span></div>`).join("")}</div></section>`;
  }
  cont.innerHTML = h;
  $$("tr[data-it]", cont).forEach(tr => tr.addEventListener("click", () => modalItem(p.id, tr.dataset.it)));
  $$("tr[data-rubro]", cont).forEach(tr => tr.addEventListener("click", () => modalRubro(p.id, tr.dataset.rubro)));
  $("#pr-nuevo", cont).addEventListener("click", () => modalItem(p.id, null));
  $("#pr-generales", cont).addEventListener("click", () => modalGenerales(p.id));
  const bv = $("#pr-ventana", cont); if (bv) bv.addEventListener("click", () => modalVentana(p.id));
  const bva = $("#pr-ventana-aviso", cont); if (bva) bva.addEventListener("click", () => modalVentana(p.id));
}

/* Costos reales de ítems parecidos en la base de costos (misma unidad y palabras en común). */
const PALABRAS_VACIAS = new Set(["para", "con", "sin", "por", "del", "las", "los", "una", "uno", "incluye", "segun", "tipo", "provision", "servicio"]);
const palabras = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !PALABRAS_VACIAS.has(w));
function referenciaBase(it) {
  if (!S.fichas.length || !it.descripcion) return "";
  const ws = palabras(it.descripcion);
  if (!ws.length) return "";
  const un = String(it.unidad || "").toLowerCase().trim();
  const minimo = ws.length <= 2 ? 1 : 2;
  const parecidas = S.fichas.filter(f => String(f.unidad || "").toLowerCase().trim() === un && palabras(f.descripcion).filter(w => ws.includes(w)).length >= minimo);
  if (!parecidas.length) return "";
  const cant = parecidas.reduce((a, f) => a + (Number(f.cantidad) || 0), 0);
  const prom = cant > 0 ? parecidas.reduce((a, f) => a + f.real.item * (Number(f.cantidad) || 0), 0) / cant : 0;
  const vals = parecidas.map(f => f.real.item);
  const fu = v => fmtMoneda(v, "USD", v < 100 ? 2 : 0);
  return `<div class="aviso aviso-info" style="margin:0">${ICONOS.base}<div>En la base de costos hay ${parecidas.length} ítem${parecidas.length === 1 ? "" : "s"} parecido${parecidas.length === 1 ? "" : "s"}: costo real ${parecidas.length > 1 ? `promedio ${esc(fu(prom))}, entre ${esc(fu(Math.min(...vals)))} y ${esc(fu(Math.max(...vals)))}` : esc(fu(prom))} por ${esc(it.unidad || "unidad")}, en dólares sin IVA. <a href="#base/${encodeURIComponent(ws.slice(0, 2).join(" "))}" data-cerrar>Ver en la base</a></div></div>`;
}

function modalItem(pid, itemId) {
  const p = M.proyecto(pid);
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const items = p.items || [];
  const it0 = itemId ? items.find(x => x.id === itemId) : null;
  const ult = items[items.length - 1];
  const it = it0 ? JSON.parse(JSON.stringify(it0)) : {
    id: nuevoId("it"), numero: String(ult ? (parseInt(ult.numero, 10) || items.length) + 1 : 1), descripcion: "", rubro: ult ? ult.rubro || "" : "",
    unidad: "", cantidad: 1, precioUnitario: 0, costo: {}, desde: ult ? ult.desde || "" : "", hasta: ult ? ult.hasta || "" : ""
  };
  const rubros = M.rubrosDe(p);
  const v = x => (x ? fmtMiles(x) : "");
  const md = modal(it0 ? `Ítem ${it.numero}` : "Nuevo ítem", `<form class="form" id="fi" novalidate>
    <div class="fila" style="grid-template-columns:110px minmax(0,1fr)"><div class="campo"><label for="i-num">N°</label><input id="i-num" value="${esc(it.numero)}"></div>
      <div class="campo"><label for="i-rubro">Rubro</label><input id="i-rubro" list="i-dl-rubros" value="${esc(it.rubro || "")}" placeholder="Agrupa ítems parecidos"><datalist id="i-dl-rubros">${rubros.map(r => `<option value="${esc(r)}">`).join("")}</datalist></div></div>
    <div class="campo"><label for="i-desc">Descripción</label><textarea id="i-desc" rows="2">${esc(it.descripcion)}</textarea></div>
    <div class="fila fila-movil-2" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="campo"><label for="i-unidad">Unidad</label><input id="i-unidad" value="${esc(it.unidad || "")}" placeholder="Gl, Mes, m³…"></div>
      <div class="campo"><label for="i-cant">Cantidad</label><input id="i-cant" inputmode="decimal" value="${v(it.cantidad)}"></div>
      <div class="campo campo-ancho-movil"><label for="i-pu">Precio unitario de venta</label><input id="i-pu" inputmode="decimal" value="${v(it.precioUnitario)}"></div>
    </div>
    <div class="bloque"><div class="bloque-tit">Costo directo unitario cotizado <span class="mute" style="font-weight:400">(${mon === "ARS" ? "pesos" : "dólares"} por ${esc(it.unidad || "unidad")}, sin IVA)</span></div>
      <div class="fila fila-movil-2" style="grid-template-columns:repeat(4,minmax(0,1fr))">${P.PARTES_COSTO.map(c => `<div class="campo"><label for="i-c-${c.k}">${c.nombre}</label><input id="i-c-${c.k}" data-c="${c.k}" inputmode="decimal" value="${v((it.costo || {})[c.k])}"></div>`).join("")}</div>
      <div class="equiv" id="i-calc"><b>—</b><span></span></div>${referenciaBase(it)}</div>
    <div class="bloque"><div class="bloque-tit">Ventana de ejecución</div>
      <div class="fila fila-movil-2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="campo"><label for="i-desde">Desde (mes)</label><input id="i-desde" type="month" value="${esc(it.desde || "")}" placeholder="AAAA-MM"></div>
        <div class="campo"><label for="i-hasta">Hasta (mes)</label><input id="i-hasta" type="month" value="${esc(it.hasta || "")}" placeholder="AAAA-MM"></div></div>
      <p class="hint" style="margin:0">La cantidad se reparte en partes iguales entre esos meses para armar el plan de la curva S.</p></div>
    <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button>
      ${it0 ? `<button class="btn btn-peligro der" type="button" id="i-borrar">${ICONOS.borrar}Quitar ítem</button>` : ""}</div>
  </form>`, { ancho: 680 });
  const q = id => $("#i-" + id, md);
  const leer = () => {
    const costo = {};
    P.PARTES_COSTO.forEach(c => { const x = parseMonto(q("c-" + c.k).value); if (x > 0) costo[c.k] = x; });
    return { cantidad: parseMonto(q("cant").value) || 0, precioUnitario: parseMonto(q("pu").value) || 0, costo };
  };
  const calc = () => {
    const d = leer();
    const cu = P.costoUnit(d);
    const box = q("calc");
    if (!cu) { box.querySelector("b").textContent = "Sin costo cargado"; box.querySelector("span").textContent = `Venta del ítem: ${fmtMoneda(d.cantidad * d.precioUnitario, mon)}`; return; }
    box.querySelector("b").textContent = `Costo unitario ${fmtU(cu, mon)} · costo del ítem ${fmtMoneda(cu * d.cantidad, mon)}`;
    box.querySelector("span").textContent = d.precioUnitario > 0 ? `Margen ${fmtPct((d.precioUnitario - cu) / d.precioUnitario)} sobre una venta de ${fmtMoneda(d.cantidad * d.precioUnitario, mon)}` : "";
  };
  $$("input", md).forEach(i => i.addEventListener("input", calc));
  $$('[inputmode="decimal"]', md).forEach(i => i.addEventListener("blur", () => { const x = parseMonto(i.value); if (!isNaN(x)) i.value = fmtMiles(x); }));
  calc();
  const mesOk = s => !s || /^\d{4}-\d{2}$/.test(s);
  $("#fi", md).addEventListener("submit", e => {
    e.preventDefault();
    const d = leer();
    const desc = q("desc").value.trim();
    if (!desc) return toast("Poné la descripción del ítem.", "error");
    if (!(d.cantidad > 0)) return toast("La cantidad tiene que ser mayor que cero.", "error");
    const desde = q("desde").value.trim(), hasta = q("hasta").value.trim();
    if (!mesOk(desde) || !mesOk(hasta)) return toast("Los meses van como AAAA-MM, por ejemplo 2026-08.", "error");
    if ((desde && !hasta) || (!desde && hasta)) return toast("Completá los dos meses de la ventana, o ninguno.", "error");
    if (desde && hasta && desde > hasta) return toast("El mes de inicio es posterior al de fin.", "error");
    const numero = q("num").value.trim() || it.numero;
    if ((M.proyecto(pid).items || []).some(x => x.id !== it.id && String(x.numero).trim() === numero)) return toast(`Ya hay un ítem ${numero}.`, "error");
    const nuevo = Object.assign(it, d, { numero, descripcion: desc, rubro: q("rubro").value.trim(), unidad: q("unidad").value.trim(), desde, hasta });
    let antes = [], despues = [];
    P.actualizarProyecto(pid, pp => {
      pp.items = pp.items || [];
      antes = JSON.parse(JSON.stringify(pp.items));
      const i = pp.items.findIndex(x => x.id === nuevo.id);
      if (i >= 0) pp.items[i] = nuevo; else pp.items.push(nuevo);
      despues = pp.items;
    }, app.usuario.socio);
    P.reimputarRubros(pid, antes, despues, app.usuario.socio);
    cerrarModal();
    toast(it0 ? "Ítem guardado" : "Ítem agregado");
  });
  const b = q("borrar");
  if (b) b.addEventListener("click", e => {
    const nG = S.movimientos.filter(m => m.bolsillo === pid && m.imputacion === "i:" + it.id).length;
    const nA = Object.keys(P.avancesDe(pid)[it.id] || {}).length;
    const txt = nG || nA ? `Tiene ${nG ? nG + " gasto" + (nG > 1 ? "s" : "") : ""}${nG && nA ? " y " : ""}${nA ? "avance cargado" : ""}: ¿quitar igual?` : "Tocá otra vez para quitar";
    confirmar2(e.currentTarget, () => {
      P.actualizarProyecto(pid, pp => { pp.items = (pp.items || []).filter(x => x.id !== it.id); }, app.usuario.socio);
      cerrarModal();
      toast(nG ? "Ítem quitado. Sus gastos quedan como «Ítem borrado» hasta que los reimputes." : "Ítem quitado");
    }, txt);
  });
}

function modalRubro(pid, nombre) {
  const p = M.proyecto(pid);
  const n = (p.items || []).filter(it => it.rubro === nombre).length;
  const md = modal("Cambiar el nombre del rubro", `<form class="form" id="fr">
    <div class="campo"><label for="r-nombre">Nombre</label><input id="r-nombre" value="${esc(nombre)}"></div>
    <p class="hint" style="margin:0">Se cambia en sus ${n} ítem${n === 1 ? "" : "s"} y en los gastos imputados a este rubro.</p>
    <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div></form>`, { ancho: 480 });
  $("#fr", md).addEventListener("submit", e => {
    e.preventDefault();
    const nuevo = $("#r-nombre", md).value.trim();
    if (!nuevo) return toast("Poné un nombre.", "error");
    if (nuevo === nombre) return cerrarModal();
    let antes = [], despues = [];
    P.actualizarProyecto(pid, pp => {
      antes = JSON.parse(JSON.stringify(pp.items || []));
      (pp.items || []).forEach(it => { if (it.rubro === nombre) it.rubro = nuevo; });
      despues = pp.items || [];
    }, app.usuario.socio);
    const g = P.reimputarRubros(pid, antes, despues, app.usuario.socio);
    cerrarModal();
    toast(`Rubro renombrado${g ? ` y ${g} gasto${g === 1 ? " actualizado" : "s actualizados"}` : ""}`);
  });
}

function modalGenerales(pid) {
  const p = M.proyecto(pid);
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const md = modal("Gastos generales de obra", `<form class="form" id="fg">
    <p style="margin:0" class="mute">Lo que se cotizó para gastos que no son de un ítem: camioneta, campamento, seguros, plan HSSO, visitas del licenciado, traslados. Los gastos que se imputan a «General de obra» se comparan contra este monto.</p>
    <div class="campo"><label for="g-monto">Monto cotizado (${mon === "ARS" ? "pesos" : "dólares"}, sin IVA)</label><input id="g-monto" class="monto" inputmode="decimal" value="${P.n(p.presupuestoGeneral) ? fmtMiles(p.presupuestoGeneral) : ""}"></div>
    <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div></form>`, { ancho: 480 });
  $("#fg", md).addEventListener("submit", e => {
    e.preventDefault();
    const v = parseMonto($("#g-monto", md).value) || 0;
    if (v < 0) return toast("El monto no puede ser negativo.", "error");
    P.actualizarProyecto(pid, pp => { pp.presupuestoGeneral = v; }, app.usuario.socio);
    cerrarModal(); toast("Gastos generales guardados");
  });
}

function modalVentana(pid) {
  const p = M.proyecto(pid);
  const sin = (p.items || []).filter(it => !(it.desde && it.hasta)).length;
  const d0 = (p.inicio || hoyISO()).slice(0, 7), h0 = (p.finPrevisto || "").slice(0, 7);
  const md = modal("Ventana de ejecución", `<form class="form" id="fv">
    <p style="margin:0" class="mute">Asigná el mismo mes de inicio y de fin a varios ítems a la vez. Después se puede ajustar ítem por ítem.</p>
    <div class="fila fila-movil-2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="campo"><label for="v-desde">Desde (mes)</label><input id="v-desde" type="month" value="${esc(d0)}" placeholder="AAAA-MM"></div>
      <div class="campo"><label for="v-hasta">Hasta (mes)</label><input id="v-hasta" type="month" value="${esc(h0)}" placeholder="AAAA-MM"></div></div>
    <label class="check"><input type="checkbox" id="v-todos"${sin ? "" : " checked"}><span>Aplicar a todos los ítems <span class="mute">(si no, solo a los ${sin} sin ventana)</span></span></label>
    <div class="form-pie"><button class="btn btn-pri" type="submit">Aplicar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div></form>`, { ancho: 480 });
  $("#fv", md).addEventListener("submit", e => {
    e.preventDefault();
    const desde = $("#v-desde", md).value.trim(), hasta = $("#v-hasta", md).value.trim();
    if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) return toast("Los meses van como AAAA-MM, por ejemplo 2026-08.", "error");
    if (desde > hasta) return toast("El mes de inicio es posterior al de fin.", "error");
    const todos = $("#v-todos", md).checked;
    let nCamb = 0;
    P.actualizarProyecto(pid, pp => { (pp.items || []).forEach(it => { if (todos || !(it.desde && it.hasta)) { it.desde = desde; it.hasta = hasta; nCamb++; } }); }, app.usuario.socio);
    cerrarModal(); toast(`Ventana aplicada a ${nCamb} ítem${nCamb === 1 ? "" : "s"}`);
  });
}

/* =================== AVANCE FÍSICO =================== */
function mesesDisponibles(p) {
  const cand = [];
  if (p.inicio) cand.push(p.inicio.slice(0, 7));
  (p.items || []).forEach(it => { if (it.desde) cand.push(it.desde); });
  P.mesesConAvance(p.id).forEach(m => cand.push(m));
  S.movimientos.forEach(m => { if (m.bolsillo === p.id && m.fecha) cand.push(m.fecha.slice(0, 7)); });
  const hoy = hoyISO().slice(0, 7);
  const desde = cand.length ? cand.sort()[0] : hoy;
  const ultimoAv = P.mesesConAvance(p.id).pop() || hoy;
  return M.mesesEntre(desde < hoy ? desde : hoy, ultimoAv > hoy ? ultimoAv : hoy).reverse();
}

function pestanaAvance(cont, p, mesParam) {
  const items = p.items || [];
  if (!items.length) { cont.innerHTML = `<div class="panel vacio"><b>Sin ítems</b>Primero cargá los ítems de la cotización.</div>`; return; }
  const meses = mesesDisponibles(p);
  const mes = meses.includes(mesParam) ? mesParam : hoyISO().slice(0, 7);
  const doc = P.avanceDelMes(p.id, mes);
  const av = P.avancesDe(p.id);
  const [ya, ma] = mes.split("-").map(Number);
  const anterior = ma === 1 ? `${ya - 1}-12` : `${ya}-${String(ma - 1).padStart(2, "0")}`;
  const base = p.lineaBase ? p.lineaBase.items : items;
  const plan = P.planMensual(base);
  const planHasta = (id, hasta) => Object.entries(plan).reduce((a, [m, q]) => (m <= hasta ? a + (q[id] || 0) : a), 0);

  const filas = items.map(it => {
    const prev = P.ejecutado(av, it.id, anterior);
    const esteMes = P.n(((doc || {}).cantidades || {})[it.id]);
    const pl = planHasta(it.id, mes);
    return `<tr data-it="${esc(it.id)}" data-prev="${prev}" data-cant="${P.n(it.cantidad)}">
      <td class="desc"><b>Ítem ${esc(it.numero)}</b> · <span class="desc-txt">${esc(it.descripcion)}</span><small>${esc(it.unidad || "")} · contratado ${esc(fmtCant(P.n(it.cantidad)))}${pl ? ` · plan al mes ${esc(fmtCant(pl))}` : ""}</small></td>
      <td class="n ocultar-movil">${fmtCant(prev)}</td>
      <td class="n" style="width:120px"><input class="input n" data-q inputmode="decimal" value="${esteMes ? String(esteMes).replace(".", ",") : ""}" placeholder="0" aria-label="Cantidad del mes, ítem ${esc(it.numero)}" style="text-align:right"></td>
      <td class="n" data-acum></td><td class="n col-pct" data-pct></td></tr>`;
  }).join("");

  const histMeses = P.mesesConAvance(p.id);
  cont.innerHTML = `<section class="panel">
    <div class="panel-cab"><div><h2>Avance físico del mes</h2><p class="panel-sub">Cantidad ejecutada en el mes, en la unidad de cada ítem. El avance global se pondera por el precio de venta de cada ítem.</p></div>
      <div class="campo" style="min-width:170px"><label for="av-mes" class="sr">Mes</label><select id="av-mes" class="input">${meses.map(m => `<option value="${m}"${m === mes ? " selected" : ""}>${mesLabel(m)}</option>`).join("")}</select></div></div>
    <div class="tabla-env"><table class="tabla"><thead><tr><th>Ítem</th><th class="n ocultar-movil">Acumulado anterior</th><th class="n">Este mes</th><th class="n">Acumulado</th><th class="n col-pct">Avance</th></tr></thead><tbody>${filas}</tbody>
      <tfoot><tr class="total"><td>Avance global</td><td class="ocultar-movil"></td><td></td><td class="n" id="av-plan"></td><td class="n col-pct" id="av-global"></td></tr></tfoot></table></div>
    <div class="form-pie" style="margin-top:14px"><button class="btn btn-pri" id="av-guardar">Guardar avance de ${esc(mesLabel(mes))}</button>
      ${doc ? `<span class="chico mute">Cargado por ${esc(M.socioNombre(doc.cargadoPor) || "—")}${doc.modificado ? " · última edición " + fmtFechaHora(doc.modificado) : ""}</span>` : ""}</div>
  </section>
  ${histMeses.length ? `<section class="panel"><div class="panel-cab"><div><h2>Historial de avance</h2><p class="panel-sub">Cantidades ejecutadas por mes.</p></div></div>
    <div class="tabla-env"><table class="tabla"><thead><tr><th>Ítem</th>${histMeses.map(m => `<th class="n">${mesLabel(m, true)}</th>`).join("")}<th class="n">Total</th><th class="n">Contratado</th></tr></thead><tbody>
    ${items.map(it => { const tot = P.ejecutado(av, it.id); return `<tr><td>Ítem ${esc(it.numero)} <span class="mute">${esc(it.unidad || "")}</span></td>${histMeses.map(m => `<td class="n">${(av[it.id] || {})[m] ? fmtCant(av[it.id][m]) : '<span class="mute">·</span>'}</td>`).join("")}<td class="n"><b>${fmtCant(tot)}</b></td><td class="n">${fmtCant(P.n(it.cantidad))}</td></tr>`; }).join("")}
    </tbody></table></div></section>` : ""}`;

  const recalcular = () => {
    let tot = 0, hecho = 0;
    $$("tr[data-it]", cont).forEach(tr => {
      const it = items.find(x => x.id === tr.dataset.it);
      const prev = Number(tr.dataset.prev), cant = Number(tr.dataset.cant);
      const q = parseMonto($("[data-q]", tr).value) || 0;
      const acum = prev + q;
      const pct = cant > 0 ? acum / cant : 0;
      $("[data-acum]", tr).textContent = fmtCant(acum);
      $("[data-pct]", tr).innerHTML = `${fmtPct(pct, 0)}<div class="mini-barra"><i class="${pct > 1.0001 ? "exceso" : ""}" style="width:${Math.min(100, pct * 100)}%"></i></div>`;
      const pu = P.n(it.precioUnitario);
      tot += cant * pu; hecho += Math.min(acum, cant) * pu;
    });
    $("#av-global", cont).textContent = tot > 0 ? fmtPct(hecho / tot, 1) : "—";
    const pl = P.tieneVentanas({ items: base }) ? P.planAcumulado(base, mes) : null;
    $("#av-plan", cont).innerHTML = pl == null ? "" : `<span class="mute" style="font-weight:400">Plan ${fmtPct(pl, 0)}</span>`;
  };
  recalcular();
  $$("[data-q]", cont).forEach(i => {
    i.addEventListener("input", () => { sucio = true; recalcular(); });
    i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const t = $$("[data-q]", cont); const k = t.indexOf(i); if (t[k + 1]) t[k + 1].focus(); } });
  });
  $("#av-mes", cont).addEventListener("change", e => {
    if (sucio && !avisado) { avisado = true; toast("Tenés cambios sin guardar en este mes. Elegí el otro mes de nuevo para descartarlos.", "error"); e.target.value = mes; return; }
    avisado = false; sucio = false;
    app.ir("presupuesto/avance/" + e.target.value);
  });
  $("#av-guardar", cont).addEventListener("click", () => {
    const cantidades = {};
    let mal = false;
    $$("tr[data-it]", cont).forEach(tr => {
      const v = $("[data-q]", tr).value.trim();
      if (!v) return;
      const q = parseMonto(v);
      if (isNaN(q)) { mal = true; $("[data-q]", tr).classList.add("error"); return; }
      if (q) cantidades[tr.dataset.it] = q;
    });
    if (mal) return toast("Hay una cantidad que no es un número.", "error");
    const ahora = new Date().toISOString();
    guardar("avances", Object.assign({}, doc || {}, {
      id: P.idAvance(p.id, mes), proyecto: p.id, mes, cantidades,
      cargadoPor: (doc && doc.cargadoPor) || app.usuario.socio, cargadoEl: (doc && doc.cargadoEl) || ahora,
      modificadoPor: app.usuario.socio
    }));
    sucio = false; avisado = false;
    toast(`Avance de ${mesLabel(mes)} guardado`);
    app.refrescar();
  });
}

/* =================== LÍNEA BASE =================== */
function pestanaBase(cont, p) {
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const f = v => num(v, x => fmtMoneda(x, mon));
  const items = p.items || [];
  if (!p.lineaBase) {
    cont.innerHTML = `<section class="panel"><div class="panel-cab"><div><h2>Sin línea base</h2><p class="panel-sub">La línea base es una foto fija del presupuesto al arrancar la obra: cantidades, precios, costos cotizados y ventanas. Después se puede seguir editando el presupuesto y siempre se compara contra este punto de partida. El plan de la curva S sale de la línea base.</p></div></div>
      ${items.length ? `<div class="form-pie"><button class="btn btn-pri" id="lb-congelar">Congelar línea base con ${items.length} ítems</button></div>` : `<div class="vacio">Primero cargá los ítems.</div>`}
      ${items.length && !P.tieneCostos(p) ? `<p class="hint warn" style="margin-top:10px">Todavía no hay costos cotizados cargados: conviene cargarlos antes de congelar.</p>` : ""}
      ${items.length && !P.tieneVentanas(p) ? `<p class="hint warn" style="margin-top:6px">Ningún ítem tiene ventana de ejecución: sin eso la curva S no tiene plan.</p>` : ""}</section>`;
    const b = $("#lb-congelar", cont);
    if (b) b.addEventListener("click", e => confirmar2(e.currentTarget, () => {
      P.actualizarProyecto(p.id, pp => P.congelar(pp, app.usuario.socio), app.usuario.socio);
      toast("Línea base congelada");
    }, "Tocá otra vez para congelar"));
    return;
  }
  const c = P.compararConBase(p);
  const etiqueta = { igual: ["Sin cambios", "tag-borde"], cambiado: ["Cambió", "tag-alerta"], nuevo: ["Agregado después", "tag-alerta"], quitado: ["Quitado", "tag-alerta"] };
  const nombresCambio = { cantidad: "cantidad", precio: "precio", costo: "costo", ventana: "ventana" };
  const filas = c.filas.map(x => {
    const it = x.item || x.base, b = x.base, a = x.item;
    const [txt, cls] = etiqueta[x.estado];
    return `<tr><td class="desc"><b>Ítem ${esc(it.numero)}</b> · <span class="desc-txt">${esc(it.descripcion)}</span><small><span class="tag ${cls}">${txt}</span>${x.cambios && x.cambios.length ? " " + x.cambios.map(k => nombresCambio[k]).join(", ") : ""}</small></td>
      <td class="n ocultar-movil">${b ? fmtCant(P.n(b.cantidad)) : "—"} → ${a ? fmtCant(P.n(a.cantidad)) : "—"}</td>
      <td class="n">${b ? f(P.ventaItem(b)) : "—"}<small class="mute" style="display:block">${a ? fmtMoneda(P.ventaItem(a), mon) : "—"}</small></td>
      <td class="n">${b && P.costoItem(b) ? f(P.costoItem(b)) : "—"}<small class="mute" style="display:block">${a && P.costoItem(a) ? fmtMoneda(P.costoItem(a), mon) : "—"}</small></td>
      <td class="ocultar-movil chico">${b ? esc(ventanaTxt(b)) : "—"}<br><span class="mute">${a ? esc(ventanaTxt(a)) : "—"}</span></td></tr>`;
  }).join("");
  const dv = c.actual.venta - c.base.venta, dc = c.actual.costo - c.base.costo;
  cont.innerHTML = `<section class="panel"><div class="panel-cab"><div><h2>Línea base del ${fmtFecha(p.lineaBase.fecha.slice(0, 10), true)}</h2><p class="panel-sub">Congelada por ${esc(M.socioNombre(p.lineaBase.por) || "—")}. En cada celda, arriba la línea base y abajo el valor vigente.</p></div></div>
    <div class="grid-kpi" style="margin-bottom:16px">
      ${kpi("Venta en la línea base", f(c.base.venta), `Vigente: ${fmtMoneda(c.actual.venta, mon)}`)}
      ${kpi("Diferencia de venta", f(dv), dv ? "Adicionales o cambios de cantidad" : "Sin cambios")}
      ${kpi("Costo en la línea base", c.base.costo ? f(c.base.costo) : "—", `Vigente: ${c.actual.costo ? fmtMoneda(c.actual.costo, mon) : "—"}`)}
      ${kpi("Diferencia de costo", f(dc), dc ? "Cambios en el costo cotizado" : "Sin cambios")}
    </div>
    <div class="tabla-env"><table class="tabla"><thead><tr><th>Ítem</th><th class="n ocultar-movil">Cantidad</th><th class="n">Venta</th><th class="n">Costo cotizado</th><th class="ocultar-movil">Ventana</th></tr></thead><tbody>${filas}
      <tr class="sub"><td>Gastos generales de obra</td><td class="ocultar-movil"></td><td></td><td class="n">${f(c.base.general)}<small class="mute" style="display:block">${fmtMoneda(c.actual.general, mon)}</small></td><td class="ocultar-movil"></td></tr></tbody></table></div>
    <div class="form-pie" style="margin-top:14px"><button class="btn btn-peligro" id="lb-rehacer">Volver a congelar con los valores de hoy</button></div></section>`;
  $("#lb-rehacer", cont).addEventListener("click", e => confirmar2(e.currentTarget, () => {
    P.actualizarProyecto(p.id, pp => P.congelar(pp, app.usuario.socio), app.usuario.socio);
    toast("Línea base reemplazada");
  }, "Se pierde la comparación con la anterior. ¿Seguro?"));
}

/* =================== IMPORTAR DESDE EXCEL =================== */
async function importarExcel(pid) {
  try { await cargarScript(XLSX_URL); }
  catch (e) { return toast("No se pudo cargar el lector de Excel. Revisá la conexión.", "error"); }
  const XLSX = window.XLSX;
  const p = M.proyecto(pid);
  const md = modal("Importar ítems desde Excel", `<div class="form" id="imp">
    <p style="margin:0" class="mute">Elegí la planilla de cotización. La app busca la fila de encabezados y te muestra qué columna tomó para cada dato, para que lo revises antes de importar.</p>
    <div class="campo"><label for="imp-archivo">Archivo (.xlsx, .xls o .csv)</label><input id="imp-archivo" type="file" accept=".xlsx,.xls,.xlsm,.csv"></div>
    <div id="imp-paso2"></div></div>`, { ancho: 920 });
  let libro = null;
  $("#imp-archivo", md).addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try { libro = XLSX.read(await file.arrayBuffer(), { type: "array" }); }
    catch (err) { return toast("No se pudo leer el archivo. ¿Es una planilla de Excel?", "error"); }
    const hojas = libro.SheetNames.map(nombre => {
      const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: "" });
      return { nombre, filas, det: P.detectarColumnas(filas) };
    });
    const mejor = hojas.slice().sort((a, b) => b.det.puntos - a.det.puntos)[0];
    paso2(hojas, mejor.nombre);
  });

  function paso2(hojas, nombreHoja) {
    const hoja = hojas.find(h => h.nombre === nombreHoja);
    const det = hoja.det;
    const enc = hoja.filas[det.fila] || [];
    const ancho = Math.max(0, ...hoja.filas.slice(0, 60).map(f => f.length));
    const opcCol = sel => `<option value="">— no está —</option>` + Array.from({ length: ancho }, (_, i) => `<option value="${i}"${sel === i ? " selected" : ""}>${letraColumna(i)}${enc[i] !== "" && enc[i] != null ? " · " + esc(String(enc[i]).slice(0, 28)) : ""}</option>`).join("");
    $("#imp-paso2", md).innerHTML = `
      <div class="fila fila-movil-2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="campo"><label for="imp-hoja">Hoja</label><select id="imp-hoja">${hojas.map(h => `<option${h.nombre === nombreHoja ? " selected" : ""}>${esc(h.nombre)}</option>`).join("")}</select></div>
        <div class="campo"><label for="imp-fila">Fila de encabezados</label><input id="imp-fila" type="number" min="1" value="${det.fila + 1}"></div></div>
      <div class="bloque"><div class="bloque-tit">Qué columna es cada dato</div>
        <div class="fila" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${P.CAMPOS_IMPORT.map(c => `<div class="campo"><label for="imp-c-${c.k}">${c.nombre}</label><select id="imp-c-${c.k}" data-campo="${c.k}">${opcCol(det.mapa[c.k])}</select></div>`).join("")}</div>
        <div class="fila fila-movil-2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <div class="campo"><span class="rotulo">Los costos de la planilla son</span><div class="seg seg-chico" id="imp-ct"><button type="button" data-v="u" class="activo">Por unidad</button><button type="button" data-v="t">Totales del ítem</button></div></div>
          <div class="campo"><span class="rotulo">Qué hacer con los ${(p.items || []).length} ítems actuales</span><div class="seg seg-chico" id="imp-modo"><button type="button" data-v="r" class="activo">Reemplazar</button><button type="button" data-v="a">Agregar al final</button></div></div></div>
        <p class="hint" style="margin:0" id="imp-modo-hint"></p></div>
      <div class="bloque"><div class="bloque-tit" id="imp-cuenta">Vista previa</div><div class="tabla-env" id="imp-prev"></div></div>
      <div class="form-pie"><button class="btn btn-pri" id="imp-ok">Importar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div>`;
    let costosTot = false, reemplazar = true;
    const mapa = () => { const o = {}; $$("[data-campo]", md).forEach(s => { if (s.value !== "") o[s.dataset.campo] = Number(s.value); }); return o; };
    const filaEnc = () => Math.max(0, (Number($("#imp-fila", md).value) || 1) - 1);
    const leer = () => P.leerItemsPlanilla(hoja.filas, filaEnc(), mapa(), costosTot);
    const mon = p.moneda === "ARS" ? "ARS" : "USD";
    const vista = () => {
      const its = leer();
      $("#imp-cuenta", md).textContent = `Vista previa: ${its.length} ítem${its.length === 1 ? "" : "s"} encontrados`;
      $("#imp-prev", md).innerHTML = its.length ? `<table class="tabla"><thead><tr><th>N°</th><th>Descripción</th><th>Rubro</th><th>Unidad</th><th class="n">Cant.</th><th class="n">Precio unit.</th><th class="n">Costo unit.</th></tr></thead><tbody>
        ${its.slice(0, 12).map(it => `<tr><td>${esc(it.numero)}</td><td class="desc"><span class="desc-txt">${esc(it.descripcion)}</span></td><td>${esc(it.rubro || "—")}</td><td>${esc(it.unidad)}</td><td class="n">${fmtCant(it.cantidad)}</td><td class="n">${fmtU(it.precioUnitario, mon)}</td><td class="n">${P.costoUnit(it) ? fmtU(P.costoUnit(it), mon) : "—"}</td></tr>`).join("")}
        ${its.length > 12 ? `<tr class="sub"><td colspan="7">y ${its.length - 12} más</td></tr>` : ""}</tbody></table>` : `<div class="vacio">No se encontraron ítems con esa configuración. Revisá la fila de encabezados y la columna de descripción.</div>`;
      $("#imp-modo-hint", md).textContent = reemplazar
        ? "Los ítems con el mismo número conservan sus gastos imputados, su avance y su ventana. Los que no estén en la planilla se quitan, salvo que tengan gastos o avance."
        : "Los ítems de la planilla se suman a los actuales.";
    };
    $("#imp-hoja", md).addEventListener("change", e => paso2(hojas, e.target.value));
    $("#imp-fila", md).addEventListener("input", vista);
    $$("[data-campo]", md).forEach(s => s.addEventListener("change", vista));
    $$("#imp-ct button", md).forEach(b => b.addEventListener("click", () => { costosTot = b.dataset.v === "t"; $$("#imp-ct button", md).forEach(x => x.classList.toggle("activo", x === b)); vista(); }));
    $$("#imp-modo button", md).forEach(b => b.addEventListener("click", () => { reemplazar = b.dataset.v === "r"; $$("#imp-modo button", md).forEach(x => x.classList.toggle("activo", x === b)); vista(); }));
    vista();
    $("#imp-ok", md).addEventListener("click", () => {
      const nuevos = leer();
      if (!nuevos.length) return toast("No hay ítems para importar.", "error");
      let conservados = 0, antes = [], despues = [];
      P.actualizarProyecto(pid, pp => {
        const actuales = pp.items || [];
        antes = JSON.parse(JSON.stringify(actuales));
        if (!reemplazar) {
          pp.items = actuales.concat(nuevos.map(it => Object.assign({ id: nuevoId("it"), desde: "", hasta: "" }, it)));
          return;
        }
        const usados = new Set();
        const lista = nuevos.map(it => {
          const viejo = actuales.find(x => String(x.numero).trim() === String(it.numero).trim() && !usados.has(x.id));
          if (viejo) { usados.add(viejo.id); return Object.assign({}, viejo, it, { id: viejo.id, desde: viejo.desde || "", hasta: viejo.hasta || "", costo: Object.keys(it.costo).length ? it.costo : (viejo.costo || {}) }); }
          return Object.assign({ id: nuevoId("it"), desde: "", hasta: "" }, it);
        });
        const av = P.avancesDe(pid);
        actuales.forEach(x => {
          if (usados.has(x.id)) return;
          const tieneGasto = S.movimientos.some(m => m.bolsillo === pid && m.imputacion === "i:" + x.id);
          if (tieneGasto || av[x.id]) { lista.push(x); conservados++; }
        });
        pp.items = lista;
        despues = lista;
      }, app.usuario.socio);
      if (reemplazar) P.reimputarRubros(pid, antes, despues, app.usuario.socio);
      cerrarModal();
      toast(`${nuevos.length} ítems importados${conservados ? `. Se conservaron ${conservados} que tienen gastos o avance` : ""}.`);
    });
  }
}
