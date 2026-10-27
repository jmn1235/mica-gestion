/* =========================================================
   Ficha de préstamos de un socio: todos sus préstamos en todos
   los proyectos, con su estado, las devoluciones y el saldo.
   Se descarga como imagen o PDF para mandársela al socio, y
   Julio registra desde acá la devolución, préstamo por préstamo.
   ========================================================= */
import { S } from "../db.js";
import { app } from "../contexto.js";
import { SOCIOS } from "../config.js";
import * as M from "../modelo.js";
import * as D from "../devoluciones.js";
import * as PER from "../permisos.js";
import { cotizacionMEP } from "../mep.js";
import { $, $$, esc, num, fmtUSD, fmtARS, fmtFecha, fmtFechaHora, fmtMiles, parseMonto, hoyISO, toast, confirmar2, modal, cerrarModal, cabecera, descargar, cargarScript, ICONOS } from "../ui.js";

const URL_H2C = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const URL_PDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const u = v => num(v, fmtUSD);
const ESTADO = { pendiente: ["Pendiente", "tag-alerta"], parcial: ["Devuelto en parte", "tag-borde"], devuelto: ["Devuelto", "tag-ok"] };
let mepHoy = { valor: 0, fuente: "" };

export function render(el, params) {
  const socio = SOCIOS.some(s => s.id === params[0]) ? params[0] : (app.usuario && SOCIOS.some(s => s.id === app.usuario.socio) ? app.usuario.socio : SOCIOS[0].id);
  const f = D.fichaSocio(socio);
  const admin = PER.esAdmin();
  const nombre = M.socioNombre(socio);
  if (!mepHoy.valor) mepHoy.valor = M.ultimaCotizacion();
  const pendientes = f.prestamos.filter(p => p.estado !== "devuelto");
  el.innerHTML = cabecera("Socio", `Préstamos de ${nombre}`, `Todos los proyectos · al ${esc(fmtFecha(f.fecha, true))} · en dólares MEP, con interés`,
    `${admin && pendientes.length ? `<button class="btn btn-pri" id="fs-devolver">${ICONOS.cargar}Registrar devolución</button>` : ""}
     <button class="btn btn-sec" id="fs-png">${ICONOS.descargar}Imagen</button><button class="btn btn-sec" id="fs-pdf">${ICONOS.descargar}PDF</button>`) +
    `<nav class="pestanas">${SOCIOS.map(s => `<a href="#socio/${s.id}" class="${s.id === socio ? "activo" : ""}">${esc(s.nombre)}</a>`).join("")}</nav>
    <div class="hoja-pantalla">${hojaFicha(f, mepHoy.valor)}</div>
    ${f.devoluciones.length ? panelDevoluciones(f, admin) : ""}`;
  // Dólar de hoy para pasar el saldo a pesos (se actualiza solo cuando llega).
  if (mepHoy.fuente !== hoyISO()) {
    cotizacionMEP(hoyISO()).then(r => {
      if (r && r.valor) { mepHoy = { valor: r.valor, fuente: hoyISO() }; const h = $(".hoja-pantalla", el); if (h) h.innerHTML = hojaFicha(D.fichaSocio(socio), mepHoy.valor); }
      else mepHoy.fuente = hoyISO();
    }).catch(() => { mepHoy.fuente = hoyISO(); });
  }
  $("#fs-png", el).addEventListener("click", () => exportar(hojaFicha(D.fichaSocio(socio), mepHoy.valor), `MICA_prestamos_${nombre}_${hoyISO()}`, "png"));
  $("#fs-pdf", el).addEventListener("click", () => exportar(hojaFicha(D.fichaSocio(socio), mepHoy.valor), `MICA_prestamos_${nombre}_${hoyISO()}`, "pdf"));
  const bd = $("#fs-devolver", el);
  if (bd) bd.addEventListener("click", () => modalDevolucion(socio));
  $$("[data-comp]", el).forEach(b => b.addEventListener("click", () => {
    const o = D.fichaSocio(socio).devoluciones.find(x => x.id === b.dataset.comp);
    if (o) exportar(hojaComprobante(socio, o), `MICA_devolucion_${nombre}_${o.fecha}`, b.dataset.fmt);
  }));
  $$("[data-anular]", el).forEach(b => b.addEventListener("click", () => confirmar2(b, () => {
    D.anularDevolucion(b.dataset.anular, app.usuario.socio);
    toast("Devolución anulada: sus movimientos quedaron en la papelera");
  }, "Tocá otra vez para anular")));
}

