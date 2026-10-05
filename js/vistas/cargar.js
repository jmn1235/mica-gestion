/* =========================================================
   Cargar: alta y edición de gastos, ingresos y pases entre
   bolsillos. Todo se carga en pesos y se congela al dólar MEP
   de la fecha del movimiento.
   ========================================================= */
import { S, guardar, mandarAPapelera } from "../db.js";
import { app } from "../contexto.js";
import { TITULAR_MAGNA, SOCIOS } from "../config.js";
import * as M from "../modelo.js";
import { cotizacionMEP } from "../mep.js";
import { tomarPrefill, barraIAHtml, enlazarBarraIA } from "./cargarIA.js";
import * as PER from "../permisos.js";
import { $, $$, esc, fmtUSD, fmtARS, fmtFecha, fmtFechaHora, fmtMiles, parseMonto, hoyISO, toast, confirmar2, cabecera, ICONOS } from "../ui.js";

let sucio = false;
/* El formulario no se redibuja solo cuando llegan datos nuevos de otro dispositivo:
   así no se pierde lo que se está escribiendo ni lo que queda para "cargar otro". */
export const fija = () => true;

// Si se cierra la pestaña con un formulario a medio cargar, el navegador pregunta antes.
window.addEventListener("beforeunload", e => { if (sucio && location.hash.startsWith("#cargar")) { e.preventDefault(); e.returnValue = ""; } });

const CLASE_INICIAL = { egreso: "gasto", ingreso: "cobro", pase: "prestamo" };

