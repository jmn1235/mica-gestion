/* =========================================================
   Carga con IA: lectura de facturas (foto o PDF) y carga de
   un gasto escrito o dictado. La IA propone; la persona revisa
   y guarda.
   ========================================================= */
import { S, guardar } from "../db.js";
import * as PER from "../permisos.js";
import { app } from "../contexto.js";
import { SOCIOS } from "../config.js";
import * as M from "../modelo.js";
import * as IA from "../ia.js";
import { cotizacionMEP } from "../mep.js";
import { $, $$, esc, fmtARS, fmtUSD, fmtMiles, parseMonto, hoyISO, toast, modal, cerrarModal, ICONOS } from "../ui.js";

let prefill = null;
export function tomarPrefill() { const p = prefill; prefill = null; return p; }

/* Opciones de imputación de un bolsillo: ítems, rubros y general (proyecto) o categorías. */
export function opcionesImputacion(bol) {
  const p = M.proyecto(bol);
  if (p) {
    return [
      ...(p.items || []).map(it => ({ clave: "i:" + it.id, nombre: `Ítem ${it.numero} · ${it.descripcion.slice(0, 70)}` })),
      ...M.rubrosDe(p).map(r => ({ clave: "r:" + r, nombre: "Rubro " + r })),
      { clave: "g", nombre: "General de obra (campamento, traslados, seguros, EPP, lo que no es de un ítem)" }
    ];
  }
  return M.categoriasDe(bol).map(c => ({ clave: "c:" + c, nombre: c }));
}

export function barraIAHtml() {
  if (!IA.hayClave()) return `<div class="barra-ia apagada">${ICONOS.chispa}<span>Con la IA podés leer facturas y cargar gastos escribiendo o dictando. <a href="#ajustes/impuestos">Activarla</a></span></div>`;
  const voz = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  return `<div class="barra-ia">
    <div class="barra-ia-tit">${ICONOS.chispa}<b>Cargar con IA</b></div>
    <div class="barra-ia-acciones">
      <label class="btn btn-sec" for="ia-factura">${ICONOS.subir}Leer factura</label><input type="file" id="ia-factura" accept="image/*,application/pdf" hidden>
      <div class="ia-frase"><label class="sr" for="ia-frase">Gasto escrito o dictado</label><input class="input" id="ia-frase" autocomplete="off" placeholder="Ej.: ayer pagué 250 mil de gasoil a YPF para la camioneta">
        ${voz ? `<button type="button" class="btn-icono" id="ia-mic" title="Dictar" aria-label="Dictar">${ICONOS.mic}</button>` : ""}
        <button type="button" class="btn btn-pri" id="ia-interpretar">Interpretar</button></div>
    </div>
    <div id="ia-estado-c" class="hint"></div>
  </div>`;
}

export function enlazarBarraIA(el, bolsilloActual) {
  const f = $("#ia-factura", el);
  if (!f) return;
  const est = $("#ia-estado-c", el);
  const estado = (t, warn) => { est.textContent = t; est.className = "hint" + (warn ? " warn" : ""); };
  f.addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    estado("Leyendo la factura…");
    try {
      const datos = await leerFactura(file, bolsilloActual());
      estado("");
      revisarFactura(datos, bolsilloActual(), file);
    } catch (err) { estado(err.message, true); }
  });
  const frase = $("#ia-frase", el), bi = $("#ia-interpretar", el);
  const interpretar = async () => {
    const t = frase.value.trim();
    if (!t) return frase.focus();
    bi.disabled = true; estado("Interpretando…");
    try {
      const d = await interpretarTexto(t, bolsilloActual());
      prefill = d;
      estado("");
      toast("Revisá los datos y guardá");
      app.ir("cargar");
    } catch (err) { estado(err.message, true); bi.disabled = false; }
  };
  bi.addEventListener("click", interpretar);
  frase.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); interpretar(); } });
  const mic = $("#ia-mic", el);
  if (mic) mic.addEventListener("click", () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "es-AR"; rec.interimResults = false; rec.maxAlternatives = 1;
    mic.classList.add("armado"); estado("Te escucho…");
    rec.onresult = ev => { frase.value = ev.results[0][0].transcript; estado(""); };
    rec.onerror = () => estado("No se pudo usar el micrófono. Escribilo.", true);
    rec.onend = () => mic.classList.remove("armado");
    try { rec.start(); } catch (err) { estado("No se pudo usar el micrófono.", true); mic.classList.remove("armado"); }
  });
}

