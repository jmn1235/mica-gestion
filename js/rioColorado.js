/* =========================================================
   Río Colorado: lectura (solo lectura) de la app de los dúplex,
   que tiene su propia base de Firebase. La usa solo Julio, para
   juntar el IVA de toda Magna Desarrollos.
   - Entra con Google a la base de Río Colorado (es otra base:
     la primera vez pide la cuenta) y lee gastos, proveedores y
     movimientos de IVA. No escribe nada.
   - Si no se puede conectar, se puede cargar el respaldo .json
     que baja la app de Río Colorado.
   - Lo leído queda guardado solo en este dispositivo.
   ========================================================= */

// Configuración web de la base de Río Colorado (no es secreta: lo que protege los datos son sus reglas).
export const RC_FIREBASE = {
  apiKey: "AIzaSyDtFic6ccGboUbMwgEh8gzHQe2EFQDlGFg",
  authDomain: "riocolorado-1561b.firebaseapp.com",
  projectId: "riocolorado-1561b",
  storageBucket: "riocolorado-1561b.firebasestorage.app",
  messagingSenderId: "812780435699",
  appId: "1:812780435699:web:71052756d7f10c9552df86"
};
const RAIZ = "proyectos/rio-colorado";
const V = "10.12.5";
const URL_FB = m => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;
const LS = "mica_rc_v1";
const n = v => Number(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;

/* Estado de la lectura. fuente: "nube" | "respaldo" | "ejemplo". */
export const RC = { estado: "sin", error: "", leidoEl: "", fuente: "", correo: "", gastos: [], ivamov: [], proveedores: [] };

(function cargarCache() {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || "null");
    if (d && Array.isArray(d.gastos)) Object.assign(RC, { estado: "listo", gastos: d.gastos, ivamov: d.ivamov || [], proveedores: d.proveedores || [], leidoEl: d.leidoEl || "", fuente: d.fuente || "", correo: d.correo || "" });
  } catch (e) { /* sin caché */ }
})();
function guardarCache() {
  try { localStorage.setItem(LS, JSON.stringify({ gastos: RC.gastos, ivamov: RC.ivamov, proveedores: RC.proveedores, leidoEl: RC.leidoEl, fuente: RC.fuente, correo: RC.correo })); }
  catch (e) { /* queda en memoria */ }
}
export function olvidar() {
  Object.assign(RC, { estado: "sin", error: "", leidoEl: "", fuente: "", correo: "", gastos: [], ivamov: [], proveedores: [] });
  try { localStorage.removeItem(LS); } catch (e) { /* nada */ }
}
export const hayDatos = () => RC.estado === "listo";

let fb = null;
async function modulos() {
  if (fb) return fb;
  const [a, au, f] = await Promise.all([import(URL_FB("app")), import(URL_FB("auth")), import(URL_FB("firestore"))]);
  const app = a.getApps().find(x => x.name === "rio-colorado") || a.initializeApp(RC_FIREBASE, "rio-colorado");
  const auth = au.getAuth(app);
  await au.setPersistence(auth, au.browserLocalPersistence);
  fb = { app, auth, au, f, db: f.getFirestore(app) };
  return fb;
}

/* Mensaje claro para los errores típicos. */
function explicar(e) {
  const c = (e && e.code) || "";
  if (/permission-denied/.test(c)) return "La base de Río Colorado no deja leer con esta cuenta. Entrá con el correo autorizado en esa app.";
  if (/unauthorized-domain/.test(c)) return `Falta autorizar este sitio en la base de Río Colorado: en Firebase (proyecto riocolorado-1561b) → Authentication → Configuración → Dominios autorizados, agregá «${location.hostname}».`;
  if (/popup-blocked/.test(c)) return "El navegador bloqueó la ventana para entrar con Google. Permití las ventanas emergentes para este sitio y probá de nuevo.";
  if (/popup-closed|cancelled-popup/.test(c)) return "Se cerró la ventana de Google antes de entrar.";
  if (/unavailable|network/.test(c) || /fetch|network/i.test((e && e.message) || "")) return "No hay conexión con Río Colorado. Revisá internet y probá de nuevo.";
  return "No se pudo leer Río Colorado: " + ((e && e.message) || e);
}

/* Conecta y lee. interactivo = true puede abrir la ventana de Google. Devuelve true si leyó. */
export async function conectar(interactivo) {
  RC.error = "";
  try {
    const { auth, au, f, db } = await modulos();
    if (auth.authStateReady) await auth.authStateReady();
    if (!auth.currentUser) {
      if (!interactivo) return false;
      const prov = new au.GoogleAuthProvider();
      prov.setCustomParameters({ prompt: "select_account" });
      await au.signInWithPopup(auth, prov);
    }
    const leer = async col => (await f.getDocs(f.collection(db, RAIZ + "/" + col))).docs.map(d => Object.assign({ id: d.id }, d.data()));
    const [gastos, proveedores, ivamov] = await Promise.all([leer("gastos"), leer("proveedores"), leer("ivamov")]);
    Object.assign(RC, { estado: "listo", gastos, proveedores, ivamov, leidoEl: new Date().toISOString(), fuente: "nube", correo: (auth.currentUser && auth.currentUser.email) || "" });
    guardarCache();
    return true;
  } catch (e) {
    RC.error = explicar(e);
    throw new Error(RC.error);
  }
}
export async function salirRC() {
  try { const { auth, au } = await modulos(); await au.signOut(auth); } catch (e) { /* nada */ }
  olvidar();
}