export function render(el, params) {
  sucio = false;
  const admin = PER.esAdmin();
  if (!admin && !PER.esOperativo()) {
    el.innerHTML = cabecera("", "Cargar") + `<div class="panel vacio"><b>Tu usuario es de consulta</b>Podés ver y exportar toda la información, pero no cargar ni modificar datos.<div style="margin-top:14px"><a class="btn btn-sec" href="#movimientos">Ver movimientos</a></div></div>`;
    return;
  }
  if (!admin && !PER.proyectosPermitidos().length) {
    el.innerHTML = cabecera("", "Cargar") + `<div class="panel vacio"><b>No tenés proyectos asignados</b>Pedile a Julio que te habilite un proyecto para proponer gastos y avance.</div>`;
    return;
  }
  // Pedido pendiente que el operativo está corrigiendo (#cargar/sol/<id>).
  const sol0 = params[0] === "sol" ? S.solicitudes.find(x => x.id === params[1] && x.estado === "pendiente" && x.autor === app.usuario.socio && x.coleccion === "movimientos") : null;
  if (params[0] === "sol" && !sol0) {
    el.innerHTML = cabecera("", "Pedido no disponible") + `<div class="panel vacio"><b>Ese pedido ya no está pendiente</b>Puede que Julio ya lo haya resuelto. Mirá el estado en «Mis cargas».<div style="margin-top:14px"><a class="btn btn-sec" href="#aprobaciones">Mis cargas</a></div></div>`;
    return;
  }
  // Julio corrige un pedido antes de aprobarlo (#cargar/revisar/<id>).
  const solR = admin && params[0] === "revisar" ? S.solicitudes.find(x => x.id === params[1] && x.estado === "pendiente" && x.coleccion === "movimientos" && x.accion !== "baja") : null;
  if (params[0] === "revisar" && !solR) {
    el.innerHTML = cabecera("", "Pedido no disponible") + `<div class="panel vacio"><b>Ese pedido ya no está pendiente</b><div style="margin-top:14px"><a class="btn btn-sec" href="#aprobaciones">Volver a aprobaciones</a></div></div>`;
    return;
  }
  // Pedido rechazado que el operativo vuelve a mandar corregido (#cargar/reenviar/<id>).
  const solX = params[0] === "reenviar" ? S.solicitudes.find(x => x.id === params[1] && x.autor === app.usuario.socio && x.coleccion === "movimientos" && x.datos) : null;
  const especial = ["nuevo", "sol", "revisar", "reenviar"].includes(params[0]);
  const editId = params[0] && !especial ? params[0] : sol0 && sol0.accion !== "alta" ? sol0.docId : solR && solR.accion !== "alta" ? solR.docId : null;
  const m0 = editId ? S.movimientos.find(x => x.id === editId) : null;
  if (editId && !m0) {
    el.innerHTML = cabecera("", "Movimiento no encontrado") + `<div class="panel vacio"><b>Ese movimiento no existe</b>Puede que lo hayan borrado: revisá la papelera en Ajustes → Datos.<div style="margin-top:14px"><a class="btn btn-sec" href="#movimientos">Volver a movimientos</a></div></div>`;
    return;
  }
  if (m0 && m0.certificado) {
    const c = S.certificados.find(x => x.id === m0.certificado);
    el.innerHTML = cabecera("", "Cobro de un certificado", `${esc(m0.concepto || "")} · ${fmtFecha(m0.fecha, true)}`) + `<div class="panel" style="max-width:640px">
      <p style="margin-top:0">Este ingreso está vinculado ${c ? `a <b>${esc(c.tipo === "certificado" ? "el certificado N° " + c.numero : c.tipo === "anticipo" ? "la factura de anticipo" : "la devolución del fondo de reparo")}</b>` : "a un certificado que ya no existe"}. Se edita desde Certificados y cobranza, así las retenciones y el saldo de la factura quedan bien.</p>
      <div class="form-pie">${c ? `<button class="btn btn-pri" id="ir-cert">Abrir el certificado</button>` : ""}<a class="btn btn-sec" href="#movimientos">Volver</a></div></div>`;
    const b = $("#ir-cert", el);
    if (b) b.addEventListener("click", () => {
      app.ctx = { tipo: "proyecto", id: c.proyecto }; try { localStorage.setItem("mica_ctx", "p:" + c.proyecto); } catch (e) { /* nada */ }
      $$(".sel-ctx").forEach(s => { s.value = "p:" + c.proyecto; });
      app.ir("certificados/" + encodeURIComponent(c.id));
    });
    return;
  }
  if (m0 && !admin && !PER.puedeProponerMov(m0)) {
    el.innerHTML = cabecera("", "Movimiento", `${esc(M.TIPOS[m0.tipo])} del ${fmtFecha(m0.fecha, true)}`) + `<div class="panel" style="max-width:640px">
      <p style="margin-top:0"><b>${esc(M.tituloMov(m0))}</b> · ${esc(fmtARS(m0.montoARS))} · ${esc(M.nombreBolsillo(m0.bolsillo))}</p>
      <p class="mute">Este movimiento lo modifica Julio. Como operativo podés proponer cambios en los gastos de los proyectos que tenés asignados.</p>
      <div class="form-pie"><a class="btn btn-sec" href="#movimientos">Volver</a></div></div>`;
    return;
  }
  // Si el operativo ya pidió un cambio sobre este movimiento, se sigue desde su pedido.
  const solPrev = solR || sol0 || (m0 && !admin ? PER.pendienteDe("movimientos", m0.id) : null);
  const ctx = app.ctx;
  const proyCtx = ctx.tipo === "proyecto" ? ctx.id : (M.proyectosOrdenados().find(p => p.estado === "activo") || M.proyectosOrdenados()[0] || {}).id || "";
  const permitidos = admin ? null : PER.proyectosPermitidos().map(p => p.id);
  const bolDefecto = !admin ? (permitidos.includes(ctx.id) ? ctx.id : permitidos[0]) : ctx.tipo === "proyecto" ? ctx.id : ctx.tipo === "mica" ? "ESTRUCTURA" : "MAGNA";
  // Datos propuestos por la IA (factura leída o gasto escrito), para revisar antes de guardar.
  const pre = solX ? Object.assign({}, solX.datos, { fecha: solX.datos.fecha }) : !m0 && !sol0 && !solR ? tomarPrefill() : null;
  const tipo0 = !admin ? "egreso" : m0 ? m0.tipo : pre ? pre.tipo : (["egreso", "ingreso", "pase"].includes(params[1]) ? params[1] : "egreso");
  const st = solPrev ? Object.assign({}, m0 || {}, solPrev.datos) : m0 ? Object.assign({}, m0) : Object.assign({
    tipo: tipo0, clase: !admin ? "gasto" : params[2] || CLASE_INICIAL[tipo0], fecha: hoyISO(), bolsillo: bolDefecto, destino: "",
    cuenta: (S.cuentas[0] || {}).id || "c_magna", fiscal: "A", alicuota: 21, recuperable: bolDefecto === "MAGNA"
  }, pre || {});
  // Parámetro extra en la dirección: un monto en pesos (#cargar/nuevo/pase/reserva/150000) o un bolsillo (#cargar/nuevo/egreso/gasto/RESERVA).
  let bolFijo = false;
  if (!admin) { st.tipo = "egreso"; st.clase = "gasto"; if (!permitidos.includes(st.bolsillo)) st.bolsillo = bolDefecto; }
  if (!m0 && admin && params[3]) {
    if (/^\d+(\.\d+)?$/.test(params[3])) st.montoARS = Number(params[3]);
    else if (M.bolsillos().some(b => b.id === params[3])) { st.bolsillo = params[3]; st.recuperable = params[3] === "MAGNA"; bolFijo = true; }
  }

  const editando = !!(m0 || sol0 || solR);
  const titulo = solR ? `Corregir y aprobar el pedido de ${esc(PER.socioNombre(solR.autor))}` : !admin ? (m0 ? "Proponer cambio en un gasto" : sol0 ? "Corregir pedido" : "Cargar gasto para aprobación") : m0 ? "Editar movimiento" : "Cargar movimiento";
  const sub = m0 ? `${esc(M.TIPOS[m0.tipo])} del ${fmtFecha(m0.fecha, true)}` : `Se guarda en pesos y en dólares MEP de la fecha. Estás en <b>${esc(ctx.tipo === "proyecto" ? (M.proyecto(ctx.id) || {}).nombre : ctx.tipo === "mica" ? "MICA" : "Magna")}</b>.`;
  const multiCuenta = S.cuentas.length > 1;

  const avisoOperativo = admin ? "" : `<div class="aviso aviso-info" style="max-width:920px">${ICONOS.alerta}<div><b>${solPrev ? "Estás corrigiendo un pedido pendiente." : "Queda pendiente de aprobación."}</b> ${m0 ? "El cambio no se aplica hasta que Julio lo apruebe." : "El gasto no cuenta en los números hasta que Julio lo apruebe."} Podés seguir el estado en <a href="#aprobaciones">Mis cargas</a>.</div></div>`;
  const avisoRevision = solR ? `<div class="aviso aviso-info" style="max-width:920px">${ICONOS.alerta}<div>Corregí lo que haga falta y tocá <b>Aprobar con correcciones</b>. Queda registrado que lo cargó ${esc(PER.socioNombre(solR.autor))} y que lo aprobaste vos.</div></div>` : "";
  el.innerHTML = cabecera("", titulo, pre && !solX ? `${sub} <span class="tag tag-alerta">Propuesto por la IA: revisalo</span>` : sub) + avisoRevision + avisoOperativo + (editando ? "" : barraIAHtml()) + `
  <form class="panel form" id="f" novalidate style="max-width:920px">
    <div class="seg seg-tipo" role="radiogroup" aria-label="Tipo de movimiento"${admin ? "" : " hidden"}>
      <button type="button" role="radio" data-tipo="egreso">Gasto</button>
      <button type="button" role="radio" data-tipo="ingreso">Ingreso</button>
      <button type="button" role="radio" data-tipo="pase">Pase<span class="ocultar-movil"> entre bolsillos</span></button>
    </div>

    <div class="fila fila-movil-2">
      <div class="campo"><label for="f-fecha">Fecha</label><input type="date" id="f-fecha" required></div>
      <div class="campo"><label for="f-clase" id="l-clase">Tipo</label><select id="f-clase"></select></div>
      <div class="campo" id="c-bolsillo"><label for="f-bolsillo" id="l-bolsillo">Bolsillo</label><select id="f-bolsillo"></select></div>
      <div class="campo" data-ver="pase"><label for="f-destino">Va a</label><select id="f-destino"></select></div>
      <div class="campo"${multiCuenta ? "" : " hidden"}><label for="f-cuenta">Cuenta</label><select id="f-cuenta">${S.cuentas.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("")}</select></div>
    </div>

    <div class="fila fila-movil-2">
      <div class="campo"><label for="f-monto">Monto en pesos</label><input id="f-monto" class="monto" inputmode="decimal" autocomplete="off" placeholder="0"></div>
      <div class="campo"><label for="f-cot">Dólar MEP del día</label>
        <div class="con-boton"><input id="f-cot" inputmode="decimal" autocomplete="off"><button type="button" class="btn btn-sec" id="f-buscar" title="Volver a buscar la cotización de la fecha" aria-label="Buscar cotización">${ICONOS.restaurar}</button></div>
        <div class="hint" id="f-cot-hint"></div></div>
      <div class="campo campo-ancho-movil"><span class="rotulo">Equivale a</span><div class="equiv" id="f-equiv"><b>—</b><span></span></div></div>
    </div>

    <div class="aviso aviso-info" id="hint-cert" hidden style="margin:0">${ICONOS.alerta}<div>Los cobros de certificados conviene registrarlos desde <a href="#certificados">Certificados y cobranza</a>: así quedan vinculados a la factura, con sus retenciones y su saldo.</div></div>
    <div class="fila" id="fila-detalle">
      <div class="campo" data-ver="gasto"><label for="f-proveedor">Proveedor</label><input id="f-proveedor" list="dl-prov" autocomplete="off" placeholder="Escribí o elegí"><datalist id="dl-prov">${S.proveedores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(p => `<option value="${esc(p.nombre)}">`).join("")}</datalist></div>
      <div class="campo" data-ver="socio"><label for="f-socio">Socio</label><select id="f-socio"><option value="">Elegí el socio</option>${SOCIOS.map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("")}</select></div>
      <div class="campo" data-ver="tasa"><label for="f-tasa">Tasa anual en dólares <span class="opc">(%)</span></label><input id="f-tasa" inputmode="decimal" placeholder="Ej.: 8"></div>
      <div class="campo"><label for="f-concepto">Concepto</label><input id="f-concepto" autocomplete="off" placeholder="Qué es"></div>
    </div>

    <div class="fila fila-2" data-ver="gasto">
      <div class="campo"><label for="f-imp" id="l-imp">Imputación</label><select id="f-imp"></select></div>
      <div class="campo" data-ver="tipocosto"><label for="f-tipocosto">Tipo de costo</label><select id="f-tipocosto"><option value="">Elegí el tipo</option>${M.TIPOS_COSTO.map(t => `<option>${t}</option>`).join("")}</select></div>
    </div>

    <div class="fila fila-comp" data-ver="comprobante">
      <div class="campo" data-ver="fiscal"><span class="rotulo">Comprobante</span>
        <div class="seg seg-chico" id="f-fiscal" role="radiogroup" aria-label="Comprobante">${M.FISCAL.map(f => `<button type="button" role="radio" data-fiscal="${f.id}">${f.nombre}</button>`).join("")}</div></div>
      <div class="campo" data-ver="iva"><label for="f-alicuota">Alícuota de IVA</label><select id="f-alicuota">${M.ALICUOTAS.map(a => `<option value="${a}">${String(a).replace(".", ",")}%</option>`).join("")}</select></div>
      <div class="campo" data-ver="iva"><label for="f-iva">IVA incluido en el monto</label><input id="f-iva" inputmode="decimal" autocomplete="off"></div>
      <div class="campo"><label for="f-comprobante" id="l-comprobante">N° de comprobante <span class="opc">(opcional)</span></label><input id="f-comprobante" autocomplete="off"></div>
    </div>

    <label class="check" data-ver="recuperable"><input type="checkbox" id="f-recuperable"><span><b>Gasto recuperable</b><br><span class="mute">Lo paga Magna por ser la razón social de MICA (contadora de la SRL, CASEMICA…). Queda a favor de Julio y se le reintegra.</span></span></label>

    <div class="campo"><label for="f-notas">Notas <span class="opc">(opcional)</span></label><textarea id="f-notas" rows="2"></textarea></div>

    <div class="form-pie">
      <button type="submit" class="btn btn-pri" id="f-guardar">Guardar</button>
      ${editando ? `<a class="btn btn-sec" href="${sol0 || solR ? "#aprobaciones" : "#movimientos"}">Cancelar</a>` : `<button type="button" class="btn btn-sec" id="f-otro">${admin ? "Guardar y cargar otro" : "Enviar y cargar otro"}</button>`}
      ${m0 && !solR ? `<button type="button" class="btn btn-peligro der" id="f-borrar">${ICONOS.borrar}${admin ? "Borrar" : "Pedir que se borre"}</button>` : ""}
    </div>
    ${m0 ? `<p class="chico mute" style="margin:0">Cargado por ${esc(M.socioNombre(m0.creadoPor) || m0.creadoPor || "—")}${m0.creadoEl ? " el " + fmtFechaHora(m0.creadoEl) : ""}${m0.modificadoPor ? ` · última edición: ${esc(M.socioNombre(m0.modificadoPor))} el ${fmtFechaHora(m0.modificado)}` : ""}${m0.aprobadoPor ? ` · aprobado por ${esc(M.socioNombre(m0.aprobadoPor))} el ${fmtFechaHora(m0.aprobadoEl)}` : ""}</p>` : ""}
  </form>`;

  const f = $("#f", el);
  const q = id => $("#f-" + id, f);
  let tipo = st.tipo, fiscal = st.fiscal || "A";
  let ivaManual = false, cotManual = !!m0 || !!solPrev || !!(pre && pre.cotizacion), bolManual = !!m0 || !!solPrev || bolFijo || !!(pre && pre.bolsillo), fuente = st.cotizacionFuente || "";
  let pedidoCot = 0;

  /* ----- opciones dependientes ----- */
  function opcionesBolsillo(sel, valor) {
    const grupos = {};
    M.bolsillos().forEach(b => {
      if (permitidos && !permitidos.includes(b.id)) return;
      if (b.proyecto && b.estado === "cerrado" && b.id !== valor) return;
      (grupos[b.grupo] = grupos[b.grupo] || []).push(b);
    });
    sel.innerHTML = ["Proyectos", "MICA", "Magna"].filter(g => grupos[g]).map(g => `<optgroup label="${g}">${grupos[g].map(b => `<option value="${esc(b.id)}">${esc(b.nombre)}</option>`).join("")}</optgroup>`).join("");
    if (valor) sel.value = valor;
  }
  function opcionesClase() {
    const actual = q("clase").value || st.clase;
    q("clase").innerHTML = M.CLASES[tipo].filter(c => admin || c.id === "gasto").map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("");
    q("clase").value = M.CLASES[tipo].some(c => c.id === actual) ? actual : CLASE_INICIAL[tipo];
  }
  function opcionesImputacion() {
    const bol = q("bolsillo").value;
    const actual = q("imp").value || st.imputacion || "";
    const p = M.proyecto(bol);
    let h = "";
    if (p) {
      $("#l-imp", f).textContent = "Imputación";
      h = `<option value="">Elegí a qué se imputa</option>`;
      const items = p.items || [];
      if (items.length) h += `<optgroup label="Ítems de la cotización">${items.map(it => `<option value="i:${esc(it.id)}">Ítem ${esc(it.numero)} · ${esc(corta(it.descripcion, 70))}</option>`).join("")}</optgroup>`;
      const rubros = M.rubrosDe(p);
      if (rubros.length) h += `<optgroup label="Rubros (varios ítems)">${rubros.map(r => `<option value="r:${esc(r)}">${esc(r)}</option>`).join("")}</optgroup>`;
      h += `<optgroup label="Sin ítem"><option value="g">General de obra</option></optgroup>`;
    } else {
      $("#l-imp", f).textContent = "Categoría";
      const cats = M.categoriasDe(bol);
      h = `<option value="">Elegí la categoría</option>` + cats.map(c => `<option value="c:${esc(c)}">${esc(c)}</option>`).join("");
      if (actual.startsWith("c:") && !cats.includes(actual.slice(2))) h += `<option value="${esc(actual)}">${esc(actual.slice(2))}</option>`;
    }
    q("imp").innerHTML = h;
    q("imp").value = actual;
    if (q("imp").value !== actual) q("imp").value = "";
  }
  const corta = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

  /* ----- valores por defecto de cada tipo de pase ----- */
  function defectosPase(clase) {
    if (bolManual || m0) return;
    const P = proyCtx;
    const d = {
      prestamo: ["MAGNA", P], devolucion: [P, "MAGNA"], aporte: ["MAGNA", P], reserva: [P, "RESERVA"],
      reintegro: ["ESTRUCTURA", "MAGNA"], distribucion: [P, "MAGNA"], honorario: [P, "MAGNA"], devaporte: [P, "MAGNA"], estructura: [P, "ESTRUCTURA"]
    }[clase];
    if (d) { q("bolsillo").value = d[0]; q("destino").value = d[1]; }
    if (["aporte", "distribucion", "prestamo", "devolucion", "devaporte", "honorario"].includes(clase) && (q("bolsillo").value === "MAGNA" || q("destino").value === "MAGNA")) q("socio").value = TITULAR_MAGNA;
  }

  /* ----- mostrar u ocultar campos ----- */
  function actualizar() {
    const clase = q("clase").value;
    const bol = q("bolsillo").value;
    const esGasto = tipo === "egreso" && clase === "gasto";
    const esVentaC = tipo === "ingreso" && (clase === "cobro" || clase === "anticipo");
    const ver = {
      pase: tipo === "pase", gasto: esGasto, socio: M.pideSocio(tipo, clase), tasa: M.pideTasa(tipo, clase),
      tipocosto: esGasto && M.esBolsilloProyecto(bol), comprobante: esGasto || esVentaC, fiscal: esGasto,
      iva: (esGasto && fiscal === "A") || esVentaC, recuperable: esGasto && bol === "MAGNA"
    };
    $$("[data-ver]", f).forEach(n => { n.hidden = !ver[n.dataset.ver]; });
    $$(".seg-tipo button", f).forEach(b => { const a = b.dataset.tipo === tipo; b.classList.toggle("activo", a); b.setAttribute("aria-checked", a); });
    $$("#f-fiscal button", f).forEach(b => { const a = b.dataset.fiscal === fiscal; b.classList.toggle("activo", a); b.setAttribute("aria-checked", a); });
    $("#l-clase", f).textContent = { egreso: "Tipo de egreso", ingreso: "Tipo de ingreso", pase: "Tipo de pase" }[tipo];
    $("#c-bolsillo", f).classList.toggle("campo-ancho-movil", tipo !== "pase");
    $("#l-bolsillo", f).textContent = tipo === "pase" ? "Sale de" : tipo === "ingreso" ? "Entra a" : "Se paga desde";
    const hc = $("#hint-cert", f);
    if (hc) hc.hidden = !(esVentaC && !m0);
    $("#l-comprobante", f).innerHTML = esVentaC ? 'N° de factura <span class="opc">(opcional)</span>' : 'N° de comprobante <span class="opc">(opcional)</span>';
    q("concepto").placeholder = esGasto ? "Qué se compró o contrató" : esVentaC ? "Ej.: Certificado 1, agosto" : "Detalle";
    q("guardar").textContent = solR ? "Aprobar con correcciones" : !admin ? (m0 ? "Enviar cambio para aprobación" : sol0 ? "Guardar corrección del pedido" : "Enviar para aprobación") : m0 ? "Guardar cambios" : esGasto ? "Guardar gasto" : tipo === "pase" ? "Guardar pase" : "Guardar ingreso";
    calcularIva();
  }

  function calcularIva() {
    const clase = q("clase").value;
    const esVentaC = tipo === "ingreso" && (clase === "cobro" || clase === "anticipo");
    const aplica = (tipo === "egreso" && clase === "gasto" && fiscal === "A") || esVentaC;
    if (!ivaManual) {
      const monto = parseMonto(q("monto").value) || 0;
      const a = Number(q("alicuota").value) || 0;
      const iva = aplica && a > 0 ? monto - monto / (1 + a / 100) : 0;
      q("iva").value = iva ? fmtMiles(Math.round(iva * 100) / 100) : "";
    }
    equivalencia();
  }

  function equivalencia() {
    const monto = parseMonto(q("monto").value) || 0;
    const cot = parseMonto(q("cot").value) || 0;
    const iva = q("iva").closest("[data-ver]").hidden ? 0 : (parseMonto(q("iva").value) || 0);
    const eq = q("equiv");
    if (monto > 0 && cot > 0) {
      eq.querySelector("b").textContent = fmtUSD(monto / cot, 2);
      eq.querySelector("span").textContent = iva > 0 ? "Neto de IVA: " + fmtUSD((monto - iva) / cot, 2) : "Al dólar MEP de la fecha";
    } else {
      eq.querySelector("b").textContent = "—";
      eq.querySelector("span").textContent = cot > 0 ? "" : "Falta la cotización";
    }
  }

  async function buscarCot(forzar) {
    const fecha = q("fecha").value;
    if (!fecha || (cotManual && !forzar)) return;
    const n = ++pedidoCot;
    const hint = q("cot-hint");
    hint.className = "hint"; hint.textContent = "Buscando cotización…";
    const r = await cotizacionMEP(fecha);
    if (n !== pedidoCot) return;
    if (r) {
      q("cot").value = fmtMiles(r.valor);
      cotManual = false; fuente = r.aproximada ? "aprox" : "api";
      hint.className = "hint" + (r.aproximada ? " warn" : "");
      hint.textContent = r.aproximada ? "No hay dato para esa fecha: se usó la de hoy. Revisala." : (r.fecha === fecha ? "MEP venta de esa fecha." : "MEP del " + fmtFecha(r.fecha) + " (último día hábil).");
    } else {
      hint.className = "hint warn"; hint.textContent = "No se pudo consultar. Cargala a mano.";
    }
    equivalencia();
  }

  /* ----- cargar valores ----- */
  q("fecha").value = st.fecha || hoyISO();
  opcionesBolsillo(q("bolsillo"), st.bolsillo);
  opcionesBolsillo(q("destino"), st.destino || "");
  if (S.cuentas.length) q("cuenta").value = st.cuenta || S.cuentas[0].id;
  opcionesClase();
  q("clase").value = st.clase || CLASE_INICIAL[tipo];
  opcionesImputacion();
  q("monto").value = st.montoARS ? fmtMiles(st.montoARS) : "";
  q("cot").value = st.cotizacion ? fmtMiles(st.cotizacion) : "";
  q("proveedor").value = st.proveedor || "";
  q("socio").value = st.socio || "";
  q("tasa").value = st.tasa != null ? String(st.tasa).replace(".", ",") : "";
  q("concepto").value = st.concepto || "";
  q("tipocosto").value = st.tipoCosto || "";
  q("alicuota").value = String(st.alicuota != null && st.alicuota !== "" ? st.alicuota : 21);
  q("comprobante").value = st.comprobante || "";
  q("recuperable").checked = !!st.recuperable;
  q("notas").value = st.notas || "";
  if ((m0 || solPrev) && st.ivaARS) {
    q("iva").value = fmtMiles(st.ivaARS);
    const a = Number(st.alicuota) || 0;
    const calc = a ? st.montoARS - st.montoARS / (1 + a / 100) : 0;
    ivaManual = Math.abs(calc - st.ivaARS) > 1;
  }
  if (!m0 && tipo === "pase") defectosPase(q("clase").value);
  actualizar();
  if (pre && pre.cotizacion) q("cot-hint").textContent = "Cotización tomada al leer la factura.";
  else if (solPrev && !m0) q("cot-hint").textContent = "Cotización del pedido.";
  else if (m0) {
    q("cot-hint").textContent = m0.cotizacionFuente === "manual" ? "Cotización cargada a mano." : "Cotización guardada con el movimiento.";
  } else buscarCot(true);

  /* ----- eventos ----- */
  f.addEventListener("input", () => { sucio = true; });
  f.addEventListener("change", () => { sucio = true; });
  $$(".seg-tipo button", f).forEach(b => b.addEventListener("click", () => {
    tipo = b.dataset.tipo;
    opcionesClase();
    if (tipo === "pase") { if (!q("destino").value || q("destino").value === q("bolsillo").value) bolManual = false; defectosPase(q("clase").value); }
    else if (!m0 && !bolManual) q("bolsillo").value = bolDefecto;
    opcionesImputacion();
    actualizar();
  }));
  $$("#f-fiscal button", f).forEach(b => b.addEventListener("click", () => { fiscal = b.dataset.fiscal; ivaManual = false; actualizar(); }));
  q("clase").addEventListener("change", () => { if (tipo === "pase") defectosPase(q("clase").value); actualizar(); });
  q("bolsillo").addEventListener("change", () => {
    bolManual = true;
    opcionesImputacion();
    if (q("bolsillo").value === "MAGNA" && !m0) q("recuperable").checked = true;
    actualizar();
  });
  q("destino").addEventListener("change", () => { bolManual = true; });
  q("fecha").addEventListener("change", () => buscarCot(false));
  q("buscar").addEventListener("click", () => buscarCot(true));
  q("cot").addEventListener("input", () => { cotManual = true; fuente = "manual"; q("cot-hint").className = "hint"; q("cot-hint").textContent = "Cotización cargada a mano."; equivalencia(); });
  q("monto").addEventListener("input", calcularIva);
  q("alicuota").addEventListener("change", () => { ivaManual = false; calcularIva(); });
  q("iva").addEventListener("input", () => { ivaManual = true; equivalencia(); });
  ["monto", "cot", "iva"].forEach(id => q(id).addEventListener("blur", () => { const v = parseMonto(q(id).value); if (!isNaN(v)) q(id).value = fmtMiles(v); }));
  // Enter en un campo no envía el formulario por accidente, salvo en el botón.
  f.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") { e.preventDefault(); } });

  f.addEventListener("submit", e => { e.preventDefault(); guardarForm(false); });
  if (!editando) enlazarBarraIA(el, () => q("bolsillo").value);
  if (q("otro")) q("otro").addEventListener("click", () => guardarForm(true));
  if (q("borrar")) q("borrar").addEventListener("click", e => confirmar2(e.currentTarget, () => {
    sucio = false;
    if (!admin) {
      PER.proponer({ coleccion: "movimientos", accion: "baja", docId: m0.id });
      toast("Pedido de baja enviado: Julio lo tiene que aprobar");
      return app.ir("aprobaciones");
    }
    mandarAPapelera("movimientos", m0, app.usuario.socio);
    toast("Movimiento enviado a la papelera");
    app.ir("movimientos");
  }, admin ? "Tocá otra vez para borrar" : "Tocá otra vez para pedir la baja"));

  function marcarError(id, msg) {
    $$(".error", f).forEach(n => n.classList.remove("error"));
    const n = q(id);
    if (n) { n.classList.add("error"); n.focus(); }
    toast(msg, "error");
    return false;
  }

  function guardarForm(otro) {
    const clase = q("clase").value;
    const esGasto = tipo === "egreso" && clase === "gasto";
    const esVentaC = tipo === "ingreso" && (clase === "cobro" || clase === "anticipo");
    const fecha = q("fecha").value;
    const bol = q("bolsillo").value;
    const dest = q("destino").value;
    const monto = parseMonto(q("monto").value);
    const cot = parseMonto(q("cot").value);
    const iva = (esGasto && fiscal === "A") || esVentaC ? (parseMonto(q("iva").value) || 0) : 0;
    if (!fecha) return marcarError("fecha", "Falta la fecha.");
    if (!bol) return marcarError("bolsillo", "Elegí el bolsillo.");
    if (tipo === "pase" && (!dest || dest === bol)) return marcarError("destino", "El pase tiene que ir a otro bolsillo.");
    if (!(monto > 0)) return marcarError("monto", "Cargá el monto en pesos.");
    if (!(cot > 0)) return marcarError("cot", "Falta la cotización del dólar para congelar el valor.");
    if (iva < 0 || iva >= monto) return marcarError("iva", "El IVA tiene que ser menor que el monto.");
    if (esGasto && !q("proveedor").value.trim() && !q("concepto").value.trim()) return marcarError("concepto", "Poné el proveedor o el concepto.");
    if (esGasto && !q("imp").value) return marcarError("imp", M.esBolsilloProyecto(bol) ? "Elegí a qué ítem, rubro o general se imputa." : "Elegí la categoría.");
    if (M.pideSocio(tipo, clase) && !q("socio").value) return marcarError("socio", "Elegí el socio.");
    const tasa = M.pideTasa(tipo, clase) && q("tasa").value.trim() ? parseMonto(q("tasa").value) : null;
    if (tasa != null && (isNaN(tasa) || tasa < 0 || tasa > 200)) return marcarError("tasa", "Revisá la tasa: es un % anual en dólares.");

    const ahora = new Date().toISOString();
    const d = Object.assign({}, m0 || {}, {
      tipo, clase, fecha, bolsillo: bol, destino: tipo === "pase" ? dest : "",
      cuenta: q("cuenta").value || (S.cuentas[0] || {}).id || "c_magna",
      montoARS: Math.round(monto * 100) / 100, cotizacion: cot, cotizacionFuente: fuente || "manual",
      montoUSD: Math.round((monto / cot) * 100) / 100,
      concepto: q("concepto").value.trim(), notas: q("notas").value.trim(),
      proveedor: esGasto ? q("proveedor").value.trim() : "",
      imputacion: esGasto ? q("imp").value : "",
      tipoCosto: esGasto && M.esBolsilloProyecto(bol) ? q("tipocosto").value : "",
      fiscal: esGasto ? fiscal : esVentaC ? "A" : "",
      alicuota: iva > 0 ? Number(q("alicuota").value) : 0,
      ivaARS: Math.round(iva * 100) / 100,
      comprobante: esGasto || esVentaC ? q("comprobante").value.trim() : "",
      recuperable: esGasto && bol === "MAGNA" ? q("recuperable").checked : false,
      socio: M.pideSocio(tipo, clase) ? q("socio").value : "",
      tasa
    });
    if (solR) {
      ["creadoPor", "creadoEl", "modificadoPor", "aprobadoPor", "aprobadoEl", "solicitud", "id", "modificado"].forEach(k => { if (!m0) delete d[k]; });
      PER.aprobar(solR, d);
      sucio = false;
      toast("Pedido aprobado con correcciones · " + `${fmtARS(d.montoARS)} · ${fmtUSD(d.montoUSD)}`);
      return app.ir("aprobaciones");
    }
    if (!admin) {
      // Operativo: el gasto viaja como pedido; Julio lo aplica al aprobarlo.
      ["creadoPor", "creadoEl", "modificadoPor", "aprobadoPor", "aprobadoEl", "solicitud"].forEach(k => { if (!m0) delete d[k]; });
      PER.proponer({ coleccion: "movimientos", accion: m0 ? "modificacion" : "alta", docId: m0 ? m0.id : sol0 ? sol0.docId : null, datos: d });
      toast((m0 ? "Cambio enviado" : sol0 ? "Pedido corregido" : "Gasto enviado") + " para aprobación · " + `${fmtARS(d.montoARS)} · ${fmtUSD(d.montoUSD)}`);
      sucio = false;
      if (otro) {
        ["monto", "concepto", "comprobante", "iva", "notas"].forEach(id => { q(id).value = ""; });
        ivaManual = false; equivalencia(); q("monto").focus(); window.scrollTo({ top: 0, behavior: "smooth" });
      } else app.ir("aprobaciones");
      return;
    }
    if (!m0) { d.creadoPor = app.usuario.socio; d.creadoEl = ahora; }
    else d.modificadoPor = app.usuario.socio;
    delete d.demo;
    guardar("movimientos", d);

    // Proveedor nuevo: queda en el maestro para la próxima.
    if (d.proveedor && !S.proveedores.some(p => p.nombre.toLowerCase() === d.proveedor.toLowerCase())) {
      guardar("proveedores", { nombre: d.proveedor, cuit: "", rubro: "", notas: "", creadoPor: app.usuario.socio });
    }
    const resumen = `${fmtARS(d.montoARS)} · ${fmtUSD(d.montoUSD)}`;
    toast((m0 ? "Cambios guardados" : esGasto ? "Gasto guardado" : tipo === "pase" ? "Pase guardado" : "Ingreso guardado") + " · " + resumen);
    sucio = false;
    if (otro) {
      $("#dl-prov", f).innerHTML = S.proveedores.concat(d.proveedor ? [{ nombre: d.proveedor }] : []).map(p => p.nombre).filter((v, i, a) => a.indexOf(v) === i).sort().map(n => `<option value="${esc(n)}">`).join("");
      ["monto", "concepto", "comprobante", "iva", "notas"].forEach(id => { q(id).value = ""; });
      ivaManual = false;
      equivalencia();
      q("monto").focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else app.ir("movimientos");
  }
}