/* ---------- lectura de factura ---------- */
async function leerFactura(file, bol) {
  const bloque = await IA.bloqueArchivo(file);
  const opciones = opcionesImputacion(bol);
  const esProy = !!M.proyecto(bol);
  const sistema = "Sos un asistente de control de costos de una empresa de servicios mineros en Argentina. Leés facturas de proveedores y las imputás. Respondés SOLO con JSON válido, sin explicaciones ni markdown.";
  const instr = `Leé esta factura y devolvé un JSON con esta forma exacta:
{"fecha":"AAAA-MM-DD","proveedor":"","cuit":"","comprobante":"","letra":"A|B|C|X","total":0,"neto":0,"iva":0,"alicuota":21,"renglones":[{"concepto":"","imputacion":"","tipoCosto":"","monto":0}]}
Reglas:
- "letra": la letra de la factura (A, B o C). Si es un ticket o no se distingue, "X".
- Factura A: copiá "neto" e "iva" tal como figuran, sin calcularlos. Si tiene percepciones u otros impuestos, quedan dentro del total pero no del IVA.
- Factura B o C: "iva": 0 y "neto" igual al total.
- "total": el importe final a pagar, en pesos, como número sin separadores.
- "imputacion" tiene que ser una de estas claves (usá la clave exacta, no el nombre):
${opciones.map(o => `  ${o.clave} = ${o.nombre}`).join("\n") || "  (sin opciones: dejalo vacío)"}
${esProy ? `- "tipoCosto": uno de ${M.TIPOS_COSTO.join(" | ")}.` : `- "tipoCosto": dejalo vacío.`}
- Si la factura tiene conceptos que van a imputaciones distintas, armá un renglón por cada una y repartí el total (con IVA incluido, prorrateado). La suma de los renglones tiene que dar el total.
- Si no sabés a qué ítem va, usá la opción general${esProy ? " (g)" : ""}.
- Si un dato no aparece, dejalo como cadena vacía.`;
  const d = await IA.pedirJSON([{ role: "user", content: [bloque, { type: "text", text: instr }] }], { sistema, maxTokens: 2000 });
  return d;
}

