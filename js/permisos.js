/* =========================================================
   Permisos y aprobaciones.
   - Administrador (titular de Magna): carga y modifica todo.
   - Operativo: ve todo y propone gastos de obra y avance físico;
     nada se aplica hasta que el administrador lo aprueba.
   - Veedor: ve y exporta, no modifica.
   Lo que se muestra acá es una ayuda en pantalla: la barrera real
   son las reglas de Firestore (firestore.rules).
   ========================================================= */
import { S, guardar, mandarAPapelera, fijarGuardia, nuevoId, prefijo } from "./db.js";
import { app } from "./contexto.js";
import { TITULAR_MAGNA, SOCIOS } from "./config.js";
import * as M from "./modelo.js";
import * as GS from "./gastoSocio.js";
import { toast, fmtARS, fmtFecha, mesLabel, ICONOS } from "./ui.js";

export const ROLES = [
  { id: "admin", nombre: "Administrador", detalle: "Carga, modifica y aprueba todo." },
  { id: "operativo", nombre: "Operativo", detalle: "Ve todo. Propone gastos de obra y avance físico, que quedan pendientes de aprobación." },
  { id: "veedor", nombre: "Veedor", detalle: "Ve y exporta todo. No modifica nada." }
];
export const nombreRol = id => (ROLES.find(r => r.id === id) || {}).nombre || id;
const BOLS_FIJOS = ["MAGNA", "RESERVA", "ESTRUCTURA"];

/* ---------- roles ---------- */
export function permisoDe(socio) {
  if (socio === TITULAR_MAGNA) return { rol: "admin", proyectos: "todos" };
  const u = ((S.config.permisos || {}).usuarios || {})[socio] || {};
  return { rol: u.rol === "veedor" ? "veedor" : "operativo", proyectos: Array.isArray(u.proyectos) ? u.proyectos : "todos" };
}
export const rol = () => (app.usuario ? permisoDe(app.usuario.socio).rol : "veedor");
export const esAdmin = () => rol() === "admin";
export const esOperativo = () => rol() === "operativo";

/* Proyectos donde el usuario puede proponer cambios. */
export function proyectoPermitido(pid, socio = app.usuario && app.usuario.socio) {
  if (!pid || BOLS_FIJOS.includes(pid)) return false;
  const p = M.proyecto(pid);
  if (!p) return false;
  const per = permisoDe(socio);
  if (per.rol === "admin") return true;
  if (per.rol !== "operativo" || p.estado === "cerrado") return false;
  return per.proyectos === "todos" || per.proyectos.includes(pid);
}
export const proyectosPermitidos = () => M.proyectosOrdenados().filter(p => proyectoPermitido(p.id));

/* Un movimiento que el operativo puede pedir modificar o dar de baja: un gasto de un proyecto suyo. */
export function puedeProponerMov(m) {
  return esOperativo() && !!m && M.esCosto(m) && !m.certificado && proyectoPermitido(m.bolsillo);
}
/* Puede tocar el movimiento en pantalla (directo o como pedido). */
export const puedeEditarMov = m => esAdmin() || puedeProponerMov(m);

/* Segunda barrera: fuera del administrador, solo se escriben solicitudes. */
let ultimoAviso = 0;
fijarGuardia(col => {
  if (!app.usuario || esAdmin()) return true;
  if (col === "solicitudes" && esOperativo()) return true;
  if (Date.now() - ultimoAviso > 1500) {
    ultimoAviso = Date.now();
    toast(esOperativo() ? "Ese cambio lo hace Julio. Vos podés proponer gastos de obra y avance físico." : "Tu usuario es de consulta: no modifica datos.", "error");
  }
  return false;
});

/* ---------- solicitudes ---------- */
export const pendientes = () => S.solicitudes.filter(s => s.estado === "pendiente").sort((a, b) => String(a.creadoEl).localeCompare(String(b.creadoEl)));
export const misSolicitudes = () => S.solicitudes.filter(s => app.usuario && s.autor === app.usuario.socio).sort((a, b) => String(b.creadoEl).localeCompare(String(a.creadoEl)));
export const pendienteDe = (col, docId, autor = app.usuario && app.usuario.socio) =>
  S.solicitudes.find(s => s.estado === "pendiente" && s.coleccion === col && s.docId === docId && s.autor === autor) || null;

const limpio = o => (o == null ? null : JSON.parse(JSON.stringify(o)));

