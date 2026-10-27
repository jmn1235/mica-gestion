/* =========================================================
   Aprobaciones (Julio) y Mis cargas (operativos).
   Julio revisa los cambios propuestos y los aprueba, corrige
   o rechaza. Los operativos siguen el estado de sus pedidos.
   ========================================================= */
import { S } from "../db.js";
import { app, fijarCtx } from "../contexto.js";
import * as M from "../modelo.js";
import * as PER from "../permisos.js";
import { $, $$, esc, fmtARS, fmtFechaHora, mesLabel, parseMonto, toast, confirmar2, modal, cerrarModal, cabecera, ICONOS } from "../ui.js";

const LS_VISTO = "mica_rechazos_vistos";
const vistoHasta = () => { try { return localStorage.getItem(LS_VISTO) || ""; } catch (e) { return ""; } };

const marcadas = new Set();
let verHistorial = 30;

export function render(el) {
  if (PER.esAdmin()) return vistaAdmin(el);
  return vistaOperativo(el);
}

/* ---------- piezas ---------- */
const tagAccion = s => `<span class="tag ${s.accion === "baja" ? "tag-alerta" : "tag-borde"}">${PER.ACCIONES[s.accion]}</span>`;
const tagEstado = s => `<span class="tag ${({ aprobada: "tag-ok", rechazada: "tag-alerta", pendiente: "tag-borde", cancelada: "" })[s.estado] || ""}">${PER.ESTADOS[s.estado]}</span>`;
const queEs = s => (s.coleccion === "avances" ? "Avance físico" : "Gasto de obra");
function titulo(s) {
  const d = s.datos || s.anterior || {};
  if (s.coleccion === "avances") return `Avance de ${mesLabel(d.mes || "")} · ${esc((M.proyecto(d.proyecto) || {}).nombre || "")}`;
  return esc(M.tituloMov(d) || "Gasto");
}
function detalleCorto(s) {
  const d = s.datos || s.anterior || {};
  if (s.coleccion === "avances") {
    const n = Object.keys((d.cantidades) || {}).length;
    return `${n} ítem${n === 1 ? "" : "s"} con cantidad`;
  }
  return `${esc(M.nombreBolsillo(d.bolsillo))} · ${esc(M.nombreImputacion(d, 40) || "Sin imputar")}`;
}
function montoDe(s) {
  const d = s.datos || s.anterior || {};
  return s.coleccion === "movimientos" ? `<b class="num">${esc(fmtARS(Number(d.montoARS) || 0))}</b>` : "";
}

function tarjeta(s, { check = false, acciones = "" } = {}) {
  const conf = s.estado === "pendiente" ? PER.conflicto(s) : "";
  return `<article class="sol" data-sol="${esc(s.id)}">
    ${check ? `<label class="sol-check"><input type="checkbox" data-marca="${esc(s.id)}"${marcadas.has(s.id) ? " checked" : ""} aria-label="Seleccionar"></label>` : ""}
    <div class="sol-cuerpo">
      <div class="sol-cab">${tagAccion(s)}<span class="mute chico">${queEs(s)}</span>${s.estado !== "pendiente" ? tagEstado(s) : ""}</div>
      <div class="sol-tit">${titulo(s)}</div>
      <div class="sol-sub">${detalleCorto(s)}</div>
      <div class="sol-meta">Pedido por <b>${esc(PER.socioNombre(s.autor))}</b> el ${fmtFechaHora(s.editadoEl || s.creadoEl)}${s.editadoEl ? " (corregido)" : ""}${s.resueltoEl ? ` · ${s.estado === "cancelada" ? "cancelado" : PER.ESTADOS[s.estado].toLowerCase()} por ${esc(PER.socioNombre(s.resueltoPor))} el ${fmtFechaHora(s.resueltoEl)}${s.corregido ? " con correcciones" : ""}` : s.canceladoEl ? ` · cancelado el ${fmtFechaHora(s.canceladoEl)}` : ""}</div>
      ${s.motivo ? `<div class="sol-motivo"><b>Motivo:</b> ${esc(s.motivo)}</div>` : ""}
      ${conf ? `<div class="sol-conflicto">${ICONOS.alerta}<span>${esc(conf)}</span></div>` : ""}
    </div>
    <div class="sol-der">${montoDe(s)}<div class="sol-acc">${acciones}</div></div>
  </article>`;
}

