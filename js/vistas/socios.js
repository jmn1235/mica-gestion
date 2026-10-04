/* =========================================================
   Socios: aportes, préstamos con interés, honorarios y lo que
   se le debe a cada socio. Cambia según lo elegido arriba:
   un proyecto, MICA (todos) o Magna (posición de Julio).
   ========================================================= */
import { S, guardar, nuevoId } from "../db.js";
import { app } from "../contexto.js";
import { SOCIOS, TITULAR_MAGNA } from "../config.js";
import * as M from "../modelo.js";
import { actualizarProyecto } from "../presupuesto.js";
import { $, $$, esc, num, fmtUSD, fmtARS, fmtPct, fmtFecha, mesLabel, parseMonto, hoyISO, toast, confirmar2, modal, cerrarModal, cabecera, ICONOS } from "../ui.js";

const kpi = (rot, val, sub = "") => `<div class="kpi"><div class="kpi-rot">${rot}</div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
const u = v => num(v, fmtUSD);

export function render(el) {
  const ctx = app.ctx;
  if (ctx.tipo === "proyecto" && M.proyecto(ctx.id)) return vistaProyecto(el, M.proyecto(ctx.id));
  if (ctx.tipo === "magna") return vistaMagna(el);
  return vistaMica(el);
}

/* =================== PROYECTO =================== */
function vistaProyecto(el, p) {
  const mica = M.resumenMica();
  const r = mica.proyectos.find(x => x.proyecto.id === p.id) || M.resumenProyecto(p);
  const asignado = r.asignadoUsd || 0;
  const cuenta = M.cuentaSociosProyecto(p, r, asignado);
  const tot = k => cuenta.filas.reduce((a, f) => a + f[k], 0);
  const pagos = M.pagosASocios(p.id);
  const sinTasa = r.prestamos.some(x => x.sinTasa);

  let h = cabecera(p.codigo || "Proyecto", "Socios", `${esc(p.nombre)} · en dólares MEP`,
    `<a class="btn btn-pri" href="#cargar/nuevo/pase/prestamo">${ICONOS.cargar}Registrar préstamo</a><a class="btn btn-sec btn-sec-escritorio" href="#cargar/nuevo/ingreso/aporte">Registrar aporte</a>`);
  if (p.estado === "cerrado" && p.cierre) h += `<div class="aviso aviso-info">${ICONOS.ok}<div>Proyecto cerrado el ${esc(fmtFecha(p.cierre.fecha, true))}: intereses y honorarios calculados hasta esa fecha. El detalle de la liquidación está en <a href="#liquidacion">Cierre de proyecto</a>.</div></div>`;
  if (sinTasa) h += `<div class="aviso aviso-info">${ICONOS.alerta}<div>Hay préstamos sin tasa: no generan interés. Tocá el préstamo para cargarle la tasa anual en dólares.</div></div>`;

  h += `<div class="grid-kpi">
    ${kpi("Aportes de capital", u(tot("aportes")), "Se devuelven al cierre, sin interés")}
    ${kpi("Préstamos a devolver", u(r.deudaUsd), r.interesesUsd > 0.5 ? `Incluye ${fmtUSD(r.prestamos.reduce((a, x) => a + x.saldoInteresUsd, 0))} de interés pendiente` : "Sin interés devengado")}
    ${kpi("Honorarios a pagar", u(tot("honorarios")), `${(p.honorarios || []).length} acuerdo${(p.honorarios || []).length === 1 ? "" : "s"} · al cierre`)}
    ${kpi("Neto para repartir", u(tot("resultado")), `Después de honorarios, intereses, impuestos${asignado ? " y estructura" : ""}`)}
  </div>`;

  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Cuenta de cada socio</h2><p class="panel-sub">Lo que le correspondería a cada uno si el proyecto se liquidara hoy, con el resultado neto de impuestos estimados. Se liquida al cierre en este orden: impuestos, préstamos con su interés, aportes, honorarios, parte de estructura y el resultado según la participación (<a href="#liquidacion">Cierre de proyecto</a>).</p></div><a class="btn btn-fant btn-chico" href="#ajustes/proyectos/${encodeURIComponent(p.id)}">Participación</a></div>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Socio</th><th class="n">%</th><th class="n ocultar-movil">Aportes</th><th class="n ocultar-movil">Préstamos</th><th class="n ocultar-movil">Honorarios</th><th class="n">Resultado</th><th class="n ocultar-movil">Distribuido</th><th class="n">A favor</th></tr></thead><tbody>
    ${cuenta.filas.map(f => `<tr><td><b>${esc(f.nombre)}</b></td><td class="n">${fmtPct(f.pct, 0)}</td><td class="n ocultar-movil">${u(f.aportes)}</td><td class="n ocultar-movil">${u(f.prestamos)}</td><td class="n ocultar-movil">${u(f.honorarios)}</td><td class="n">${u(f.resultado)}</td><td class="n ocultar-movil">${u(-f.distribuido)}</td><td class="n"><b>${u(f.aFavor)}</b></td></tr>`).join("")}
    <tr class="total"><td>Total</td><td class="n">${fmtPct(tot("pct"), 0)}</td><td class="n ocultar-movil">${u(tot("aportes"))}</td><td class="n ocultar-movil">${u(tot("prestamos"))}</td><td class="n ocultar-movil">${u(tot("honorarios"))}</td><td class="n">${u(tot("resultado"))}</td><td class="n ocultar-movil">${u(-tot("distribuido"))}</td><td class="n">${u(tot("aFavor"))}</td></tr>
    </tbody></table></div>
    ${cuenta.otrosPrestamistas.length ? `<p class="panel-sub" style="margin-top:10px">Además, el proyecto debe ${cuenta.otrosPrestamistas.map(x => `${fmtUSD(x.saldoUsd)} a ${esc(x.nombre)}`).join(" y ")}.</p>` : ""}</section>`;

  h += `<section class="panel"><div class="panel-cab"><div><h2>Préstamos</h2><p class="panel-sub">Cada préstamo tiene su tasa efectiva anual en dólares y devenga interés compuesto día a día. Las devoluciones pagan primero el interés y después el capital, empezando por el préstamo más viejo. El interés es costo del proyecto y se le paga a quien prestó.</p></div></div>
    ${r.prestamos.length ? r.prestamos.map(g => `
      <div class="grupo-prestamo">
        <div class="grupo-cab"><b>${esc(g.nombre)}</b><span class="mute chico">prestado ${fmtUSD(g.recibidoUsd)} · devuelto ${fmtUSD(g.devueltoUsd)} · interés ${fmtUSD(g.interesUsd)}</span><span class="n"><b>${u(g.saldoUsd)}</b></span></div>
        <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Préstamo</th><th class="n">Capital</th><th class="n">Tasa anual</th><th class="n ocultar-movil">Interés devengado</th><th class="n">Saldo</th></tr></thead><tbody>
        ${g.tramos.map(t => `<tr class="clic" data-tasa="${esc(t.mov.id)}" title="Cambiar la tasa"><td>${fmtFecha(t.fecha)}<small class="mute" style="display:block">${esc(fmtARS(t.capitalArs))}${t.mov.concepto ? " · " + esc(t.mov.concepto) : ""}</small></td><td class="n">${u(t.capital)}</td><td class="n">${t.tasa ? String(t.tasa).replace(".", ",") + "%" : '<span class="tag tag-alerta">Sin tasa</span>'}</td><td class="n ocultar-movil">${u(t.devengado)}</td><td class="n">${u(t.cap + t.int)}</td></tr>`).join("")}
        ${g.devoluciones.map(m => `<tr class="sub"><td>Devolución ${fmtFecha(m.fecha)}<small class="mute" style="display:block">${esc(fmtARS(m.montoARS))}</small></td><td class="n">${u(-M.usd(m))}</td><td></td><td class="ocultar-movil"></td><td></td></tr>`).join("")}
        </tbody></table></div></div>`).join("") : `<div class="vacio">El proyecto no recibió préstamos.</div>`}
    <div class="form-pie" style="margin-top:12px"><a class="btn btn-sec btn-chico" href="#cargar/nuevo/pase/prestamo">Préstamo desde un bolsillo</a><a class="btn btn-sec btn-chico" href="#cargar/nuevo/ingreso/prestamo">Préstamo de un socio</a><a class="btn btn-sec btn-chico" href="#cargar/nuevo/pase/devolucion">Devolución a Magna</a><a class="btn btn-sec btn-chico" href="#cargar/nuevo/egreso/devolucion">Devolución a un socio</a></div></section>`;

  const hon = r.honorarios;
  const nombreModo = a => { const m = M.MODOS_HONORARIO.find(x => x.id === a.modo) || M.MODOS_HONORARIO[0]; return m.pct ? `${String(a.porcentaje || 0).replace(".", ",")}% ${m.nombre.replace("% ", "")}` : `${fmtUSD(a.monto || 0)} ${a.modo === "unico" ? "único" : "por mes"}`; };
  h += `<section class="panel"><div class="panel-cab"><div><h2>Honorarios</h2><p class="panel-sub">No se pagan durante la obra: se suman al costo del proyecto y quedan a favor del socio. Se computan los meses cerrados (hasta ${esc(mesLabel(hon.tope).toLowerCase())}).</p></div><button class="btn btn-pri btn-chico" id="so-hon-nuevo">Agregar acuerdo</button></div>
    ${hon.porAcuerdo.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Acuerdo</th><th class="ocultar-movil">Cómo se calcula</th><th class="ocultar-movil">Desde</th><th class="n">Reconocido</th></tr></thead><tbody>
      ${hon.porAcuerdo.map(x => `<tr class="clic" data-hon="${esc(x.acuerdo.id)}"><td><b>${esc(M.socioNombre(x.acuerdo.socio))}</b><small class="mute" style="display:block">${esc(x.acuerdo.concepto || "Honorarios")}</small></td><td class="ocultar-movil">${esc(nombreModo(x.acuerdo))}</td><td class="ocultar-movil">${x.acuerdo.desde ? esc(mesLabel(x.acuerdo.desde, true)) : "—"}${x.acuerdo.hasta ? " – " + esc(mesLabel(x.acuerdo.hasta, true)) : ""}</td><td class="n">${u(x.total)}<small class="mute" style="display:block">${x.detalle.length} mes${x.detalle.length === 1 ? "" : "es"}</small></td></tr>`).join("")}
      ${Object.entries(pagos).filter(([, v]) => v.honorarios > 0).map(([s, v]) => `<tr class="sub"><td>Pagado a ${esc(M.socioNombre(s))}</td><td class="ocultar-movil"></td><td class="ocultar-movil"></td><td class="n">${u(-v.honorarios)}</td></tr>`).join("")}
      <tr class="total"><td>Total reconocido</td><td class="ocultar-movil"></td><td class="ocultar-movil"></td><td class="n">${u(hon.total)}</td></tr></tbody></table></div>
      ${Object.keys(hon.porMes).length ? `<details style="margin-top:12px"><summary class="chico mute" style="cursor:pointer">Ver mes por mes</summary><div class="tabla-env" style="margin-top:8px"><table class="tabla tabla-compacta"><thead><tr><th>Mes</th>${hon.porAcuerdo.map(x => `<th class="n">${esc(M.socioNombre(x.acuerdo.socio))}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>
        ${Object.keys(hon.porMes).sort().map(mes => `<tr><td>${esc(mesLabel(mes))}</td>${hon.porAcuerdo.map(x => { const d = x.detalle.find(y => y.mes === mes); return `<td class="n">${d ? fmtUSD(d.monto) + (d.base != null ? `<small class="mute" style="display:block">base ${fmtUSD(d.base)}</small>` : "") : '<span class="mute">·</span>'}</td>`; }).join("")}<td class="n"><b>${fmtUSD(hon.porMes[mes])}</b></td></tr>`).join("")}
      </tbody></table></div></details>` : ""}`
      : `<div class="vacio">No hay honorarios acordados en este proyecto.</div>`}</section>`;

  const devs = S.movimientos.filter(m => m.bolsillo === p.id && m.clase === "devaporte" && (m.tipo === "egreso" || m.tipo === "pase")).map(m => ({ s: m.socio || (m.destino === "MAGNA" ? TITULAR_MAGNA : ""), m, dev: true }));
  const aportes = Object.entries(r.aportes || {}).flatMap(([s, v]) => v.movs.map(m => ({ s, m }))).concat(devs).sort((a, b) => a.m.fecha.localeCompare(b.m.fecha));
  h += `<section class="panel"><div class="panel-cab"><div><h2>Aportes de capital</h2><p class="panel-sub">Ocasionales. Se devuelven al cierre, antes de repartir el resultado, y no generan interés.</p></div><a class="btn btn-sec btn-chico" href="#cargar/nuevo/ingreso/aporte">Registrar aporte</a></div>
    ${aportes.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Fecha</th><th>Socio</th><th class="n ocultar-movil">Pesos</th><th class="n">Dólares</th></tr></thead><tbody>
      ${aportes.map(({ s, m, dev }) => `<tr${dev ? ' class="sub"' : ""}><td>${fmtFecha(m.fecha)}</td><td>${esc(M.socioNombre(s) || "Sin indicar")}${dev ? `<small class="mute" style="display:block">devolución</small>` : m.tipo === "pase" ? `<small class="mute" style="display:block">desde ${esc(M.nombreBolsillo(m.bolsillo))}</small>` : ""}</td><td class="n ocultar-movil">${fmtARS(dev ? -m.montoARS : m.montoARS)}</td><td class="n">${u(dev ? -M.usd(m) : M.usd(m))}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="vacio">No hubo aportes de capital.</div>`}</section>`;

  el.innerHTML = h;
  $$("[data-tasa]", el).forEach(tr => tr.addEventListener("click", () => modalTasa(tr.dataset.tasa)));
  $$("[data-hon]", el).forEach(tr => tr.addEventListener("click", () => modalHonorario(p.id, tr.dataset.hon)));
  $("#so-hon-nuevo", el).addEventListener("click", () => modalHonorario(p.id, null));
}