/* El operativo propone un cambio. Si ya tenía uno pendiente sobre el mismo dato, lo reemplaza. */
export function proponer({ coleccion, accion, docId, datos }) {
  const ahora = new Date().toISOString();
  const autor = app.usuario.socio;
  const id0 = docId || nuevoId(prefijo(coleccion));
  const actual = (S[coleccion] || []).find(x => x.id === id0) || null;
  const previa = pendienteDe(coleccion, id0);
  // Pedir borrar algo que solo existía como pedido: se cancela el pedido.
  if (accion === "baja" && previa && previa.accion === "alta") {
    guardar("solicitudes", Object.assign({}, previa, { estado: "cancelada", canceladoEl: ahora }));
    return { cancelada: true };
  }
  const acc = accion === "baja" ? "baja" : previa && previa.accion === "alta" ? "alta" : actual ? "modificacion" : "alta";
  const d = limpio(datos);
  if (d) { delete d.id; delete d.demo; delete d.modificado; }
  const sol = Object.assign({}, previa || {}, {
    coleccion, accion: acc, docId: id0, autor, estado: "pendiente",
    datos: acc === "baja" ? null : d,
    anterior: previa ? previa.anterior : limpio(actual),
    resumen: resumen(coleccion, acc === "baja" ? actual : d),
    creadoEl: previa ? previa.creadoEl : ahora, editadoEl: previa ? ahora : null
  });
  return guardar("solicitudes", sol);
}

export function cancelar(sol) {
  guardar("solicitudes", Object.assign({}, sol, { estado: "cancelada", canceladoEl: new Date().toISOString() }));
}

/* ¿Cambió el dato desde que se pidió? Devuelve un texto o "". */
export function conflicto(sol) {
  const actual = (S[sol.coleccion] || []).find(x => x.id === sol.docId) || null;
  if (sol.accion === "alta") return actual && sol.coleccion === "movimientos" ? "Ya existe un movimiento con ese identificador." : "";
  if (!actual) return "El dato ya no existe: lo borraron después del pedido.";
  if (sol.anterior && actual.modificado && sol.anterior.modificado && actual.modificado !== sol.anterior.modificado) return "El dato cambió después de que se hizo el pedido. Revisá antes de aprobar.";
  return "";
}

/* El administrador aprueba: aplica el cambio (con correcciones, si las hizo) y deja la constancia. */
export function aprobar(sol, corregido) {
  const ahora = new Date().toISOString();
  const yo = app.usuario.socio;
  const actual = (S[sol.coleccion] || []).find(x => x.id === sol.docId) || null;
  if (sol.accion === "baja") {
    if (actual && sol.coleccion === "movimientos") GS.borrarMovimiento(actual, sol.autor);
    else if (actual) mandarAPapelera(sol.coleccion, actual, sol.autor);
  } else {
    const datos = Object.assign({}, corregido || sol.datos);
    const firma = { aprobadoPor: yo, aprobadoEl: ahora, solicitud: sol.id };
    let d;
    if (sol.coleccion === "movimientos") {
      d = Object.assign({}, actual || {}, datos, firma, { id: sol.docId });
      if (!actual) { d.creadoPor = sol.autor; d.creadoEl = sol.creadoEl; } else { d.modificadoPor = sol.autor; }
      if (d.proveedor && !S.proveedores.some(p => p.nombre.toLowerCase() === d.proveedor.toLowerCase())) {
        guardar("proveedores", { nombre: d.proveedor, cuit: "", rubro: "", notas: "", creadoPor: sol.autor });
      }
    } else {
      d = Object.assign({}, actual || {}, datos, firma, { id: sol.docId });
      if (!actual) { d.cargadoPor = sol.autor; d.cargadoEl = sol.creadoEl; }
      d.modificadoPor = sol.autor;
    }
    const g = guardar(sol.coleccion, d);
    // Gasto pagado por un socio: al aprobarlo nace (o se ajusta) su préstamo.
    if (g && sol.coleccion === "movimientos" && (g.pagadoPor || GS.prestamoDe(g))) GS.sincronizarPrestamo(g, yo);
  }
  guardar("solicitudes", Object.assign({}, sol, { estado: "aprobada", resueltoPor: yo, resueltoEl: ahora, corregido: !!corregido, datosAplicados: corregido ? limpio(corregido) : null }));
}

export function rechazar(sol, motivo) {
  guardar("solicitudes", Object.assign({}, sol, { estado: "rechazada", motivo: motivo || "", resueltoPor: app.usuario.socio, resueltoEl: new Date().toISOString() }));
}

/* ---------- textos ---------- */
export const ACCIONES = { alta: "Alta", modificacion: "Modificación", baja: "Baja" };
export const ESTADOS = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", cancelada: "Cancelada" };

export function resumen(col, d) {
  if (!d) return "";
  if (col === "movimientos") return `${M.tituloMov(d)} · ${fmtARS(d.montoARS)} · ${M.nombreBolsillo(d.bolsillo)} · ${fmtFecha(d.fecha)}`;
  if (col === "avances") return `Avance físico de ${mesLabel(d.mes)} · ${(M.proyecto(d.proyecto) || {}).nombre || d.proyecto}`;
  return col;
}

