/* =========================================================
   Base de costos: costos unitarios reales por ítem de las
   obras cerradas (y de obras anteriores cargadas a mano o
   desde Excel), para usar como referencia al cotizar.
   ========================================================= */
import { S, guardar, mandarAPapelera, nuevoId } from "../db.js";
import { app } from "../contexto.js";
import * as P from "../presupuesto.js";
import { $, $$, esc, num, fmtUSD, fmtPct, fmtCant, fmtMiles, fmtFecha, parseMonto, hoyISO, toast, confirmar2, modal, cerrarModal, cargarScript, cabecera, ICONOS } from "../ui.js";
import { letraColumna } from "./comun.js";

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const F = { q: "", rubro: "", unidad: "", tipo: "", obra: "", param: "" };
const ORIGEN = { cierre: "Cierre del proyecto", manual: "Carga manual", importada: "Importada de Excel" };
const PARTES = [["mat", "Materiales"], ["mo", "Mano de obra"], ["eq", "Equipos"], ["sub", "Subcontratos"]];
const n = v => Number(v) || 0;
const r4 = v => Math.round(v * 10000) / 10000;
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const u2 = v => fmtUSD(v, Math.abs(v) < 100 ? 2 : 0);
const kpi = (rot, val, sub = "") => `<div class="kpi"><div class="kpi-rot">${rot}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
const unicos = (lista, f) => Array.from(new Set(lista.map(f).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));

export function render(el, params) {
  if (params[0] && params[0] !== F.param) {
    F.param = params[0];
    Object.assign(F, { q: "", rubro: "", unidad: "", tipo: "", obra: "" });
    if (params[0].startsWith("obra:")) F.obra = params[0].slice(5); else F.q = params[0];
  }
  const todas = S.fichas;
  const obras = unicos(todas, f => f.obra);
  el.innerHTML = cabecera("Histórico", "Base de costos", "Costo real por unidad de cada ítem de las obras cerradas, en dólares MEP sin IVA. Es la referencia para cotizar.",
    `${todas.length ? `<button class="btn btn-sec" id="bc-exportar">${ICONOS.descargar}Exportar a Excel</button>` : ""}<button class="btn btn-sec btn-sec-escritorio" id="bc-importar">${ICONOS.subir}Importar</button><button class="btn btn-pri" id="bc-nueva">Agregar ficha</button>`) +
    (todas.length ? kpis(todas, obras) + `
    <section class="panel" style="margin-top:16px">
      <div class="filtros">
        <div class="buscar">${ICONOS.buscar}<label class="sr" for="bc-q">Buscar</label><input id="bc-q" class="input" placeholder="Buscar ítem, obra o cliente" value="${esc(F.q)}"></div>
        ${selFiltro("rubro", "Rubro", unicos(todas, f => f.rubro))}
        ${selFiltro("unidad", "Unidad", unicos(todas, f => f.unidad))}
        ${selFiltro("tipo", "Tipo de obra", unicos(todas, f => f.tipoObra))}
        ${selFiltro("obra", "Obra", obras)}
      </div>
      <div id="bc-res"></div>
    </section>` : `<section class="panel"><div class="vacio"><b>Todavía no hay fichas</b>Se generan solas al cerrar un proyecto (Proyecto → Cierre de proyecto). También podés cargar costos de obras anteriores a mano o desde una planilla de Excel.
      <div class="form-pie" style="justify-content:center;margin-top:14px"><button class="btn btn-pri" id="bc-nueva2">Agregar ficha</button><button class="btn btn-sec" id="bc-importar2">Importar desde Excel</button></div></div></section>`);
  const res = $("#bc-res", el);
  if (res) {
    pintar(res);
    $("#bc-q", el).addEventListener("input", e => { F.q = e.target.value; pintar(res); });
    $$("[data-filtro]", el).forEach(s => s.addEventListener("change", () => { F[s.dataset.filtro] = s.value; pintar(res); }));
  }
  const b = (id, fn) => { const x = $(id, el); if (x) x.addEventListener("click", fn); };
  b("#bc-nueva", () => modalFicha(null));
  b("#bc-nueva2", () => modalFicha(null));
  b("#bc-importar", importar);
  b("#bc-importar2", importar);
  b("#bc-exportar", () => exportar(filtradas()));
}

function selFiltro(k, nombre, opciones) {
  if (opciones.length < 2 && !F[k]) return "";
  return `<label class="sr" for="bc-${k}">${nombre}</label><select id="bc-${k}" data-filtro="${k}"><option value="">${nombre}: todas</option>${opciones.map(o => `<option${o === F[k] ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
}

function kpis(todas, obras) {
  const conCot = todas.filter(f => n(f.cot && f.cot.total) > 0 && n(f.cantidad) > 0);
  const real = conCot.reduce((a, f) => a + f.real.item * f.cantidad, 0), cot = conCot.reduce((a, f) => a + f.cot.total * f.cantidad, 0);
  const porObra = {};
  todas.forEach(f => { if (f.ggPct == null) return; const o = porObra[f.obra] = porObra[f.obra] || { gg: f.ggPct, peso: 0 }; o.peso += f.real.item * n(f.cantidad); });
  const pesos = Object.values(porObra);
  const gg = pesos.reduce((a, o) => a + o.peso, 0) > 0 ? pesos.reduce((a, o) => a + o.gg * o.peso, 0) / pesos.reduce((a, o) => a + o.peso, 0) : null;
  const ultima = todas.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  return `<div class="grid-kpi">
    ${kpi("Fichas", String(todas.length), `${obras.length} obra${obras.length === 1 ? "" : "s"}`)}
    ${kpi("Desvío medio", cot > 0 ? num(real / cot - 1, fmtPct) : "—", cot > 0 ? "Costo real de los ítems contra lo cotizado" : "Sin costos cotizados para comparar")}
    ${kpi("Gastos generales", gg != null ? fmtPct(gg) : "—", "Promedio sobre el costo de los ítems")}
    ${kpi("Última obra", ultima ? esc(ultima.obra) : "—", ultima ? esc(ultima.anio || "") + (ultima.cliente ? " · " + esc(ultima.cliente) : "") : "")}
  </div>`;
}

function filtradas() {
  const palabras = norm(F.q).split(/\s+/).filter(Boolean);
  return S.fichas.filter(f => {
    if (F.rubro && f.rubro !== F.rubro) return false;
    if (F.unidad && f.unidad !== F.unidad) return false;
    if (F.tipo && f.tipoObra !== F.tipo) return false;
    if (F.obra && f.obra !== F.obra) return false;
    if (!palabras.length) return true;
    const t = norm([f.descripcion, f.rubro, f.obra, f.cliente, f.tipoObra, f.numero].join(" "));
    return palabras.every(w => t.includes(w));
  }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.obra).localeCompare(String(b.obra)) || String(a.numero).localeCompare(String(b.numero), "es", { numeric: true }));
}

function pintar(cont) {
  const lista = filtradas();
  if (!lista.length) { cont.innerHTML = `<div class="vacio"><b>Sin resultados</b>Probá con otra palabra o quitá algún filtro.</div>`; return; }
  const unidades = unicos(lista, f => norm(f.unidad));
  let h = "";
  if (unidades.length === 1 && lista.length > 1) {
    const cant = lista.reduce((a, f) => a + n(f.cantidad), 0);
    const prom = k => cant > 0 ? lista.reduce((a, f) => a + f.real[k] * n(f.cantidad), 0) / cant : 0;
    const vals = lista.map(f => f.real.item);
    const un = lista[0].unidad || "unidad";
    h += `<div class="resumen-filtro">
      <div><span>${lista.length} fichas · por ${esc(un)}</span><b>Promedio ${esc(u2(prom("item")))}</b></div>
      <div><span>Mínimo</span><b>${esc(u2(Math.min(...vals)))}</b></div>
      <div><span>Máximo</span><b>${esc(u2(Math.max(...vals)))}</b></div>
      <div><span>Con gastos generales</span><b>${esc(u2(prom("total")))}</b></div>
    </div>`;
  }
  const max = 300;
  h += `<div class="tabla-env"><table class="tabla"><thead><tr><th>Ítem</th><th class="ocultar-movil">Unidad</th><th class="n ocultar-movil">Cantidad</th><th class="n ocultar-movil">Cotizado</th><th class="n">Real</th><th class="n ocultar-movil">Con generales</th><th class="n">Desvío</th></tr></thead><tbody>
    ${lista.slice(0, max).map(f => `<tr class="clic" data-f="${esc(f.id)}"><td class="desc"><span class="desc-txt">${esc(f.descripcion)}</span><small>${esc(f.obra)}${f.anio ? " · " + esc(f.anio) : ""}${f.rubro ? " · " + esc(f.rubro) : ""}<span class="solo-movil"> · por ${esc(f.unidad || "unidad")}</span></small></td>
      <td class="ocultar-movil">${esc(f.unidad || "—")}</td><td class="n ocultar-movil">${esc(fmtCant(n(f.cantidad)))}</td>
      <td class="n ocultar-movil">${n(f.cot && f.cot.total) ? esc(u2(f.cot.total)) : "—"}</td><td class="n"><b>${esc(u2(f.real.item))}</b></td>
      <td class="n ocultar-movil">${esc(u2(f.real.total))}</td><td class="n">${f.desvioPct == null ? "—" : num(f.desvioPct, fmtPct)}</td></tr>`).join("")}
  </tbody></table></div>${lista.length > max ? `<p class="panel-sub" style="margin-top:10px">Se muestran ${max} de ${lista.length}. Afiná la búsqueda o exportá a Excel.</p>` : ""}`;
  cont.innerHTML = h;
  $$("tr[data-f]", cont).forEach(tr => tr.addEventListener("click", () => modalDetalle(tr.dataset.f)));
}

/* ---------- detalle ---------- */
function modalDetalle(id) {
  const f = S.fichas.find(x => x.id === id);
  if (!f) return;
  const fila = (t, cot, real, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><td>${t}</td><td class="n">${cot == null ? "" : cot ? esc(u2(cot)) : "—"}</td><td class="n">${real == null ? "" : real ? esc(u2(real)) : "—"}</td></tr>`;
  const md = modal(f.descripcion.length > 70 ? f.descripcion.slice(0, 69) + "…" : f.descripcion, `
    <div class="ficha-meta">
      <span class="tag">${esc(f.obra)}${f.anio ? " · " + esc(f.anio) : ""}</span>${f.cliente ? `<span class="tag tag-borde">${esc(f.cliente)}</span>` : ""}${f.ubicacion ? `<span class="tag tag-borde">${esc(f.ubicacion)}</span>` : ""}
      ${f.rubro ? `<span class="tag tag-borde">Rubro ${esc(f.rubro)}</span>` : ""}<span class="tag tag-borde">${esc(ORIGEN[f.origen] || "")}</span>
    </div>
    <p class="mute" style="margin:0 0 12px">${f.numero ? `Ítem ${esc(f.numero)} · ` : ""}${esc(fmtCant(n(f.cantidad)))} ${esc(f.unidad || "")}${f.origen === "cierre" ? ` ejecutados de ${esc(fmtCant(n(f.cantidadCotizada)))} cotizados${f.sinAvance ? " (sin avance cargado)" : ""}` : ""}. Valores por ${esc(f.unidad || "unidad")}, en dólares MEP sin IVA${f.moneda === "ARS" && f.mepRef ? `; contrato en pesos, pasado a dólares a ${esc(fmtMiles(f.mepRef))}` : ""}.</p>
    <div class="tabla-env"><table class="tabla tabla-compacta ficha-tabla"><thead><tr><th></th><th class="n">Cotizado</th><th class="n">Real</th></tr></thead><tbody>
      ${PARTES.map(([k, nom]) => fila(nom, n(f.cot && f.cot[k]), n(f.real[k]))).join("")}
      ${n(f.real.ind) ? fila("Indirectos imputados", null, f.real.ind) : ""}
      ${fila("<b>Costo del ítem</b>", n(f.cot && f.cot.total), f.real.item, "sub")}
      ${fila(`Gastos generales de la obra${f.ggPct != null ? ` (${esc(fmtPct(f.ggPct))})` : ""}`, null, n(f.real.gg))}
      ${fila("<b>Costo total</b>", null, f.real.total, "total")}
      ${n(f.puVenta) ? fila("Precio de venta", null, f.puVenta) : ""}
    </tbody></table></div>
    <p class="mute" style="margin:10px 0 0">${f.desvioPct != null ? `Desvío del costo del ítem contra lo cotizado: <b>${esc(fmtPct(f.desvioPct))}</b>. ` : ""}${f.margenPct != null ? `Margen sobre el precio: <b>${esc(fmtPct(f.margenPct))}</b>.` : ""}</p>
    <form class="form" id="fd" style="margin-top:14px" novalidate>
      <div class="fila fila-movil-2"><div class="campo"><label for="fd-tipo">Tipo de obra</label><input id="fd-tipo" list="fd-tipos" value="${esc(f.tipoObra || "")}"><datalist id="fd-tipos">${unicos(S.fichas, x => x.tipoObra).map(t => `<option value="${esc(t)}">`).join("")}</datalist></div>
      <div class="campo"><label for="fd-ubic">Ubicación</label><input id="fd-ubic" value="${esc(f.ubicacion || "")}"></div></div>
      <div class="campo"><label for="fd-notas">Notas <span class="opc">(qué hay que tener en cuenta al usar este costo)</span></label><textarea id="fd-notas" rows="2">${esc(f.notas || "")}</textarea></div>
      <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button>${f.origen !== "cierre" ? `<button class="btn btn-sec" type="button" id="fd-editar">Editar costos</button>` : ""}<button class="btn btn-sec" type="button" data-cerrar>Cerrar</button>
        <button class="btn btn-peligro der" type="button" id="fd-quitar">${ICONOS.borrar}Quitar</button></div>
      ${f.origen === "cierre" ? `<p class="hint" style="margin:0">Los costos salen del cierre del proyecto: si cambia algo, se reabre y se vuelve a cerrar.</p>` : ""}
    </form>`, { ancho: 640 });
  $("#fd", md).addEventListener("submit", e => {
    e.preventDefault();
    const tipo = $("#fd-tipo", md).value.trim();
    guardar("fichas", Object.assign({}, f, { tipoObra: tipo, tipoObraManual: tipo !== (f.tipoObra || "") || f.tipoObraManual, ubicacion: $("#fd-ubic", md).value.trim(), notas: $("#fd-notas", md).value.trim(), modificadoPor: app.usuario.socio }));
    cerrarModal(); toast("Ficha guardada");
  });
  const be = $("#fd-editar", md);
  if (be) be.addEventListener("click", () => modalFicha(f.id));
  $("#fd-quitar", md).addEventListener("click", e => confirmar2(e.currentTarget, () => {
    mandarAPapelera("fichas", f, app.usuario.socio);
    cerrarModal(); toast("Ficha enviada a la papelera");
  }));
}

/* ---------- alta y edición manual ---------- */
function completar(f) {
  const r = f.real;
  r.item = r4(n(r.mat) + n(r.mo) + n(r.eq) + n(r.sub) + n(r.ind));
  r.gg = r4(f.ggPct != null ? r.item * f.ggPct : n(r.gg));
  r.total = r4(r.item + r.gg);
  f.cot = f.cot || {};
  f.cot.total = r4(n(f.cot.total) || PARTES.reduce((a, [k]) => a + n(f.cot[k]), 0));
  f.desvioPct = f.cot.total > 0 ? r4(r.item / f.cot.total - 1) : null;
  f.margenPct = n(f.puVenta) > 0 ? r4(1 - r.total / f.puVenta) : null;
  return f;
}

function modalFicha(id) {
  const f0 = id ? S.fichas.find(x => x.id === id) : null;
  const f = f0 ? JSON.parse(JSON.stringify(f0)) : { origen: "manual", obra: "", cliente: "", anio: hoyISO().slice(0, 4), tipoObra: "", ubicacion: "", rubro: "", descripcion: "", unidad: "", cantidad: 1, real: {}, cot: {}, ggPct: null, puVenta: 0, notas: "" };
  const v = x => (x ? esc(String(x).replace(".", ",")) : "");
  const dl = (idd, lista) => `<datalist id="${idd}">${lista.map(t => `<option value="${esc(t)}">`).join("")}</datalist>`;
  const md = modal(f0 ? "Editar ficha" : "Nueva ficha de costo", `<form class="form" id="fm" novalidate>
    <p class="mute" style="margin:0">Para cargar costos de obras anteriores. Los montos son por unidad, en dólares sin IVA.</p>
    <div class="fila fila-movil-2"><div class="campo"><label for="fm-obra">Obra</label><input id="fm-obra" list="fm-obras" value="${esc(f.obra)}" required>${dl("fm-obras", unicos(S.fichas, x => x.obra))}</div>
      <div class="campo"><label for="fm-cliente">Cliente</label><input id="fm-cliente" value="${esc(f.cliente)}"></div>
      <div class="campo"><label for="fm-anio">Año</label><input id="fm-anio" inputmode="numeric" value="${esc(f.anio || "")}"></div></div>
    <div class="fila fila-movil-2"><div class="campo"><label for="fm-tipo">Tipo de obra</label><input id="fm-tipo" list="fm-tipos" value="${esc(f.tipoObra)}">${dl("fm-tipos", unicos(S.fichas.concat(S.proyectos), x => x.tipoObra))}</div>
      <div class="campo"><label for="fm-ubic">Ubicación</label><input id="fm-ubic" value="${esc(f.ubicacion)}"></div>
      <div class="campo"><label for="fm-rubro">Rubro</label><input id="fm-rubro" list="fm-rubros" value="${esc(f.rubro)}">${dl("fm-rubros", unicos(S.fichas, x => x.rubro))}</div></div>
    <div class="campo"><label for="fm-desc">Descripción del ítem</label><input id="fm-desc" value="${esc(f.descripcion)}" required></div>
    <div class="fila fila-movil-2"><div class="campo"><label for="fm-unidad">Unidad</label><input id="fm-unidad" list="fm-unidades" value="${esc(f.unidad)}" placeholder="m3, m, u, mes, gl…">${dl("fm-unidades", unicos(S.fichas, x => x.unidad))}</div>
      <div class="campo"><label for="fm-cant">Cantidad ejecutada</label><input id="fm-cant" inputmode="decimal" value="${v(f.cantidad)}"></div></div>
    <div class="bloque"><div class="bloque-tit">Costo real por unidad (US$)</div>
      <div class="fila fila-movil-2" style="grid-template-columns:repeat(5,minmax(0,1fr))">${PARTES.concat([["ind", "Indirectos"]]).map(([k, nom]) => `<div class="campo"><label for="fm-r-${k}">${nom}</label><input id="fm-r-${k}" inputmode="decimal" value="${v(f.real[k])}"></div>`).join("")}</div>
      <div class="fila fila-movil-2"><div class="campo"><label for="fm-gg">Gastos generales de la obra (%)</label><input id="fm-gg" inputmode="decimal" value="${f.ggPct != null ? v(Math.round(f.ggPct * 1000) / 10) : ""}" placeholder="Ej.: 12"></div>
        <div class="campo"><label for="fm-cot">Costo cotizado por unidad <span class="opc">(opcional)</span></label><input id="fm-cot" inputmode="decimal" value="${v(f.cot && f.cot.total)}"></div>
        <div class="campo"><label for="fm-pv">Precio de venta por unidad <span class="opc">(opcional)</span></label><input id="fm-pv" inputmode="decimal" value="${v(f.puVenta)}"></div></div></div>
    <div class="campo"><label for="fm-notas">Notas <span class="opc">(opcional)</span></label><textarea id="fm-notas" rows="2">${esc(f.notas || "")}</textarea></div>
    <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div></form>`, { ancho: 760 });
  $("#fm", md).addEventListener("submit", e => {
    e.preventDefault();
    const q = k => $("#fm-" + k, md).value.trim();
    const m = k => { const x = parseMonto(q(k)); return isNaN(x) ? 0 : x; };
    if (!q("obra")) return toast("Poné el nombre de la obra.", "error");
    if (!q("desc")) return toast("Poné la descripción del ítem.", "error");
    const real = Object.fromEntries(PARTES.concat([["ind"]]).map(([k]) => [k, m("r-" + k)]));
    if (!Object.values(real).some(x => x > 0)) return toast("Cargá al menos un costo por unidad.", "error");
    const gg = q("gg") ? m("gg") / 100 : null;
    const d = completar(Object.assign(f, {
      obra: q("obra"), cliente: q("cliente"), anio: q("anio"), fecha: f.fecha || (q("anio") ? q("anio") + "-12-31" : hoyISO()), tipoObra: q("tipo"), ubicacion: q("ubic"), rubro: q("rubro"),
      descripcion: q("desc"), unidad: q("unidad"), cantidad: m("cant") || 1, real, ggPct: gg, cot: { total: m("cot") }, puVenta: m("pv"), notas: q("notas"), moneda: "USD"
    }));
    if (!f0) { d.id = nuevoId("fi"); d.creadoPor = app.usuario.socio; d.creadoEl = new Date().toISOString(); }
    else d.modificadoPor = app.usuario.socio;
    guardar("fichas", d);
    cerrarModal(); toast(f0 ? "Ficha guardada" : "Ficha agregada");
  });
}

/* ---------- importar desde Excel ---------- */
async function importar() {
  try { await cargarScript(XLSX_URL); }
  catch (e) { return toast("No se pudo cargar el lector de Excel. Revisá la conexión.", "error"); }
  const XLSX = window.XLSX;
  const md = modal("Importar costos desde Excel", `<div class="form">
    <p class="mute" style="margin:0">Para cargar los costos reales de obras anteriores. La planilla tiene que tener una fila por ítem con la descripción, la unidad y el costo real (por unidad o total) de materiales, mano de obra, equipos y subcontratos. Sirve el mismo formato que exporta la app.</p>
    <div class="campo"><label for="bi-archivo">Archivo (.xlsx, .xls o .csv)</label><input id="bi-archivo" type="file" accept=".xlsx,.xls,.xlsm,.csv"></div>
    <div id="bi-paso2"></div></div>`, { ancho: 920 });
  $("#bi-archivo", md).addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    let libro;
    try { libro = XLSX.read(await file.arrayBuffer(), { type: "array" }); }
    catch (err) { return toast("No se pudo leer el archivo. ¿Es una planilla de Excel?", "error"); }
    const hojas = libro.SheetNames.map(nombre => {
      const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: "" });
      return { nombre, filas, det: P.detectarColumnas(filas) };
    });
    paso2(md, hojas, hojas.slice().sort((a, b) => b.det.puntos - a.det.puntos)[0].nombre, file.name.replace(/\.[^.]+$/, ""));
  });
}

