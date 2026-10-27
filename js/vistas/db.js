/* =========================================================
   Capa de datos.
   - Modo nube: Firestore con escucha en tiempo real.
   - Modo local: los mismos datos en localStorage (para probar
     sin Firebase configurado).
   La app siempre lee de S y escribe con guardar()/borrar().
   ========================================================= */

export const COLS = ["proyectos", "movimientos", "proveedores", "cuentas", "avances", "certificados", "fichas", "papelera", "solicitudes"];

export const S = {
  proyectos: [], movimientos: [], proveedores: [], cuentas: [], avances: [], certificados: [], fichas: [], papelera: [], solicitudes: [],
  config: {}               // documentos de la colección config, por id
};

export const estado = { modo: "local", listo: false, error: "", denegadas: new Set() };

const LS_KEY = "mica_datos_v1";
const PREFIJO = { proyectos: "p", movimientos: "m", proveedores: "pr", cuentas: "c", avances: "av", certificados: "ce", fichas: "fi", papelera: "t", solicitudes: "so" };
export const prefijo = col => PREFIJO[col] || "x";

/* Guardia de escritura: la fija permisos.js según el rol del usuario.
   Es una segunda barrera en la pantalla; la que manda son las reglas de Firestore. */
let guardia = () => true;
let modoSistema = 0;
export function fijarGuardia(fn) { guardia = fn; }
/* Escrituras propias de la app (datos iniciales, ejemplo): no pasan por la guardia. */
export function comoSistema(fn) { modoSistema++; try { return fn(); } finally { modoSistema--; } }
const permitido = col => modoSistema > 0 || guardia(col) !== false;
let fb = null;
const oyentes = new Set();

export function alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function avisar(col) { oyentes.forEach(f => { try { f(col); } catch (e) { console.error(e); } }); }

export function nuevoId(pref = "x") {
  return pref + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
const limpio = o => JSON.parse(JSON.stringify(o));

/* ---------- modo local ---------- */
function cargarLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    COLS.forEach(c => { S[c] = Array.isArray(d[c]) ? d[c] : []; });
    S.config = d.config && typeof d.config === "object" ? d.config : {};
  } catch (e) { console.warn("No se pudieron leer los datos locales", e); }
}
function persistirLocal() {
  try {
    const d = { config: S.config };
    COLS.forEach(c => { d[c] = S[c]; });
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch (e) { estado.error = "El navegador no deja guardar datos locales."; }
}
export function iniciarLocal() {
  estado.modo = "local";
  cargarLocal();
  estado.listo = true;
  avisar("*");
}

/* ---------- modo nube ---------- */
export function iniciarNube(api) {
  fb = api;
  estado.modo = "nube";
  const pendientes = new Set([...COLS, "config"]);
  return new Promise(resolve => {
    const marcar = c => { if (pendientes.delete(c) && !pendientes.size) { estado.listo = true; resolve(); } };
    COLS.forEach(c => {
      fb.f.onSnapshot(fb.f.collection(fb.db, c), snap => {
        S[c] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
        marcar(c); avisar(c);
      }, err => {
        if (/permission|insufficient/i.test(err.code + " " + err.message)) estado.denegadas.add(c);
        estado.error = err.message; marcar(c); avisar("error");
      });
    });
    fb.f.onSnapshot(fb.f.collection(fb.db, "config"), snap => {
      const o = {};
      snap.docs.forEach(d => { o[d.id] = d.data(); });
      S.config = o;
      marcar("config"); avisar("config");
    }, err => { estado.error = err.message; marcar("config"); avisar("error"); });
  });
}

/* Pregunta al servidor (no al caché) si un documento existe. null = no se pudo saber. */
export async function existeEnServidor(col, id) {
  if (estado.modo !== "nube") return null;
  try {
    const d = await fb.f.getDocFromServer(fb.f.doc(fb.db, col, id));
    return d.exists();
  } catch (e) { return null; }
}

function errorNube(e) {
  estado.error = e && e.message ? e.message : String(e);
  avisar("error");
}

/* ---------- escritura ---------- */
export function guardar(col, obj) {
  if (!permitido(col)) return null;
  if (!obj.id) obj.id = nuevoId(PREFIJO[col] || "x");
  obj.modificado = new Date().toISOString();
  const datos = limpio(obj);
  if (estado.modo === "nube") {
    const { id, ...resto } = datos;
    // Firestore actualiza la vista al instante; la promesa se resuelve al llegar al servidor.
    fb.f.setDoc(fb.f.doc(fb.db, col, id), resto).catch(errorNube);
  } else {
    const arr = S[col];
    const i = arr.findIndex(x => x.id === datos.id);
    if (i >= 0) arr[i] = datos; else arr.push(datos);
    persistirLocal(); avisar(col);
  }
  return datos;
}

export function borrar(col, id) {
  if (!permitido(col)) return;
  if (estado.modo === "nube") {
    fb.f.deleteDoc(fb.f.doc(fb.db, col, id)).catch(errorNube);
  } else {
    S[col] = S[col].filter(x => x.id !== id);
    persistirLocal(); avisar(col);
  }
}

export function guardarConfig(id, datos) {
  if (!permitido("config")) return;
  const d = limpio(datos);
  if (estado.modo === "nube") {
    fb.f.setDoc(fb.f.doc(fb.db, "config", id), d, { merge: true }).catch(errorNube);
  } else {
    S.config[id] = Object.assign({}, S.config[id] || {}, d);
    persistirLocal(); avisar("config");
  }
}

/* Lo borrado se guarda en la papelera con quién y cuándo, y se puede restaurar. */
export function mandarAPapelera(col, obj, quien) {
  if (!permitido(col)) return;
  guardar("papelera", { col, docId: obj.id, datos: limpio(obj), borradoEl: new Date().toISOString(), por: quien || "" });
  borrar(col, obj.id);
}
export function restaurar(t) {
  const datos = Object.assign({}, t.datos, { id: t.docId });
  guardar(t.col, datos);
  borrar("papelera", t.id);
}

/* Reemplaza todos los datos (restaurar un respaldo). */
export async function reemplazarTodo(d) {
  if (!permitido("config")) return;
  if (estado.modo === "nube") {
    const { writeBatch, doc } = fb.f;
    const ops = [];
    COLS.forEach(c => {
      S[c].forEach(x => ops.push(["del", c, x.id]));
      (Array.isArray(d[c]) ? d[c] : []).forEach(x => ops.push(["set", c, x.id || nuevoId(PREFIJO[c]), x]));
    });
    Object.entries(d.config || {}).forEach(([id, v]) => ops.push(["set", "config", id, v]));
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(fb.db);
      ops.slice(i, i + 400).forEach(([op, c, id, x]) => {
        const ref = doc(fb.db, c, id);
        if (op === "del") b.delete(ref);
        else { const { id: _omit, ...resto } = limpio(x); b.set(ref, resto); }
      });
      await b.commit();
    }
  } else {
    COLS.forEach(c => { S[c] = Array.isArray(d[c]) ? limpio(d[c]) : []; });
    S.config = limpio(d.config || {});
    persistirLocal(); avisar("*");
  }
}

export function respaldo() {
  const d = { app: "MICA Gestión de proyectos", version: 1, exportado: new Date().toISOString(), config: S.config };
  COLS.forEach(c => { d[c] = S[c]; });
  return limpio(d);
}

/* Solo modo local: borra todo para empezar de cero. */
export function borrarLocal() {
  COLS.forEach(c => { S[c] = []; });
  S.config = {};
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* nada */ }
  avisar("*");
}
