/* =========================================================
   MICA · Gestión de proyectos — arranque, login y navegación.
   Pantallas: js/vistas/*.js (una por archivo).
   ========================================================= */
import { S, estado, alCambiar, iniciarLocal, iniciarNube, existeEnServidor, guardarConfig } from "./db.js";
import { hayFirebase, cargarFirebase, escucharLogin, entrarConGoogle, salir, usuarioLocal, entrarLocal } from "./auth.js";
import { SOCIOS } from "./config.js";
import { sembrarSiHaceFalta, cargarEjemplo } from "./semilla.js";
import { app, ctxValido, fijarCtx, ctxDeKey, opcionesCtx } from "./contexto.js";
import { $, $$, esc, ICONOS, toast } from "./ui.js";
import * as tablero from "./vistas/tablero.js";
import * as cargar from "./vistas/cargar.js";
import * as movimientos from "./vistas/movimientos.js";
import * as ajustes from "./vistas/ajustes.js";
import * as mas from "./vistas/mas.js";
import * as presupuesto from "./vistas/presupuesto.js";
import * as seguimiento from "./vistas/seguimiento.js";
import * as certificados from "./vistas/certificados.js";
import * as socios from "./vistas/socios.js";
import * as impuestos from "./vistas/impuestos.js";
import * as cierre from "./vistas/cierre.js";
import * as preguntar from "./vistas/preguntar.js";
import * as liquidacion from "./vistas/liquidacion.js";
import * as base from "./vistas/base.js";
import { vencidasTodas } from "./certificados.js";
import * as aprobaciones from "./vistas/aprobaciones.js";
import * as PER from "./permisos.js";
import { comoSistema } from "./db.js";

const VISTAS = { tablero, cargar, movimientos, presupuesto, certificados, seguimiento, cierre, liquidacion, socios, impuestos, base, preguntar, ajustes, mas, aprobaciones };
const raiz = $("#app");
let shellListo = false;
let actual = { ruta: "", params: [], vista: null };

/* ---------- pantallas de entrada ---------- */
function pantallaCargando(texto) {
  shellListo = false;
  raiz.innerHTML = `<div class="cargando"><div><span class="punto"></span>${esc(texto)}</div></div>`;
}

function pantallaLogin(motivo = "") {
  shellListo = false;
  const local = !hayFirebase();
  raiz.innerHTML = `
  <div class="login"><div class="login-caja">
    <div class="login-marca"><img src="img/logo-mica-blanco.png" alt="MICA — Minería Integral Catamarca" width="573" height="76"></div>
    <div class="login-tarjeta">
      <h1>Gestión de proyectos</h1>
      <p>${local ? "Modo local: los datos quedan guardados solo en este navegador. Elegí quién sos para entrar." : "Entrá con la cuenta de Google autorizada para MICA."}</p>
      ${motivo ? `<div class="login-error" role="alert">${esc(motivo)}</div>` : ""}
      ${local
        ? `<div class="socios-local">${SOCIOS.map(s => `<button class="btn btn-sec" data-socio="${s.id}">${esc(s.nombre)}</button>`).join("")}</div>`
        : `<button class="btn btn-google" id="btn-google">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Entrar con Google</button>`}
    </div>
    <div class="login-pie">MICA — Minería Integral Catamarca</div>
  </div></div>`;
  if (local) {
    $$("[data-socio]").forEach(b => b.addEventListener("click", () => entrar(entrarLocal(b.dataset.socio))));
  } else {
    $("#btn-google").addEventListener("click", async e => {
      e.currentTarget.disabled = true;
      try { await entrarConGoogle(); }
      catch (err) { pantallaLogin("No se pudo entrar: " + (err.message || err)); }
      finally { const b = $("#btn-google"); if (b) b.disabled = false; }
    });
  }
}

