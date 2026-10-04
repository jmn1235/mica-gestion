/* =========================================================
   Cierre de mes: lista de control del proyecto, gastos
   habituales que faltan, resumen del mes e informe con IA.
   ========================================================= */
import { S } from "../db.js";
import { app } from "../contexto.js";
import * as M from "../modelo.js";
import * as P from "../presupuesto.js";
import * as C from "../certificados.js";
import * as I from "../impuestos.js";
import * as IA from "../ia.js";
import { contextoProyecto } from "../contextoIA.js";
import { $, esc, num, fmtUSD, fmtARS, fmtFecha, mesLabel, hoyISO, toast, cabecera, ICONOS } from "../ui.js";
import { pedirProyecto } from "./comun.js";
import { barrasHorizontales } from "../graficos.js";

const informes = {}; // informes generados en esta sesión, por proyecto y mes

const mesAnterior = ym => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };

export function render(el, params) {
  if (app.ctx.tipo !== "proyecto" || !M.proyecto(app.ctx.id)) return pedirProyecto(el, "Cierre de mes", "Lista de control mensual de cada proyecto e informe para los socios.");
  const p = M.proyecto(app.ctx.id);
  const hoy = hoyISO();
  const porDefecto = Number(hoy.slice(8, 10)) <= 15 ? mesAnterior(hoy.slice(0, 7)) : hoy.slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(params[0] || "") ? params[0] : porDefecto;
  const meses = M.mesesEntre(mesAnterior(mesAnterior(mesAnterior(mesAnterior(mesAnterior(hoy.slice(0, 7)))))), hoy.slice(0, 7)).reverse();
  if (!meses.includes(mes)) meses.push(mes);

  const movsMes = S.movimientos.filter(m => m.bolsillo === p.id && M.mesDe(m) === mes);
  const costosMes = movsMes.filter(M.esCosto);
  const ventasMes = movsMes.filter(M.esVenta);
  const control = listaControl(p, mes, costosMes);
  const hechos = control.filter(c => c.ok).length;

  const porTipo = {};
  costosMes.forEach(m => { const k = m.tipoCosto || "Sin tipo"; porTipo[k] = (porTipo[k] || 0) + M.netoUsd(m); });
  const porProv = {};
  costosMes.forEach(m => { const k = m.proveedor || m.concepto || "Sin proveedor"; porProv[k] = (porProv[k] || 0) + M.netoUsd(m); });
  const cobrado = ventasMes.reduce((a, m) => a + M.netoUsd(m), 0), gastado = costosMes.reduce((a, m) => a + M.netoUsd(m), 0);

  let h = cabecera(p.codigo || "Proyecto", "Cierre de mes", `${esc(p.nombre)}`,
    `<label class="sr" for="ci-mes">Mes</label><select id="ci-mes" class="input" style="width:auto">${meses.map(m => `<option value="${m}"${m === mes ? " selected" : ""}>${esc(mesLabel(m))}</option>`).join("")}</select>`);
  if (p.estado === "cerrado") h += `<div class="aviso aviso-info">${ICONOS.alerta}<div>El proyecto está cerrado: el resumen final está en <a href="#liquidacion">Cierre de proyecto</a>.</div></div>`;
  h += `<div class="grid-2" style="margin-top:0">
    <section class="panel"><div class="panel-cab"><div><h2>Lista de control de ${esc(mesLabel(mes).toLowerCase())}</h2><p class="panel-sub">${hechos} de ${control.length} puntos al día.</p></div></div>
      <ul class="control">${control.map(c => `<li class="${c.ok ? "ok" : "falta"}"><span class="marca" aria-hidden="true">${c.ok ? ICONOS.ok : ICONOS.alerta}</span><div><b>${esc(c.titulo)}</b>${c.detalle ? `<small>${c.detalle}</small>` : ""}</div>${c.accion ? `<a class="btn btn-sec btn-chico" href="${c.accion[1]}">${esc(c.accion[0])}</a>` : ""}</li>`).join("")}</ul></section>
    <section class="panel"><div class="panel-cab"><div><h2>El mes en números</h2><p class="panel-sub">En dólares MEP, netos de IVA.</p></div></div>
      <table class="tabla tabla-compacta"><tbody>
        <tr><td>Cobrado</td><td class="n">${num(cobrado, fmtUSD)}</td></tr>
        <tr><td>Costos (${costosMes.length} gasto${costosMes.length === 1 ? "" : "s"})</td><td class="n">${num(-gastado, fmtUSD)}</td></tr>
        <tr class="total"><td>Diferencia del mes</td><td class="n">${num(cobrado - gastado, fmtUSD)}</td></tr>
      </tbody></table>
      <div style="margin-top:14px">${barrasHorizontales(Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v })), v => fmtUSD(v))}</div>
      ${Object.keys(porProv).length ? `<p class="panel-sub" style="margin-top:14px">Principales: ${Object.entries(porProv).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${esc(k)} ${esc(fmtUSD(v))}`).join(" · ")}</p>` : ""}</section>
  </div>
  <section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Informe para los socios</h2><p class="panel-sub">La IA lo redacta con los datos del proyecto y de este mes. Revisalo antes de mandarlo.</p></div>
    <div class="cab-acciones">${informes[p.id + mes] ? `<button class="btn btn-sec btn-chico" id="ci-copiar">Copiar</button>` : ""}<button class="btn btn-pri btn-chico" id="ci-informe">${informes[p.id + mes] ? "Volver a generar" : "Generar informe"}</button></div></div>
    <div id="ci-texto">${informes[p.id + mes] ? `<div class="informe">${formatear(informes[p.id + mes])}</div>` : IA.hayClave() ? `<div class="vacio">Tocá «Generar informe».</div>` : `<div class="aviso aviso-info" style="margin:0">${ICONOS.alerta}<div>Para generar el informe hace falta cargar la clave de IA en <a href="#ajustes/impuestos">Ajustes → Impuestos e IA</a>.</div></div>`}</div>
  </section>`;
  el.innerHTML = h;
  $("#ci-mes", el).addEventListener("change", e => app.ir("cierre/" + e.target.value));
  $("#ci-informe", el).addEventListener("click", async ev => {
    const b = ev.currentTarget;
    if (!IA.hayClave()) return toast("Falta la clave de IA en Ajustes → Impuestos e IA.", "error");
    b.disabled = true; b.textContent = "Redactando…";
    $("#ci-texto", el).innerHTML = `<div class="vacio"><span class="punto"></span>La IA está leyendo los datos del proyecto…</div>`;
    try {
      const datos = { mes, mes_nombre: mesLabel(mes), lista_de_control: control.map(c => ({ punto: c.titulo, al_dia: c.ok, detalle: c.detalleTexto || "" })),
        mes_en_numeros: { cobrado_usd: Math.round(cobrado), costos_usd: Math.round(gastado), costos_por_tipo_usd: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, Math.round(v)])), principales_proveedores: Object.entries(porProv).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ proveedor: k, usd: Math.round(v) })) },
        proyecto: contextoProyecto(p) };
      const sistema = "Sos el asistente de gestión de MICA (Minería Integral Catamarca), una empresa de servicios mineros con cuatro socios. Redactás informes mensuales claros y sobrios para los socios, en español rioplatense, con oraciones cortas. Usás solo los datos que te pasan; si algo falta, lo decís. Los montos van en dólares MEP salvo que se indique pesos. No inventes cifras.";
      const pedido = `Redactá el informe del mes de ${mesLabel(mes)} del proyecto ${p.nombre}. Estructura: 1) Resumen en tres líneas. 2) Qué pasó en el mes (cobros, costos y en qué se gastó). 3) Cómo viene el proyecto contra lo cotizado (avance físico, avance de gasto, proyección de cierre y margen). 4) Cobranza (facturas emitidas, vencidas y por cobrar). 5) Impuestos y reserva fiscal. 6) Situación de cada socio. 7) Pendientes para el próximo mes, tomados de la lista de control. Usá títulos cortos y viñetas. Máximo 450 palabras.\n\nDatos:\n${JSON.stringify(datos)}`;
      const txt = await IA.texto([{ role: "user", content: pedido }], { sistema, maxTokens: 1800 });
      informes[p.id + mes] = txt;
      app.refrescar();
    } catch (err) {
      $("#ci-texto", el).innerHTML = `<div class="aviso" style="margin:0">${ICONOS.alerta}<div>${esc(err.message)}</div></div>`;
      b.disabled = false; b.textContent = "Generar informe";
    }
  });
  const bc = $("#ci-copiar", el);
  if (bc) bc.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(informes[p.id + mes]); toast("Informe copiado"); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($(".informe", el)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Texto seleccionado: copialo con Ctrl+C"); }
  });
}

/* Texto con títulos y viñetas simples, a HTML seguro. */
export function formatear(t) {
  return esc(t).split(/\n{2,}/).map(bloque => {
    const lineas = bloque.split("\n");
    if (lineas.every(l => /^\s*[-•*]\s+/.test(l))) return `<ul>${lineas.map(l => `<li>${l.replace(/^\s*[-•*]\s+/, "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</li>`).join("")}</ul>`;
    const html = lineas.map(l => {
      if (/^#{1,4}\s/.test(l)) return `<h4>${l.replace(/^#{1,4}\s/, "")}</h4>`;
      if (/^\s*[-•*]\s+/.test(l)) return `<span class="vin">• ${l.replace(/^\s*[-•*]\s+/, "")}</span>`;
      return l;
    }).join("<br>").replace(/<\/h4><br>/g, "</h4>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    return `<p>${html}</p>`;
  }).join("");
}

