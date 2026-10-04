/* =========================================================
   Ajustes: proyectos (con sus ítems), proveedores, cuentas y
   categorías, y datos (Excel, respaldo, papelera).
   ========================================================= */
import { S, estado, guardar, borrar, guardarConfig, mandarAPapelera, restaurar, reemplazarTodo, respaldo, borrarLocal, nuevoId } from "../db.js";
import { app } from "../contexto.js";
import { SOCIOS, USUARIOS, FIREBASE } from "../config.js";
import * as M from "../modelo.js";
import { cargarEjemplo, quitarEjemplo, sembrarSiHaceFalta } from "../semilla.js";
import * as P from "../presupuesto.js";
import * as C from "../certificados.js";
import * as IA from "../ia.js";
import * as I from "../impuestos.js";
import { $, $$, esc, num, fmtARS, fmtUSD, fmtMoneda, fmtFecha, fmtFechaHora, fmtMiles, parseMonto, hoyISO, toast, confirmar2, modal, cerrarModal, descargar, cargarScript, cabecera, ICONOS } from "../ui.js";

const PESTANAS = [
  { id: "proyectos", nombre: "Proyectos" },
  { id: "proveedores", nombre: "Proveedores" },
  { id: "cuentas", nombre: "Cuentas y categorías" },
  { id: "impuestos", nombre: "Impuestos e IA" },
  { id: "datos", nombre: "Datos y respaldo" }
];

let editandoProyecto = false;
export const fija = () => editandoProyecto;

export function render(el, params) {
  const tab = PESTANAS.some(t => t.id === params[0]) ? params[0] : "proyectos";
  editandoProyecto = false;
  el.innerHTML = cabecera("", "Ajustes", "Lo que se cambia acá vale para los cuatro socios.") +
    `<nav class="pestanas">${PESTANAS.map(t => `<a href="#ajustes/${t.id}" class="${t.id === tab ? "activo" : ""}">${t.nombre}</a>`).join("")}</nav><div id="aj"></div>`;
  const cont = $("#aj", el);
  if (tab === "proyectos") return params[1] ? formProyecto(cont, params[1]) : listaProyectos(cont);
  if (tab === "proveedores") return proveedores(cont);
  if (tab === "cuentas") return cuentas(cont);
  if (tab === "impuestos") return impuestosIA(cont);
  return datos(cont);
}

