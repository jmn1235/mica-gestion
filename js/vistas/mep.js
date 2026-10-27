/* =========================================================
   Cotización del dólar MEP (bolsa, valor de venta).
   Fuente: api.argentinadatos.com por fecha; si no hay dato,
   dolarapi.com con la cotización del día. Cada movimiento
   guarda la cotización de su fecha y el valor en dólares
   queda congelado.
   ========================================================= */
const LS = "mica_mep_v1";
let cache = {};
try { cache = JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (e) { cache = {}; }
const guardarCache = () => { try { localStorage.setItem(LS, JSON.stringify(cache)); } catch (e) { /* nada */ } };

export const estadoMEP = { ok: null, detalle: "Sin consultar todavía" };

const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

async function conTiempo(url, ms = 6000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal }); } finally { clearTimeout(t); }
}

/* Devuelve {valor, fecha, aproximada?} o null. */
export async function cotizacionMEP(fechaISO) {
  if (!fechaISO) return null;
  const hoy = iso(new Date());
  // La cotización de hoy cambia durante el día: no se toma del caché.
  if (cache[fechaISO] && fechaISO !== hoy) return cache[fechaISO];
  const base = new Date(fechaISO + "T12:00:00");
  for (let i = 0; i < 6; i++) {
    const d = new Date(base.getTime() - i * 86400000);
    const [y, m, dd] = iso(d).split("-");
    try {
      const r = await conTiempo(`https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa/${y}/${m}/${dd}`);
      if (!r.ok) continue;
      const j = await r.json();
      const valor = Array.isArray(j) ? (j[0] && j[0].venta) : j.venta;
      if (valor) {
        const res = { valor: Number(valor), fecha: `${y}-${m}-${dd}` };
        cache[fechaISO] = res; guardarCache();
        estadoMEP.ok = true; estadoMEP.detalle = "MEP al " + res.fecha;
        return res;
      }
    } catch (e) { break; /* sin red o bloqueado: probar la otra fuente */ }
  }
  try {
    const r = await conTiempo("https://dolarapi.com/v1/dolares/bolsa");
    if (r.ok) {
      const j = await r.json();
      if (j && j.venta) {
        const res = { valor: Number(j.venta), fecha: hoy, aproximada: fechaISO !== hoy };
        if (fechaISO === hoy) { cache[fechaISO] = res; guardarCache(); }
        estadoMEP.ok = true; estadoMEP.detalle = res.aproximada ? "Sin dato para esa fecha: se usó la de hoy" : "MEP de hoy";
        return res;
      }
    }
  } catch (e) { /* nada */ }
  estadoMEP.ok = false; estadoMEP.detalle = "No se pudo consultar. Cargá la cotización a mano.";
  return null;
}

/* Última cotización conocida (para valuar saldos en pesos a dólares de hoy). */
export function ultimaConocida() {
  const fechas = Object.keys(cache).sort();
  return fechas.length ? cache[fechas[fechas.length - 1]] : null;
}
