/* =========================================================
   Utilidades de interfaz: formato de números y fechas,
   avisos, ventanas y borrado en dos toques.
   ========================================================= */

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const nf = {};
function fmtNum(v, dec = 0) {
  const k = dec;
  if (!nf[k]) nf[k] = new Intl.NumberFormat("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return nf[k].format(Math.abs(v));
}
const MENOS = "−";

/* Montos como texto: el signo menos va delante del símbolo. */
export function fmtARS(v, dec = 0) {
  if (v == null || isNaN(v)) return "—";
  return (v < 0 && Math.abs(v) >= 0.5 * Math.pow(10, -dec) ? MENOS : "") + "$ " + fmtNum(v, dec);
}
export function fmtUSD(v, dec = 0) {
  if (v == null || isNaN(v)) return "—";
  return (v < 0 && Math.abs(v) >= 0.5 * Math.pow(10, -dec) ? MENOS : "") + "US$ " + fmtNum(v, dec);
}
export function fmtPct(v, dec = 1) {
  if (v == null || !isFinite(v)) return "—";
  return (v < 0 ? MENOS : "") + fmtNum(v * 100, dec) + "%";
}
export function fmtCant(v, dec = 2) {
  if (v == null || isNaN(v)) return "—";
  const d = Number.isInteger(Number(v)) ? 0 : dec;
  return (v < 0 ? MENOS : "") + fmtNum(v, d);
}
export const fmtMoneda = (v, moneda, dec = 0) => moneda === "ARS" ? fmtARS(v, dec) : fmtUSD(v, dec);

/* Montos como HTML: negativos en rojo de marca con signo menos. */
export function num(v, fmt = fmtUSD, dec) {
  const t = dec == null ? fmt(v) : fmt(v, dec);
  const neg = v < 0 && t.startsWith(MENOS);
  return `<span class="num${neg ? " neg" : ""}">${t}</span>`;
}

/* Lee montos escritos a la argentina (1.234,56) o con punto decimal. */
export function parseMonto(s) {
  if (typeof s === "number") return s;
  let t = String(s || "").replace(/[^\d,.\-]/g, "");
  if (!t) return NaN;
  const neg = t.startsWith("-");
  t = t.replace(/-/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else {
    const partes = t.split(".");
    if (partes.length > 2) t = partes.join("");
    else if (partes.length === 2 && partes[1].length === 3) t = partes.join("");
  }
  const v = parseFloat(t);
  return neg ? -v : v;
}
/* Formatea un input de monto con separador de miles al salir del campo. */
export function fmtMiles(v, dec = 2) {
  if (v == null || isNaN(v) || v === "") return "";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: dec }).format(v);
}

/* ---------- fechas ---------- */
export function hoyISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function fmtFecha(iso, largo = false) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return largo ? `${Number(d)} de ${MESES[Number(m) - 1].toLowerCase()} de ${y}` : `${d}/${m}/${y.slice(2)}`;
}
export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export function mesLabel(ym, corto = false) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  const n = MESES[Number(m) - 1];
  return corto ? n.slice(0, 3) + " " + y.slice(2) : n + " " + y;
}
export function fmtFechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

/* Cabecera estándar de cada pantalla. */
export function cabecera(rotulo, titulo, sub = "", acciones = "") {
  return `<div class="cab"><div>${rotulo ? `<div class="cab-rot">${esc(rotulo)}</div>` : ""}<h1>${esc(titulo)}</h1>${sub ? `<div class="cab-sub">${sub}</div>` : ""}</div>${acciones ? `<div class="cab-acciones">${acciones}</div>` : ""}</div>`;
}

/* ---------- avisos ---------- */
let tToast = null;
export function toast(msg, tipo = "") {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg;
  el.className = "toast visible " + tipo;
  clearTimeout(tToast);
  tToast = setTimeout(() => { el.className = "toast " + tipo; }, tipo === "error" ? 6000 : 3200);
}

/* Borrado en dos toques: el primero arma el botón, el segundo confirma. */
export function confirmar2(btn, fn, texto = "¿Seguro?") {
  if (btn.dataset.armado === "1") { btn.dataset.armado = ""; fn(); return; }
  const original = btn.innerHTML;
  btn.dataset.armado = "1";
  btn.classList.add("armado");
  btn.innerHTML = texto;
  setTimeout(() => {
    if (!btn.isConnected) return;
    btn.dataset.armado = ""; btn.classList.remove("armado"); btn.innerHTML = original;
  }, 3500);
}

/* Ventana modal simple. Devuelve el elemento para cablear eventos. */
export function modal(titulo, cuerpo, { ancho = 560, alCerrar } = {}) {
  cerrarModal();
  const fondo = document.createElement("div");
  fondo.className = "modal-fondo";
  fondo.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="max-width:${ancho}px">
    <div class="modal-cab"><h3>${esc(titulo)}</h3><button class="btn-icono" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></div>
    <div class="modal-cuerpo">${cuerpo}</div></div>`;
  document.body.appendChild(fondo);
  const cerrar = () => { fondo.remove(); document.removeEventListener("keydown", tecla); if (alCerrar) alCerrar(); };
  const tecla = e => { if (e.key === "Escape") cerrar(); };
  document.addEventListener("keydown", tecla);
  fondo.addEventListener("click", e => { if (e.target === fondo || e.target.closest("[data-cerrar]")) cerrar(); });
  fondo.cerrar = cerrar;
  const primero = fondo.querySelector("input,select,textarea");
  if (primero) setTimeout(() => primero.focus(), 30);
  return fondo;
}
export function cerrarModal() { const m = $(".modal-fondo"); if (m && m.cerrar) m.cerrar(); else if (m) m.remove(); }

/* Descarga un archivo generado en el navegador. */
export function descargar(nombre, contenido, tipo = "application/json") {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* Carga un script externo una sola vez (SheetJS para Excel). */
const scripts = {};
export function cargarScript(src) {
  if (!scripts[src]) scripts[src] = new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar " + src));
    document.head.appendChild(s);
  });
  return scripts[src];
}

/* ---------- íconos (trazo, 24x24) ---------- */
const svg = p => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const ICONOS = {
  tablero: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  cargar: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  movimientos: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  mas: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  cerrar: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  borrar: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  editar: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
  salir: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>'),
  alerta: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
  ok: svg('<path d="M5 12l5 5 9-10"/>'),
  nube: svg('<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18z"/>'),
  local: svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>'),
  flecha: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  buscar: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  descargar: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  subir: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  presupuesto: svg('<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4"/>'),
  factura: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  socios: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.8.4 5 2.8 5 5.8"/>'),
  chispa: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  impuestos: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  cierre: svg('<rect x="4" y="4" width="16" height="17" rx="1.5"/><path d="M8 2v4M16 2v4M8 12l3 3 5-6"/>'),
  preguntar: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5M12 16.5v.3"/>'),
  curva: svg('<path d="M3 20h18"/><path d="M4 17c4 0 5-9 9-9s4 5 7 5"/>'),
  restaurar: svg('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5"/>'),
  bandera: svg('<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>'),
  base: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
  imprimir: svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>')
};