function modalTasa(movId) {
  const m = S.movimientos.find(x => x.id === movId);
  if (!m) return;
  const md = modal("Tasa del préstamo", `<form class="form" id="ft">
    <p class="mute" style="margin:0">Préstamo del ${fmtFecha(m.fecha, true)} por ${esc(fmtARS(m.montoARS))} (${esc(fmtUSD(M.usd(m)))}).</p>
    <div class="campo"><label for="t-tasa">Tasa efectiva anual en dólares (%)</label><input id="t-tasa" inputmode="decimal" value="${m.tasa != null ? String(m.tasa).replace(".", ",") : ""}" placeholder="Ej.: 8"></div>
    <p class="hint" style="margin:0">Se devenga día a día en forma compuesta, desde la fecha del préstamo. Poné 0 para que no genere interés.</p>
    <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button></div></form>`, { ancho: 460 });
  $("#ft", md).addEventListener("submit", e => {
    e.preventDefault();
    const t = parseMonto($("#t-tasa", md).value);
    if (isNaN(t) || t < 0 || t > 200) return toast("Revisá la tasa: es un % anual en dólares.", "error");
    guardar("movimientos", Object.assign({}, m, { tasa: t, modificadoPor: app.usuario.socio }));
    cerrarModal(); toast("Tasa guardada");
  });
}