/* ---------- hoja para ver y descargar ---------- */
function hojaFicha(f, mep) {
  const nombre = M.socioNombre(f.socio);
  return `<div class="hoja">
    <div class="hoja-cab"><img src="img/logo-mica-negro.png" alt="MICA" class="hoja-logo"><div class="hoja-tit"><b>Préstamos de ${esc(nombre)}</b><span>Estado al ${esc(fmtFecha(f.fecha, true))} · dólares MEP con interés</span></div></div>
    <div class="hoja-kpis">
      <div><span>Prestado</span><b>${esc(fmtUSD(f.prestadoUsd))}</b><small>${esc(fmtARS(f.prestadoArs))}</small></div>
      <div><span>Interés generado</span><b>${esc(fmtUSD(f.interesUsd))}</b></div>
      <div><span>Devuelto</span><b>${esc(fmtUSD(f.devueltoUsd))}</b></div>
      <div class="hoja-kpi-fuerte"><span>Saldo a devolver</span><b>${esc(fmtUSD(f.saldoUsd))}</b>${mep > 0 && f.saldoUsd > 0.005 ? `<small>${esc(fmtARS(f.saldoUsd * mep))} al dólar de ${esc(fmtARS(mep, 2))}</small>` : ""}</div>
    </div>
    ${f.prestamos.length ? `<table class="hoja-tabla"><thead><tr><th>Fecha</th><th>Proyecto y detalle</th><th class="n">Capital</th><th class="n">Tasa</th><th class="n">Interés</th><th class="n">Devuelto</th><th class="n">Saldo</th><th>Estado</th></tr></thead><tbody>
      ${f.prestamos.map(p => {
        const dev = p.pagos.reduce((a, x) => a + x.int + x.cap, 0);
        const [et, ec] = ESTADO[p.estado];
        return `<tr><td>${esc(fmtFecha(p.fecha))}</td><td><b>${esc(p.proyecto)}</b><small>${esc(p.detalle)}</small></td><td class="n">${esc(fmtUSD(p.capitalUsd))}<small>${esc(fmtARS(p.capitalArs))}</small></td><td class="n">${p.tasa ? esc(String(p.tasa).replace(".", ",")) + "%" : "—"}</td><td class="n">${esc(fmtUSD(p.devengado))}</td><td class="n">${dev > 0.005 ? esc(fmtUSD(dev)) : "—"}</td><td class="n"><b>${esc(fmtUSD(p.saldo))}</b></td><td><span class="tag ${ec}">${et}</span>${p.pagos.length ? `<small>${p.pagos.map(x => "dev. " + fmtFecha(x.fecha)).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</small>` : ""}</td></tr>`;
      }).join("")}
      <tr class="hoja-total"><td></td><td>Total</td><td class="n">${esc(fmtUSD(f.prestadoUsd))}</td><td></td><td class="n">${esc(fmtUSD(f.interesUsd))}</td><td class="n">${esc(fmtUSD(f.devueltoUsd))}</td><td class="n">${esc(fmtUSD(f.saldoUsd))}</td><td></td></tr>
    </tbody></table>` : `<p class="hoja-vacio">No tiene préstamos registrados.</p>`}
    <p class="hoja-pie">Interés compuesto día a día a la tasa anual en dólares de cada préstamo. Las devoluciones se aplican a los préstamos indicados en cada una, primero al interés y después al capital. MICA — Minería Integral Catamarca · Emitido el ${esc(fmtFechaHora(new Date().toISOString()))}</p>
  </div>`;
}

function hojaComprobante(socio, o) {
  const nombre = M.socioNombre(socio);
  const tInt = o.lineas.reduce((a, l) => a + l.int, 0), tCap = o.lineas.reduce((a, l) => a + l.cap, 0);
  const mep = o.usd > 0 ? o.ars / o.usd : 0;
  return `<div class="hoja">
    <div class="hoja-cab"><img src="img/logo-mica-negro.png" alt="MICA" class="hoja-logo"><div class="hoja-tit"><b>Devolución de préstamos a ${esc(nombre)}</b><span>${esc(fmtFecha(o.fecha, true))}${o.comprobante ? " · Transferencia " + esc(o.comprobante) : ""}</span></div></div>
    <div class="hoja-kpis">
      <div class="hoja-kpi-fuerte"><span>Monto transferido</span><b>${esc(fmtARS(o.ars))}</b><small>${esc(fmtUSD(o.usd))}${mep ? " al dólar de " + esc(fmtARS(mep, 2)) : ""}</small></div>
      <div><span>A interés</span><b>${esc(fmtUSD(tInt))}</b></div>
      <div><span>A capital</span><b>${esc(fmtUSD(tCap))}</b></div>
    </div>
    ${o.lineas.length ? `<table class="hoja-tabla"><thead><tr><th>Préstamo del</th><th>Proyecto y detalle</th><th class="n">Interés</th><th class="n">Capital</th><th class="n">Total</th><th>Queda</th></tr></thead><tbody>
      ${o.lineas.map(l => `<tr><td>${esc(fmtFecha(l.prestamo.fecha))}</td><td><b>${esc(l.prestamo.proyecto)}</b><small>${esc(l.prestamo.detalle)}</small></td><td class="n">${esc(fmtUSD(l.int))}</td><td class="n">${esc(fmtUSD(l.cap))}</td><td class="n"><b>${esc(fmtUSD(l.int + l.cap))}</b></td><td>${l.prestamo.estado === "devuelto" ? '<span class="tag tag-ok">Cancelado</span>' : esc(fmtUSD(l.prestamo.saldo)) + " (hoy)"}</td></tr>`).join("")}
    </tbody></table>` : `<p class="hoja-vacio">Devolución cargada sin detalle de préstamos: se aplicó a los más viejos.</p>`}
    <p class="hoja-pie">MICA — Minería Integral Catamarca · Comprobante interno de la devolución, emitido el ${esc(fmtFechaHora(new Date().toISOString()))}</p>
  </div>`;
}

function panelDevoluciones(f, admin) {
  return `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Devoluciones</h2><p class="panel-sub">Cada una es una transferencia. Se puede bajar su comprobante con el detalle de los préstamos que canceló.</p></div></div>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Fecha</th><th>Préstamos que cancela</th><th class="n">Monto</th><th></th></tr></thead><tbody>
    ${f.devoluciones.map(o => `<tr><td>${esc(fmtFecha(o.fecha))}${o.comprobante ? `<small class="mute" style="display:block">${esc(o.comprobante)}</small>` : ""}</td>
      <td>${o.lineas.length ? o.lineas.map(l => `${esc(l.prestamo.proyecto)} · ${esc(fmtFecha(l.prestamo.fecha))} <span class="mute">(${esc(fmtUSD(l.int + l.cap))})</span>`).join("<br>") : '<span class="mute">Sin detalle</span>'}</td>
      <td class="n">${esc(fmtARS(o.ars))}<small class="mute" style="display:block">${esc(fmtUSD(o.usd))}</small></td>
      <td class="n" style="white-space:nowrap"><button class="btn btn-sec btn-chico" data-comp="${esc(o.id)}" data-fmt="png">Imagen</button> <button class="btn btn-sec btn-chico" data-comp="${esc(o.id)}" data-fmt="pdf">PDF</button>${admin && o.detallada ? ` <button class="btn btn-fant btn-chico" data-anular="${esc(o.id)}">Anular</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div></section>`;
}

/* ---------- imagen y PDF ---------- */
async function exportar(html, nombre, fmt) {
  try { await cargarScript(URL_H2C); if (fmt === "pdf") await cargarScript(URL_PDF); }
  catch (e) { return toast("No se pudo cargar el generador. Revisá la conexión.", "error"); }
  const cont = document.createElement("div");
  cont.className = "hoja-captura";
  cont.innerHTML = html;
  document.body.appendChild(cont);
  try {
    await Promise.all(Array.from(cont.querySelectorAll("img")).map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))));
    const canvas = await window.html2canvas(cont.firstElementChild, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    if (fmt === "png") {
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
      descargar(nombre.replace(/\s+/g, "_") + ".png", blob);
    } else {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, H = 297, m = 10, ancho = W - 2 * m, altoPag = H - 2 * m;
      const pxPorMm = canvas.width / ancho;
      const altoPx = Math.floor(altoPag * pxPorMm);
      for (let y = 0, pag = 0; y < canvas.height; y += altoPx, pag++) {
        const trozo = document.createElement("canvas");
        trozo.width = canvas.width; trozo.height = Math.min(altoPx, canvas.height - y);
        trozo.getContext("2d").drawImage(canvas, 0, y, canvas.width, trozo.height, 0, 0, canvas.width, trozo.height);
        if (pag) pdf.addPage();
        pdf.addImage(trozo.toDataURL("image/png"), "PNG", m, m, ancho, trozo.height / pxPorMm);
      }
      descargar(nombre.replace(/\s+/g, "_") + ".pdf", pdf.output("blob"));
    }
    toast(fmt === "png" ? "Imagen descargada" : "PDF descargado");
  } catch (e) { console.error(e); toast("No se pudo generar el archivo.", "error"); }
  finally { cont.remove(); }
}

