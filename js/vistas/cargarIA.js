/* =========================================================
   Carga con IA: lectura de facturas (foto o PDF) y carga de
   un gasto escrito o dictado. La IA propone; la persona revisa
   y guarda.
   ========================================================= */
import { S, guardar } from "../db.js";
import * as PER from "../permisos.js";
import * as GS from "../gastoSocio.js";
import { app } from "../contexto.js";
import { SOCIOS } from "../config.js";
import * as M from "../modelo.js";
import * as IA from "../ia.js";
import { cotizacionMEP } from "../mep.js";
import { $, $$, esc, fmtARS, fmtUSD, fmtMiles, parseMonto, hoyISO, toast, modal, cerrarModal, ICONOS } from "../ui.js";
import { datosFiscales } from "../contadora.js";

const soloDigitos = v => String(v || "").replace(/\D/g, "");
/* Proveedor conocido (por CUIT o por nombre) y lo que se suele hacer con sus facturas. */
export function proveedorConocido(nombre, cuit) {
  const c = soloDigitos(cuit), nm = String(nombre || "").trim().toLowerCase();
  return S.proveedores.find(p => (c.length >= 10 && soloDigitos(p.cuit) === c)) || S.proveedores.find(p => nm && String(p.nombre || "").toLowerCase() === nm) || null;
}
/* Recuerda en el proveedor a qué bolsillo y categoría fue su último gasto de Magna pagado por Julio. */
export function recordarHabitual(g, cuit) {
  if (!PER.esAdmin() || !g || !g.proveedor) return;
  const p = proveedorConocido(g.proveedor, cuit);
  if (!p) return;
  const hab = g.bolsillo === "MAGNA" && g.imputacion ? { bolsillo: "MAGNA", imputacion: g.imputacion, fueraDeCaja: !!g.fueraDeCaja } : null;
  const antes = JSON.stringify(p.habitual || null);
  const cambios = {};
  if (JSON.stringify(hab) !== antes && hab) cambios.habitual = hab;
  if (cuit && !p.cuit) cambios.cuit = cuit;
  if (Object.keys(cambios).length) guardar("proveedores", Object.assign({}, p, cambios));
}

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
{"fecha":"AAAA-MM-DD","proveedor":"","cuit":"","cuitComprador":"","comprobante":"","codigo":"","letra":"A|B|C|X","total":0,"neto":0,"noGravado":0,"iva":0,"alicuota":21,"otrosTributos":0,"percepciones":{"iibb":0,"iva":0,"ganancias":0},"esCombustible":false,"renglones":[{"concepto":"","imputacion":"","tipoCosto":"","subcategoria":"","monto":0}]}
Reglas:
- "letra": la letra del comprobante (A, B o C). Los tiques fiscales también tienen letra: "Tique factura A" (código 081) es "A"; "Tique factura B" (código 082) es "B"; código 111 es "C". Un tique sin letra, un remito o un presupuesto es "X".
- "codigo": el código del comprobante si figura (por ejemplo "081"). "comprobante": el número con punto de venta, por ejemplo "00039-00091987".
- "cuit": el CUIT del que vende (arriba, con la razón social del emisor). "cuitComprador": el CUIT del que compra (el cliente), sin confundirlos.
- "neto": el neto gravado ("subtotal importe neto gravado"), copiado tal como figura. "noGravado": la suma de lo no gravado y lo exento; si no hay, 0.
- Factura A: copiá "iva" tal como figura, sin calcularlo. Si hay IVA de distintas alícuotas (por ejemplo 21% y 10,5%), sumá todos los IVA en "iva" y poné "alicuota": "varias".
- "otrosTributos": impuestos que no son IVA ni percepciones: impuestos internos, impuesto a los combustibles líquidos (ITC), impuesto al dióxido de carbono, tasas viales o municipales incluidas, "importe total otros tributos". En las facturas de combustible casi siempre hay uno, aunque figure con un nombre poco claro (por ejemplo "10 - Impuestos internos ítems"). Copiá el importe, no la base. Si no hay, 0.
- "percepciones": las percepciones que figuren: de Ingresos Brutos (IIBB, de cualquier provincia, sumadas) en "iibb", de IVA en "iva" y de Ganancias en "ganancias". Si no hay, 0. No pongas acá los impuestos internos ni el de los combustibles.
- Los números entre corchetes o paréntesis al lado de cada renglón (por ejemplo "(21.00) [80.89]") son alícuotas o códigos internos: no son importes.
- Control: neto + noGravado + iva + otrosTributos + percepciones tiene que dar el total. Si no da, volvé a mirar la factura antes de responder.
- Factura B o C: "iva": 0 y "neto" igual al total menos las percepciones y los otros tributos.
- "total": el importe final a pagar, en pesos, como número sin separadores (los decimales con punto).
- "esCombustible": true si es una carga de combustible (nafta, gasoil, diésel, GNC) en una estación de servicio; si no, false.
- "imputacion" tiene que ser una de estas claves (usá la clave exacta, no el nombre):
${opciones.map(o => `  ${o.clave} = ${o.nombre}`).join("\n") || "  (sin opciones: dejalo vacío)"}
${esProy ? `- "tipoCosto": uno de ${M.TIPOS_COSTO.join(" | ")} ("Indirectos" son los gastos generales de la obra).
- "subcategoria": una de las de su tipoCosto, exacta: ${M.TIPOS_COSTO.map(t => `${t}: ${M.subcategoriasDe(t).join(" / ")}`).join("; ")}.` : `- "tipoCosto" y "subcategoria": dejalos vacíos.`}
- Si la factura tiene conceptos que van a imputaciones distintas, armá un renglón por cada una y repartí el total (con IVA e impuestos incluidos, prorrateados). La suma de los renglones tiene que dar el total.
- Si no sabés a qué ítem va, usá la opción general${esProy ? " (g)" : ""}.
- Si un dato no aparece, dejalo como cadena vacía.
Ejemplo (tique de una estación de servicio): "Cód. 081 - Tique factura A", N° 00039-00091987, emisor Matías Amengual SRL CUIT 30668133297, cliente Magna Desarrollos SRL CUIT 30718641515, "Nafta Súper 44,510 l a $ 2202", subtotal neto gravado 67772.58, IVA 21% 14232.24, "10 - Impuestos internos ítems" 16006.20, total 98011.02. Se lee así:
{"fecha":"2026-10-28","proveedor":"Matías Amengual SRL","cuit":"30-66813329-7","cuitComprador":"30-71864151-5","comprobante":"00039-00091987","codigo":"081","letra":"A","total":98011.02,"neto":67772.58,"noGravado":0,"iva":14232.24,"alicuota":21,"otrosTributos":16006.20,"percepciones":{"iibb":0,"iva":0,"ganancias":0},"esCombustible":true,"renglones":[{"concepto":"Nafta Súper 44,51 l","imputacion":"","tipoCosto":"","subcategoria":"","monto":98011.02}]}`;
  const d = await IA.pedirJSON([{ role: "user", content: [bloque, { type: "text", text: instr }] }], { sistema, maxTokens: 2500 });
  return d;
}

function revisarFactura(d, bol, file, preset = {}) {
  const admin = PER.esAdmin();
  const opciones = opcionesImputacion(bol);
  const prov = proveedorConocido(d.proveedor, d.cuit);
  const puedeMagna = PER.bolsilloPermitido("MAGNA");
  const hab = puedeMagna && prov && prov.habitual && prov.habitual.bolsillo === "MAGNA" ? prov.habitual : null;
  const catComb = M.categoriasDe("MAGNA").find(c => /combustible/i.test(c));
  // Combustible o proveedor que siempre va a Magna: se propone cargarlo ahí, pagado por quien carga, sin reintegro.
  const sugerirMagna = puedeMagna && bol !== "MAGNA" && (hab || (d.esCombustible && catComb));
  const impMagna = bol === "MAGNA" ? (preset.imputacion || (hab && hab.imputacion) || (d.esCombustible && catComb ? "c:" + catComb : "")) : "";
  const fuera0 = bol === "MAGNA" && (preset.fueraDeCaja != null ? preset.fueraDeCaja : hab ? !!hab.fueraDeCaja : !!d.esCombustible);
  const pagoSR0 = fuera0 ? (preset.pagoSinReintegro || app.usuario.socio) : "";
  const esProy = !!M.proyecto(bol);
  const total0 = Number(d.total) || 0;
  const letra = String(d.letra || "").toUpperCase();
  const fiscal0 = letra === "A" && Number(d.iva) > 0 ? "A" : letra === "B" || letra === "C" ? "B" : "X";
  const renglones = (Array.isArray(d.renglones) && d.renglones.length ? d.renglones : [{ concepto: "", imputacion: "", tipoCosto: "", monto: total0 }]).map(r => {
    const tipoCosto = M.TIPOS_COSTO.includes(r.tipoCosto) ? r.tipoCosto : "";
    return {
      concepto: String(r.concepto || "").slice(0, 120), imputacion: impMagna && opciones.some(o => o.clave === impMagna) ? impMagna : opciones.some(o => o.clave === r.imputacion) ? r.imputacion : (esProy ? "g" : ""),
      tipoCosto, subcategoria: tipoCosto && M.subcategoriasDe(tipoCosto).includes(r.subcategoria) ? r.subcategoria : "", monto: Number(r.monto) || 0
    };
  });
  const pr = d.percepciones || {};
  const perc0 = { percIIBB: Number(pr.iibb) || 0, percIVA: Number(pr.iva) || 0, percGan: Number(pr.ganancias) || 0 };
  const otros0 = Number(d.otrosTributos) || 0, noGrav0 = Number(d.noGravado) || 0, neto0 = Number(d.neto) || 0;
  // El CUIT del comprador tiene que ser el de Magna: si no, el IVA no sirve como crédito fiscal.
  const cuitMagna = soloDigitos(datosFiscales().cuit), cuitComp = soloDigitos(d.cuitComprador);
  const otroComprador = cuitMagna.length >= 10 && cuitComp.length >= 10 && cuitMagna !== cuitComp;
  const alic0 = String(d.alicuota).toLowerCase() === "varias" ? "varias" : (M.ALICUOTAS.includes(Number(d.alicuota)) ? Number(d.alicuota) : 21);
  const admitePago = M.admitePrestamoSocio(bol);
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || "") ? d.fecha : hoyISO();
  const v = x => (x ? fmtMiles(x) : "");
  const optImp = sel => `<option value="">Elegí</option>` + opciones.map(o => `<option value="${esc(o.clave)}"${o.clave === sel ? " selected" : ""}>${esc(o.nombre.slice(0, 60))}</option>`).join("");
  const optSub = (t, sel) => `<option value="">${t ? "Subcategoría" : "—"}</option>` + (t ? M.subcategoriasDe(t) : []).map(x => `<option value="${esc(x)}"${x === sel ? " selected" : ""}>${esc(x)}</option>`).join("");
  const filaR = r => `<div class="renglon${esProy ? "" : " sin-tipo"}">
    <input class="input" data-r="concepto" value="${esc(r.concepto)}" placeholder="Concepto" aria-label="Concepto">
    <select class="input" data-r="imputacion" aria-label="${esProy ? "Imputación" : "Categoría"}">${optImp(r.imputacion)}</select>
    ${esProy ? `<select class="input" data-r="tipoCosto" aria-label="Categoría"><option value="">Categoría</option>${M.TIPOS_COSTO.map(t => `<option value="${t}"${t === r.tipoCosto ? " selected" : ""}>${esc(M.nombreCategoria(t))}</option>`).join("")}</select>
    <select class="input" data-r="subcategoria" aria-label="Subcategoría">${optSub(r.tipoCosto, r.subcategoria)}</select>` : ""}
    <input class="input n" data-r="monto" inputmode="decimal" value="${v(r.monto)}" aria-label="Monto" style="text-align:right">
    <button type="button" class="btn-icono" data-quitar aria-label="Quitar renglón">${ICONOS.cerrar}</button></div>`;
  const md = modal("Factura leída con IA", `<form class="form abierto-a-todos" id="fr" novalidate>
    <p class="mute" style="margin:0">Revisá lo que leyó la IA antes de guardar. Se carga en <b>${esc(M.nombreBolsillo(bol))}</b>.</p>
    ${otroComprador ? `<div class="aviso" style="margin:0">${ICONOS.alerta}<div><b>La factura no es a nombre de Magna.</b> El CUIT del comprador es ${esc(d.cuitComprador)} y el de Magna es ${esc(datosFiscales().cuit)}. Su IVA no se puede computar como crédito fiscal.</div></div>` : ""}
    ${sugerirMagna ? `<div class="aviso aviso-info" style="margin:0">${ICONOS.alerta}<div><b>${hab ? "Este proveedor suele ir a Magna · Julio." : "Parece una carga de combustible."}</b> Si es de Magna y no de ${esc(M.nombreBolsillo(bol))}, cargala en Magna · Julio${catComb && !hab ? `, categoría ${esc(catComb)},` : ""} como pagada por vos, sin reintegro.
      <div style="margin-top:8px"><button type="button" class="btn btn-sec btn-chico" id="r-a-magna">Cargar en Magna · Julio</button></div></div></div>` : ""}
    <div class="fila fila-movil-2">
      <div class="campo"><label for="r-fecha">Fecha</label><input id="r-fecha" type="date" value="${esc(fechaOk)}"></div>
      <div class="campo"><label for="r-prov">Proveedor</label><input id="r-prov" value="${esc(d.proveedor || "")}"></div>
      <div class="campo"><label for="r-comp">Comprobante</label><input id="r-comp" value="${esc(d.comprobante || "")}"></div>
      <div class="campo"><label for="r-fiscal">Tipo</label><select id="r-fiscal">${M.FISCAL.map(f => `<option value="${f.id}"${f.id === fiscal0 ? " selected" : ""}>${f.id === "B" ? "Factura B o C" : f.id === "S" ? "Sueldo, cargas o tasa" : f.nombre}</option>`).join("")}</select></div>
    </div>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="r-total">Total en pesos</label><input id="r-total" class="monto" inputmode="decimal" value="${v(total0)}"></div>
      <div class="campo" data-iva><label for="r-iva">IVA total</label><input id="r-iva" inputmode="decimal" value="${v(Number(d.iva) || 0)}"></div>
      <div class="campo" data-iva><label for="r-alic">Alícuota</label><select id="r-alic">${M.ALICUOTAS.map(a => `<option value="${a}"${alic0 === a ? " selected" : ""}>${String(a).replace(".", ",")}%</option>`).join("")}<option value="varias"${alic0 === "varias" ? " selected" : ""}>Varias</option></select></div>
      <div class="campo"><label for="r-mep">Dólar MEP del día</label><input id="r-mep" inputmode="decimal"><div class="hint" id="r-mep-hint">Buscando…</div></div>
    </div>
    <div class="fila fila-movil-2" data-perc>
      <div class="campo"><label for="r-percIIBB">Percepción IIBB</label><input id="r-percIIBB" inputmode="decimal" value="${v(perc0.percIIBB)}" placeholder="0"></div>
      <div class="campo" data-iva><label for="r-percIVA">Percepción IVA</label><input id="r-percIVA" inputmode="decimal" value="${v(perc0.percIVA)}" placeholder="0"></div>
      <div class="campo"><label for="r-percGan">Percepción Ganancias</label><input id="r-percGan" inputmode="decimal" value="${v(perc0.percGan)}" placeholder="0"></div>
      <div class="campo"><label for="r-otros">Impuestos internos y otros tributos</label><input id="r-otros" inputmode="decimal" value="${v(otros0)}" placeholder="0"></div>
      <div class="campo" data-iva><label for="r-nograv">No gravado o exento</label><input id="r-nograv" inputmode="decimal" value="${v(noGrav0)}" placeholder="0"></div>
      ${bol === "MAGNA" ? `<div class="campo"><label for="r-fuera">Lo pagó</label><select id="r-fuera"><option value="">La cuenta de Magna</option>${SOCIOS.map(s => `<option value="${s.id}"${pagoSR0 === s.id ? " selected" : ""}>${esc(s.nombre)}, con su plata, sin reintegro</option>`).join("")}</select></div>` : ""}
      ${admitePago ? `<div class="campo"><label for="r-pagado">Lo pagó</label><select id="r-pagado"><option value="">La cuenta de Magna</option>${SOCIOS.map(s => `<option value="${s.id}">${esc(s.nombre)} (queda como préstamo)</option>`).join("")}</select></div>` : ""}
    </div>
    <div class="hint" id="r-control" style="margin:0"></div>
    <div class="bloque"><div class="bloque-tit">Renglones <span class="mute" style="font-weight:400" id="r-suma"></span></div>
      <div id="r-lista" class="form" style="gap:8px">${renglones.map(filaR).join("")}</div>
      <div><button type="button" class="btn btn-sec btn-chico" id="r-add">Agregar renglón</button></div></div>
    <div class="form-pie"><button class="btn btn-pri" type="submit" id="r-guardar">Guardar</button>
      <button class="btn btn-sec" type="button" id="r-form">Revisar en el formulario</button>
      <button class="btn btn-fant" type="button" data-cerrar>Cancelar</button></div>
  </form>`, { ancho: 880 });
  const q = id => $("#r-" + id, md);
  let fuente = "manual";
  const leerR = () => $$(".renglon", md).map(row => ({ concepto: $('[data-r="concepto"]', row).value.trim(), imputacion: $('[data-r="imputacion"]', row).value, tipoCosto: esProy ? $('[data-r="tipoCosto"]', row).value : "", subcategoria: esProy ? $('[data-r="subcategoria"]', row).value : "", monto: parseMonto($('[data-r="monto"]', row).value) || 0 }));
  const leerPerc = () => {
    const fz = q("fiscal").value;
    if (fz !== "A" && fz !== "B") return { percIIBB: 0, percIVA: 0, percGan: 0 };
    return { percIIBB: parseMonto(q("percIIBB").value) || 0, percIVA: fz === "A" ? (parseMonto(q("percIVA").value) || 0) : 0, percGan: parseMonto(q("percGan").value) || 0 };
  };
  const leerOtros = () => {
    const fz = q("fiscal").value;
    if (fz !== "A" && fz !== "B") return { otrosTribARS: 0, noGravadoARS: 0 };
    return { otrosTribARS: parseMonto(q("otros").value) || 0, noGravadoARS: fz === "A" ? (parseMonto(q("nograv").value) || 0) : 0 };
  };
  /* Control de la factura: neto gravado + no gravado + IVA + impuestos internos + percepciones = total. */
  const control = () => {
    const tot = parseMonto(q("total").value) || 0, fz = q("fiscal").value;
    const el = q("control");
    if (!(tot > 0) || (fz !== "A" && fz !== "B")) { el.textContent = ""; return; }
    const iva = fz === "A" ? (parseMonto(q("iva").value) || 0) : 0;
    const pc = leerPerc(), ot = leerOtros();
    const gravado = tot - iva - pc.percIIBB - pc.percIVA - pc.percGan - ot.otrosTribARS - ot.noGravadoARS;
    const partes = [`Neto gravado ${fmtARS(gravado, 2)}`, ot.noGravadoARS ? `no gravado ${fmtARS(ot.noGravadoARS, 2)}` : "", iva ? `IVA ${fmtARS(iva, 2)}` : "", ot.otrosTribARS ? `imp. internos ${fmtARS(ot.otrosTribARS, 2)}` : "", (pc.percIIBB + pc.percIVA + pc.percGan) ? `percepciones ${fmtARS(pc.percIIBB + pc.percIVA + pc.percGan, 2)}` : ""].filter(Boolean).join(" + ");
    const difNeto = fz === "A" && neto0 > 0 ? gravado - neto0 : 0;
    if (gravado < 0) { el.className = "hint warn"; el.textContent = "Los impuestos suman más que el total: revisalos."; }
    else if (Math.abs(difNeto) > 1) { el.className = "hint warn"; el.textContent = `${partes} = ${fmtARS(tot, 2)}. La factura dice neto gravado ${fmtARS(neto0, 2)}: hay ${fmtARS(Math.abs(difNeto), 2)} de diferencia, revisá los impuestos.`; }
    else { el.className = "hint"; el.textContent = `${partes} = ${fmtARS(tot, 2)} ✓`; }
  };
  const actualizar = () => {
    const tot = parseMonto(q("total").value) || 0;
    const rs = leerR();
    const suma = rs.reduce((a, r) => a + r.monto, 0);
    q("suma").textContent = `· suman ${fmtARS(suma)}${Math.abs(suma - tot) > Math.max(1, tot * 0.005) ? ` y la factura dice ${fmtARS(tot)}` : ""}`;
    $$("[data-iva]", md).forEach(n => { n.hidden = q("fiscal").value !== "A"; });
    $$("[data-perc] > .campo:not([data-iva])", md).forEach(n => { n.hidden = !["A", "B"].includes(q("fiscal").value) && !n.querySelector("#r-pagado, #r-fuera"); });
    q("guardar").textContent = rs.length > 1 ? `Guardar ${rs.length} gastos` : "Guardar gasto";
    q("form").hidden = rs.length !== 1;
    control();
  };
  const enlazarR = row => $("[data-quitar]", row).addEventListener("click", () => { if ($$(".renglon", md).length > 1) { row.remove(); actualizar(); } });
  $$(".renglon", md).forEach(enlazarR);
  q("add").addEventListener("click", () => { q("lista").insertAdjacentHTML("beforeend", filaR({ concepto: "", imputacion: esProy ? "g" : "", tipoCosto: "", monto: 0 })); enlazarR(q("lista").lastElementChild); actualizar(); });
  md.addEventListener("input", e => { if (e.target.id === "r-mep") fuente = "manual"; actualizar(); });
  md.addEventListener("change", e => {
    const t = e.target;
    if (t.matches && t.matches('[data-r="tipoCosto"]')) { const sub = $('[data-r="subcategoria"]', t.closest(".renglon")); sub.innerHTML = optSub(t.value, ""); }
    actualizar();
  });
  const buscarMep = async () => {
    const r = await cotizacionMEP(q("fecha").value);
    if (r) { q("mep").value = fmtMiles(r.valor); fuente = r.aproximada ? "aprox" : "api"; q("mep-hint").textContent = r.aproximada ? "Sin dato para esa fecha: se usó la de hoy." : "MEP de esa fecha."; }
    else q("mep-hint").textContent = "No se pudo consultar. Cargala a mano.";
  };
  q("fecha").addEventListener("change", buscarMep);
  const bm = q("a-magna");
  if (bm) bm.addEventListener("click", () => { cerrarModal(); revisarFactura(Object.assign({}, d, { renglones: leerR().map(r => ({ concepto: r.concepto, monto: r.monto })) }), "MAGNA", file, { fueraDeCaja: true, pagoSinReintegro: app.usuario.socio, imputacion: hab ? hab.imputacion : "c:" + catComb }); });
  buscarMep(); actualizar();

  const datosComunes = () => ({
    fecha: q("fecha").value, proveedor: q("prov").value.trim(), comprobante: q("comp").value.trim(), fiscal: q("fiscal").value,
    alicuota: q("alic").value === "varias" ? "varias" : (Number(q("alic").value) || 21), cotizacion: parseMonto(q("mep").value) || 0, cotizacionFuente: fuente,
    pagadoPor: q("pagado") ? q("pagado").value : "",
    fueraDeCaja: !!(q("fuera") && q("fuera").value),
    pagoSinReintegro: q("fuera") ? q("fuera").value : ""
  });
  q("form").addEventListener("click", () => {
    const c = datosComunes(), r = leerR()[0];
    const iva = c.fiscal === "A" ? (parseMonto(q("iva").value) || 0) : 0;
    prefill = Object.assign({ tipo: "egreso", clase: "gasto", bolsillo: bol, fecha: c.fecha, proveedor: c.proveedor, comprobante: c.comprobante, fiscal: c.fiscal, alicuota: c.alicuota,
      montoARS: r.monto || parseMonto(q("total").value) || 0, concepto: r.concepto, imputacion: r.imputacion, tipoCosto: r.tipoCosto, subcategoria: r.subcategoria,
      ivaARS: iva || undefined, pagadoPor: c.pagadoPor, fueraDeCaja: c.fueraDeCaja, pagoSinReintegro: c.pagoSinReintegro, recuperable: bol === "MAGNA" && !c.fueraDeCaja,
      cotizacion: c.cotizacion || undefined, cotizacionFuente: c.cotizacion ? c.cotizacionFuente : undefined, leidoConIA: true }, leerPerc(), leerOtros());
    cerrarModal(); app.ir("cargar");
  });
  $("#fr", md).addEventListener("submit", e => {
    e.preventDefault();
    const c = datosComunes();
    const rs = leerR();
    const tot = parseMonto(q("total").value) || 0;
    const iva = c.fiscal === "A" ? (parseMonto(q("iva").value) || 0) : 0;
    const pc = leerPerc(), ot = leerOtros();
    const perc = pc.percIIBB + pc.percIVA + pc.percGan;
    const suma = rs.reduce((a, r) => a + r.monto, 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) return toast("Falta la fecha.", "error");
    if (!(tot > 0)) return toast("Falta el total.", "error");
    if (Math.abs(suma - tot) > Math.max(1, tot * 0.005)) return toast(`Los renglones suman ${fmtARS(suma)} y el total es ${fmtARS(tot)}.`, "error");
    if (!(c.cotizacion > 0)) return toast("Falta el dólar MEP del día.", "error");
    if (rs.some(r => !r.imputacion)) return toast(esProy ? "Hay un renglón sin imputación." : "Hay un renglón sin categoría.", "error");
    if (iva < 0 || iva >= tot) return toast("Revisá el IVA.", "error");
    if (c.fiscal === "A" && c.alicuota === "varias" && !(iva > 0)) return toast("Con varias alícuotas, cargá el IVA total.", "error");
    if (iva + perc >= tot) return toast("El IVA más las percepciones tiene que ser menor que el total.", "error");
    if (iva + perc + ot.otrosTribARS + ot.noGravadoARS >= tot) return toast("El IVA, las percepciones y los impuestos internos tienen que sumar menos que el total.", "error");
    if (esProy && rs.some(r => !r.tipoCosto)) return toast("Hay un renglón sin categoría (mano de obra, materiales…).", "error");
    if (esProy && rs.some(r => !r.subcategoria && M.subcategoriasDe(r.tipoCosto).length)) return toast("Hay un renglón sin subcategoría.", "error");
    const ahora = new Date().toISOString();
    const parte = (v, r) => (tot ? Math.round(v * r.monto / tot * 100) / 100 : 0);
    rs.forEach(r => {
      const ivaR = parte(iva, r);
      const x = {
        tipo: "egreso", clase: "gasto", fecha: c.fecha, bolsillo: bol, destino: "", cuenta: (S.cuentas[0] || {}).id || "c_magna",
        montoARS: Math.round(r.monto * 100) / 100, cotizacion: c.cotizacion, cotizacionFuente: c.cotizacionFuente, montoUSD: Math.round(r.monto / c.cotizacion * 100) / 100,
        proveedor: c.proveedor, concepto: r.concepto, imputacion: r.imputacion, tipoCosto: r.tipoCosto, subcategoria: r.subcategoria, fiscal: c.fiscal,
        alicuota: ivaR > 0 ? c.alicuota : 0, ivaARS: ivaR, percIIBB: parte(pc.percIIBB, r), percIVA: parte(pc.percIVA, r), percGan: parte(pc.percGan, r),
        otrosTribARS: parte(ot.otrosTribARS, r), noGravadoARS: parte(ot.noGravadoARS, r), fueraDeCaja: c.fueraDeCaja, pagoSinReintegro: c.pagoSinReintegro,
        comprobante: c.comprobante, recuperable: bol === "MAGNA" && !c.fueraDeCaja, pagadoPor: c.pagadoPor || "",
        socio: "", tasa: null, notas: "Leído con IA", leidoConIA: true, creadoPor: app.usuario.socio, creadoEl: ahora
      };
      if (!admin) return PER.proponer({ coleccion: "movimientos", accion: "alta", datos: x });
      const g = guardar("movimientos", x);
      if (g && g.pagadoPor) GS.sincronizarPrestamo(g, app.usuario.socio);
    });
    if (admin && c.proveedor && !proveedorConocido(c.proveedor, d.cuit)) guardar("proveedores", { nombre: c.proveedor, cuit: d.cuit || "", rubro: "", notas: "", creadoPor: app.usuario.socio });
    if (admin && bol === "MAGNA" && rs[0]) recordarHabitual({ proveedor: c.proveedor, bolsillo: bol, imputacion: rs[0].imputacion, fueraDeCaja: c.fueraDeCaja }, d.cuit);
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
    subcategorias: Object.fromEntries(M.TIPOS_COSTO.map(t => [t, M.subcategoriasDe(t)])),
    socio_que_escribe: app.usuario ? app.usuario.socio : "",
    socios: SOCIOS.map(s => s.id + " = " + s.nombre),
    proveedores_conocidos: S.proveedores.map(p => p.nombre).slice(0, 80)
  };
  const sistema = "Convertís frases de los socios de MICA (servicios mineros, Argentina) en un movimiento de dinero para cargar en la app. Respondés SOLO con JSON válido.";
  const instr = `Frase: "${t}"