function historialHtml(lista) {
  if (!lista.length) return `<div class="vacio">Todavía no hay pedidos resueltos.</div>`;
  return `<div class="sol-lista">${lista.slice(0, verHistorial).map(s => tarjeta(s, { acciones: `<button class="btn btn-fant btn-chico" data-ver="${esc(s.id)}">Ver</button>` })).join("")}</div>
    ${lista.length > verHistorial ? `<div style="text-align:center;margin-top:12px"><button class="btn btn-sec btn-chico" id="ap-mas">Ver más</button></div>` : ""}`;
}

/* ---------- Julio ---------- */
function vistaAdmin(el) {
  const ps = PER.pendientes();
  [...marcadas].forEach(id => { if (!ps.some(s => s.id === id)) marcadas.delete(id); });
  const hist = S.solicitudes.filter(s => s.estado !== "pendiente").sort((a, b) => String(b.resueltoEl || b.canceladoEl || "").localeCompare(String(a.resueltoEl || a.canceladoEl || "")));
  let h = cabecera("", "Aprobaciones", "Cambios propuestos por los operativos. Nada se aplica hasta que lo apruebes.");
  h += `<section class="panel"><div class="panel-cab"><div><h2>Pendientes</h2><p class="panel-sub">${ps.length ? `${ps.length} pedido${ps.length === 1 ? "" : "s"}, del más viejo al más nuevo.` : "No hay nada para revisar."}</p></div>
    ${ps.length > 1 ? `<div class="cab-acciones"><button class="btn btn-sec btn-chico" id="ap-todas">${marcadas.size === ps.length ? "Desmarcar todas" : "Marcar todas"}</button><button class="btn btn-pri btn-chico" id="ap-aprobar-marcadas"${marcadas.size ? "" : " disabled"}>Aprobar marcadas (${marcadas.size})</button></div>` : ""}</div>
    ${ps.length ? `<div class="sol-lista">${ps.map(s => tarjeta(s, { check: ps.length > 1, acciones: `<button class="btn btn-sec btn-chico" data-ver="${esc(s.id)}">Revisar</button><button class="btn btn-pri btn-chico" data-ok="${esc(s.id)}">Aprobar</button>` })).join("")}</div>` : `<div class="vacio"><b>Todo al día</b>Cuando un operativo cargue un gasto o un avance, aparece acá.</div>`}
  </section>
  <section class="panel"><div class="panel-cab"><div><h2>Historial</h2><p class="panel-sub">Pedidos aprobados, rechazados o cancelados, con quién y cuándo.</p></div></div>${historialHtml(hist)}</section>`;
  el.innerHTML = h;

  $$("[data-marca]", el).forEach(c => c.addEventListener("change", () => { if (c.checked) marcadas.add(c.dataset.marca); else marcadas.delete(c.dataset.marca); app.refrescar(); }));
  const todas = $("#ap-todas", el);
  if (todas) todas.addEventListener("click", () => { if (marcadas.size === ps.length) marcadas.clear(); else ps.forEach(s => marcadas.add(s.id)); app.refrescar(); });
  const am = $("#ap-aprobar-marcadas", el);
  if (am) am.addEventListener("click", e => {
    const sel = ps.filter(s => marcadas.has(s.id));
    const conConf = sel.filter(s => PER.conflicto(s));
    if (conConf.length) return toast(`Hay ${conConf.length} pedido${conConf.length === 1 ? "" : "s"} con aviso de conflicto: revisalos de a uno.`, "error");
    confirmar2(e.currentTarget, () => {
      sel.forEach(s => PER.aprobar(s));
      marcadas.clear();
      toast(`${sel.length} pedido${sel.length === 1 ? "" : "s"} aprobado${sel.length === 1 ? "" : "s"}`);
    }, `Tocá otra vez para aprobar ${sel.length}`);
  });
  $$("[data-ok]", el).forEach(b => b.addEventListener("click", e => {
    const s = S.solicitudes.find(x => x.id === b.dataset.ok);
    if (!s) return;
    if (PER.conflicto(s)) return detalle(s);
    confirmar2(e.currentTarget, () => { PER.aprobar(s); toast("Aprobado"); }, "¿Aprobar?");
  }));
  enlazarVer(el);
}