/* Respaldo .json que descarga la app de Río Colorado (Datos y configuración → Descargar respaldo). */
export function desdeRespaldo(texto) {
  const d = JSON.parse(texto);
  if (!d || !Array.isArray(d.gastos)) throw new Error("El archivo no parece un respaldo de Río Colorado: no tiene gastos.");
  Object.assign(RC, { estado: "listo", error: "", gastos: d.gastos, proveedores: d.proveedores || [], ivamov: d.ivamov || [], leidoEl: d.exportado || new Date().toISOString(), fuente: "respaldo", correo: "" });
  guardarCache();
}

/* ---------- compras de Río Colorado, en el formato de la planilla ---------- */
const FISCAL_RC = {
  "Con IVA discriminado (Factura A)": "A",
  "IVA incluido sin discriminar (Factura B)": "B",
  "Factura C (sin IVA)": "C",
  "Sin IVA / sin factura": "X"
};
const digitos = v => String(v || "").replace(/\D/g, "");
const formatoCuit = v => { const d = digitos(v); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v || "").trim(); };

/* Cada gasto de Río Colorado como compra de Magna (en pesos).
   - Los «comprometidos» todavía no tienen factura: no entran.
   - El monto de Río Colorado es el total de la factura (con IVA, percepciones e impuestos internos). */
export function comprasRC() {
  const cuitDe = nombre => { const p = RC.proveedores.find(x => x.nombre && nombre && x.nombre.toLowerCase() === String(nombre).toLowerCase()); return p ? p.cuit || "" : ""; };
  return RC.gastos.filter(g => g && g.fecha && (g.estado || "Pagado") !== "Comprometido" && n(g.montoARS) > 0).map(g => {
    const letra = FISCAL_RC[g.fiscal] || "X";
    const total = n(g.montoARS);
    const iva = letra === "A" ? n(g.ivaARS) : 0;
    const percIIBB = n(g.percIIBB), percIVA = letra === "A" ? n(g.percIVA) : 0, percGan = n(g.percGan);
    const otrosTrib = letra === "X" ? 0 : n(g.otrosTribARS), noGravado = letra === "A" ? n(g.noGravadoARS) : 0;
    const notaCuit = (String(g.notas || "").match(/CUIT\s*:?\s*([\d-]{11,13})/i) || [])[1] || "";
    return {
      id: "rc_" + g.id, origen: "RC", fecha: String(g.fecha).slice(0, 10), proveedor: g.proveedor || "", cuit: formatoCuit(g.cuitProveedor || notaCuit || cuitDe(g.proveedor)),
      numero: g.comprobante || "", letra, alicuota: g.alicuota || (iva ? 21 : 0), total: r2(total), iva: r2(iva),
      percIIBB: r2(percIIBB), percIVA: r2(percIVA), percGan: r2(percGan), otrosTrib: r2(otrosTrib), noGravado: r2(noGravado),
      netoGravado: r2(total - iva - percIIBB - percIVA - percGan - otrosTrib - noGravado),
      concepto: g.concepto || "", rubro: g.rubro || "", tipo: g.tipo || "", financia: g.financia || "", cargadoPor: g.cargadoPor || "", notas: g.notas || "",
      cotizacion: n(g.cotizacion)
    };
  });
}

/* Controles para la contadora: facturas A sin número o sin CUIT. */
export function faltantesRC() {
  const cs = comprasRC().filter(c => c.letra === "A");
  return { sinNumero: cs.filter(c => !digitos(c.numero)).length, sinCuit: cs.filter(c => digitos(c.cuit).length !== 11).length, total: cs.length };
}

/* Movimientos de IVA que Río Colorado registró con otros proyectos (para comparar). */
export function movimientosIvaRC() {
  return RC.ivamov.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}

/* ---------- datos de ejemplo (solo vista previa) ---------- */
export function ejemplo() {
  const g = (id, fecha, proveedor, concepto, total, iva, extra = {}) => Object.assign({ id, fecha, proveedor, concepto, montoARS: total, ivaARS: iva, fiscal: "Con IVA discriminado (Factura A)", alicuota: 21, estado: "Pagado", rubro: "Estructura de hormigón", tipo: "Materiales", financia: "Fondo común", cotizacion: 1400 }, extra);
  Object.assign(RC, {
    estado: "listo", error: "", fuente: "ejemplo", correo: "", leidoEl: new Date().toISOString(),
    proveedores: [{ nombre: "Prevedello", cuit: "30-71234567-8" }, { nombre: "Corralón El Puente", cuit: "20-28765432-1" }],
    gastos: [
      g("e1", "2026-08-07", "Prevedello", "Hormigón H21 · platea", 18150000, 3150000, { comprobante: "0005-00012345", percIIBB: 300000 }),
      g("e2", "2026-08-21", "Corralón El Puente", "Hierro y alambre", 6050000, 1050000, { comprobante: "0002-00004410", rubro: "Fundaciones" }),
      g("e3", "2026-09-12", "Prevedello", "Viguetas y bloques", 12100000, 2100000, { comprobante: "0005-00012790", rubro: "Losas y techos alivianados" }),
      g("e4", "2026-09-25", "Raúl", "Quincena albañilería", 4200000, 0, { fiscal: "Sin IVA / sin factura", alicuota: null, tipo: "Mano de obra", rubro: "Mampostería" }),
      g("e5", "2026-10-09", "Corralón El Puente", "Cemento y cal", 3630000, 630000, { comprobante: "0002-00004702", rubro: "Mampostería" })
    ],
    ivamov: []
  });
}
