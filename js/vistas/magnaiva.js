/* =========================================================
   Magna · IVA y contadora (solo el administrador).
   Junta el IVA de toda Magna Desarrollos SRL: las obras de MICA,
   Estructura, las compras propias de Magna y Río Colorado (que
   se lee de su propia base). Muestra el IVA mes a mes y por
   origen, propone la compensación entre proyectos y baja la
   planilla completa para la contadora.
   ========================================================= */
import { S, guardar } from "../db.js";
import { app } from "../contexto.js";
import * as M from "../modelo.js";
import * as PER from "../permisos.js";
import * as RC from "../rioColorado.js";
import * as MI from "../magnaIva.js";
import * as CT from "../contadora.js";
import { cotizacionMEP } from "../mep.js";
import { $, $$, esc, num, fmtARS, fmtUSD, fmtFechaHora, fmtMiles, parseMonto, hoyISO, mesLabel, toast, modal, cerrarModal, cabecera, ICONOS } from "../ui.js";

const est = { desde: "", hasta: "", intento: false, cargando: false };
const a = v => num(v, fmtARS);
const kpi = (rot, val, sub = "") => `<div class="kpi"><div class="kpi-rot">${rot}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
const mesActual = () => hoyISO().slice(0, 7);

export function render(el) {
  if (!PER.esAdmin()) {
    el.innerHTML = cabecera("Magna", "IVA y contadora") + `<div class="panel vacio"><b>Esta sección es solo para el administrador</b>Junta el IVA de toda Magna Desarrollos, incluido Río Colorado.</div>`;
    return;
  }
  const men = MI.mensual();
  if (!est.hasta) est.hasta = mesActual();
  if (!est.desde) est.desde = men.meses.find(m => m >= est.hasta.slice(0, 4) + "-01") || est.hasta;
  // La primera vez en la sesión se actualiza Río Colorado en silencio (si ya se había conectado).
  if (!est.intento && RC.RC.fuente === "nube") { est.intento = true; actualizarSilencioso(); }

  const filas = men.filas.filter(f => f.mes >= est.desde && f.mes <= est.hasta);
  const ult = men.filas.filter(f => f.mes <= est.hasta).pop();
  const sum = k => filas.reduce((x, f) => x + f[k], 0);
  const fis = CT.datosFiscales();

  let h = cabecera("Magna", "IVA y contadora", `${esc(fis.razonSocial)}${fis.cuit ? " · CUIT " + esc(fis.cuit) : ""} · todo el IVA de Magna: obras de MICA, Río Colorado y compras propias. Esta sección la ves solo vos.`);
  h += panelRC();
  h += `<section class="panel"><div class="fila fila-movil-2" style="grid-template-columns:repeat(2,minmax(0,220px));gap:12px">
      <div class="campo"><label for="mi-desde">Desde</label><input type="month" id="mi-desde" value="${esc(est.desde)}"></div>
      <div class="campo"><label for="mi-hasta">Hasta</label><input type="month" id="mi-hasta" value="${esc(est.hasta)}"></div>
    </div></section>`;
  h += `<div class="grid-kpi" style="margin-bottom:16px">
    ${kpi(`IVA a pagar · ${esc(mesLabel(est.hasta))}`, ult && ult.mes === est.hasta ? a(ult.pagar) : a(0), "Estimado de la declaración de Magna")}
    ${kpi("IVA a favor de Magna", a(ult ? ult.favorTec + ult.favorLibre : 0), ult ? `Técnico ${fmtARS(ult.favorTec)} · libre disponibilidad ${fmtARS(ult.favorLibre)}` : "Sin datos")}
    ${kpi("IVA débito del período", a(sum("debito")), "Facturas emitidas")}
    ${kpi("IVA crédito del período", a(sum("credito")), "Compras con factura A")}
  </div>`;
  h += panelMensual(filas);
  h += panelOrigen();
  h += panelQuien();
  h += panelCompensacion();
  h += panelPlanilla();
  el.innerHTML = h;
  cablear(el);
}

/* ---------- Río Colorado ---------- */
function panelRC() {
  const r = RC.RC;
  const demo = !!window.MICA_DEMO;
  let cuerpo;
  if (RC.hayDatos()) {
    const cs = RC.comprasRC();
    const fA = cs.filter(c => c.letra === "A");
    const falt = RC.faltantesRC();
    const fuente = r.fuente === "nube" ? `de la base de Río Colorado${r.correo ? ` (${esc(r.correo)})` : ""}` : r.fuente === "respaldo" ? "de un respaldo .json" : "de los datos de ejemplo";
    cuerpo = `<p class="panel-sub" style="margin:0">Leído ${fuente} el ${esc(fmtFechaHora(r.leidoEl))}: ${cs.length} compras, ${fA.length} con factura A (crédito fiscal ${esc(fmtARS(fA.reduce((x, c) => x + c.iva, 0)))}).</p>
      ${falt.sinNumero || falt.sinCuit ? `<div class="aviso" style="margin:10px 0 0">${ICONOS.alerta}<div>En Río Colorado hay facturas A ${[falt.sinNumero ? `${falt.sinNumero} sin número de comprobante` : "", falt.sinCuit ? `${falt.sinCuit} sin CUIT del proveedor` : ""].filter(Boolean).join(" y ")}. La contadora los necesita: completalos en esa app.</div></div>` : ""}
      ${r.error ? `<div class="aviso" style="margin:10px 0 0">${ICONOS.alerta}<div>${esc(r.error)} Se usa lo último leído.</div></div>` : ""}`;
  } else {
    cuerpo = `<p class="panel-sub" style="margin:0">Todavía no se leyó Río Colorado. Conectate con tu cuenta de Google (la misma de esa app) o cargá el respaldo .json que baja Río Colorado en «Datos y configuración».</p>
      ${r.error ? `<div class="aviso" style="margin:10px 0 0">${ICONOS.alerta}<div>${esc(r.error)}</div></div>` : ""}`;
  }
  return `<section class="panel"><div class="panel-cab"><div><h2>Río Colorado</h2><p class="panel-sub">Solo lectura: la app de los dúplex sigue igual. Lo leído queda guardado en este dispositivo.</p></div>
      <div class="cab-acciones">
        <button class="btn ${RC.hayDatos() ? "btn-sec" : "btn-pri"} btn-chico" id="rc-conectar"${est.cargando ? " disabled" : ""}>${est.cargando ? "Leyendo…" : RC.hayDatos() && r.fuente === "nube" ? "Actualizar" : "Conectar con Río Colorado"}</button>
        <label class="btn btn-sec btn-chico" for="rc-archivo">${ICONOS.subir}Cargar respaldo</label><input type="file" id="rc-archivo" accept=".json,application/json" hidden>
        ${demo && r.fuente !== "ejemplo" ? `<button class="btn btn-fant btn-chico" id="rc-ejemplo">Datos de ejemplo</button>` : ""}
        ${RC.hayDatos() ? `<button class="btn btn-fant btn-chico" id="rc-olvidar">Desconectar</button>` : ""}
      </div></div>${cuerpo}</section>`;
}

async function actualizarSilencioso() {
  try { if (await RC.conectar(false)) app.refrescar(); } catch (e) { app.refrescar(); }
}

/* ---------- IVA mes a mes ---------- */
function panelMensual(filas) {
  const t = k => filas.reduce((x, f) => x + f[k], 0);
  return `<section class="panel"><div class="panel-cab"><div><h2>IVA de Magna mes a mes</h2><p class="panel-sub">En pesos. Es una estimación para controlar con la contadora: la declaración la hace ella. Lo que queda a favor en un mes se usa en el siguiente.</p></div></div>
    ${filas.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Mes</th><th class="n">Débito</th><th class="n">Crédito</th><th class="n ocultar-movil">Ret. y percep.</th><th class="n ocultar-movil">A favor del mes anterior</th><th class="n">A pagar</th><th class="n">Queda a favor</th></tr></thead><tbody>
      ${filas.map(f => `<tr><td>${esc(mesLabel(f.mes))}</td><td class="n">${a(f.debito)}</td><td class="n">${a(-f.credito)}</td><td class="n ocultar-movil">${a(-f.ret)}</td><td class="n ocultar-movil">${a(-(f.tecAnt + f.libreAnt))}</td><td class="n"><b>${a(f.pagar)}</b></td><td class="n">${a(f.favorTec + f.favorLibre)}</td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="n">${a(t("debito"))}</td><td class="n">${a(-t("credito"))}</td><td class="n ocultar-movil">${a(-t("ret"))}</td><td class="n ocultar-movil"></td><td class="n">${a(t("pagar"))}</td><td class="n"></td></tr>
    </tbody></table></div>` : `<div class="vacio">No hay IVA en esos meses.</div>`}</section>`;
}

/* ---------- por origen ---------- */
function panelOrigen() {
  const os = MI.totalesPorOrigen(est.desde, est.hasta).filter(o => o.debito || o.credito || o.ret || o.iibb || o.gan);
  const t = k => os.reduce((x, o) => x + o[k], 0);
  return `<section class="panel"><div class="panel-cab"><div><h2>Por origen</h2><p class="panel-sub">De ${esc(mesLabel(est.desde))} a ${esc(mesLabel(est.hasta))}, en pesos. Saldo positivo: esa parte genera IVA a pagar. Negativo: aporta crédito fiscal. IIBB y Ganancias: percepciones de las compras y retenciones de los cobros, que son pagos a cuenta.</p></div></div>
    ${os.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Origen</th><th class="n">Débito</th><th class="n">Crédito</th><th class="n ocultar-movil">Ret. y percep. IVA</th><th class="n">Saldo IVA</th><th class="n ocultar-movil">A cuenta IIBB</th><th class="n ocultar-movil">A cuenta Ganancias</th></tr></thead><tbody>
      ${os.map(o => `<tr><td><b>${esc(o.nombre)}</b>${o.tipo === "magna" ? `<small class="mute" style="display:block">Compras propias de Magna (combustible, corralón)</small>` : ""}</td><td class="n">${a(o.debito)}</td><td class="n">${a(-o.credito)}</td><td class="n ocultar-movil">${a(-o.ret)}</td><td class="n"><b>${a(o.saldo)}</b></td><td class="n ocultar-movil">${a(o.iibb)}</td><td class="n ocultar-movil">${a(o.gan)}</td></tr>`).join("")}
      <tr class="total"><td>Magna</td><td class="n">${a(t("debito"))}</td><td class="n">${a(-t("credito"))}</td><td class="n ocultar-movil">${a(-t("ret"))}</td><td class="n">${a(t("saldo"))}</td><td class="n ocultar-movil">${a(t("iibb"))}</td><td class="n ocultar-movil">${a(t("gan"))}</td></tr>
    </tbody></table></div>` : `<div class="vacio">No hay movimientos con IVA en esos meses.</div>`}</section>`;
}

/* ---------- compras propias de Magna, por quién las pagó ---------- */
function panelQuien() {
  const fs = MI.comprasMagnaPorQuien(est.desde, est.hasta);
  if (!fs.length) return "";
  const t = k => fs.reduce((x, f) => x + f[k], 0);
  return `<section class="panel"><div class="panel-cab"><div><h2>Compras de Magna: quién aportó el crédito fiscal</h2><p class="panel-sub">De ${esc(mesLabel(est.desde))} a ${esc(mesLabel(est.hasta))}, en pesos. Las facturas a nombre de Magna (combustible, corralón y otras) según quién las pagó: un socio con su plata, sin reintegro, o la cuenta de Magna.</p></div></div>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Quién la pagó</th><th class="n">Facturas</th><th class="n ocultar-movil">Total</th><th class="n ocultar-movil">IVA</th><th class="n ocultar-movil">Percepciones de IVA</th><th class="n">Crédito fiscal aportado</th></tr></thead><tbody>
      ${fs.map(f => `<tr><td><b>${esc(f.nombre)}</b>${f.sinReintegro ? `<small class="mute" style="display:block">Con su plata, sin reintegro</small>` : ""}</td><td class="n">${f.facturas}</td><td class="n ocultar-movil">${a(f.total)}</td><td class="n ocultar-movil">${a(f.iva)}</td><td class="n ocultar-movil">${a(f.percIVA)}</td><td class="n"><b>${a(f.credito)}</b></td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="n">${t("facturas")}</td><td class="n ocultar-movil">${a(t("total"))}</td><td class="n ocultar-movil">${a(t("iva"))}</td><td class="n ocultar-movil">${a(t("percIVA"))}</td><td class="n">${a(t("credito"))}</td></tr>
    </tbody></table></div></section>`;
}

/* ---------- compensación entre proyectos ---------- */
function panelCompensacion() {
  const c = MI.compensacion(est.hasta);
  const pares = c.pares.filter(p => Math.abs(p.corresponde) > 1 || Math.abs(p.hecho) > 1);
  const ivRC = RC.hayDatos() ? RC.movimientosIvaRC() : [];
  const vendRC = ivRC.filter(m => m.tipo === "vendido").reduce((x, m) => x + (Number(m.ivaARS) || 0), 0);
  return `<section class="panel"><div class="panel-cab"><div><h2>Compensación de IVA entre proyectos</h2><p class="panel-sub">Acumulado hasta ${esc(mesLabel(est.hasta))}. Magna paga un solo IVA: el proyecto que tiene IVA a pagar usa el crédito fiscal del que tiene saldo a favor, y le paga ese IVA. Se reparte en proporción. Magna (propio) no entra: esas compras las pagan los socios sin reintegro.</p></div></div>
    ${pares.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Paga</th><th>Recibe</th><th class="n">Corresponde</th><th class="n ocultar-movil">Registrado</th><th class="n">Falta</th><th><span class="sr">Acción</span></th></tr></thead><tbody>
      ${pares.map((p, i) => `<tr><td>${esc(p.deNombre)}</td><td>${esc(p.aNombre)}</td><td class="n">${a(p.corresponde)}</td><td class="n ocultar-movil">${a(p.hecho)}</td><td class="n"><b>${p.falta < -1 ? `<span class="tag">${esc(fmtARS(-p.falta))} de más</span>` : a(Math.max(0, p.falta))}</b></td>
        <td class="n">${p.falta > 1 ? `<button class="btn btn-sec btn-chico" data-comp="${i}">Registrar</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="vacio">${c.deudores.length && !c.acreedores.length ? "Ningún proyecto tiene crédito fiscal a favor: no hay nada que compensar." : !c.deudores.length && c.acreedores.length ? "Ningún proyecto tiene IVA a pagar: el crédito queda a favor de Magna." : "No hay nada que compensar hasta ese mes."}</div>`}
    <p class="panel-sub" style="margin-top:10px">Al registrar, el IVA sale de Magna · Reserva fiscal (ahí está apartado el IVA del que paga). Si cobra Río Colorado, sale de la cuenta hacia su fondo: cargalo también en esa app como «Movimiento de IVA · Vendido a otro proyecto».${ivRC.length ? ` En Río Colorado hay ${ivRC.length} movimiento${ivRC.length === 1 ? "" : "s"} de IVA cargado${ivRC.length === 1 ? "" : "s"}, con ${esc(fmtARS(vendRC))} de IVA vendido.` : ""}</p>
  </section>`;
}

function modalCompensar(par) {
  const md = modal("Registrar compensación de IVA", `<form class="form" id="cp-f" novalidate>
    <p class="mute" style="margin:0"><b>${esc(par.deNombre)}</b> le paga a <b>${esc(par.aNombre)}</b> el IVA del crédito fiscal que usó. ${par.a === "RC" ? "Sale de la cuenta de Magna (desde Magna · Reserva fiscal) hacia el fondo de Río Colorado." : par.de === "RC" ? "Entra a la cuenta de Magna, al bolsillo que cobra." : "Es un pase de Magna · Reserva fiscal al bolsillo que cobra: no sale del banco."}</p>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="cp-fecha">Fecha</label><input type="date" id="cp-fecha" value="${hoyISO()}"></div>
      <div class="campo"><label for="cp-monto">Monto en pesos</label><input id="cp-monto" class="monto" inputmode="decimal" value="${esc(fmtMiles(Math.max(0, par.falta)))}"></div>
      <div class="campo"><label for="cp-mep">Dólar MEP del día</label><input id="cp-mep" inputmode="decimal"><div class="hint" id="cp-mep-hint">Buscando…</div></div>
    </div>
    ${par.de !== "RC" && M.saldoBolsillo("RESERVA").ars < par.falta - 1 ? `<div class="aviso" style="margin:0">${ICONOS.alerta}<div>Magna · Reserva fiscal tiene ${esc(fmtARS(M.saldoBolsillo("RESERVA").ars))}: no alcanza. Primero reservá el IVA de ${esc(par.deNombre)} desde Impuestos.</div></div>` : ""}
    ${par.a === "RC" ? `<div class="aviso aviso-info" style="margin:0">${ICONOS.alerta}<div>Después cargalo en la app de Río Colorado: Movimiento de IVA → «Vendido a otro proyecto», proyecto «${esc(par.deNombre)}», con el mismo monto.</div></div>` : ""}
    <div class="form-pie"><button class="btn btn-pri" type="submit">Registrar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div>
  </form>`, { ancho: 640 });
  const buscar = async () => {
    const r = await cotizacionMEP($("#cp-fecha", md).value);
    if (r) { $("#cp-mep", md).value = fmtMiles(r.valor); $("#cp-mep-hint", md).textContent = r.aproximada ? "Sin dato para esa fecha: se usó la de hoy." : "MEP de esa fecha."; }
    else $("#cp-mep-hint", md).textContent = "No se pudo consultar. Cargala a mano.";
  };
  $("#cp-fecha", md).addEventListener("change", buscar);
  buscar();
  $("#cp-f", md).addEventListener("submit", e => {
    e.preventDefault();
    const fecha = $("#cp-fecha", md).value, monto = parseMonto($("#cp-monto", md).value), cot = parseMonto($("#cp-mep", md).value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return toast("Falta la fecha.", "error");
    if (!(monto > 0)) return toast("Cargá el monto.", "error");
    if (!(cot > 0)) return toast("Falta el dólar MEP del día.", "error");
    const m = MI.movimientoCompensacion(par, { fecha, montoARS: monto, cotizacion: cot });
    m.creadoPor = app.usuario.socio; m.creadoEl = new Date().toISOString();
    guardar("movimientos", m);
    cerrarModal();
    toast(`Compensación registrada · ${fmtARS(monto)} · ${fmtUSD(monto / cot)}`);
  });
}

/* ---------- planilla completa ---------- */
function panelPlanilla() {
  return `<section class="panel"><div class="panel-cab"><div><h2>Planilla completa para la contadora</h2><p class="panel-sub">Lo mismo que la planilla de siempre, pero de toda Magna: suma las compras de Río Colorado${RC.hayDatos() ? "" : " (todavía sin leer)"} y las compras propias, con una columna «Origen» y una hoja de IVA por origen. Usa los meses elegidos arriba.</p></div>
    <div class="cab-acciones"><button class="btn btn-pri btn-chico" id="mi-planilla">${ICONOS.descargar}Descargar planilla</button></div></div></section>`;
}

/* ---------- eventos ---------- */
function cablear(el) {
  const cambiaMes = () => {
    const d = $("#mi-desde", el).value, h = $("#mi-hasta", el).value;
    if (!/^\d{4}-\d{2}$/.test(d) || !/^\d{4}-\d{2}$/.test(h)) return;
    if (d > h) return toast("El mes «desde» tiene que ser anterior o igual al «hasta».", "error");
    est.desde = d; est.hasta = h; app.refrescar();
  };
  $("#mi-desde", el).addEventListener("change", cambiaMes);
  $("#mi-hasta", el).addEventListener("change", cambiaMes);
  $("#rc-conectar", el).addEventListener("click", async () => {
    est.cargando = true; app.refrescar();
    try { await RC.conectar(true); toast("Río Colorado actualizado"); }
    catch (e) { toast(e.message, "error"); }
    finally { est.cargando = false; app.refrescar(); }
  });
  $("#rc-archivo", el).addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { RC.desdeRespaldo(await f.text()); toast("Respaldo de Río Colorado cargado"); app.refrescar(); }
    catch (err) { toast(err.message || "No se pudo leer el archivo.", "error"); }
  });
  const be = $("#rc-ejemplo", el);
  if (be) be.addEventListener("click", () => { RC.ejemplo(); app.refrescar(); });
  const bo = $("#rc-olvidar", el);
  if (bo) bo.addEventListener("click", async () => { await RC.salirRC(); toast("Se borró lo leído de Río Colorado en este dispositivo"); app.refrescar(); });
  const pares = MI.compensacion(est.hasta).pares.filter(p => Math.abs(p.corresponde) > 1 || Math.abs(p.hecho) > 1);
  $$("[data-comp]", el).forEach(b => b.addEventListener("click", () => modalCompensar(pares[Number(b.dataset.comp)])));
  $("#mi-planilla", el).addEventListener("click", async ev => {
    if (M.mesesEntre(est.desde, est.hasta).length > 24) return toast("Elegí hasta 24 meses por planilla.", "error");
    const b = ev.currentTarget; b.disabled = true;
    try {
      const r = await CT.exportarContadora(est.desde, est.hasta, M.socioNombre(app.usuario.socio), { rc: RC.hayDatos() ? RC.comprasRC() : [], porOrigen: MI.filasPorOrigen(est.desde, est.hasta) });
      toast(`Planilla descargada · ${r.compras} compras con factura, ${r.ventas} ventas, ${r.sinFactura} sin factura`);
    } catch (err) { console.error(err); toast("No se pudo generar la planilla. Revisá la conexión.", "error"); }
    finally { b.disabled = false; }
  });
}