/* ---------- registrar una devolución ---------- */
function modalDevolucion(socio) {
  const nombre = M.socioNombre(socio);
  let fecha = hoyISO(), mep = mepHoy.valor || M.ultimaCotizacion(), fuente = "manual", f = D.fichaSocio(socio, fecha);
  const montos = {};
  const md = modal(`Devolución a ${nombre}`, `<form class="form" id="fd" novalidate>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="d-fecha">Fecha de la transferencia</label><input type="date" id="d-fecha" value="${fecha}"></div>
      <div class="campo"><label for="d-mep">Dólar MEP del día</label><input id="d-mep" inputmode="decimal" value="${mep ? fmtMiles(mep) : ""}"><div class="hint" id="d-mep-hint"></div></div>
      <div class="campo"><label for="d-comp">N° de transferencia <span class="opc">(opcional)</span></label><input id="d-comp" autocomplete="off"></div>
      <div class="campo"${S.cuentas.length > 1 ? "" : " hidden"}><label for="d-cuenta">Cuenta</label><select id="d-cuenta">${S.cuentas.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("")}</select></div>
    </div>
    <div class="bloque"><div class="bloque-tit">Qué préstamos devolvés <span class="mute" style="font-weight:400">· saldo con interés a la fecha, en dólares</span></div>
      <div id="d-lista"></div></div>
    <div class="desglose" id="d-resumen"></div>
    <div id="d-avisos"></div>
    <div class="campo"><label for="d-notas">Notas <span class="opc">(opcional)</span></label><input id="d-notas" autocomplete="off"></div>
    <div class="form-pie"><button class="btn btn-pri" type="submit" id="d-ok">Confirmar devolución</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div>
  </form>`, { ancho: 860 });
  const q = id => $("#d-" + id, md);
  const pintarLista = () => {
    const pend = f.prestamos.filter(p => p.estado !== "devuelto");
    q("lista").innerHTML = pend.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th></th><th>Préstamo</th><th class="n">Saldo</th><th class="n">Devolver (US$)</th></tr></thead><tbody>
      ${pend.map(p => `<tr><td><input type="checkbox" data-sel="${esc(p.id)}"${montos[p.id] !== null ? " checked" : ""} aria-label="Devolver este préstamo"></td>
        <td><b>${esc(p.proyecto)}</b> · ${esc(fmtFecha(p.fecha))}<small class="mute" style="display:block">${esc(p.detalle)}${p.saldoInt > 0.005 ? ` · interés ${esc(fmtUSD(p.saldoInt))}` : ""}</small></td>
        <td class="n">${esc(fmtUSD(p.saldo))}</td>
        <td class="n"><input class="input n" style="max-width:120px;margin-left:auto;text-align:right" inputmode="decimal" data-usd="${esc(p.id)}" value="${montos[p.id] != null ? fmtMiles(montos[p.id]) : fmtMiles(Math.round(p.saldo * 100) / 100)}"></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="mute">No tiene préstamos pendientes a esta fecha.</p>`;
    $$("[data-sel]", md).forEach(c => c.addEventListener("change", () => { montos[c.dataset.sel] = c.checked ? (parseMonto($(`[data-usd="${c.dataset.sel}"]`, md).value) || 0) : null; resumen(); }));
    $$("[data-usd]", md).forEach(i => i.addEventListener("input", () => { const c = $(`[data-sel="${i.dataset.usd}"]`, md); if (c.checked) montos[i.dataset.usd] = parseMonto(i.value) || 0; resumen(); }));
    resumen();
  };
  const elegidos = () => $$("[data-sel]", md).filter(c => c.checked).map(c => ({ id: c.dataset.sel, usd: parseMonto($(`[data-usd="${c.dataset.sel}"]`, md).value) || 0 }));
  const resumen = () => {
    const ls = D.lineasDevolucion(f, elegidos());
    const usd = ls.reduce((a, l) => a + l.usd, 0), int = ls.reduce((a, l) => a + l.int, 0);
    mep = parseMonto(q("mep").value) || 0;
    q("resumen").innerHTML = usd > 0 ? `<span>${ls.length} préstamo${ls.length > 1 ? "s" : ""}</span><span>Interés <b>${fmtUSD(int)}</b></span><span>Capital <b>${fmtUSD(usd - int)}</b></span><span class="desglose-total">Transferir <b>${mep ? fmtARS(usd * mep) : "—"}</b> (${fmtUSD(usd)})</span>` : `<span class="mute">Elegí al menos un préstamo.</span>`;
    // Aviso si un proyecto no tiene la plata en su bolsillo.
    const porBol = {};
    ls.forEach(l => { porBol[l.p.bolsillo] = (porBol[l.p.bolsillo] || 0) + l.usd * mep; });
    const cortos = Object.entries(porBol).filter(([b, ars]) => M.saldoBolsillo(b).ars < ars - 1);
    q("avisos").innerHTML = cortos.length ? `<div class="aviso" style="margin:0">${ICONOS.alerta}<div>${cortos.map(([b, ars]) => `${esc(M.nombreBolsillo(b))} tiene ${esc(fmtARS(M.saldoBolsillo(b).ars))} y la devolución es de ${esc(fmtARS(ars))}`).join("; ")}. Se puede registrar igual: el bolsillo queda en negativo.</div></div>` : "";
    const sobre = elegidos().find(e => { const p = f.prestamos.find(x => x.id === e.id); return p && e.usd > p.saldo + 0.01; });
    if (sobre) q("avisos").innerHTML += `<div class="aviso aviso-info" style="margin-top:8px">${ICONOS.alerta}<div>Hay un monto mayor que el saldo del préstamo: se devuelve solo el saldo.</div></div>`;
  };
  const buscarMep = async () => {
    q("mep-hint").textContent = "Buscando…";
    const r = await cotizacionMEP(fecha).catch(() => null);
    if (r && r.valor) { q("mep").value = fmtMiles(r.valor); fuente = r.aproximada ? "aprox" : "api"; q("mep-hint").textContent = r.aproximada ? "Sin dato para esa fecha: revisala." : "MEP venta de esa fecha."; }
    else q("mep-hint").textContent = "No se pudo consultar: cargala a mano.";
    resumen();
  };
  q("fecha").addEventListener("change", () => {
    fecha = q("fecha").value || hoyISO();
    f = D.fichaSocio(socio, fecha);
    Object.keys(montos).forEach(k => { if (montos[k] !== null) delete montos[k]; });
    pintarLista(); buscarMep();
  });
  q("mep").addEventListener("input", () => { fuente = "manual"; q("mep-hint").textContent = "Cargada a mano."; resumen(); });
  pintarLista(); buscarMep();
  $("#fd", md).addEventListener("submit", e => {
    e.preventDefault();
    const ls = D.lineasDevolucion(f, elegidos());
    mep = parseMonto(q("mep").value) || 0;
    if (!ls.length) return toast("Elegí al menos un préstamo con monto.", "error");
    if (!(mep > 0)) return toast("Falta el dólar MEP del día.", "error");
    if (!q("fecha").value) return toast("Falta la fecha.", "error");
    confirmar2(q("ok"), () => {
      const res = D.registrarDevolucion({ socio, fecha, mep, cotizacionFuente: fuente, cuenta: q("cuenta").value, comprobante: q("comp").value.trim(), notas: q("notas").value.trim(), lineas: ls, quien: app.usuario.socio });
      cerrarModal();
      // El comprobante se arma con lo recién cargado (en la nube los datos vuelven un instante después).
      const o = {
        id: res.operacion, fecha, comprobante: q("comp").value.trim(), detallada: true,
        ars: res.movs.reduce((a, m) => a + (Number(m && m.montoARS) || 0), 0), usd: ls.reduce((a, l) => a + l.usd, 0),
        lineas: ls.map(l => ({ prestamo: Object.assign({}, l.p, { estado: l.total ? "devuelto" : "parcial", saldo: Math.max(0, l.p.saldo - l.usd) }), int: l.int, cap: l.cap }))
      };
      toast(`Devolución registrada · ${fmtARS(ls.reduce((a, l) => a + l.usd, 0) * mep)}`);
      {
        const m2 = modal("Devolución registrada", `<div class="hoja-pantalla">${hojaComprobante(socio, o)}</div>
          <div class="form-pie"><button class="btn btn-pri" id="c-png">${ICONOS.descargar}Imagen</button><button class="btn btn-sec" id="c-pdf">${ICONOS.descargar}PDF</button><button class="btn btn-fant" data-cerrar>Cerrar</button></div>`, { ancho: 860 });
        $("#c-png", m2).addEventListener("click", () => exportar(hojaComprobante(socio, o), `MICA_devolucion_${nombre}_${o.fecha}`, "png"));
        $("#c-pdf", m2).addEventListener("click", () => exportar(hojaComprobante(socio, o), `MICA_devolucion_${nombre}_${o.fecha}`, "pdf"));
      }
    }, "Tocá otra vez para confirmar");
  });
}
