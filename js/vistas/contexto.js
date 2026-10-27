/* =========================================================
   Estado compartido de la interfaz: quién está usando la app
   y qué está mirando (un proyecto, MICA o Magna).
   ========================================================= */
import { proyecto, proyectosOrdenados } from "./modelo.js";

const LS = "mica_ctx";

export const app = {
  usuario: null,      // { socio, nombre, email, local? }
  ctx: null,          // { tipo: "proyecto", id } | { tipo: "mica" } | { tipo: "magna" }
  refrescar: () => {} // lo define app.js
};

export const ctxKey = c => (c.tipo === "proyecto" ? "p:" + c.id : c.tipo);
export function ctxDeKey(k) {
  if (k && k.startsWith("p:")) return { tipo: "proyecto", id: k.slice(2) };
  if (k === "mica" || k === "magna") return { tipo: k };
  return null;
}

/* Contexto válido: el guardado si sigue existiendo, si no el primer proyecto activo. */
export function ctxValido() {
  let c = app.ctx;
  if (!c) { try { c = ctxDeKey(localStorage.getItem(LS)); } catch (e) { c = null; } }
  if (c && c.tipo === "proyecto" && !proyecto(c.id)) c = null;
  if (!c) {
    const p = proyectosOrdenados()[0];
    c = p ? { tipo: "proyecto", id: p.id } : { tipo: "mica" };
  }
  app.ctx = c;
  return c;
}
export function fijarCtx(c) {
  app.ctx = c;
  try { localStorage.setItem(LS, ctxKey(c)); } catch (e) { /* nada */ }
}
export function nombreCtx(c = app.ctx) {
  if (!c) return "";
  if (c.tipo === "mica") return "MICA · vista general";
  if (c.tipo === "magna") return "Magna Desarrollos";
  const p = proyecto(c.id);
  return p ? p.nombre : "Proyecto";
}

/* Opciones del selector de arriba, agrupadas. */
export function opcionesCtx(actual) {
  const k = actual ? ctxKey(actual) : "";
  const op = (v, t) => `<option value="${v}"${v === k ? " selected" : ""}>${t}</option>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const abiertos = proyectosOrdenados().filter(p => p.estado !== "cerrado");
  const cerrados = proyectosOrdenados().filter(p => p.estado === "cerrado");
  let h = `<optgroup label="Proyectos">${abiertos.map(p => op("p:" + p.id, esc(p.nombre) + (p.estado === "cotizacion" ? " (en cotización)" : ""))).join("") || '<option disabled>Sin proyectos</option>'}</optgroup>`;
  if (cerrados.length) h += `<optgroup label="Cerrados">${cerrados.map(p => op("p:" + p.id, esc(p.nombre))).join("")}</optgroup>`;
  h += `<optgroup label="Vistas generales">${op("mica", "MICA · vista general")}${op("magna", "Magna Desarrollos")}</optgroup>`;
  return h;
}