/* ---------- entrada a la app ---------- */
let datosIniciados = false;
async function entrar(usuario) {
  app.usuario = usuario;
  if (!datosIniciados) {
    pantallaCargando("Cargando datos…");
    try {
      if (hayFirebase()) { const fb = await cargarFirebase(); await iniciarNube({ db: fb.db, f: fb.f }); }
      else iniciarLocal();
      datosIniciados = true;
    } catch (e) {
      return pantallaLogin("No se pudieron leer los datos: " + (e.message || e));
    }
    if (estado.denegadas.has("proyectos") || estado.denegadas.has("movimientos")) {
      return pantallaLogin("La base de datos rechazó el acceso. Revisá que las reglas de seguridad estén publicadas con tu correo.");
    }
    if (estado.denegadas.size) {
      // La app sigue andando; lo que falta es publicar las reglas nuevas de esta versión.
      estado.error = "falta publicar en Firebase las reglas actualizadas (firestore.rules) para: " + Array.from(estado.denegadas).join(", ");
    }
    // En la nube, los datos iniciales se cargan solo si el servidor confirma que la base está vacía
    // (un dispositivo nuevo sin señal podría ver un caché vacío y pisar datos reales).
    if (estado.modo === "nube") {
      // Solo el administrador inicializa la base (los demás no pueden escribir en ella).
      if (PER.esAdmin() && !(S.config.general || {}).semilla && (await existeEnServidor("config", "general")) === false) sembrarSiHaceFalta();
    } else comoSistema(() => {
      sembrarSiHaceFalta();
      // Vista previa: arranca con datos de ejemplo para mostrar cómo se ve con la obra en marcha.
      if (window.MICA_DEMO && !S.movimientos.length) {
        cargarEjemplo();
        if (!(S.config.general || {}).impuestos) guardarConfig("general", { impuestos: { iibb: 3, ganancias: 35, chequeCredito: 0.6, chequeDebito: 0.6, chequeComputable: 33 } });
      }
    });
  }
  armarShell();
  navegar();
}

export async function cerrarSesion() {
  await salir();
  location.hash = "";
  location.reload();
}

/* ---------- estructura: menú lateral, barra del celular y navegación inferior ---------- */
const MENU = [
  { ruta: "tablero", nombre: "Tablero", icono: "tablero" },
  { ruta: "cargar", nombre: "Cargar", icono: "cargar" },
  { ruta: "movimientos", nombre: "Movimientos", icono: "movimientos" }
];
const MENU_PROYECTO = [
  { ruta: "presupuesto", nombre: "Contrato y presupuesto", icono: "presupuesto" },
  { ruta: "certificados", nombre: "Certificados", icono: "factura" },
  { ruta: "seguimiento", nombre: "Seguimiento", icono: "curva" },
  { ruta: "cierre", nombre: "Cierre de mes", icono: "cierre" },
  { ruta: "liquidacion", nombre: "Cierre de proyecto", icono: "bandera" }
];

/* Nombre de la pantalla de pedidos según el rol. */
const nombreAprob = () => (PER.esAdmin() ? "Aprobaciones" : PER.esOperativo() ? "Mis cargas" : "Pendientes");
function aplicarRol() {
  const r = PER.rol();
  document.body.classList.remove("rol-admin", "rol-operativo", "rol-veedor");
  document.body.classList.add("rol-" + r);
  $$("[data-nombre-aprob]").forEach(n => { n.textContent = nombreAprob(); });
  $$("[data-rol-txt]").forEach(n => { n.textContent = PER.nombreRol(r); });
}

