/* Piezas compartidas entre pantallas. */
import { app, fijarCtx } from "../contexto.js";
import * as M from "../modelo.js";
import { $$, esc, cabecera } from "../ui.js";

/* Para pantallas que son de un proyecto: si arriba está elegido MICA o Magna, se pide elegir uno. */
export function pedirProyecto(el, titulo, sub) {
  const ps = M.proyectosOrdenados();
  el.innerHTML = cabecera("", titulo, sub) + `<section class="panel"><div class="panel-cab"><div><h2>Elegí un proyecto</h2><p class="panel-sub">Esta pantalla es de un proyecto. También podés cambiarlo en el selector de arriba.</p></div></div>
    ${ps.length ? `<div class="lista-proy">${ps.map(p => `<button class="btn btn-sec" data-p="${esc(p.id)}"><b>${esc(p.nombre)}</b><span class="mute">${esc(p.cliente || "")}</span></button>`).join("")}</div>` : `<div class="vacio">No hay proyectos. Creá uno en Ajustes.</div>`}</section>`;
  $$("[data-p]", el).forEach(b => b.addEventListener("click", () => {
    fijarCtx({ tipo: "proyecto", id: b.dataset.p });
    $$(".sel-ctx").forEach(s => { s.value = "p:" + b.dataset.p; });
    app.refrescar();
  }));
}

/* Letra de columna de Excel: 0 → A, 26 → AA. */
export function letraColumna(i) {
  let s = "";
  i++;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