/* ---------- operativo y veedor ---------- */
function vistaOperativo(el) {
  const op = PER.esOperativo();
  const mias = op ? PER.misSolicitudes() : [];
  const pend = op ? mias.filter(s => s.estado === "pendiente") : PER.pendientes();
  const resueltas = op ? mias.filter(s => s.estado !== "pendiente") : S.solicitudes.filter(s => s.estado !== "pendiente").sort((a, b) => String(b.resueltoEl || "").localeCompare(String(a.resueltoEl || "")));
  const visto = vistoHasta();
  const rech = resueltas.filter(s => s.estado === "rechazada" && String(s.resueltoEl || "") > visto);
  if (op) { try { localStorage.setItem(LS_VISTO, new Date().toISOString()); } catch (e) { /* nada */ } }
  let h = cabecera("", op ? "Mis cargas" : "Cambios pendientes", op ? "Lo que propusiste y en qué estado está. Nada cuenta en los números hasta que Julio lo aprueba." : "Cambios propuestos por los operativos que esperan la aprobación de Julio.",
    op && PER.proyectosPermitidos().length ? `<a class="btn btn-pri" href="#cargar">${ICONOS.cargar}Proponer gasto</a>` : "");
  if (op && rech.length) h += `<div class="aviso">${ICONOS.alerta}<div><b>Julio rechazó ${rech.length} pedido${rech.length === 1 ? "" : "s"}.</b> Mirá el motivo abajo y, si corresponde, corregilo y volvé a enviarlo.</div></div>`;
  h += `<section class="panel"><div class="panel-cab"><div><h2>Pendientes de aprobación</h2><p class="panel-sub">${pend.length ? `${pend.length} pedido${pend.length === 1 ? "" : "s"}.` : "No hay pedidos esperando."}</p></div></div>
    ${pend.length ? `<div class="sol-lista">${pend.map(s => tarjeta(s, { acciones: op ? `<button class="btn btn-sec btn-chico" data-corregir="${esc(s.id)}">Corregir</button><button class="btn btn-fant btn-chico" data-cancelar="${esc(s.id)}">Cancelar</button>` : `<button class="btn btn-fant btn-chico" data-ver="${esc(s.id)}">Ver</button>` })).join("")}</div>` : `<div class="vacio">${op ? "Cuando cargues un gasto o un avance, lo vas a ver acá hasta que Julio lo apruebe." : "Nada pendiente."}</div>`}
  </section>
  <section class="panel"><div class="panel-cab"><div><h2>${op ? "Resueltas" : "Historial"}</h2></div></div>
    ${resueltas.length ? `<div class="sol-lista">${resueltas.slice(0, verHistorial).map(s => tarjeta(s, { acciones: `${op && s.estado === "rechazada" && s.accion !== "baja" ? `<button class="btn btn-sec btn-chico" data-reenviar="${esc(s.id)}">Corregir y reenviar</button>` : ""}<button class="btn btn-fant btn-chico" data-ver="${esc(s.id)}">Ver</button>` })).join("")}</div>
      ${resueltas.length > verHistorial ? `<div style="text-align:center;margin-top:12px"><button class="btn btn-sec btn-chico" id="ap-mas">Ver más</button></div>` : ""}` : `<div class="vacio">Todavía no hay pedidos resueltos.</div>`}
  </section>`;
  el.innerHTML = h;

  $$("[data-corregir]", el).forEach(b => b.addEventListener("click", () => corregirPropio(S.solicitudes.find(x => x.id === b.dataset.corregir))));
  $$("[data-reenviar]", el).forEach(b => b.addEventListener("click", () => {
    const s = S.solicitudes.find(x => x.id === b.dataset.reenviar);
    if (!s) return;
    if (s.coleccion === "avances") return corregirPropio(s);
    if (s.accion === "modificacion" && S.movimientos.some(m => m.id === s.docId)) return app.ir("cargar/" + encodeURIComponent(s.docId));
    app.ir("cargar/reenviar/" + encodeURIComponent(s.id));
  }));
  $$("[data-cancelar]", el).forEach(b => b.addEventListener("click", e => confirmar2(e.currentTarget, () => {
    const s = S.solicitudes.find(x => x.id === b.dataset.cancelar);
    if (s) { PER.cancelar(s); toast("Pedido cancelado"); }
  }, "¿Cancelar el pedido?")));
  enlazarVer(el);
}