function revisarFactura(d, bol, file) {
  const opciones = opcionesImputacion(bol);
  const esProy = !!M.proyecto(bol);
  const total0 = Number(d.total) || 0;
  const letra = String(d.letra || "").toUpperCase();
  const fiscal0 = letra === "A" && Number(d.iva) > 0 ? "A" : letra === "B" || letra === "C" ? "B" : "X";
  const renglones = (Array.isArray(d.renglones) && d.renglones.length ? d.renglones : [{ concepto: "", imputacion: "", tipoCosto: "", monto: total0 }]).map(r => ({
    concepto: String(r.concepto || "").slice(0, 120), imputacion: opciones.some(o => o.clave === r.imputacion) ? r.imputacion : (esProy ? "g" : ""),
    tipoCosto: M.TIPOS_COSTO.includes(r.tipoCosto) ? r.tipoCosto : "", monto: Number(r.monto) || 0
  }));
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || "") ? d.fecha : hoyISO();
  const v = x => (x ? fmtMiles(x) : "");
  const optImp = sel => `<option value="">Elegí</option>` + opciones.map(o => `<option value="${esc(o.clave)}"${o.clave === sel ? " selected" : ""}>${esc(o.nombre.slice(0, 60))}</option>`).join("");
  const filaR = r => `<div class="renglon${esProy ? "" : " sin-tipo"}">
    <input class="input" data-r="concepto" value="${esc(r.concepto)}" placeholder="Concepto" aria-label="Concepto">
    <select class="input" data-r="imputacion" aria-label="${esProy ? "Imputación" : "Categoría"}">${optImp(r.imputacion)}</select>
    ${esProy ? `<select class="input" data-r="tipoCosto" aria-label="Tipo de costo"><option value="">Tipo</option>${M.TIPOS_COSTO.map(t => `<option${t === r.tipoCosto ? " selected" : ""}>${t}</option>`).join("")}</select>` : ""}
    <input class="input n" data-r="monto" inputmode="decimal" value="${v(r.monto)}" aria-label="Monto" style="text-align:right">
    <button type="button" class="btn-icono" data-quitar aria-label="Quitar renglón">${ICONOS.cerrar}</button></div>`;
  const md = modal("Factura leída con IA", `<form class="form abierto-a-todos" id="fr" novalidate>
    <p class="mute" style="margin:0">Revisá lo que leyó la IA antes de guardar. Se carga en <b>${esc(M.nombreBolsillo(bol))}</b>.</p>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="r-fecha">Fecha</label><input id="r-fecha" type="date" value="${esc(fechaOk)}"></div>
      <div class="campo"><label for="r-prov">Proveedor</label><input id="r-prov" value="${esc(d.proveedor || "")}"></div>
      <div class="campo"><label for="r-comp">Comprobante</label><input id="r-comp" value="${esc(d.comprobante || "")}"></div>
      <div class="campo"><label for="r-fiscal">Tipo</label><select id="r-fiscal">${M.FISCAL.map(f => `<option value="${f.id}"${f.id === fiscal0 ? " selected" : ""}>${f.id === "B" ? "Factura B o C" : f.id === "S" ? "Sueldo, cargas o tasa" : f.nombre}</option>`).join("")}</select></div>
    </div>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="r-total">Total en pesos</label><input id="r-total" class="monto" inputmode="decimal" value="${v(total0)}"></div>
      <div class="campo" data-iva><label for="r-iva">IVA</label><input id="r-iva" inputmode="decimal" value="${v(Number(d.iva) || 0)}"></div>
      <div class="campo" data-iva><label for="r-alic">Alícuota</label><select id="r-alic">${M.ALICUOTAS.map(a => `<option value="${a}"${Number(d.alicuota || 21) === a ? " selected" : ""}>${String(a).replace(".", ",")}%</option>`).join("")}</select></div>
      <div class="campo"><label for="r-mep">Dólar MEP del día</label><input id="r-mep" inputmode="decimal"><div class="hint" id="r-mep-hint">Buscando…</div></div>
    </div>
    <div class="bloque"><div class="bloque-tit">Renglones <span class="mute" style="font-weight:400" id="r-suma"></span></div>
      <div id="r-lista" class="form" style="gap:8px">${renglones.map(filaR).join("")}</div>
      <div><button type="button" class="btn btn-sec btn-chico" id="r-add">Agregar renglón</button></div></div>
    <div class="form-pie"><button class="btn btn-pri" type="submit" id="r-guardar">Guardar</button>
      <button class="btn btn-sec" type="button" id="r-form">Revisar en el formulario</button>
      <button class="btn btn-fant" type="button" data-cerrar>Cancelar</button></div>
  </form>`, { ancho: 880 });
  const q = id => $("#r-" + id, md);
  let fuente = "manual";
  const leerR = () => $$(".renglon", md).map(row => ({ concepto: $('[data-r="concepto"]', row).value.trim(), imputacion: $('[data-r="imputacion"]', row).value, tipoCosto: esProy ? $('[data-r="tipoCosto"]', row).value : "", monto: parseMonto($('[data-r="monto"]', row).value) || 0 }));
  const actualizar = () => {
    const tot = parseMonto(q("total").value) || 0;
    const rs = leerR();
    const suma = rs.reduce((a, r) => a + r.monto, 0);
    q("suma").textContent = `· suman ${fmtARS(suma)}${Math.abs(suma - tot) > Math.max(1, tot * 0.005) ? ` y la factura dice ${fmtARS(tot)}` : ""}`;
    $$("[data-iva]", md).forEach(n => { n.hidden = q("fiscal").value !== "A"; });
    q("guardar").textContent = rs.length > 1 ? `Guardar ${rs.length} gastos` : "Guardar gasto";
    q("form").hidden = rs.length !== 1;
  };
  const enlazarR = row => $("[data-quitar]", row).addEventListener("click", () => { if ($$(".renglon", md).length > 1) { row.remove(); actualizar(); } });
  $$(".renglon", md).forEach(enlazarR);
  q("add").addEventListener("click", () => { q("lista").insertAdjacentHTML("beforeend", filaR({ concepto: "", imputacion: esProy ? "g" : "", tipoCosto: "", monto: 0 })); enlazarR(q("lista").lastElementChild); actualizar(); });
  md.addEventListener("input", e => { if (e.target.id === "r-mep") fuente = "manual"; actualizar(); });
  md.addEventListener("change", actualizar);
  const buscarMep = async () => {
    const r = await cotizacionMEP(q("fecha").value);
    if (r) { q("mep").value = fmtMiles(r.valor); fuente = r.aproximada ? "aprox" : "api"; q("mep-hint").textContent = r.aproximada ? "Sin dato para esa fecha: se usó la de hoy." : "MEP de esa fecha."; }
    else q("mep-hint").textContent = "No se pudo consultar. Cargala a mano.";
  };
  q("fecha").addEventListener("change", buscarMep);
  buscarMep(); actualizar();

  const datosComunes = () => ({
    fecha: q("fecha").value, proveedor: q("prov").value.trim(), comprobante: q("comp").value.trim(), fiscal: q("fiscal").value,
    alicuota: Number(q("alic").value) || 21, cotizacion: parseMonto(q("mep").value) || 0, cotizacionFuente: fuente
  });
  q("form").addEventListener("click", () => {
    const c = datosComunes(), r = leerR()[0];
    prefill = { tipo: "egreso", clase: "gasto", bolsillo: bol, fecha: c.fecha, proveedor: c.proveedor, comprobante: c.comprobante, fiscal: c.fiscal, alicuota: c.alicuota,
      montoARS: r.monto || parseMonto(q("total").value) || 0, concepto: r.concepto, imputacion: r.imputacion, tipoCosto: r.tipoCosto,
      cotizacion: c.cotizacion || undefined, cotizacionFuente: c.cotizacion ? c.cotizacionFuente : undefined, leidoConIA: true };
    cerrarModal(); app.ir("cargar");
  });
  $("#fr", md).addEventListener("submit", e => {
    e.preventDefault();
    const c = datosComunes();
    const rs = leerR();
    const tot = parseMonto(q("total").value) || 0;
    const iva = c.fiscal === "A" ? (parseMonto(q("iva").value) || 0) : 0;
    const suma = rs.reduce((a, r) => a + r.monto, 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) return toast("Falta la fecha.", "error");
    if (!(tot > 0)) return toast("Falta el total.", "error");
    if (Math.abs(suma - tot) > Math.max(1, tot * 0.005)) return toast(`Los renglones suman ${fmtARS(suma)} y el total es ${fmtARS(tot)}.`, "error");
    if (!(c.cotizacion > 0)) return toast("Falta el dólar MEP del día.", "error");
    if (rs.some(r => !r.imputacion)) return toast(esProy ? "Hay un renglón sin imputación." : "Hay un renglón sin categoría.", "error");
    if (iva < 0 || iva >= tot) return toast("Revisá el IVA.", "error");
    const ahora = new Date().toISOString();
    const admin = PER.esAdmin();
    rs.forEach(r => {
      const ivaR = tot ? Math.round(iva * r.monto / tot * 100) / 100 : 0;
      (admin ? (x => guardar("movimientos", x)) : (x => PER.proponer({ coleccion: "movimientos", accion: "alta", datos: x })))({
        tipo: "egreso", clase: "gasto", fecha: c.fecha, bolsillo: bol, destino: "", cuenta: (S.cuentas[0] || {}).id || "c_magna",
        montoARS: Math.round(r.monto * 100) / 100, cotizacion: c.cotizacion, cotizacionFuente: c.cotizacionFuente, montoUSD: Math.round(r.monto / c.cotizacion * 100) / 100,
        proveedor: c.proveedor, concepto: r.concepto, imputacion: r.imputacion, tipoCosto: r.tipoCosto, fiscal: c.fiscal,
        alicuota: ivaR > 0 ? c.alicuota : 0, ivaARS: ivaR, comprobante: c.comprobante, recuperable: bol === "MAGNA",
        socio: "", tasa: null, notas: "Leído con IA", leidoConIA: true, creadoPor: app.usuario.socio, creadoEl: ahora
      });
    });
    if (admin && c.proveedor && !S.proveedores.some(p => p.nombre.toLowerCase() === c.proveedor.toLowerCase())) guardar("proveedores", { nombre: c.proveedor, cuit: d.cuit || "", rubro: "", notas: "", creadoPor: app.usuario.socio });
    cerrarModal();
    if (!admin) {
      toast(rs.length > 1 ? `${rs.length} gastos enviados para aprobación · ${fmtARS(tot)}` : `Gasto enviado para aprobación · ${fmtARS(tot)}`);
      return app.ir("aprobaciones");
    }
    toast(rs.length > 1 ? `${rs.length} gastos guardados · ${fmtARS(tot)}` : `Gasto guardado · ${fmtARS(tot)} · ${fmtUSD(tot / c.cotizacion)}`);
    app.ir("movimientos");
  });
}

