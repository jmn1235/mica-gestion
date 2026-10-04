/* =========================================================
   Asistente con IA (API de Anthropic).
   La clave se guarda solo en este dispositivo (localStorage),
   nunca en Firestore. Cada socio carga la suya.
   ========================================================= */
const LS = "mica_ia_v1";
const API = "https://api.anthropic.com/v1/messages";

export const MODELOS = [
  { id: "claude-sonnet-5-5", nombre: "Sonnet 5.5", detalle: "equilibrado (recomendado)", pin: 2, pout: 10 },
  { id: "claude-haiku-4-5-20251001", nombre: "Haiku 4.5", detalle: "rápido y barato", pin: 1, pout: 5 },
  { id: "claude-opus-5-5", nombre: "Opus 5.5", detalle: "más preciso, más caro", pin: 4, pout: 20 }
];

let memoria = null;
export function config() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { c = null; }
  c = c || memoria || {};
  if (!c.modelo || !MODELOS.some(m => m.id === c.modelo)) c.modelo = MODELOS[0].id;
  c.uso = c.uso || {};
  return c;
}
export function guardarConfig(cambios) {
  const c = Object.assign(config(), cambios);
  memoria = c;
  try { localStorage.setItem(LS, JSON.stringify(c)); } catch (e) { /* queda en memoria mientras la app esté abierta */ }
}
export const hayClave = () => !!config().key;

const mesHoy = () => new Date().toISOString().slice(0, 7);
function registrarUso(modelo, u) {
  if (!u) return;
  const m = MODELOS.find(x => x.id === modelo) || MODELOS[0];
  const c = config();
  const usd = ((u.input_tokens || 0) * m.pin + (u.output_tokens || 0) * m.pout) / 1e6;
  const k = mesHoy();
  c.uso[k] = c.uso[k] || { n: 0, usd: 0 };
  c.uso[k].n++; c.uso[k].usd += usd;
  Object.keys(c.uso).sort().slice(0, -6).forEach(x => delete c.uso[x]);
  guardarConfig({ uso: c.uso });
}
export const usoDelMes = () => config().uso[mesHoy()] || { n: 0, usd: 0 };

function errorHttp(st, j) {
  const m = (j && j.error && j.error.message) || "";
  if (st === 401) return new Error("La clave de API no es válida. Revisala en Ajustes → Impuestos e IA.");
  if (st === 403) return new Error("La clave no tiene permiso para usar este modelo. " + m);
  if (st === 404) return new Error("El modelo elegido no está disponible para esta cuenta. Cambialo en Ajustes → Impuestos e IA.");
  if (st === 429) return new Error("Se alcanzó el límite de uso por minuto. Esperá un momento y probá de nuevo.");
  if (/credit balance/i.test(m)) return new Error("La cuenta de Anthropic no tiene saldo. Cargá crédito en console.anthropic.com → Billing.");
  if (st === 529 || st === 503 || /overload/i.test(m)) return new Error("Los servidores de Anthropic están saturados. Probá en unos minutos.");
  return new Error(`Error ${st}${m ? ": " + m : ""}`);
}

/* Llama al modelo y devuelve la respuesta completa. */
export async function llamar(mensajes, { sistema, maxTokens = 1500, modelo } = {}) {
  const c = config();
  if (!c.key) throw new Error("Falta cargar la clave de IA en Ajustes → Impuestos e IA.");
  if (navigator.onLine === false) throw new Error("Sin conexión a internet.");
  const cuerpo = { model: modelo || c.modelo, max_tokens: maxTokens, messages: mensajes };
  if (sistema) cuerpo.system = sistema;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 120000);
  let res, j = null;
  try {
    res = await fetch(API, {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": c.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify(cuerpo)
    });
    const t = await res.text();
    try { j = JSON.parse(t); } catch (e) { j = null; }
  } catch (e) {
    throw new Error(e && e.name === "AbortError" ? "La IA tardó demasiado en responder. Probá de nuevo." : "No se pudo conectar con Anthropic. Revisá la conexión.");
  } finally { clearTimeout(to); }
  if (!res.ok) throw errorHttp(res.status, j);
  if (!j) throw new Error("La respuesta de Anthropic no se pudo leer.");
  registrarUso(cuerpo.model, j.usage);
  return j;
}
export async function texto(mensajes, opciones) {
  const j = await llamar(mensajes, opciones);
  return (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
}
/* Saca el JSON de una respuesta, aunque venga con texto o bloque de código alrededor. */
export function extraerJSON(txt) {
  let s = String(txt || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const i = s.indexOf("{"), k = s.lastIndexOf("}");
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && (a < i || i < 0) && b > a) s = s.slice(a, b + 1);
  else if (i >= 0 && k > i) s = s.slice(i, k + 1);
  return JSON.parse(s);
}
export async function pedirJSON(mensajes, opciones) {
  return extraerJSON(await texto(mensajes, opciones));
}

export function archivoABase64(file) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = () => mal(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
}
/* Achica las fotos grandes del celular antes de mandarlas (más rápido y más barato). */
function achicarImagen(file, max = 1800) {
  return new Promise(ok => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
    img.src = url;
  });
}
/* Bloque de contenido para una imagen o un PDF. */
export async function bloqueArchivo(file) {
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    if (file.size > 30 * 1024 * 1024) throw new Error("El PDF es muy grande (más de 30 MB).");
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: await archivoABase64(file) } };
  }
  const chica = await achicarImagen(file);
  if (chica) return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: chica } };
  const tipo = /png$/i.test(file.type) ? "image/png" : /webp$/i.test(file.type) ? "image/webp" : "image/jpeg";
  return { type: "image", source: { type: "base64", media_type: tipo, data: await archivoABase64(file) } };
}