function corregirPropio(s) {
  if (!s) return;
  if (s.coleccion === "movimientos") {
    if (s.accion === "baja") return toast("Un pedido de baja no se corrige: si no querés borrarlo, cancelá el pedido.");
    return app.ir(s.estado === "pendiente" ? "cargar/sol/" + encodeURIComponent(s.id) : "cargar/reenviar/" + encodeURIComponent(s.id));
  }
  const d = s.datos || s.anterior || {};
  fijarCtx({ tipo: "proyecto", id: d.proyecto });
  $$(".sel-ctx").forEach(x => { x.value = "p:" + d.proyecto; });
  app.ir("presupuesto/avance/" + d.mes);
}

function enlazarVer(el) {
  $$("[data-ver]", el).forEach(b => b.addEventListener("click", () => detalle(S.solicitudes.find(x => x.id === b.dataset.ver))));
  const mas = $("#ap-mas", el);
  if (mas) mas.addEventListener("click", () => { verHistorial += 30; app.refrescar(); });
}

/* ---------- detalle de un pedido ---------- */
function detalle(s) {
  if (!s) return;
  const admin = PER.esAdmin() && s.estado === "pendiente";
  const conf = s.estado === "pendiente" ? PER.conflicto(s) : "";
  const filas = PER.diferencias(s, s.datosAplicados || s.datos);
  const ver = s.accion === "modificacion" ? filas : filas.filter(f => (s.accion === "baja" ? f.antes : f.despues) !== "—");
  const tabla = s.accion === "modificacion"
    ? `<table class="tabla tabla-compacta"><thead><tr><th>Campo</th><th>Antes</th><th>Propuesto</th></tr></thead><tbody>${ver.map(f => `<tr class="${f.cambia ? "cambia" : ""}"><td>${esc(f.campo)}</td><td>${esc(f.antes)}</td><td>${f.cambia ? `<b>${esc(f.despues)}</b>` : esc(f.despues)}</td></tr>`).join("")}</tbody></table>`
    : `<table class="tabla tabla-compacta"><tbody>${ver.map(f => `<tr><td>${esc(f.campo)}</td><td>${esc(s.accion === "baja" ? f.antes : f.despues)}</td></tr>`).join("")}</tbody></table>`;
  const md = modal(`${PER.ACCIONES[s.accion]} · ${queEs(s)}`, `
    <p style="margin-top:0">Pedido por <b>${esc(PER.socioNombre(s.autor))}</b> el ${fmtFechaHora(s.editadoEl || s.creadoEl)} · ${tagEstado(s)}</p>
    ${s.accion === "baja" ? `<div class="aviso" style="margin:0 0 12px">${ICONOS.alerta}<div>Pide <b>borrar</b> este ${s.coleccion === "avances" ? "avance" : "gasto"}. Si lo aprobás, va a la papelera.</div></div>` : ""}
    ${s.accion === "modificacion" ? `<p class="chico mute" style="margin:0 0 8px">En negrita, lo que cambia.</p>` : ""}
    ${conf ? `<div class="aviso" style="margin:0 0 12px">${ICONOS.alerta}<div>${esc(conf)}</div></div>` : ""}
    <div class="tabla-env">${tabla}</div>
    ${s.motivo ? `<p><b>Motivo del rechazo:</b> ${esc(s.motivo)}</p>` : ""}
    ${s.corregido ? `<p class="chico mute">Julio lo aprobó con correcciones; se muestra lo que quedó aplicado.</p>` : ""}
    ${admin ? `<div class="campo" style="margin-top:14px"><label for="ap-motivo">Motivo, si lo rechazás <span class="opc">(lo ve ${esc(PER.socioNombre(s.autor))})</span></label><textarea id="ap-motivo" rows="2" placeholder="Ej.: la factura es de otra obra"></textarea></div>
    <div class="form-pie"><button class="btn btn-pri" id="ap-ok">Aprobar</button>${s.accion !== "baja" ? `<button class="btn btn-sec" id="ap-corregir">Corregir y aprobar</button>` : ""}<button class="btn btn-peligro der" id="ap-no">Rechazar</button></div>` : `<div class="form-pie"><button class="btn btn-sec" data-cerrar>Cerrar</button></div>`}`, { ancho: 640 });
  if (!admin) return;
  $("#ap-ok", md).addEventListener("click", e => {
    const go = () => { PER.aprobar(s); cerrarModal(); toast("Aprobado"); };
    if (conf) confirmar2(e.currentTarget, go, "Hay un aviso: tocá otra vez para aprobar igual"); else go();
  });
  $("#ap-no", md).addEventListener("click", () => {
    const motivo = $("#ap-motivo", md).value.trim();
    if (!motivo) { $("#ap-motivo", md).focus(); return toast("Escribí el motivo: así sabe qué corregir.", "error"); }
    PER.rechazar(s, motivo); cerrarModal(); toast("Pedido rechazado");
  });
  const corr = $("#ap-corregir", md);
  if (corr) corr.addEventListener("click", () => {
    cerrarModal();
    if (s.coleccion === "movimientos") return app.ir("cargar/revisar/" + encodeURIComponent(s.id));
    corregirAvance(s);
  });
}