Devolvé este JSON:
{"tipo":"egreso|ingreso|pase","clase":"","fecha":"AAAA-MM-DD","montoARS":0,"bolsillo":"","destino":"","proveedor":"","concepto":"","imputacion":"","tipoCosto":"","subcategoria":"","fiscal":"A|B|S|X","socio":"","tasa":null,"pagadoPor":""}
Reglas:
- Un pago o compra es tipo "egreso" clase "gasto". Plata que entra es "ingreso". Pasar plata entre bolsillos (préstamo de Magna a un proyecto, reserva de impuestos) es "pase", con "bolsillo" de origen y "destino".
- "fecha": interpretá "hoy", "ayer", "el lunes" desde la fecha de hoy. Si no dice, hoy.
- "montoARS": en pesos como número ("250 mil" = 250000, "1,5 palos" = 1500000). Si la frase da dólares, convertí solo si dice el tipo de cambio; si no, poné 0.
- "bolsillo": id de la lista; si nombra un proyecto, el id de ese proyecto; si no dice, el bolsillo por defecto.
- Para un gasto de proyecto, "imputacion" es una clave de imputaciones_por_proyecto de ese proyecto; si no sabés a qué ítem va, "g". Para Estructura, Magna o Reserva, "imputacion" es "c:" + la categoría.
- "fiscal": "A" si dice factura A, "B" si dice factura B o C, "S" si son sueldos, cargas sociales, tasas o impuestos, "X" si dice sin factura o en negro; si no dice, "A".
- "socio": id del socio solo para aportes, préstamos, devoluciones, distribuciones u honorarios.
- "pagadoPor": en un gasto, id del socio si la frase dice que lo pagó un socio con su plata o su tarjeta ("lo pagó José", "puse yo" dicho por un socio); si no, vacío.
- "tipoCosto" y "subcategoria": para gastos de proyecto, de tipos_de_costo y subcategorias (exactas).
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
  if (out.tipoCosto && M.subcategoriasDe(out.tipoCosto).includes(d.subcategoria)) out.subcategoria = d.subcategoria;
  if (out.tipo === "egreso" && out.clase === "gasto" && SOCIOS.some(s => s.id === d.pagadoPor) && M.admitePrestamoSocio(out.bolsillo)) out.pagadoPor = d.pagadoPor;
  out.fiscal = ["A", "B", "S", "X"].includes(d.fiscal) ? d.fiscal : "A";
  if (SOCIOS.some(s => s.id === d.socio)) out.socio = d.socio;
  if (Number(d.tasa) > 0) out.tasa = Number(d.tasa);
  out.recuperable = out.bolsillo === "MAGNA";
  return out;
}