/* Campos que cambian entre el dato actual y el pedido, en palabras. */
const CAMPOS_MOV = [
  ["fecha", "Fecha", v => fmtFecha(v)], ["bolsillo", "Proyecto", v => M.nombreBolsillo(v)], ["montoARS", "Monto", v => fmtARS(v)],
  ["cotizacion", "Dólar MEP", v => String(v || "").replace(".", ",")], ["proveedor", "Proveedor"], ["concepto", "Concepto"],
  ["imputacion", "Imputación", (v, d) => M.nombreImputacion(Object.assign({}, d, { imputacion: v }), 60)], ["tipoCosto", "Categoría", v => M.nombreCategoria(v)],
  ["subcategoria", "Subcategoría"],
  ["fiscal", "Comprobante", v => (M.FISCAL.find(x => x.id === v) || {}).nombre || v || "—"],
  ["alicuota", "Alícuota de IVA", v => (Number(v) || v === "varias" ? M.nombreAlicuota(v) : "")], ["ivaARS", "IVA", v => (Number(v) ? fmtARS(v) : "")],
  ["percIIBB", "Percepción de IIBB", v => (Number(v) ? fmtARS(v) : "")], ["percIVA", "Percepción de IVA", v => (Number(v) ? fmtARS(v) : "")], ["percGan", "Percepción de Ganancias", v => (Number(v) ? fmtARS(v) : "")],
  ["pagadoPor", "Lo pagó (préstamo)", v => M.socioNombre(v)],
  ["comprobante", "N° de comprobante"], ["notas", "Notas"]
];
export function diferencias(sol, datos = sol.datos) {
  const ant = sol.anterior || {};
  if (sol.coleccion === "movimientos") {
    return CAMPOS_MOV.map(([k, nombre, f]) => {
      const a = ant[k], b = (datos || {})[k];
      const fa = a == null || a === "" ? "—" : f ? f(a, ant) || "—" : String(a);
      const fb = b == null || b === "" ? "—" : f ? f(b, datos) || "—" : String(b);
      return { campo: nombre, antes: fa, despues: fb, cambia: sol.accion === "modificacion" && fa !== fb };
    });
  }
  if (sol.coleccion === "avances") {
    const p = M.proyecto((datos || ant).proyecto) || { items: [] };
    const ca = ant.cantidades || {}, cb = (datos || {}).cantidades || {};
    const ids = Array.from(new Set([...Object.keys(ca), ...Object.keys(cb)]));
    return ids.map(id => {
      const it = (p.items || []).find(x => x.id === id) || {};
      const a = Number(ca[id]) || 0, b = Number(cb[id]) || 0;
      return { campo: `Ítem ${it.numero || "?"}${it.unidad ? " (" + it.unidad + ")" : ""}`, antes: a ? String(a).replace(".", ",") : "—", despues: b ? String(b).replace(".", ",") : "—", cambia: sol.accion === "modificacion" && a !== b };
    });
  }
  return [];
}

export const socioNombre = id => (SOCIOS.find(s => s.id === id) || {}).nombre || id || "—";

/* Aviso de cambios pendientes para el Tablero y Movimientos. */
export function avisoPendientesHtml(filtro = () => true) {
  const ps = pendientes().filter(filtro);
  if (!ps.length) return "";
  const gastos = ps.filter(s => s.coleccion === "movimientos" && s.accion === "alta").reduce((a, s) => a + (Number((s.datos || {}).montoARS) || 0), 0);
  const n = ps.length, pl = n === 1 ? "" : "s";
  const extra = gastos > 0 ? ` Incluye ${fmtARS(gastos)} en gastos nuevos que todavía no cuentan en los saldos.` : "";
  if (esAdmin()) return `<div class="aviso aviso-info">${ICONOS.alerta}<div><b>${n} cambio${pl} esperando tu aprobación.</b>${extra}<div style="margin-top:8px"><a class="btn btn-sec btn-chico" href="#aprobaciones">Revisar</a></div></div></div>`;
  const mios = ps.filter(s => app.usuario && s.autor === app.usuario.socio).length;
  return `<div class="aviso aviso-info">${ICONOS.alerta}<div><b>${n} cambio${pl} pendiente${pl} de aprobación${mios ? `, ${mios} tuyo${mios === 1 ? "" : "s"}` : ""}.</b>${extra}<div style="margin-top:8px"><a class="btn btn-sec btn-chico" href="#aprobaciones">${esOperativo() ? "Mis cargas" : "Ver pendientes"}</a></div></div></div>`;
}
