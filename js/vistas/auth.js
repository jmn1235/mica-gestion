/* =========================================================
   Login.
   - Con Firebase configurado: Google, y solo los correos de
     USUARIOS (la base además lo controla en firestore.rules).
   - Sin Firebase: modo local, se elige el socio en pantalla.
   ========================================================= */
import { FIREBASE, USUARIOS, SOCIOS } from "./config.js";

const V = "10.12.5";
const URL = m => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;
const LS_LOCAL = "mica_usuario_local";

export const hayFirebase = () => !!(FIREBASE.apiKey && FIREBASE.projectId);

let fb = null;

/* Carga los módulos de Firebase solo cuando hacen falta. */
export async function cargarFirebase() {
  if (fb) return fb;
  const [appMod, authMod, f] = await Promise.all([import(URL("app")), import(URL("auth")), import(URL("firestore"))]);
  const app = appMod.initializeApp(FIREBASE);
  const auth = authMod.getAuth(app);
  await authMod.setPersistence(auth, authMod.browserLocalPersistence);
  let db;
  try {
    // Caché local: la app abre rápido y sigue funcionando sin señal.
    db = f.initializeFirestore(app, { localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }) });
  } catch (e) {
    db = f.getFirestore(app);
  }
  fb = { app, auth, authMod, db, f };
  return fb;
}

/* Devuelve el usuario autorizado o null. */
export function usuarioDeCorreo(email) {
  const e = String(email || "").toLowerCase();
  const u = USUARIOS.find(x => x.email.toLowerCase() === e);
  if (!u) return null;
  const s = SOCIOS.find(x => x.id === u.socio);
  return { email: e, socio: u.socio, nombre: s ? s.nombre : e };
}

/* Escucha el estado del login de Google. cb(usuario|null, motivo) */
export async function escucharLogin(cb) {
  const { auth, authMod } = await cargarFirebase();
  try { await authMod.getRedirectResult(auth); } catch (e) { /* sin redirección pendiente */ }
  authMod.onAuthStateChanged(auth, async user => {
    if (!user) return cb(null, "");
    const u = usuarioDeCorreo(user.email);
    if (!u || !user.emailVerified) {
      await authMod.signOut(auth);
      return cb(null, `La cuenta ${user.email} no está autorizada para usar la app.`);
    }
    cb(Object.assign(u, { foto: user.photoURL || "" }), "");
  });
}

export async function entrarConGoogle() {
  const { auth, authMod } = await cargarFirebase();
  const prov = new authMod.GoogleAuthProvider();
  prov.setCustomParameters({ prompt: "select_account" });
  try {
    await authMod.signInWithPopup(auth, prov);
  } catch (e) {
    // Si el navegador bloquea la ventana emergente, se usa redirección.
    if (e && /popup-blocked|operation-not-supported/.test(e.code || "")) return authMod.signInWithRedirect(auth, prov);
    if (e && /popup-closed|cancelled-popup/.test(e.code || "")) return;
    throw e;
  }
}

export async function salir() {
  if (hayFirebase()) {
    const { auth, authMod } = await cargarFirebase();
    return authMod.signOut(auth);
  }
  try { localStorage.removeItem(LS_LOCAL); } catch (e) { /* nada */ }
}

/* ---------- modo local ---------- */
export function usuarioLocal() {
  try {
    const id = localStorage.getItem(LS_LOCAL);
    const s = SOCIOS.find(x => x.id === id);
    return s ? { email: "", socio: s.id, nombre: s.nombre, local: true } : null;
  } catch (e) { return null; }
}
export function entrarLocal(socioId) {
  try { localStorage.setItem(LS_LOCAL, socioId); } catch (e) { /* nada */ }
  const s = SOCIOS.find(x => x.id === socioId);
  return { email: "", socio: s.id, nombre: s.nombre, local: true };
}