function paso2(md, hojas, nombreHoja, nombreArchivo) {
  const hoja = hojas.find(h => h.nombre === nombreHoja);
  const det = hoja.det, enc = hoja.filas[det.fila] || [];
  const ancho = Math.max(0, ...hoja.filas.slice(0, 60).map(f => f.length));
  const opcCol = sel => `<option value="">— no está —</option>` + Array.from({ length: ancho }, (_, i) => `<option value="${i}"${sel === i ? " selected" : ""}>${letraColumna(i)}${enc[i] !== "" && enc[i] != null ? " · " + esc(String(enc[i]).slice(0, 28)) : ""}</option>`).join("");
  const nombres = { precioUnitario: "Precio de venta unitario", mat: "Costo real materiales", mo: "Costo real mano de obra", eq: "Costo real equipos", sub: "Costo real subcontratos", cantidad: "Cantidad ejecutada" };
  // Si la planilla trae la columna de obra (formato exportado), se usa esa.
  const colObra = enc.findIndex(c => norm(c) === "obra");
  $("#bi-paso2", md).innerHTML = `
    <div class="fila fila-movil-2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="campo"><label for="bi-hoja">Hoja</label><select id="bi-hoja">${hojas.map(h => `<option${h.nombre === nombreHoja ? " selected" : ""}>${esc(h.nombre)}</option>`).join("")}</select></div>
      <div class="campo"><label for="bi-fila">Fila de encabezados</label><input id="bi-fila" type="number" min="1" value="${det.fila + 1}"></div></div>
    <div class="bloque"><div class="bloque-tit">De qué obra son</div>
      <div class="fila fila-movil-2" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="campo"><label for="bi-obra">Obra</label><input id="bi-obra" value="${colObra >= 0 ? "" : esc(nombreArchivo)}" placeholder="${colObra >= 0 ? "Se toma de la columna Obra" : ""}"></div>
        <div class="campo"><label for="bi-cliente">Cliente</label><input id="bi-cliente"></div>
        <div class="campo"><label for="bi-anio">Año</label><input id="bi-anio" inputmode="numeric" value="${hoyISO().slice(0, 4)}"></div>
        <div class="campo"><label for="bi-tipo">Tipo de obra</label><input id="bi-tipo"></div>
        <div class="campo"><label for="bi-gg">Gastos generales (%)</label><input id="bi-gg" inputmode="decimal" placeholder="Opcional"></div>
        <div class="campo"><label for="bi-mep">Si los montos están en pesos, dólar de referencia</label><input id="bi-mep" inputmode="decimal" placeholder="Vacío: están en dólares"></div>
      </div></div>
    <div class="bloque"><div class="bloque-tit">Qué columna es cada dato</div>
      <div class="fila" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${P.CAMPOS_IMPORT.map(c => `<div class="campo"><label for="bi-c-${c.k}">${nombres[c.k] || c.nombre}</label><select id="bi-c-${c.k}" data-campo="${c.k}">${opcCol(det.mapa[c.k])}</select></div>`).join("")}</div>
      <div class="campo"><span class="rotulo">Los costos de la planilla son</span><div class="seg seg-chico" id="bi-ct"><button type="button" data-v="u" class="activo">Por unidad</button><button type="button" data-v="t">Totales del ítem</button></div></div></div>
    <div class="bloque"><div class="bloque-tit" id="bi-cuenta">Vista previa</div><div class="tabla-env" id="bi-prev"></div></div>
    <div class="form-pie"><button class="btn btn-pri" id="bi-ok">Importar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div>`;
  let totales = false;
  const mapa = () => { const o = {}; $$("[data-campo]", md).forEach(s => { if (s.value !== "") o[s.dataset.campo] = Number(s.value); }); return o; };
  const filaEnc = () => Math.max(0, (Number($("#bi-fila", md).value) || 1) - 1);
  const leer = () => {
    const mep = parseMonto($("#bi-mep", md).value);
    const div = mep > 0 ? mep : 1;
    const its = P.leerItemsPlanilla(hoja.filas, filaEnc(), mapa(), totales);
    // Obra por fila, si la planilla la trae.
    // Mismo criterio de filas que la lectura de ítems, para que cada obra quede con su renglón.
    const mp = mapa(), fe = filaEnc();
    const aNum = x => typeof x === "number" ? x : parseFloat(String(x || "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
    const obras = colObra < 0 ? [] : hoja.filas.slice(fe + 1).filter(f => {
      const desc = String(mp.descripcion != null ? f[mp.descripcion] : "").trim();
      if (!desc || /^total|^subtotal/.test(norm(desc))) return false;
      return aNum(mp.cantidad != null ? f[mp.cantidad] : 0) > 0 || aNum(mp.precioUnitario != null ? f[mp.precioUnitario] : 0) > 0;
    }).map(f => String(f[colObra] || "").trim());
    return its.map((it, i) => ({ it, obra: obras[i] || "", real: Object.fromEntries(PARTES.map(([k]) => [k, n((it.costo || {})[k]) / div])), pv: n(it.precioUnitario) / div }));
  };
  const vista = () => {
    const filas = leer().filter(x => PARTES.some(([k]) => x.real[k] > 0));
    $("#bi-cuenta", md).textContent = `Vista previa: ${filas.length} ítem${filas.length === 1 ? "" : "s"} con costo`;
    $("#bi-prev", md).innerHTML = filas.length ? `<table class="tabla tabla-compacta"><thead><tr><th>Descripción</th><th>Unidad</th><th class="n">Cant.</th><th class="n">Costo real por unidad</th></tr></thead><tbody>
      ${filas.slice(0, 10).map(x => `<tr><td class="desc"><span class="desc-txt">${esc(x.it.descripcion)}</span>${x.obra ? `<small>${esc(x.obra)}</small>` : ""}</td><td>${esc(x.it.unidad)}</td><td class="n">${fmtCant(x.it.cantidad)}</td><td class="n">${esc(u2(PARTES.reduce((a, [k]) => a + x.real[k], 0)))}</td></tr>`).join("")}
      ${filas.length > 10 ? `<tr class="sub"><td colspan="4">y ${filas.length - 10} más</td></tr>` : ""}</tbody></table>` : `<div class="vacio">No se encontraron ítems con costo. Revisá la fila de encabezados y las columnas de costo.</div>`;
  };
  $("#bi-hoja", md).addEventListener("change", e => paso2(md, hojas, e.target.value, nombreArchivo));
  $("#bi-fila", md).addEventListener("input", vista);
  $("#bi-mep", md).addEventListener("input", vista);
  $$("[data-campo]", md).forEach(s => s.addEventListener("change", vista));
  $$("#bi-ct button", md).forEach(b => b.addEventListener("click", () => { totales = b.dataset.v === "t"; $$("#bi-ct button", md).forEach(x => x.classList.toggle("activo", x === b)); vista(); }));
  vista();
  $("#bi-ok", md).addEventListener("click", () => {
    const filas = leer().filter(x => PARTES.some(([k]) => x.real[k] > 0));
    const obraGral = $("#bi-obra", md).value.trim();
    if (!filas.length) return toast("No hay ítems con costo para importar.", "error");
    if (!obraGral && filas.some(x => !x.obra)) return toast("Poné el nombre de la obra.", "error");
    const g = parseMonto($("#bi-gg", md).value);
    const anio = $("#bi-anio", md).value.trim();
    const ahora = new Date().toISOString();
    filas.forEach(x => guardar("fichas", completar({
      id: nuevoId("fi"), origen: "importada", obra: x.obra || obraGral, cliente: $("#bi-cliente", md).value.trim(), anio, fecha: anio ? anio + "-12-31" : hoyISO(),
      tipoObra: $("#bi-tipo", md).value.trim(), ubicacion: "", numero: x.it.numero, rubro: x.it.rubro || "", descripcion: x.it.descripcion, unidad: x.it.unidad || "",
      cantidad: x.it.cantidad || 1, real: Object.assign({ ind: 0 }, x.real), cot: {}, ggPct: g > 0 ? g / 100 : null, puVenta: x.pv, moneda: "USD", notas: "",
      creadoPor: app.usuario.socio, creadoEl: ahora
    })));
    cerrarModal(); toast(`${filas.length} fichas importadas`);
  });
}

/* ---------- exportar en el formato de la planilla de cotización ---------- */
async function exportar(lista) {
  if (!lista.length) return toast("No hay fichas para exportar.", "error");
  try { await cargarScript(XLSX_URL); }
  catch (e) { return toast("No se pudo cargar el generador de Excel. Revisá la conexión.", "error"); }
  const XLSX = window.XLSX;
  const r2 = v => Math.round(n(v) * 100) / 100;
  const filas = lista.map(f => ({
    "Ítem": f.numero || "", Rubro: f.rubro || "", "Descripción": f.descripcion, Unidad: f.unidad || "", Cantidad: n(f.cantidad), "Precio unitario": r2(f.puVenta),
    Materiales: r2(f.real.mat), "Mano de obra": r2(f.real.mo), Equipos: r2(f.real.eq), Subcontratos: r2(f.real.sub), Indirectos: r2(f.real.ind),
    "Costo del ítem": r2(f.real.item), "Gastos generales": r2(f.real.gg), "Costo total": r2(f.real.total),
    "Costo cotizado": r2(f.cot && f.cot.total), "Desvío %": f.desvioPct == null ? "" : Math.round(f.desvioPct * 1000) / 10, "Margen %": f.margenPct == null ? "" : Math.round(f.margenPct * 1000) / 10,
    Obra: f.obra, Cliente: f.cliente || "", "Tipo de obra": f.tipoObra || "", "Ubicación": f.ubicacion || "", "Año": f.anio || "", Origen: ORIGEN[f.origen] || "", Notas: f.notas || ""
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas);
  ws["!cols"] = [7, 22, 60, 8, 10, 12, 12, 12, 12, 12, 12, 13, 13, 13, 13, 9, 9, 24, 24, 24, 20, 6, 18, 30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Base de costos");
  const nota = [["MICA · Base de costos"], [`Exportado el ${fmtFecha(hoyISO(), true)}. ${lista.length} fichas.`], [""],
    ["Montos por unidad, en dólares MEP sin IVA."], ["Materiales, mano de obra, equipos y subcontratos son el costo real del ítem, con lo imputado a su rubro ya repartido."],
    ["Gastos generales: lo imputado a «General de obra», repartido según el peso de cada ítem en el costo directo cotizado."],
    ["Para usarla como base de una cotización: en Contrato y presupuesto → Importar desde Excel, elegir esta hoja; la app reconoce las columnas."]];
  const wn = XLSX.utils.aoa_to_sheet(nota);
  wn["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wn, "Cómo leerla");
  XLSX.writeFile(wb, `MICA_base_de_costos_${hoyISO()}.xlsx`);
  toast(`Excel descargado con ${lista.length} fichas`);
}