function armarShell() {
  const u = app.usuario;
  const ctx = ctxValido();
  const inicial = (u.nombre || "?").slice(0, 1).toUpperCase();
  raiz.innerHTML = `
  <div class="shell">
    <aside class="lateral" aria-label="Menú principal">
      <div class="lateral-marca"><img src="img/logo-mica-blanco.png" alt="MICA — Minería Integral Catamarca" width="573" height="76"></div>
      <div class="lateral-ctx"><label for="sel-ctx">Viendo</label><select id="sel-ctx" class="sel-ctx">${opcionesCtx(ctx)}</select></div>
      <nav class="lateral-nav">
        ${MENU.map(m => `<a href="#${m.ruta}" data-ruta="${m.ruta}">${ICONOS[m.icono]}<span>${m.nombre}</span></a>`).join("")}
        <a href="#aprobaciones" data-ruta="aprobaciones">${ICONOS.ok}<span data-nombre-aprob>${nombreAprob()}</span></a>
        <div class="sep"></div>
        <div class="rot">Proyecto</div>
        ${MENU_PROYECTO.map(m => `<a href="#${m.ruta}" data-ruta="${m.ruta}">${ICONOS[m.icono]}<span>${m.nombre}</span></a>`).join("")}
        <div class="sep"></div>
        <div class="rot">MICA y Magna</div>
        <a href="#socios" data-ruta="socios">${ICONOS.socios}<span>Socios</span></a>
        <a href="#impuestos" data-ruta="impuestos">${ICONOS.impuestos}<span>Impuestos</span></a>
        <a href="#base" data-ruta="base">${ICONOS.base}<span>Base de costos</span></a>
        <a href="#preguntar" data-ruta="preguntar">${ICONOS.preguntar}<span>Preguntar</span></a>
        <div class="sep"></div>
        <a href="#ajustes" data-ruta="ajustes">${ICONOS.ajustes}<span>${PER.esAdmin() ? "Ajustes" : "Exportar y datos"}</span></a>
        <a href="ayuda.html" target="_blank" rel="noopener">${ICONOS.preguntar}<span>Guía de uso</span></a>
      </nav>
      <div class="lateral-pie">
        <div class="avatar">${u.foto ? `<img src="${esc(u.foto)}" alt="" referrerpolicy="no-referrer">` : esc(inicial)}</div>
        <div class="quien"><b>${esc(u.nombre)} <small class="rol-chip" data-rol-txt>${esc(PER.nombreRol(PER.rol()))}</small></b><span>${estado.modo === "nube" ? ICONOS.nube + "En la nube" : ICONOS.local + "Modo local"}</span></div>
        <button class="btn-icono" id="btn-salir" title="Salir" aria-label="Salir">${ICONOS.salir}</button>
      </div>
    </aside>
    <header class="barra-movil">
      <img src="img/isotipo-blanco.png" alt="MICA" width="261" height="76">
      <label class="sr" for="sel-ctx-m">Viendo</label>
      <select id="sel-ctx-m" class="sel-ctx">${opcionesCtx(ctx)}</select>
    </header>
    <div class="contenido">
      ${window.MICA_DEMO ? `<div class="aviso-demo">Vista previa con datos de ejemplo. Lo que cargues queda solo en este navegador.</div>` : ""}
      <div id="aviso-nube" class="aviso-nube" hidden></div>
      <main id="vista" class="vista"></main>
    </div>
    <nav class="nav-inferior" aria-label="Navegación">
      ${MENU.map(m => `<a href="#${m.ruta}" data-ruta="${m.ruta}">${ICONOS[m.icono]}<span>${m.nombre}</span></a>`).join("")}
      <a href="#mas" data-ruta="mas">${ICONOS.mas}<span>Más</span></a>
    </nav>
  </div>`;
  $$(".sel-ctx").forEach(sel => sel.addEventListener("change", () => {
    const c = ctxDeKey(sel.value);
    if (!c) return;
    fijarCtx(c);
    $$(".sel-ctx").forEach(s => { s.value = sel.value; });
    // Al cambiar de contexto en el formulario de carga, se empieza un formulario nuevo.
    if (actual.ruta === "cargar" && actual.params[0]) location.hash = "cargar";
    else pintar(true);
  }));
  $("#btn-salir").addEventListener("click", cerrarSesion);
  shellListo = true;
  aplicarRol();
  avisoNube();
  marcarVencidas();
}

function marcarNav(ruta) {
  const r = ruta === "mas" ? "mas" : ruta;
  const enMas = ["aprobaciones", "ajustes", "presupuesto", "certificados", "seguimiento", "cierre", "liquidacion", "socios", "impuestos", "base", "preguntar"].includes(r);
  $$("[data-ruta]").forEach(a => a.classList.toggle("activo", a.dataset.ruta === r || !!(enMas && a.dataset.ruta === "mas" && a.closest(".nav-inferior"))));
}