/* Julio ajusta las cantidades de un avance antes de aprobarlo. */
function corregirAvance(s) {
  const d = s.datos || {};
  const p = M.proyecto(d.proyecto) || { items: [] };
  const cant = d.cantidades || {};
  const md = modal(`Corregir avance de ${mesLabel(d.mes)}`, `<p style="margin-top:0">${esc(p.nombre || "")} · propuesto por ${esc(PER.socioNombre(s.autor))}</p>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Ítem</th><th class="n">Cantidad del mes</th></tr></thead><tbody>
    ${(p.items || []).map(it => `<tr><td>Ítem ${esc(it.numero)} <span class="mute">${esc(it.unidad || "")}</span></td><td class="n"><input class="input n" data-ca="${esc(it.id)}" inputmode="decimal" value="${cant[it.id] ? String(cant[it.id]).replace(".", ",") : ""}" placeholder="0" style="text-align:right;max-width:120px" aria-label="Cantidad ítem ${esc(it.numero)}"></td></tr>`).join("")}
    </tbody></table></div>
    <div class="form-pie"><button class="btn btn-pri" id="ca-ok">Aprobar con correcciones</button><button class="btn btn-sec" data-cerrar>Cancelar</button></div>`, { ancho: 560 });
  $("#ca-ok", md).addEventListener("click", () => {
    const nuevas = {};
    let mal = false;
    $$("[data-ca]", md).forEach(i => {
      const v = i.value.trim();
      if (!v) return;
      const n = parseMonto(v);
      if (isNaN(n)) { mal = true; i.classList.add("error"); return; }
      if (n) nuevas[i.dataset.ca] = n;
    });
    if (mal) return toast("Hay una cantidad que no es un número.", "error");
    PER.aprobar(s, Object.assign({}, d, { cantidades: nuevas }));
    cerrarModal(); toast("Avance aprobado con correcciones");
  });
}

/* Para el menú: cuántos pedidos hay que mirar. */
export function contador() {
  if (PER.esAdmin()) return PER.pendientes().length;
  if (PER.esOperativo()) { const v = vistoHasta(); return PER.misSolicitudes().filter(s => s.estado === "rechazada" && String(s.resueltoEl || "") > v).length; }
  return 0;
}