function modalHonorario(pid, id) {
  const p = M.proyecto(pid);
  const a0 = id ? (p.honorarios || []).find(x => x.id === id) : null;
  const a = a0 ? Object.assign({}, a0) : { id: nuevoId("ho"), socio: "", concepto: "", modo: "mensual", monto: 0, porcentaje: 0, desde: (p.inicio || hoyISO()).slice(0, 7), hasta: "" };
  const md = modal(a0 ? "Acuerdo de honorarios" : "Nuevo acuerdo de honorarios", `<form class="form" id="fh" novalidate>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="h-socio">Socio</label><select id="h-socio"><option value="">Elegí el socio</option>${SOCIOS.map(s => `<option value="${s.id}"${s.id === a.socio ? " selected" : ""}>${esc(s.nombre)}</option>`).join("")}</select></div>
      <div class="campo"><label for="h-concepto">Por qué trabajo</label><input id="h-concepto" value="${esc(a.concepto || "")}" placeholder="Dirección de obra, gerenciamiento…"></div>
    </div>
    <div class="campo"><label for="h-modo">Cómo se calcula</label><select id="h-modo">${M.MODOS_HONORARIO.map(x => `<option value="${x.id}"${x.id === a.modo ? " selected" : ""}>${x.nombre}</option>`).join("")}</select></div>
    <div class="fila fila-movil-2">
      <div class="campo" id="h-c-monto"><label for="h-monto">Monto en dólares</label><input id="h-monto" inputmode="decimal" value="${a.monto ? String(a.monto).replace(".", ",") : ""}"></div>
      <div class="campo" id="h-c-pct"><label for="h-pct">Porcentaje</label><input id="h-pct" inputmode="decimal" value="${a.porcentaje ? String(a.porcentaje).replace(".", ",") : ""}" placeholder="Ej.: 5"></div>
    </div>
    <div class="fila fila-movil-2">
      <div class="campo"><label for="h-desde" id="h-l-desde">Desde (mes)</label><input id="h-desde" type="month" value="${esc(a.desde || "")}" placeholder="AAAA-MM"></div>
      <div class="campo" id="h-c-hasta"><label for="h-hasta">Hasta (mes, opcional)</label><input id="h-hasta" type="month" value="${esc(a.hasta || "")}" placeholder="AAAA-MM"></div>
    </div>
    <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button>
      ${a0 ? `<button class="btn btn-peligro der" type="button" id="h-borrar">${ICONOS.borrar}Quitar</button>` : ""}</div></form>`, { ancho: 560 });
  const q = x => $("#h-" + x, md);
  const ver = () => {
    const modo = M.MODOS_HONORARIO.find(x => x.id === q("modo").value);
    q("c-monto").hidden = modo.pct; q("c-pct").hidden = !modo.pct;
    q("c-hasta").hidden = modo.id === "unico";
    q("l-desde").textContent = modo.id === "unico" ? "Mes en que se reconoce" : "Desde (mes)";
  };
  q("modo").addEventListener("change", ver); ver();
  $("#fh", md).addEventListener("submit", e => {
    e.preventDefault();
    const modo = M.MODOS_HONORARIO.find(x => x.id === q("modo").value);
    const d = Object.assign(a, {
      socio: q("socio").value, concepto: q("concepto").value.trim(), modo: modo.id,
      monto: parseMonto(q("monto").value) || 0, porcentaje: parseMonto(q("pct").value) || 0,
      desde: q("desde").value.trim(), hasta: modo.id === "unico" ? "" : q("hasta").value.trim()
    });
    if (!d.socio) return toast("Elegí el socio.", "error");
    if (modo.pct ? !(d.porcentaje > 0) : !(d.monto > 0)) return toast(modo.pct ? "Poné el porcentaje." : "Poné el monto en dólares.", "error");
    if (!/^\d{4}-\d{2}$/.test(d.desde)) return toast("El mes va como AAAA-MM, por ejemplo 2026-08.", "error");
    if (d.hasta && (!/^\d{4}-\d{2}$/.test(d.hasta) || d.hasta < d.desde)) return toast("Revisá el mes de fin.", "error");
    actualizarProyecto(pid, pp => {
      pp.honorarios = pp.honorarios || [];
      const i = pp.honorarios.findIndex(x => x.id === d.id);
      if (i >= 0) pp.honorarios[i] = d; else pp.honorarios.push(d);
    }, app.usuario.socio);
    cerrarModal(); toast("Acuerdo guardado");
  });
  const b = q("borrar");
  if (b) b.addEventListener("click", e => confirmar2(e.currentTarget, () => {
    actualizarProyecto(pid, pp => { pp.honorarios = (pp.honorarios || []).filter(x => x.id !== a.id); }, app.usuario.socio);
    cerrarModal(); toast("Acuerdo quitado");
  }));
}