function navegar() {
  if (!shellListo) return;
  const [ruta, ...params] = (location.hash.replace(/^#/, "") || "tablero").split("/").map(decodeURIComponent);
  const vista = VISTAS[ruta] ? ruta : "tablero";
  actual = { ruta: vista, params, vista: VISTAS[vista] };
  marcarNav(vista);
  pintar(true);
  window.scrollTo(0, 0);
}

/* Vuelve a dibujar la pantalla actual. forzar=false se usa cuando cambian los datos. */
function pintar(forzar) {
  if (!shellListo || !actual.vista) return;
  if (!forzar && actual.vista.fija && actual.vista.fija()) return;
  const el = $("#vista");
  const y = window.scrollY;
  try { actual.vista.render(el, actual.params); }
  catch (e) { console.error(e); el.innerHTML = `<div class="panel"><b>Algo falló al mostrar esta pantalla.</b><p class="mute">${esc(e.message)}</p></div>`; }
  if (!forzar) window.scrollTo(0, y);
}

let pendiente = false;
function alCambiarDatos(col) {
  if (!shellListo) return;
  avisoNube();
  if (col === "error") return;
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => {
    pendiente = false;
    const ctx = ctxValido();
    $$(".sel-ctx").forEach(s => { s.innerHTML = opcionesCtx(ctx); });
    if (col === "config" || col === "*") aplicarRol();
    marcarVencidas();
    pintar(false);
  });
}

/* Contadores del menú: facturas vencidas y pedidos para revisar (también en «Más»). */
function marcarVencidas() {
  let n = 0, a = 0;
  try { n = vencidasTodas().length; } catch (e) { n = 0; }
  try { a = aprobaciones.contador(); } catch (e) { a = 0; }
  const poner = (sel, k, titulo) => $$(sel).forEach(el => {
    let b = el.querySelector(".badge");
    if (!k) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "badge"; el.appendChild(b); }
    b.textContent = k; b.title = titulo;
  });
  poner('[data-ruta="certificados"], [data-ruta-mas="certificados"]', n, `${n} factura${n === 1 ? "" : "s"} vencida${n === 1 ? "" : "s"}`);
  poner('[data-ruta="aprobaciones"], [data-ruta-mas="aprobaciones"]', a, PER.esAdmin() ? `${a} pedido${a === 1 ? "" : "s"} para aprobar` : `${a} pedido${a === 1 ? "" : "s"} rechazado${a === 1 ? "" : "s"}`);
  poner('.nav-inferior [data-ruta="mas"]', n + a, "Pendientes");
}

function avisoNube() {
  const el = $("#aviso-nube");
  if (!el) return;
  if (estado.error) {
    el.hidden = false;
    el.innerHTML = `${ICONOS.alerta}<span>No se pudo guardar o leer en la nube: ${esc(estado.error)}. Revisá la conexión; si sigue, avisá a Julio.</span>`;
  } else el.hidden = true;
}

app.refrescar = () => pintar(true);
app.salir = cerrarSesion;
app.ir = hash => { if (location.hash === "#" + hash) navegar(); else location.hash = hash; };

window.addEventListener("hashchange", navegar);
alCambiar(alCambiarDatos);

/* ---------- arranque ---------- */
async function iniciar() {
  if ("serviceWorker" in navigator && location.protocol === "https:" && !window.MICA_DEMO) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  if (!hayFirebase()) {
    const u = usuarioLocal();
    return u ? entrar(u) : pantallaLogin();
  }
  pantallaCargando("Conectando…");
  try {
    await escucharLogin((u, motivo) => { if (u) entrar(u); else { app.usuario = null; pantallaLogin(motivo); } });
  } catch (e) {
    pantallaLogin("No se pudo conectar con Firebase: " + (e.message || e));
  }
}
iniciar();

window.addEventListener("error", e => { if (e.message && !/ResizeObserver/.test(e.message)) toast("Error: " + e.message, "error"); });