/* =================== PROYECTOS =================== */
function listaProyectos(cont) {
  const ps = M.proyectosOrdenados();
  cont.innerHTML = `<section class="panel"><div class="panel-cab"><div><h2>Proyectos</h2><p class="panel-sub">Cada proyecto tiene su bolsillo, su contrato y sus ítems de cotización.</p></div><a class="btn btn-pri" href="#ajustes/proyectos/nuevo">Nuevo proyecto</a></div>
    ${ps.length ? `<div class="tabla-env"><table class="tabla"><thead><tr><th>Proyecto</th><th class="ocultar-movil">Cliente</th><th>Estado</th><th class="n">Contrato</th><th class="n ocultar-movil">Ítems</th></tr></thead><tbody>
    ${ps.map(p => `<tr class="clic" data-id="${esc(p.id)}"><td><b>${esc(p.nombre)}</b><small class="mute" style="display:block">${esc(p.codigo || "")}</small></td><td class="ocultar-movil">${esc(p.cliente || "—")}</td>
      <td><span class="tag${p.estado === "activo" ? " tag-ok" : ""}">${esc((M.ESTADOS_PROYECTO.find(e => e.id === p.estado) || {}).nombre || "—")}</span></td>
      <td class="n">${fmtMoneda(M.montoContrato(p), p.moneda)}</td><td class="n ocultar-movil">${(p.items || []).length}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="vacio"><b>No hay proyectos</b>Creá el primero.</div>`}</section>`;
  $$("tr[data-id]", cont).forEach(tr => tr.addEventListener("click", () => app.ir("ajustes/proyectos/" + encodeURIComponent(tr.dataset.id))));
}

function formProyecto(cont, id) {
  const nuevo = id === "nuevo";
  const p0 = nuevo ? null : M.proyecto(id);
  if (!nuevo && !p0) { cont.innerHTML = `<div class="panel vacio"><b>Proyecto no encontrado</b><a href="#ajustes/proyectos">Volver</a></div>`; return; }
  const p = p0 ? JSON.parse(JSON.stringify(p0)) : {
    nombre: "", codigo: "", cliente: "", cuitCliente: "", ubicacion: "", tipoObra: "", estado: "cotizacion", moneda: "USD",
    montoContrato: 0, anticipo: 0, anticipoCuotas: 0, alicuotaIVA: 21, retenciones: { gan: 0, iibb: 0, iva: 0 }, fondoReparoPct: 0, plazoPago: 15, inicio: "", finPrevisto: "",
    participacion: Object.fromEntries(SOCIOS.map(s => [s.id, 100 / SOCIOS.length])), items: [], notas: ""
  };
  let moneda = p.moneda === "ARS" ? "ARS" : "USD";
  const nMov = p0 ? S.movimientos.filter(m => m.bolsillo === p0.id || m.destino === p0.id).length : 0;

  cont.innerHTML = `<form class="form" id="fp" novalidate>
    <section class="panel form">
      <div class="panel-cab" style="margin:0"><div><h2>${nuevo ? "Nuevo proyecto" : esc(p.nombre)}</h2><p class="panel-sub">Datos generales y del contrato.</p></div><a class="btn btn-fant btn-chico" href="#ajustes/proyectos">Volver</a></div>
      <div class="fila">
        <div class="campo"><label for="p-nombre">Nombre</label><input id="p-nombre" value="${esc(p.nombre)}" required></div>
        <div class="campo"><label for="p-codigo">Código <span class="opc">(opcional)</span></label><input id="p-codigo" value="${esc(p.codigo)}" placeholder="MICA-XX"></div>
        <div class="campo"><label for="p-estado">Estado</label><select id="p-estado"${p.estado === "cerrado" ? " disabled" : ""}>${M.ESTADOS_PROYECTO.map(e => `<option value="${e.id}"${e.id === p.estado ? " selected" : ""}${e.id === "cerrado" && p.estado !== "cerrado" ? " disabled" : ""}>${e.nombre}</option>`).join("")}</select>
          <div class="hint">${p.estado === "cerrado" ? "Cerrado. Se reabre desde Cierre de proyecto." : "Se cierra desde Proyecto → Cierre de proyecto."}</div></div>
      </div>
      <div class="fila">
        <div class="campo"><label for="p-cliente">Cliente</label><input id="p-cliente" value="${esc(p.cliente)}"></div>
        <div class="campo"><label for="p-cuit">CUIT del cliente <span class="opc">(opcional)</span></label><input id="p-cuit" value="${esc(p.cuitCliente)}"></div>
        <div class="campo"><label for="p-ubic">Ubicación</label><input id="p-ubic" value="${esc(p.ubicacion)}"></div>
      </div>
      <div class="campo"><label for="p-tipo">Tipo de obra o servicio <span class="opc">(para la base de costos)</span></label><input id="p-tipo" value="${esc(p.tipoObra || "")}"></div>
      <div class="bloque">
        <div class="bloque-tit">Contrato</div>
        <div class="fila">
          <div class="campo"><span class="rotulo">Moneda del contrato</span><div class="seg seg-chico" id="p-moneda"><button type="button" data-m="USD">Dólares</button><button type="button" data-m="ARS">Pesos</button></div></div>
          <div class="campo"><label for="p-monto">Monto del contrato <span class="opc">(vacío = suma de ítems)</span></label><input id="p-monto" inputmode="decimal" value="${p.montoContrato ? fmtMiles(p.montoContrato) : ""}" placeholder="${(p.items || []).length ? fmtMiles(M.montoContrato(Object.assign({}, p, { montoContrato: 0 }))) : "0"}"></div>
          <div class="campo"><label for="p-anticipo">Anticipo</label><input id="p-anticipo" inputmode="decimal" value="${p.anticipo ? fmtMiles(p.anticipo) : ""}"></div>
          <div class="campo"><label for="p-cuotas">Amortización del anticipo</label><select id="p-cuotas"><option value="0">Proporcional a cada certificado</option>${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(k => `<option value="${k}"${Number(p.anticipoCuotas) === k ? " selected" : ""}>En ${k} certificado${k > 1 ? "s" : ""} iguales</option>`).join("")}</select></div>
        </div>
        <div class="fila">
          <div class="campo"><label for="p-fondo">Fondo de reparo (%)</label><input id="p-fondo" inputmode="decimal" value="${p.fondoReparoPct ? String(p.fondoReparoPct).replace(".", ",") : ""}" placeholder="0"></div>
          <div class="campo"><label for="p-plazo">Plazo de pago (días)</label><input id="p-plazo" type="number" min="0" value="${esc(p.plazoPago ?? 15)}"></div>
          <div class="campo"><label for="p-inicio">Inicio</label><input id="p-inicio" type="date" value="${esc(p.inicio || "")}"></div>
          <div class="campo"><label for="p-fin">Fin previsto</label><input id="p-fin" type="date" value="${esc(p.finPrevisto || "")}"></div>
        </div>
        <div class="fila">
          <div class="campo"><label for="p-iva">IVA de las facturas (%)</label><input id="p-iva" inputmode="decimal" value="${String(p.alicuotaIVA ?? 21).replace(".", ",")}"></div>
          <div class="campo"><label for="p-ret-gan">Retención de Ganancias (% del neto)</label><input id="p-ret-gan" inputmode="decimal" value="${String((p.retenciones || {}).gan || "").replace(".", ",")}" placeholder="0"></div>
          <div class="campo"><label for="p-ret-iibb">Retención de IIBB (% del neto)</label><input id="p-ret-iibb" inputmode="decimal" value="${String((p.retenciones || {}).iibb || "").replace(".", ",")}" placeholder="0"></div>
          <div class="campo"><label for="p-ret-iva">Retención de IVA (% del IVA)</label><input id="p-ret-iva" inputmode="decimal" value="${String((p.retenciones || {}).iva || "").replace(".", ",")}" placeholder="0"></div>
        </div>
        <p class="hint" style="margin:0">Las retenciones habituales del cliente se proponen solas al registrar cada cobro, y se pueden corregir.</p>
      </div>
      <div class="bloque">
        <div class="bloque-tit">Participación de los socios</div>
        <div class="fila fila-movil-2">${SOCIOS.map(s => `<div class="campo"><label for="p-part-${s.id}">${esc(s.nombre)} (%)</label><input id="p-part-${s.id}" data-part="${s.id}" inputmode="decimal" value="${String(Number((p.participacion || {})[s.id]) || 0).replace(".", ",")}"></div>`).join("")}</div>
        <div class="hint" id="p-part-suma"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-cab" style="margin:0"><div><h2>Ítems y presupuesto</h2><p class="panel-sub">${nuevo ? "Después de crear el proyecto, cargá o importá sus ítems en Contrato y presupuesto." : `${(p.items || []).length} ítems cargados. Los ítems, sus costos cotizados, la ventana de ejecución y el avance se manejan en Contrato y presupuesto.`}</p></div>
      ${nuevo ? "" : `<a class="btn btn-sec btn-chico" href="#presupuesto" data-ir-presupuesto>Abrir</a>`}</div>
    </section>

    <section class="panel form">
      <div class="campo"><label for="p-notas">Notas <span class="opc">(opcional)</span></label><textarea id="p-notas" rows="3">${esc(p.notas || "")}</textarea></div>
      <div class="form-pie">
        <button type="submit" class="btn btn-pri">${nuevo ? "Crear proyecto" : "Guardar cambios"}</button>
        <a class="btn btn-sec" href="#ajustes/proyectos">Cancelar</a>
        ${!nuevo ? `<button type="button" class="btn btn-peligro der" id="p-borrar">${ICONOS.borrar}Borrar proyecto</button>` : ""}
      </div>
    </section>
  </form>`;

  const f = $("#fp", cont);
  f.addEventListener("input", () => { editandoProyecto = true; });

  const pintarMoneda = () => $$("#p-moneda button", f).forEach(b => b.classList.toggle("activo", b.dataset.m === moneda));
  $$("#p-moneda button", f).forEach(b => b.addEventListener("click", () => { moneda = b.dataset.m; editandoProyecto = true; pintarMoneda(); }));
  const irP = $("[data-ir-presupuesto]", cont);
  if (irP) irP.addEventListener("click", e => { e.preventDefault(); app.ctx = { tipo: "proyecto", id: p.id }; try { localStorage.setItem("mica_ctx", "p:" + p.id); } catch (e2) { /* nada */ } $$(".sel-ctx").forEach(x => { x.value = "p:" + p.id; }); app.ir("presupuesto"); });
  pintarMoneda();

  const sumaPart = () => {
    const s = $$("[data-part]", f).reduce((a, i) => a + (parseMonto(i.value) || 0), 0);
    const h = $("#p-part-suma", f);
    h.textContent = Math.abs(s - 100) < 0.01 ? "Suma 100%." : `Suma ${String(Math.round(s * 100) / 100).replace(".", ",")}%: tiene que dar 100%.`;
    h.className = "hint" + (Math.abs(s - 100) < 0.01 ? "" : " warn");
    return s;
  };
  $$("[data-part]", f).forEach(i => i.addEventListener("input", sumaPart));
  sumaPart();

  f.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") e.preventDefault(); });
  f.addEventListener("submit", e => {
    e.preventDefault();
    const nombre = $("#p-nombre", f).value.trim();
    if (!nombre) { $("#p-nombre", f).focus(); return toast("Poné el nombre del proyecto.", "error"); }
    if (S.proyectos.some(x => x.id !== p.id && x.nombre.trim().toLowerCase() === nombre.toLowerCase())) return toast("Ya hay un proyecto con ese nombre.", "error");
    if (Math.abs(sumaPart() - 100) >= 0.01) return toast("La participación de los socios tiene que sumar 100%.", "error");
    const montoTxt = $("#p-monto", f).value.trim();
    // Se parte de la versión guardada más reciente, así no se pisan cambios hechos en otra pantalla (ítems, línea base).
    const base = p0 ? JSON.parse(JSON.stringify(M.proyecto(p0.id) || p)) : p;
    const d = Object.assign(base, {
      nombre, codigo: $("#p-codigo", f).value.trim(),
      // El cierre se hace solo desde Cierre de proyecto, que liquida y pasa los costos a la base.
      estado: base.estado === "cerrado" ? "cerrado" : ($("#p-estado", f).value === "cerrado" ? (base.estado || "activo") : $("#p-estado", f).value),
      cliente: $("#p-cliente", f).value.trim(), cuitCliente: $("#p-cuit", f).value.trim(), ubicacion: $("#p-ubic", f).value.trim(),
      tipoObra: $("#p-tipo", f).value.trim(), moneda,
      montoContrato: montoTxt ? (parseMonto(montoTxt) || 0) : 0,
      anticipo: parseMonto($("#p-anticipo", f).value) || 0,
      anticipoCuotas: Number($("#p-cuotas", f).value) || 0,
      alicuotaIVA: isNaN(parseMonto($("#p-iva", f).value)) ? 21 : parseMonto($("#p-iva", f).value),
      retenciones: { gan: parseMonto($("#p-ret-gan", f).value) || 0, iibb: parseMonto($("#p-ret-iibb", f).value) || 0, iva: parseMonto($("#p-ret-iva", f).value) || 0 },
      fondoReparoPct: parseMonto($("#p-fondo", f).value) || 0,
      plazoPago: Number($("#p-plazo", f).value) || 0,
      inicio: $("#p-inicio", f).value, finPrevisto: $("#p-fin", f).value,
      participacion: Object.fromEntries($$("[data-part]", f).map(i => [i.dataset.part, parseMonto(i.value) || 0])),
      notas: $("#p-notas", f).value.trim()
    });
    if (nuevo) { d.creadoPor = app.usuario.socio; d.creadoEl = new Date().toISOString(); }
    else d.modificadoPor = app.usuario.socio;
    const g = guardar("proyectos", d);
    editandoProyecto = false;
    toast(nuevo ? "Proyecto creado" : "Proyecto guardado");
    if (nuevo) {
      app.ctx = { tipo: "proyecto", id: g.id }; try { localStorage.setItem("mica_ctx", "p:" + g.id); } catch (e2) { /* nada */ }
      app.ir("presupuesto");
    } else app.ir("ajustes/proyectos");
  });

  const bb = $("#p-borrar", f);
  if (bb) bb.addEventListener("click", e => {
    if (nMov) return toast(`No se puede borrar: tiene ${nMov} movimientos. Si terminó, marcalo como «Cerrado».`, "error");
    confirmar2(e.currentTarget, () => {
      mandarAPapelera("proyectos", p0, app.usuario.socio);
      editandoProyecto = false;
      toast("Proyecto enviado a la papelera");
      app.ir("ajustes/proyectos");
    }, "Tocá otra vez para borrar");
  });
}

/* =================== PROVEEDORES =================== */
function proveedores(cont) {
  const uso = {};
  S.movimientos.forEach(m => { if (M.esCosto(m) && m.proveedor) { const k = m.proveedor.toLowerCase(); uso[k] = uso[k] || { n: 0, usd: 0 }; uso[k].n++; uso[k].usd += M.netoUsd(m); } });
  const lista = S.proveedores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  cont.innerHTML = `<section class="panel"><div class="panel-cab"><div><h2>Proveedores</h2><p class="panel-sub">Se agregan solos al cargar un gasto con un proveedor nuevo. Si cambiás un nombre, se corrige en todos los gastos.</p></div><button class="btn btn-pri" id="pv-nuevo">Nuevo proveedor</button></div>
    <div class="filtros"><div class="buscar">${ICONOS.buscar}<input class="input" id="pv-buscar" type="search" placeholder="Buscar proveedor" aria-label="Buscar proveedor"></div></div>
    ${lista.length ? `<div class="tabla-env"><table class="tabla"><thead><tr><th>Proveedor</th><th class="ocultar-movil">CUIT</th><th class="ocultar-movil">Rubro</th><th class="n">Gastos</th><th class="n">Total sin IVA</th></tr></thead><tbody>
    ${lista.map(p => { const u = uso[p.nombre.toLowerCase()] || { n: 0, usd: 0 }; return `<tr class="clic" data-id="${esc(p.id)}" data-txt="${esc((p.nombre + " " + (p.cuit || "") + " " + (p.rubro || "")).toLowerCase())}"><td><b>${esc(p.nombre)}</b></td><td class="ocultar-movil">${esc(p.cuit || "—")}</td><td class="ocultar-movil">${esc(p.rubro || "—")}</td><td class="n">${u.n}</td><td class="n">${num(u.usd, fmtUSD)}</td></tr>`; }).join("")}
    </tbody></table></div>` : `<div class="vacio"><b>Sin proveedores</b>Aparecen al cargar gastos.</div>`}</section>`;
  $("#pv-nuevo", cont).addEventListener("click", () => editarProveedor(null));
  $$("tr[data-id]", cont).forEach(tr => tr.addEventListener("click", () => editarProveedor(S.proveedores.find(p => p.id === tr.dataset.id))));
  $("#pv-buscar", cont).addEventListener("input", e => { const t = e.target.value.toLowerCase(); $$("tr[data-txt]", cont).forEach(tr => { tr.hidden = !tr.dataset.txt.includes(t); }); });
}

function editarProveedor(p0) {
  const p = p0 ? Object.assign({}, p0) : { nombre: "", cuit: "", rubro: "", notas: "" };
  const n = p0 ? S.movimientos.filter(m => m.proveedor && m.proveedor.toLowerCase() === p0.nombre.toLowerCase()).length : 0;
  const md = modal(p0 ? "Editar proveedor" : "Nuevo proveedor", `<form class="form" id="fpv">
    <div class="campo"><label for="pv-nombre">Nombre o razón social</label><input id="pv-nombre" value="${esc(p.nombre)}"></div>
    <div class="fila fila-2"><div class="campo"><label for="pv-cuit">CUIT <span class="opc">(opcional)</span></label><input id="pv-cuit" value="${esc(p.cuit || "")}"></div>
    <div class="campo"><label for="pv-rubro">Rubro <span class="opc">(opcional)</span></label><input id="pv-rubro" value="${esc(p.rubro || "")}"></div></div>
    <div class="campo"><label for="pv-notas">Notas <span class="opc">(opcional)</span></label><textarea id="pv-notas" rows="2">${esc(p.notas || "")}</textarea></div>
    ${n ? `<p class="chico mute" style="margin:0">Tiene ${n} gasto${n > 1 ? "s" : ""} cargado${n > 1 ? "s" : ""}. Si cambiás el nombre, se corrige en todos.</p>` : ""}
    <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button>
    ${p0 ? `<button class="btn btn-peligro der" type="button" id="pv-borrar">${ICONOS.borrar}Borrar</button>` : ""}</div></form>`);
  $("#fpv", md).addEventListener("submit", e => {
    e.preventDefault();
    const nombre = $("#pv-nombre", md).value.trim();
    if (!nombre) return toast("Poné el nombre.", "error");
    if (S.proveedores.some(x => x.id !== p.id && x.nombre.toLowerCase() === nombre.toLowerCase())) return toast("Ya existe un proveedor con ese nombre.", "error");
    const viejo = p0 ? p0.nombre : "";
    Object.assign(p, { nombre, cuit: $("#pv-cuit", md).value.trim(), rubro: $("#pv-rubro", md).value.trim(), notas: $("#pv-notas", md).value.trim() });
    guardar("proveedores", p);
    if (viejo && viejo !== nombre) {
      S.movimientos.filter(m => m.proveedor && m.proveedor.toLowerCase() === viejo.toLowerCase()).forEach(m => guardar("movimientos", Object.assign({}, m, { proveedor: nombre })));
    }
    cerrarModal();
    toast("Proveedor guardado");
  });
  const b = $("#pv-borrar", md);
  if (b) b.addEventListener("click", e => confirmar2(e.currentTarget, () => {
    mandarAPapelera("proveedores", p0, app.usuario.socio);
    cerrarModal(); toast("Proveedor enviado a la papelera. Los gastos conservan el nombre.");
  }));
}

/* =================== CUENTAS Y CATEGORÍAS =================== */
const LISTAS = [
  { k: "categoriasEstructura", bol: "ESTRUCTURA", titulo: "Gastos de estructura de MICA", sub: "Bolsillo MICA · Estructura." },
  { k: "categoriasMagna", bol: "MAGNA", titulo: "Gastos de Magna", sub: "Bolsillo Magna · Julio. Los recuperables se le reintegran a Julio." },
  { k: "categoriasReserva", bol: "RESERVA", titulo: "Pagos de impuestos", sub: "Bolsillo Magna · Reserva fiscal." }
];

function cuentas(cont) {
  const g = S.config.general || {};
  cont.innerHTML = `<section class="panel"><div class="panel-cab"><div><h2>Cuentas</h2><p class="panel-sub">Magna opera con una sola cuenta bancaria. Si algún día se usa efectivo u otra cuenta, se agrega acá y aparece para elegir al cargar.</p></div><button class="btn btn-sec" id="cu-nueva">Agregar cuenta</button></div>
    <div class="tabla-env"><table class="tabla"><thead><tr><th>Cuenta</th><th class="ocultar-movil">Banco</th><th class="n">Saldo</th></tr></thead><tbody>
    ${S.cuentas.map(c => `<tr class="clic" data-id="${esc(c.id)}"><td><b>${esc(c.nombre)}</b><small class="mute" style="display:block">${c.tipo === "efectivo" ? "Efectivo" : "Banco"}</small></td><td class="ocultar-movil">${esc(c.banco || "—")}</td><td class="n">${num(M.saldoCuenta(c.id), fmtARS)}</td></tr>`).join("")}
    </tbody></table></div></section>
    <div class="grid-3">${LISTAS.map(L => `<section class="panel" data-lista="${L.k}"><div class="panel-cab"><div><h2>${L.titulo}</h2><p class="panel-sub">${L.sub}</p></div></div>
      <div class="form" style="gap:8px" data-filas>${(g[L.k] || []).map(c => filaCat(c)).join("")}</div>
      <div class="form-pie" style="margin-top:12px"><button class="btn btn-sec btn-chico" data-add>Agregar</button><button class="btn btn-pri btn-chico" data-guardar>Guardar</button></div></section>`).join("")}</div>`;
  $("#cu-nueva", cont).addEventListener("click", () => editarCuenta(null));
  $$("tr[data-id]", cont).forEach(tr => tr.addEventListener("click", () => editarCuenta(S.cuentas.find(c => c.id === tr.dataset.id))));
  $$("[data-lista]", cont).forEach(sec => {
    const L = LISTAS.find(x => x.k === sec.dataset.lista);
    const filas = $("[data-filas]", sec);
    const enlazar = () => $$("[data-quitar]", filas).forEach(b => { b.onclick = () => { b.closest(".con-boton").remove(); editandoProyecto = true; }; });
    enlazar();
    filas.addEventListener("input", () => { editandoProyecto = true; });
    $("[data-add]", sec).addEventListener("click", () => { filas.insertAdjacentHTML("beforeend", filaCat("")); enlazar(); $("input", filas.lastElementChild).focus(); });
    $("[data-guardar]", sec).addEventListener("click", () => {
      const nuevas = [];
      $$(".con-boton", filas).forEach(r => {
        const inp = $("input", r);
        const v = inp.value.trim();
        if (!v || nuevas.includes(v)) return;
        nuevas.push(v);
        const orig = inp.dataset.orig;
        // Renombre en cascada: los gastos ya cargados pasan al nombre nuevo.
        if (orig && orig !== v) S.movimientos.filter(m => m.bolsillo === L.bol && m.imputacion === "c:" + orig).forEach(m => guardar("movimientos", Object.assign({}, m, { imputacion: "c:" + v })));
      });
      guardarConfig("general", { [L.k]: nuevas });
      editandoProyecto = false;
      toast("Categorías guardadas");
    });
  });
}
const filaCat = c => `<div class="con-boton"><input class="input" value="${esc(c)}" data-orig="${esc(c)}" aria-label="Categoría"><button type="button" class="btn-icono" data-quitar title="Quitar" aria-label="Quitar">${ICONOS.cerrar}</button></div>`;

function editarCuenta(c0) {
  const c = c0 ? Object.assign({}, c0) : { nombre: "", banco: "", tipo: "banco", notas: "" };
  const usada = c0 && S.movimientos.some(m => (m.cuenta || "c_magna") === c0.id);
  const md = modal(c0 ? "Editar cuenta" : "Nueva cuenta", `<form class="form" id="fcu">
    <div class="campo"><label for="cu-nombre">Nombre</label><input id="cu-nombre" value="${esc(c.nombre)}"></div>
    <div class="fila fila-2"><div class="campo"><label for="cu-banco">Banco <span class="opc">(opcional)</span></label><input id="cu-banco" value="${esc(c.banco || "")}"></div>
    <div class="campo"><label for="cu-tipo">Tipo</label><select id="cu-tipo"><option value="banco"${c.tipo === "banco" ? " selected" : ""}>Banco</option><option value="efectivo"${c.tipo === "efectivo" ? " selected" : ""}>Efectivo</option></select></div></div>
    <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" data-cerrar>Cancelar</button>
    ${c0 && !usada && S.cuentas.length > 1 ? `<button class="btn btn-peligro der" type="button" id="cu-borrar">${ICONOS.borrar}Borrar</button>` : ""}</div></form>`);
  $("#fcu", md).addEventListener("submit", e => {
    e.preventDefault();
    const nombre = $("#cu-nombre", md).value.trim();
    if (!nombre) return toast("Poné el nombre.", "error");
    guardar("cuentas", Object.assign(c, { nombre, banco: $("#cu-banco", md).value.trim(), tipo: $("#cu-tipo", md).value }));
    cerrarModal(); toast("Cuenta guardada");
  });
  const b = $("#cu-borrar", md);
  if (b) b.addEventListener("click", e => confirmar2(e.currentTarget, () => { mandarAPapelera("cuentas", c0, app.usuario.socio); cerrarModal(); toast("Cuenta enviada a la papelera"); }));
}

/* =================== IMPUESTOS E IA =================== */
function impuestosIA(cont) {
  const t = M.parametrosImpuestos();
  const ia = IA.config();
  const uso = IA.usoDelMes();
  const v = x => String(x ?? "").replace(".", ",");
  cont.innerHTML = `<div class="grid-2" style="margin-top:0">
    <section class="panel"><div class="panel-cab"><div><h2>Tasas de impuestos</h2><p class="panel-sub">Valen para toda Magna. Son estimaciones para reservar y ver el resultado neto: conviene validarlas con la contadora.</p></div></div>
      <form class="form" id="fimp" novalidate>
        <div class="fila fila-movil-2">
          <div class="campo"><label for="t-iibb">Ingresos Brutos (% de lo facturado neto)</label><input id="t-iibb" inputmode="decimal" value="${v(t.iibb)}"></div>
          <div class="campo"><label for="t-gan">Ganancias (% del resultado impositivo)</label><input id="t-gan" inputmode="decimal" value="${v(t.ganancias)}"></div>
        </div>
        <div class="fila fila-movil-2">
          <div class="campo"><label for="t-chc">Impuesto al cheque, créditos (%)</label><input id="t-chc" inputmode="decimal" value="${v(t.chequeCredito)}"></div>
          <div class="campo"><label for="t-chd">Impuesto al cheque, débitos (%)</label><input id="t-chd" inputmode="decimal" value="${v(t.chequeDebito)}"></div>
        </div>
        <div class="campo"><label for="t-chp">Parte del impuesto al cheque que se computa contra Ganancias (%)</label><input id="t-chp" inputmode="decimal" value="${v(t.chequeComputable)}"></div>
        <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar tasas</button></div>
      </form></section>
    <section class="panel"><div class="panel-cab"><div><h2>Asistente con IA</h2><p class="panel-sub">Lee facturas, entiende gastos escritos o dictados, arma el informe del cierre de mes y responde preguntas. Usa la API de Anthropic con una clave de MICA.</p></div></div>
      <form class="form" id="fia" novalidate>
        <div class="campo"><label for="ia-key">Clave de API de Anthropic</label><input id="ia-key" type="password" autocomplete="off" value="${esc(ia.key || "")}" placeholder="sk-ant-…"></div>
        <div class="campo"><label for="ia-modelo">Modelo</label><select id="ia-modelo">${IA.MODELOS.map(m => `<option value="${m.id}"${m.id === ia.modelo ? " selected" : ""}>${esc(m.nombre)} · ${esc(m.detalle)}</option>`).join("")}</select></div>
        <p class="hint" style="margin:0">La clave se guarda solo en este dispositivo, nunca en la base de datos compartida. Cada socio que quiera usar la IA la carga en su celular o computadora. Se crea en console.anthropic.com → API Keys, con crédito cargado en Billing.</p>
        ${uso.n ? `<p class="hint" style="margin:0">Este mes, en este dispositivo: ${uso.n} consulta${uso.n === 1 ? "" : "s"}, unos ${fmtUSD(uso.usd, 2)} de costo estimado.</p>` : ""}
        <div class="form-pie"><button class="btn btn-pri" type="submit">Guardar</button><button class="btn btn-sec" type="button" id="ia-probar">Probar la clave</button>${ia.key ? `<button class="btn btn-peligro der" type="button" id="ia-borrar">Quitar la clave</button>` : ""}</div>
        <div id="ia-estado"></div>
      </form></section>
  </div>`;
  const leerT = id => { const x = parseMonto($(id, cont).value); return isNaN(x) ? null : x; };
  $("#fimp", cont).addEventListener("submit", e => {
    e.preventDefault();
    const d = { iibb: leerT("#t-iibb"), ganancias: leerT("#t-gan"), chequeCredito: leerT("#t-chc"), chequeDebito: leerT("#t-chd"), chequeComputable: leerT("#t-chp") };
    if (Object.values(d).some(x => x == null || x < 0 || x > 100)) return toast("Revisá las tasas: tienen que ser porcentajes entre 0 y 100.", "error");
    guardarConfig("general", { impuestos: d });
    toast("Tasas guardadas");
  });
  $("#fia", cont).addEventListener("submit", e => {
    e.preventDefault();
    IA.guardarConfig({ key: $("#ia-key", cont).value.trim(), modelo: $("#ia-modelo", cont).value });
    toast(IA.config().key ? "Clave guardada en este dispositivo" : "Sin clave: la IA queda desactivada");
  });
  $("#ia-probar", cont).addEventListener("click", async () => {
    IA.guardarConfig({ key: $("#ia-key", cont).value.trim(), modelo: $("#ia-modelo", cont).value });
    const est = $("#ia-estado", cont);
    est.innerHTML = `<p class="hint">Probando…</p>`;
    try { const t2 = await IA.texto([{ role: "user", content: "Respondé solo: OK" }], { maxTokens: 10 }); est.innerHTML = `<p class="hint">Funciona. Respuesta: ${esc(t2.slice(0, 40))}</p>`; }
    catch (err) { est.innerHTML = `<div class="aviso" style="margin:0">${ICONOS.alerta}<div>${esc(err.message)}</div></div>`; }
  });
  const bq = $("#ia-borrar", cont);
  if (bq) bq.addEventListener("click", e => confirmar2(e.currentTarget, () => { IA.guardarConfig({ key: "" }); app.refrescar(); toast("Clave quitada de este dispositivo"); }));
}

/* =================== DATOS =================== */
function datos(cont) {
  const local = estado.modo === "local";
  const pap = S.papelera.slice().sort((a, b) => String(b.borradoEl).localeCompare(String(a.borradoEl)));
  const nDemo = S.movimientos.filter(m => m.demo).length;
  const desc = t => {
    const d = t.datos || {};
    if (t.col === "movimientos") return `${M.TIPOS[d.tipo] || "Movimiento"} · ${fmtFecha(d.fecha)} · ${M.tituloMov(d)} · ${fmtARS(d.montoARS)}`;
    if (t.col === "proyectos") return "Proyecto · " + (d.nombre || "");
    if (t.col === "proveedores") return "Proveedor · " + (d.nombre || "");
    if (t.col === "cuentas") return "Cuenta · " + (d.nombre || "");
    if (t.col === "certificados") return "Certificados · " + C.tituloDoc(d) + (d.periodo ? " · " + d.periodo : "");
    return t.col;
  };
  cont.innerHTML = `
  <div class="grid-2" style="margin-top:0">
    <section class="panel"><div class="panel-cab"><div><h2>Exportar</h2><p class="panel-sub">Un Excel con movimientos, proyectos, ítems con costos cotizados, avance físico, certificados y cobranza, impuestos, socios, préstamos, honorarios, proveedores, saldos por bolsillo, cierres de proyecto y base de costos.</p></div></div>
      <button class="btn btn-sec" id="d-excel">${ICONOS.descargar}Descargar Excel</button></section>
    <section class="panel"><div class="panel-cab"><div><h2>Respaldo</h2><p class="panel-sub">Copia completa en un archivo. Conviene bajarla una vez por mes y guardarla en el Drive de MICA.</p></div></div>
      <div class="form-pie"><button class="btn btn-sec" id="d-json">${ICONOS.descargar}Descargar respaldo</button>
      <label class="btn btn-fant" for="d-archivo">${ICONOS.subir}Restaurar un respaldo</label><input type="file" id="d-archivo" accept="application/json,.json" hidden></div></section>
  </div>

  <section class="panel" style="margin-top:16px"><div class="panel-cab"><div><h2>Papelera</h2><p class="panel-sub">Lo borrado queda acá con quién y cuándo lo borró, y se puede restaurar.</p></div>${pap.length ? `<button class="btn btn-peligro btn-chico" id="d-vaciar">Vaciar papelera</button>` : ""}</div>
    ${pap.length ? `<div class="tabla-env"><table class="tabla"><tbody>${pap.map(t => `<tr><td class="desc">${esc(desc(t))}<small>Borrado por ${esc(M.socioNombre(t.por) || t.por || "—")} el ${fmtFechaHora(t.borradoEl)}</small></td><td class="n"><button class="btn btn-sec btn-chico" data-rest="${esc(t.id)}">${ICONOS.restaurar}Restaurar</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="vacio">La papelera está vacía.</div>`}
  </section>

  <div class="grid-2">
    <section class="panel"><div class="panel-cab"><div><h2>Usuarios autorizados</h2><p class="panel-sub">Los cuatro socios ven y editan todo. Para cambiar la lista hay que editar <code>js/config.js</code> y <code>firestore.rules</code>.</p></div></div>
      <div class="tabla-env"><table class="tabla"><tbody>${USUARIOS.map(u => `<tr><td><b>${esc(M.socioNombre(u.socio))}</b></td><td>${esc(u.email)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="panel"><div class="panel-cab"><div><h2>Dónde se guardan los datos</h2></div></div>
      ${local
        ? `<div class="aviso">${ICONOS.alerta}<div><b>Modo local.</b> Los datos están solo en este navegador. Para compartirlos entre los socios hay que configurar Firebase (ver LEEME.md).</div></div>
           <div class="form-pie">
             ${nDemo ? `<button class="btn btn-sec" id="d-sin-demo">Quitar datos de ejemplo (${nDemo})</button>` : `<button class="btn btn-sec" id="d-demo">Cargar datos de ejemplo</button>`}
             <button class="btn btn-peligro" id="d-reset">Borrar todo</button>
           </div>`
        : `<p style="margin:0">En la nube de Firebase, proyecto <b>${esc(FIREBASE.projectId)}</b>. Cada cambio se ve al instante en los otros dispositivos y queda disponible sin conexión.</p>`}
    </section>
  </div>`;

  $("#d-json", cont).addEventListener("click", () => {
    descargar(`MICA_respaldo_${hoyISO()}.json`, JSON.stringify(respaldo(), null, 1));
    toast("Respaldo descargado");
  });
  $("#d-archivo", cont).addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let d;
    try { d = JSON.parse(await file.text()); } catch (err) { return toast("El archivo no es un respaldo válido.", "error"); }
    if (!d || !Array.isArray(d.movimientos) || !Array.isArray(d.proyectos)) return toast("El archivo no es un respaldo de esta app.", "error");
    const md = modal("Restaurar respaldo", `<p style="margin-top:0">El respaldo es del <b>${fmtFechaHora(d.exportado)}</b> y tiene ${d.movimientos.length} movimientos y ${d.proyectos.length} proyectos.</p>
      <div class="aviso">${ICONOS.alerta}<div><b>Reemplaza todos los datos actuales</b> para los cuatro socios. Antes de seguir, bajá un respaldo de lo que hay ahora.</div></div>
      <div class="form-pie"><button class="btn btn-pri" id="r-ok">Reemplazar todo</button><button class="btn btn-sec" data-cerrar>Cancelar</button></div>`);
    $("#r-ok", md).addEventListener("click", ev => confirmar2(ev.currentTarget, async () => {
      try { await reemplazarTodo(d); cerrarModal(); toast("Respaldo restaurado"); app.refrescar(); }
      catch (err) { toast("No se pudo restaurar: " + err.message, "error"); }
    }, "Tocá otra vez para confirmar"));
  });
  $("#d-excel", cont).addEventListener("click", exportarExcel);
  $$("[data-rest]", cont).forEach(b => b.addEventListener("click", () => {
    const t = S.papelera.find(x => x.id === b.dataset.rest);
    if (t) { restaurar(t); toast("Restaurado"); }
  }));
  const vac = $("#d-vaciar", cont);
  if (vac) vac.addEventListener("click", e => confirmar2(e.currentTarget, () => { S.papelera.slice().forEach(t => borrar("papelera", t.id)); toast("Papelera vacía"); }, "Se borra para siempre"));
  const demo = $("#d-demo", cont);
  if (demo) demo.addEventListener("click", () => {
    cargarEjemplo();
    toast("Datos de ejemplo cargados en Tres Cruces, MICA y Magna");
  });
  const sin = $("#d-sin-demo", cont);
  if (sin) sin.addEventListener("click", () => {
    quitarEjemplo();
    toast("Datos de ejemplo quitados");
  });
  const reset = $("#d-reset", cont);
  if (reset) reset.addEventListener("click", e => confirmar2(e.currentTarget, () => { borrarLocal(); sembrarSiHaceFalta(); toast("Datos borrados. Quedó solo el proyecto inicial."); }, "Se borra todo: ¿seguro?"));
}

async function exportarExcel() {
  try {
    await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  } catch (e) { return toast("No se pudo cargar el generador de Excel. Revisá la conexión.", "error"); }
  const XLSX = window.XLSX;
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const movs = S.movimientos.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const hMov = movs.map(m => ({
    Fecha: m.fecha, Tipo: M.TIPOS[m.tipo], Clase: M.nombreClase(m.tipo, m.clase), Bolsillo: M.nombreBolsillo(m.bolsillo), Destino: m.tipo === "pase" ? M.nombreBolsillo(m.destino) : "",
    Proveedor: m.proveedor || "", Concepto: m.concepto || "", "Imputación": M.nombreImputacion(m), "Tipo de costo": m.tipoCosto || "",
    Comprobante: ({ A: "Factura A", B: "Factura B o C", S: "Sueldo, cargas o tasa", X: "Sin factura" })[m.fiscal] || "", "N° comprobante": m.comprobante || "",
    "Monto ARS": r2(m.montoARS), "IVA ARS": r2(m.ivaARS), "Neto ARS": r2(M.netoArs(m)), "Dólar MEP": r2(m.cotizacion), "Monto USD": r2(M.usd(m)), "Neto USD": r2(M.netoUsd(m)),
    "Ret. Ganancias": r2(m.retGan), "Ret. IIBB": r2(m.retIIBB), "Ret. IVA": r2(m.retIVA), "Ret. otras": r2(m.retOtras), "TC de pago": m.tcPago || "",
    Certificado: m.certificado ? (C.tituloDoc(S.certificados.find(c => c.id === m.certificado) || {}) || "") : "",
    Socio: M.socioNombre(m.socio), "Tasa %": m.tasa ?? "", Recuperable: m.recuperable ? "Sí" : "", Notas: m.notas || "", "Cargado por": M.socioNombre(m.creadoPor) || "", Id: m.id
  }));
  const hProy = M.proyectosOrdenados().map(p => { const r = M.resumenProyecto(p); return {
    Proyecto: p.nombre, "Código": p.codigo || "", Cliente: p.cliente || "", Estado: (M.ESTADOS_PROYECTO.find(e => e.id === p.estado) || {}).nombre || "", Moneda: p.moneda,
    Contrato: r2(r.contrato), Anticipo: r2(p.anticipo), "Cobrado USD": r2(r.ventasUsd), "Costos USD": r2(r.costosUsd), "Resultado USD": r2(r.resultadoUsd), "Saldo bolsillo ARS": r2(r.saldo.ars),
    ...Object.fromEntries(SOCIOS.map(s => ["% " + s.nombre, (p.participacion || {})[s.id] || 0]))
  }; });
  const hItems = [], hAvance = [];
  M.proyectosOrdenados().forEach(p => {
    const sg = P.seguimiento(p);
    sg.filas.forEach(x => { const it = x.item; hItems.push({
      Proyecto: p.nombre, Moneda: p.moneda, "Ítem": it.numero, "Descripción": it.descripcion, Rubro: it.rubro || "", Unidad: it.unidad, Cantidad: it.cantidad,
      "Precio unitario": r2(it.precioUnitario), Venta: r2(x.venta),
      "CU materiales": r2((it.costo || {}).mat), "CU mano de obra": r2((it.costo || {}).mo), "CU equipos": r2((it.costo || {}).eq), "CU subcontratos": r2((it.costo || {}).sub),
      "Costo unitario cotizado": r2(x.cuCot), "Costo cotizado": r2(x.cot), Desde: it.desde || "", Hasta: it.hasta || "",
      Ejecutado: r2(x.ejec), "Avance %": r2(x.avance * 100), "Costo real imputado": r2(x.real), "Costo unitario real": x.cuReal == null ? "" : r2(x.cuReal), "Proyectado al cierre": r2(x.proyectado)
    }); });
    S.avances.filter(a => a.proyecto === p.id).sort((a, b) => a.mes.localeCompare(b.mes)).forEach(a => Object.entries(a.cantidades || {}).forEach(([id, q]) => {
      const it = (p.items || []).find(x => x.id === id);
      hAvance.push({ Proyecto: p.nombre, Mes: a.mes, "Ítem": it ? it.numero : "(borrado)", "Descripción": it ? it.descripcion : "", Unidad: it ? it.unidad : "", Cantidad: q, "Cargado por": M.socioNombre(a.cargadoPor) || "" });
    }));
  });
  const hCert = [];
  M.proyectosOrdenados().forEach(p => C.docsDe(p.id).forEach(c => {
    const e = C.estadoDe(c, p), f = c.factura || {};
    hCert.push({
      Proyecto: p.nombre, Moneda: p.moneda, Documento: C.tituloDoc(c), "Período": c.periodo || "", "Emisión": c.fecha || "",
      Bruto: r2(e.imp.bruto), "Amortización anticipo": r2(e.imp.amort), "Fondo de reparo": r2(e.imp.fondo), Neto: r2(e.imp.neto), IVA: r2(e.imp.iva), Total: r2(e.imp.total),
      Factura: f.numero || "", "Fecha factura": f.fecha || "", "TC factura": f.tc || "", Vencimiento: e.vencimiento || "",
      Cobrado: r2(e.cancelado), Saldo: r2(e.saldo), "Retenciones ARS": r2(e.retenciones), "Diferencia de cambio USD": r2(e.difCambio),
      Estado: C.ESTADOS[e.estado].nombre + (e.vencido ? ` (vencida ${e.diasVencido} días)` : "")
    });
  }));
  const mica = M.resumenMica();
  const hSocios = [], hPrest = [], hHon = [];
  mica.proyectos.forEach(r => {
    const p = r.proyecto;
    M.cuentaSociosProyecto(p, r, r.asignadoUsd || 0).filas.forEach(f => hSocios.push({
      Proyecto: p.nombre, Socio: f.nombre, "Participación %": r2(f.pct * 100), "Aportes USD": r2(f.aportes), "Préstamos USD": r2(f.prestamos),
      "Honorarios USD": r2(f.honorarios), "Parte del resultado USD": r2(f.resultado), "Distribuido USD": r2(f.distribuido), "A favor USD": r2(f.aFavor)
    }));
    r.prestamos.forEach(g => g.tramos.forEach(t => hPrest.push({
      Proyecto: p.nombre, Prestamista: g.nombre, Fecha: t.fecha, "Capital ARS": r2(t.capitalArs), "Capital USD": r2(t.capital), "Tasa anual %": t.tasa,
      "Interés devengado USD": r2(t.devengado), "Saldo USD": r2(t.cap + t.int)
    })));
    r.honorarios.porAcuerdo.forEach(x => x.detalle.forEach(d => hHon.push({
      Proyecto: p.nombre, Socio: M.socioNombre(x.acuerdo.socio), Concepto: x.acuerdo.concepto || "", Modo: x.modo.nombre, Mes: d.mes, "Base USD": d.base == null ? "" : r2(d.base), "Honorario USD": r2(d.monto)
    })));
  });
  const hImp = mica.proyectos.map(r => {
    const x = r.impuestos, res = I.reservaProyecto(r.proyecto, r);
    return { Proyecto: r.proyecto.nombre, "Resultado antes de impuestos USD": r2(r.resultadoUsd), "IIBB USD": r2(x.iibbUsd), "Impuesto al cheque USD": r2(x.chequeUsd),
      "Después de IIBB y cheque USD": r2(r.resultadoDespuesIIBBUsd), "Ganancias USD": r2(x.gananciasCostoUsd), "Neto USD": r2(r.resultadoNetoUsd),
      "IVA a pagar ARS": r2(res.iva.saldo), "A reservar ARS": r2(res.aReservar), "Reservado ARS": r2(res.reservado), "Falta reservar ARS": r2(res.pendiente),
      "Ret. Ganancias ARS": r2(x.retGanArs), "Ret. IIBB ARS": r2(x.retIibbArs), "Ret. IVA ARS": r2(x.retIvaArs) };
  });
  mica.socios.forEach(sc => hSocios.push({ Proyecto: "TOTAL MICA", Socio: sc.nombre, "Participación %": "", "Aportes USD": r2(sc.aportes), "Préstamos USD": r2(sc.prestamos), "Honorarios USD": r2(sc.honorarios), "Parte del resultado USD": r2(sc.resultado), "Distribuido USD": r2(sc.distribuido), "A favor USD": r2(sc.aFavor) }));
  const hProv = S.proveedores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(p => ({ Proveedor: p.nombre, CUIT: p.cuit || "", Rubro: p.rubro || "", Notas: p.notas || "" }));
  const ORIG = { cierre: "Cierre del proyecto", manual: "Carga manual", importada: "Importada de Excel" };
  const hFichas = S.fichas.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.obra).localeCompare(String(b.obra))).map(f => ({
    Obra: f.obra, Cliente: f.cliente || "", "Tipo de obra": f.tipoObra || "", "Año": f.anio || "", Origen: ORIG[f.origen] || "", "Ítem": f.numero || "", Rubro: f.rubro || "",
    "Descripción": f.descripcion, Unidad: f.unidad || "", Cantidad: r2(f.cantidad),
    "Materiales USD/u": r2(f.real.mat), "Mano de obra USD/u": r2(f.real.mo), "Equipos USD/u": r2(f.real.eq), "Subcontratos USD/u": r2(f.real.sub), "Indirectos USD/u": r2(f.real.ind),
    "Costo del ítem USD/u": r2(f.real.item), "Gastos generales USD/u": r2(f.real.gg), "Costo total USD/u": r2(f.real.total), "Costo cotizado USD/u": r2(f.cot && f.cot.total),
    "Desvío %": f.desvioPct == null ? "" : r2(f.desvioPct * 100), "Precio de venta USD/u": r2(f.puVenta), "Margen %": f.margenPct == null ? "" : r2(f.margenPct * 100), Notas: f.notas || ""
  }));
  const hCierres = S.proyectos.filter(p => p.estado === "cerrado" && p.cierre).map(p => {
    const c = p.cierre, z = c.resumen || {};
    return { Proyecto: p.nombre, "Fecha de cierre": c.fecha, "Dólar de liquidación": r2(c.mep), "Cobrado USD": r2(z.ventasUsd), "Costos USD": r2(z.costosUsd),
      "Honorarios USD": r2(z.honorariosUsd), "Intereses USD": r2(z.interesesUsd), "Antes de impuestos USD": r2(z.resultadoUsd), "IIBB USD": r2(z.iibbUsd), "Cheque USD": r2(z.chequeUsd),
      "Ganancias USD": r2(z.gananciasUsd), "Neto de impuestos USD": r2(z.netoUsd), "Estructura USD": r2(z.estructuraUsd), "Diferencia de cambio USD": r2(z.difCambioUsd),
      "Resultado final USD": r2(z.finalUsd), "Margen final %": z.margenRealPct == null ? "" : r2(z.margenRealPct * 100), "Margen cotizado %": z.margenCotizadoPct == null ? "" : r2(z.margenCotizadoPct * 100),
      "Gastos generales %": z.ggPct == null ? "" : r2(z.ggPct * 100), "Destino del resultado": c.destino === "repartir" || !c.destino ? "Repartido" : "Reinvertido en " + M.nombreBolsillo(c.destino),
      "Cerrado por": M.socioNombre(c.cerradoPor) || "" };
  });
  const hBol = M.bolsillos().map(b => { const s = M.saldoBolsillo(b.id); return { Bolsillo: b.nombre, "Saldo ARS": r2(s.ars), "Saldo USD (histórico)": r2(s.usd) }; });
  const wb = XLSX.utils.book_new();
  const hoja = (filas, nombre, anchos) => {
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ "Sin datos": "" }]);
    if (anchos) ws["!cols"] = anchos.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };
  hoja(hMov, "Movimientos", [11, 10, 22, 26, 26, 24, 30, 34, 14, 14, 14, 14, 14, 14, 10, 12, 12, 10, 8, 12, 24, 12, 18]);
  hoja(hProy, "Proyectos", [22, 12, 26, 14, 8, 14, 12, 14, 14, 14, 16]);
  hoja(hItems, "Ítems", [20, 7, 6, 60, 24, 8, 10, 14, 14, 12, 12, 12, 12, 14, 14, 9, 9, 10, 9, 14, 14, 14]);
  hoja(hAvance, "Avance físico", [20, 9, 6, 60, 8, 10, 14]);
  hoja(hImp, "Impuestos", [20, 18, 12, 14, 18, 14, 12, 16, 16, 16, 16, 16, 14, 14]);
  hoja(hSocios, "Socios", [20, 12, 14, 14, 14, 14, 20, 14, 14]);
  hoja(hPrest, "Préstamos", [20, 24, 11, 16, 14, 12, 18, 14]);
  hoja(hHon, "Honorarios", [20, 12, 28, 30, 9, 12, 14]);
  hoja(hCert, "Certificados", [20, 7, 30, 9, 11, 12, 12, 12, 12, 12, 12, 16, 12, 10, 12, 12, 12, 14, 14, 26]);
  hoja(hBol, "Saldos por bolsillo", [30, 16, 20]);
  hoja(hProv, "Proveedores", [30, 16, 20, 30]);
  hoja(hCierres, "Cierres", [22, 12, 12, 13, 13, 13, 13, 15, 12, 12, 13, 15, 13, 15, 15, 12, 12, 12, 26, 14]);
  hoja(hFichas, "Base de costos", [22, 22, 22, 6, 18, 6, 20, 60, 8, 10, 12, 12, 12, 12, 12, 14, 14, 14, 14, 9, 14, 9, 30]);
  XLSX.writeFile(wb, `MICA_gestion_${hoyISO()}.xlsx`);
  toast("Excel descargado");
}