/* ---------- gasto escrito o dictado ---------- */
async function interpretarTexto(t, bolActual) {
  const bols = M.bolsillos().filter(b => !b.proyecto || b.estado !== "cerrado");
  const proyectos = M.proyectosOrdenados().filter(p => p.estado !== "cerrado");
  const ctx = {
    hoy: hoyISO(), bolsillo_por_defecto: bolActual,
    bolsillos: bols.map(b => ({ id: b.id, nombre: b.nombre })),
    clases: { egreso: M.CLASES.egreso.map(c => c.id + " = " + c.nombre), ingreso: M.CLASES.ingreso.map(c => c.id + " = " + c.nombre), pase: M.CLASES.pase.map(c => c.id + " = " + c.nombre) },
    imputaciones_por_proyecto: Object.fromEntries(proyectos.map(p => [p.id, opcionesImputacion(p.id).map(o => o.clave + " = " + o.nombre)])),
    categorias: { ESTRUCTURA: M.categoriasDe("ESTRUCTURA"), MAGNA: M.categoriasDe("MAGNA"), RESERVA: M.categoriasDe("RESERVA") },
    tipos_de_costo: M.TIPOS_COSTO,
    socios: SOCIOS.map(s => s.id + " = " + s.nombre),
    proveedores_conocidos: S.proveedores.map(p => p.nombre).slice(0, 80)
  };
  const sistema = "Convertís frases de los socios de MICA (servicios mineros, Argentina) en un movimiento de dinero para cargar en la app. Respondés SOLO con JSON válido.";
  const instr = `Frase: "${t}"

Devolvé este JSON:
{"tipo":"egreso|ingreso|pase","clase":"","fecha":"AAAA-MM-DD","montoARS":0,"bolsillo":"","destino":"","proveedor":"","concepto":"","imputacion":"","tipoCosto":"","fiscal":"A|B|S|X","socio":"","tasa":null}
Reglas:
- Un pago o compra es tipo "egreso" clase "gasto". Plata que entra es "ingreso". Pasar plata entre bolsillos (préstamo de Magna a un proyecto, reserva de impuestos) es "pase", con "bolsillo" de origen y "destino".
- "fecha": interpretá "hoy", "ayer", "el lunes" desde la fecha de hoy. Si no dice, hoy.
- "montoARS": en pesos como número ("250 mil" = 250000, "1,5 palos" = 1500000). Si la frase da dólares, convertí solo si dice el tipo de cambio; si no, poné 0.
- "bolsillo": id de la lista; si nombra un proyecto, el id de ese proyecto; si no dice, el bolsillo por defecto.
- Para un gasto de proyecto, "imputacion" es una clave de imputaciones_por_proyecto de ese proyecto; si no sabés a qué ítem va, "g". Para Estructura, Magna o Reserva, "imputacion" es "c:" + la categoría.
- "fiscal": "A" si dice factura A, "B" si dice factura B o C, "S" si son sueldos, cargas sociales, tasas o impuestos, "X" si dice sin factura o en negro; si no dice, "A".
- "socio": id del socio solo para aportes, préstamos, devoluciones, distribuciones u honorarios.
- Si un dato no aparece, cadena vacía.

Contexto:
${JSON.stringify(ctx)}`;
  const d = await IA.pedirJSON([{ role: "user", content: instr }], { sistema, maxTokens: 600 });
  // Validación: solo se aceptan valores que existen en la app.
  const out = {};
  out.tipo = ["egreso", "ingreso", "pase"].includes(d.tipo) ? d.tipo : "egreso";
  out.clase = M.CLASES[out.tipo].some(c => c.id === d.clase) ? d.clase : M.CLASES[out.tipo][0].id;
  out.fecha = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || "") ? d.fecha : hoyISO();
  if (Number(d.montoARS) > 0) out.montoARS = Number(d.montoARS);
  out.bolsillo = bols.some(b => b.id === d.bolsillo) ? d.bolsillo : bolActual;
  if (out.tipo === "pase" && bols.some(b => b.id === d.destino) && d.destino !== out.bolsillo) out.destino = d.destino;
  out.proveedor = String(d.proveedor || "").slice(0, 80);
  out.concepto = String(d.concepto || "").slice(0, 120);
  if (opcionesImputacion(out.bolsillo).some(o => o.clave === d.imputacion)) out.imputacion = d.imputacion;
  if (M.TIPOS_COSTO.includes(d.tipoCosto)) out.tipoCosto = d.tipoCosto;
  out.fiscal = ["A", "B", "S", "X"].includes(d.fiscal) ? d.fiscal : "A";
  if (SOCIOS.some(s => s.id === d.socio)) out.socio = d.socio;
  if (Number(d.tasa) > 0) out.tasa = Number(d.tasa);
  out.recuperable = out.bolsillo === "MAGNA";
  return out;
}