/* Puntos de control del mes. */
function listaControl(p, mes, costosMes) {
  const out = [];
  const av = P.avanceDelMes(p.id, mes);
  const tieneAv = av && Object.values(av.cantidades || {}).some(q => Number(q));
  if ((p.items || []).length) out.push({ ok: tieneAv, titulo: "Avance físico cargado", detalle: tieneAv ? "" : "Falta la cantidad ejecutada de cada ítem.", accion: tieneAv ? null : ["Cargar", "#presupuesto/avance/" + mes] });
  const cert = C.docsDe(p.id).find(c => c.tipo === "certificado" && c.periodo === mes);
  out.push({ ok: !!cert, titulo: "Certificado del mes emitido", detalle: cert ? esc(C.tituloDoc(cert)) : "Todavía no hay certificado de este período.", accion: cert ? ["Ver", "#certificados/" + cert.id] : ["Crear", "#certificados/nuevo/certificado"] });
  if (cert) {
    const e = C.estadoDe(cert, p);
    out.push({ ok: e.facturado, titulo: "Factura del certificado cargada", detalle: e.facturado ? `Vence el ${esc(e.vencimiento ? fmtFecha(e.vencimiento, true) : "—")}` : "Cargá número, fecha y tipo de cambio.", accion: e.facturado ? null : ["Cargar", `#certificados/${cert.id}/editar`] });
  }
  const venc = C.resumenCobranza(p).vencidas;
  out.push({ ok: !venc.length, titulo: "Sin facturas vencidas", detalle: venc.length ? venc.map(d => `${esc(C.tituloDoc(d.doc))} (${d.diasVencido} días)`).join(", ") : "", detalleTexto: venc.map(d => C.tituloDoc(d.doc)).join(", "), accion: venc.length ? ["Ver", "#certificados"] : null });

  // Gastos habituales: proveedores presentes en al menos 2 de los 3 meses anteriores y no en este.
  const m1 = mesAnterior(mes), m2 = mesAnterior(m1), m3 = mesAnterior(m2);
  const cuenta = {};
  S.movimientos.forEach(m => {
    if (!M.esCosto(m) || m.bolsillo !== p.id || ![m1, m2, m3].includes(M.mesDe(m))) return;
    const k = (m.proveedor || "").trim();
    if (!k) return;
    cuenta[k] = cuenta[k] || new Set(); cuenta[k].add(M.mesDe(m));
  });
  const presentes = new Set(costosMes.map(m => (m.proveedor || "").trim()));
  const faltan = Object.entries(cuenta).filter(([k, s]) => s.size >= 2 && !presentes.has(k)).map(([k]) => k);
  out.push({ ok: !faltan.length, titulo: "Gastos habituales cargados", detalle: faltan.length ? "Faltan: " + faltan.map(esc).join(", ") : "", detalleTexto: faltan.join(", "), accion: faltan.length ? ["Cargar", "#cargar"] : null });

  const revisar = costosMes.filter(m => m.cotizacionFuente === "aprox" || !m.imputacion || !m.tipoCosto);
  out.push({ ok: !revisar.length, titulo: "Gastos completos", detalle: revisar.length ? `${revisar.length} gasto${revisar.length === 1 ? "" : "s"} sin imputar, sin tipo de costo o con la cotización a revisar.` : "", accion: revisar.length ? ["Revisar", "#movimientos"] : null });

  const res = I.reservaProyecto(p);
  out.push({ ok: res.pendiente <= 1, titulo: "Reserva fiscal al día", detalle: res.pendiente > 1 ? `Falta reservar ${esc(fmtARS(res.pendiente))}.` : "", detalleTexto: res.pendiente > 1 ? `Falta reservar ${Math.round(res.pendiente)} pesos` : "", accion: res.pendiente > 1 ? ["Reservar", `#cargar/nuevo/pase/reserva/${Math.round(res.pendiente)}`] : null });

  const sinTasa = M.prestamosDe(p.id).some(x => x.sinTasa);
  if (M.prestamosDe(p.id).length) out.push({ ok: !sinTasa, titulo: "Préstamos con tasa", detalle: sinTasa ? "Hay préstamos sin tasa: no generan interés." : "", accion: sinTasa ? ["Revisar", "#socios"] : null });
  return out;
}
