/* =========================================================
   Preguntar: preguntas en lenguaje natural sobre los datos.
   La conversación vive mientras la app está abierta.
   ========================================================= */
import { app } from "../contexto.js";
import * as IA from "../ia.js";
import { contextoGeneral } from "../contextoIA.js";
import { $, $$, esc, toast, cabecera, ICONOS } from "../ui.js";

const charla = []; // { rol: "yo" | "ia", texto }
let ocupado = false;

const SUGERENCIAS = [
  "¿Cuánto llevamos gastado en Tres Cruces y en qué?",
  "¿Qué facturas están vencidas o por vencer?",
  "¿Cuánto le debe MICA a Julio y por qué?",
  "¿Cómo viene el margen contra lo cotizado?",
  "¿Cuánto falta reservar para impuestos?",
  "¿Qué costos unitarios tenemos en la base para cotizar?"
];

export const fija = () => ocupado;

export function render(el) {
  const sinClave = !IA.hayClave();
  el.innerHTML = cabecera("", "Preguntar", "Preguntas sobre los datos cargados: proyectos, cobranza, socios, impuestos y la cuenta de Magna.") + `
  <section class="panel chat">
    <div class="chat-lista" id="pq-lista" aria-live="polite">
      ${charla.length ? charla.map(burbuja).join("") : `<div class="vacio"><b>Hacé una pregunta</b>La IA responde con los números de la app, en dólares MEP salvo que pidas pesos.</div>
        <div class="chips">${SUGERENCIAS.map(s => `<button class="chip" data-sug="${esc(s)}">${esc(s)}</button>`).join("")}</div>`}
      ${ocupado ? `<div class="burbuja ia"><span class="punto"></span>Pensando…</div>` : ""}
    </div>
    ${sinClave ? `<div class="aviso aviso-info" style="margin:12px 0 0">${ICONOS.alerta}<div>Para preguntar hace falta la clave de IA en <a href="#ajustes/impuestos">Ajustes → Impuestos e IA</a>.</div></div>` : ""}
    <form class="chat-form" id="pq-form">
      <label class="sr" for="pq-texto">Pregunta</label>
      <textarea id="pq-texto" rows="2" placeholder="Por ejemplo: ¿cuánto cobramos en septiembre?"${sinClave || ocupado ? " disabled" : ""}></textarea>
      <button class="btn btn-pri" type="submit"${sinClave || ocupado ? " disabled" : ""}>Preguntar</button>
    </form>
    ${charla.length ? `<div style="text-align:right;margin-top:8px"><button class="btn btn-fant btn-chico" id="pq-limpiar">Empezar de nuevo</button></div>` : ""}
  </section>`;
  const lista = $("#pq-lista", el);
  lista.scrollTop = lista.scrollHeight;
  $$("[data-sug]", el).forEach(b => b.addEventListener("click", () => preguntar(b.dataset.sug)));
  const f = $("#pq-form", el), ta = $("#pq-texto", el);
  f.addEventListener("submit", e => { e.preventDefault(); preguntar(ta.value.trim()); });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); preguntar(ta.value.trim()); } });
  const bl = $("#pq-limpiar", el);
  if (bl) bl.addEventListener("click", () => { charla.length = 0; app.refrescar(); });
  if (!sinClave && !ocupado) ta.focus();
}

function burbuja(m) {
  if (m.rol === "yo") return `<div class="burbuja yo">${esc(m.texto)}</div>`;
  const html = esc(m.texto).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#{1,4}\s(.+)$/gm, "<b>$1</b>").replace(/^\s*[-•*]\s+/gm, "• ").replace(/\n/g, "<br>");
  return `<div class="burbuja ia${m.error ? " error" : ""}">${html}</div>`;
}

async function preguntar(texto) {
  if (!texto || ocupado) return;
  if (!IA.hayClave()) return toast("Falta la clave de IA en Ajustes → Impuestos e IA.", "error");
  charla.push({ rol: "yo", texto });
  ocupado = true;
  app.refrescar();
  try {
    const sistema = "Sos el asistente de gestión de MICA (Minería Integral Catamarca). Respondés preguntas de los socios sobre los datos de la app, en español rioplatense, breve y al grano. Usás SOLO los datos del JSON; si algo no está, decilo y sugerí dónde cargarlo en la app. Mostrá montos con separador de miles a la argentina y aclarando si son US$ o pesos. Si la pregunta pide una opinión de negocio, dala con prudencia y explicando de qué datos sale.\n\nDatos de la app:\n" + JSON.stringify(contextoGeneral());
    // Los mensajes tienen que alternar usuario y asistente, empezando por el usuario.
    const mensajes = [];
    charla.slice(-10).filter(m => !m.error).forEach(m => {
      const role = m.rol === "yo" ? "user" : "assistant";
      if (mensajes.length && mensajes[mensajes.length - 1].role === role) mensajes[mensajes.length - 1].content += "\n\n" + m.texto;
      else mensajes.push({ role, content: m.texto });
    });
    while (mensajes.length && mensajes[0].role !== "user") mensajes.shift();
    const resp = await IA.texto(mensajes, { sistema, maxTokens: 1200 });
    charla.push({ rol: "ia", texto: resp || "No tengo respuesta para eso." });
  } catch (err) {
    charla.push({ rol: "ia", texto: err.message, error: true });
  }
  ocupado = false;
  app.refrescar();
}