/* =================== MICA =================== */
function vistaMica(el) {
  const r = M.resumenMica();
  const tot = k => r.socios.reduce((a, s) => a + s[k], 0);
  let h = cabecera("Vista general", "Socios de MICA", "Cuenta de cada socio en todos los proyectos, en dólares MEP.");
  h += `<div class="grid-kpi">
    ${kpi("Aportes de capital", u(tot("aportes")), "En todos los proyectos")}
    ${kpi("Préstamos a devolver", u(tot("prestamos")), "Préstamos de socios y de Magna, con interés")}
    ${kpi("Honorarios a pagar", u(tot("honorarios")), "Reconocidos y no pagados")}
    ${kpi("Neto para repartir", u(tot("resultado")), "Proyectos menos estructura, después de impuestos")}
  </div>`;
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Cuenta de cada socio</h2><p class="panel-sub">Suma de todos los proyectos, con el resultado neto de impuestos estimados. A Julio se le suman los gastos de Magna que pagó y todavía no se le reintegraron. Es una foto de hoy.</p></div></div>
    <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Socio</th><th class="n ocultar-movil">Aportes</th><th class="n ocultar-movil">Préstamos</th><th class="n ocultar-movil">Honorarios</th><th class="n ocultar-movil">Reintegros</th><th class="n">Resultado</th><th class="n ocultar-movil">Distribuido</th><th class="n">A favor</th></tr></thead><tbody>
    ${r.socios.map(s => `<tr><td><b>${esc(s.nombre)}</b></td><td class="n ocultar-movil">${u(s.aportes)}</td><td class="n ocultar-movil">${u(s.prestamos)}</td><td class="n ocultar-movil">${u(s.honorarios)}</td><td class="n ocultar-movil">${u(s.reintegro)}</td><td class="n">${u(s.resultado)}</td><td class="n ocultar-movil">${u(-s.distribuido)}</td><td class="n"><b>${u(s.aFavor)}</b></td></tr>`).join("")}
    <tr class="total"><td>Total</td><td class="n ocultar-movil">${u(tot("aportes"))}</td><td class="n ocultar-movil">${u(tot("prestamos"))}</td><td class="n ocultar-movil">${u(tot("honorarios"))}</td><td class="n ocultar-movil">${u(tot("reintegro"))}</td><td class="n">${u(tot("resultado"))}</td><td class="n ocultar-movil">${u(-tot("distribuido"))}</td><td class="n">${u(tot("aFavor"))}</td></tr>
    </tbody></table></div></section>`;

  const e = r.estructura;
  h += `<div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Reparto de estructura y gastos de Magna</h2><p class="panel-sub">Se reparten entre los proyectos según lo cobrado por cada uno, y bajan el resultado que se reparte. A un proyecto cerrado se le fija su parte al cerrarlo.</p></div></div>
      <table class="tabla tabla-compacta"><tbody>
        <tr><td>Gastos de estructura de MICA</td><td class="n">${u(e.gastosUsd)}</td></tr>
        ${e.interesesUsd ? `<tr><td>Intereses de préstamos a Estructura</td><td class="n">${u(e.interesesUsd)}</td></tr>` : ""}
        <tr><td>Gastos de Magna recuperables</td><td class="n">${u(r.reintegro.gastadoUsd)}</td></tr>
        <tr class="total"><td>Total a repartir</td><td class="n">${u(r.aRepartir)}</td></tr>
      </tbody></table>
      <div class="tabla-env" style="margin-top:12px"><table class="tabla tabla-compacta"><thead><tr><th>Proyecto</th><th class="n">Peso</th><th class="n">Asignado</th></tr></thead><tbody>
        ${r.proyectos.map(x => `<tr><td>${esc(x.proyecto.nombre)}</td><td class="n">${x.asignadoFijo ? '<span class="tag">Fijo al cierre</span>' : fmtPct(x.pesoVentas || 0, 0)}</td><td class="n">${u(x.asignadoUsd || 0)}</td></tr>`).join("")}
        ${Math.abs(r.sinAsignar) > 0.5 ? `<tr class="sub"><td>Sin asignar (no hay proyectos abiertos con cobros)</td><td></td><td class="n">${u(r.sinAsignar)}</td></tr>` : ""}
      </tbody></table></div></section>
    <section class="panel"><div class="panel-cab"><div><h2>Resultado por proyecto</h2><p class="panel-sub">Antes de impuestos, después de honorarios, intereses y la parte de estructura. El detalle de impuestos está en <a href="#impuestos">Impuestos</a>.</p></div></div>
      <div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Proyecto</th><th class="n ocultar-movil">Operativo</th><th class="n ocultar-movil">Hon. e int.</th><th class="n">Para repartir</th></tr></thead><tbody>
        ${r.proyectos.map(x => `<tr class="clic" data-p="${esc(x.proyecto.id)}"><td>${esc(x.proyecto.nombre)}</td><td class="n ocultar-movil">${u(x.resultadoOperativoUsd)}</td><td class="n ocultar-movil">${u(-(x.honorariosUsd + x.interesesUsd - x.interesesGanadosUsd))}</td><td class="n">${u(x.resultadoUsd - (x.asignadoUsd || 0))}</td></tr>`).join("")}
      </tbody></table></div></section>
  </div>`;
  el.innerHTML = h;
  $$("tr[data-p]", el).forEach(tr => tr.addEventListener("click", () => {
    app.ctx = { tipo: "proyecto", id: tr.dataset.p }; try { localStorage.setItem("mica_ctx", "p:" + tr.dataset.p); } catch (e2) { /* nada */ }
    $$(".sel-ctx").forEach(s => { s.value = "p:" + tr.dataset.p; });
    app.refrescar();
  }));
}

/* =================== MAGNA (posición de Julio) =================== */
function vistaMagna(el) {
  const g = M.resumenMagna();
  const mica = M.resumenMica();
  const julio = mica.socios.find(s => s.id === TITULAR_MAGNA) || {};
  const pd = g.prestamosDados;
  const aportesMagna = S.movimientos.filter(m => m.tipo === "pase" && m.clase === "aporte" && m.bolsillo === "MAGNA");
  let h = cabecera("Razón social", "Posición de " + M.socioNombre(TITULAR_MAGNA), "Lo que MICA le debe al titular de Magna por préstamos, reintegros y aportes hechos desde la cuenta.",
    `<a class="btn btn-pri" href="#cargar/nuevo/pase/prestamo">${ICONOS.cargar}Préstamo a un proyecto</a><a class="btn btn-sec btn-sec-escritorio" href="#cargar/nuevo/pase/reintegro">Registrar reintegro</a>`);
  h += `<div class="grid-kpi">
    ${kpi("Préstamos dados", u(pd.reduce((a, x) => a + x.saldoUsd, 0)), "Saldo con interés")}
    ${kpi("Interés devengado", u(pd.reduce((a, x) => a + x.interesUsd, 0)), "Desde cada préstamo")}
    ${kpi("Gastos a reintegrar", u(g.reintegro.usd), `${fmtARS(g.reintegro.ars)} en pesos`)}
    ${kpi("A favor en MICA", u(julio.aFavor || 0), "Incluye su parte del resultado")}
  </div>`;
  h += `<section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Préstamos de Magna</h2><p class="panel-sub">En dólares del día de cada movimiento, con interés compuesto diario a la tasa de cada préstamo.</p></div></div>
    ${pd.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>A quién</th><th class="n">Prestado</th><th class="n ocultar-movil">Devuelto</th><th class="n ocultar-movil">Interés</th><th class="n">Saldo</th></tr></thead><tbody>
      ${pd.map(x => `<tr><td>${esc(x.proyecto.nombre)}${x.sinTasa ? ' <span class="tag tag-alerta">Sin tasa</span>' : ""}</td><td class="n">${u(x.recibidoUsd)}</td><td class="n ocultar-movil">${u(-x.devueltoUsd)}</td><td class="n ocultar-movil">${u(x.interesUsd)}</td><td class="n"><b>${u(x.saldoUsd)}</b></td></tr>`).join("")}
    </tbody></table></div>` : `<div class="vacio">Magna no prestó plata a ningún proyecto.</div>`}</section>
    <section class="panel"><div class="panel-cab"><div><h2>Aportes hechos desde Magna</h2><p class="panel-sub">Aportes de capital de Julio que salieron de la cuenta de Magna. Se devuelven al cierre de cada proyecto.</p></div></div>
    ${aportesMagna.length ? `<div class="tabla-env"><table class="tabla tabla-compacta"><thead><tr><th>Fecha</th><th>A</th><th class="n">Dólares</th></tr></thead><tbody>${aportesMagna.map(m => `<tr><td>${fmtFecha(m.fecha)}</td><td>${esc(M.nombreBolsillo(m.destino))}</td><td class="n">${u(M.usd(m))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="vacio">No hay aportes hechos desde Magna.</div>`}</section>`;
  el.innerHTML = h;
}
