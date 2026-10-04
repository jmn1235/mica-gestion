/* =========================================================
   Más (celular): accesos que no entran en la barra inferior.
   ========================================================= */
import { estado } from "../db.js";
import { app } from "../contexto.js";
import { esc, cabecera, ICONOS } from "../ui.js";
import { vencidasTodas } from "../certificados.js";

export function render(el) {
  const u = app.usuario;
  const venc = vencidasTodas().length;
  el.innerHTML = cabecera("", "Más", `${esc(u.nombre)} · ${estado.modo === "nube" ? "datos en la nube" : "modo local"}`) + `
  <section class="panel" style="padding:4px 16px">
    <nav class="menu-mas">
      <a href="#presupuesto">${ICONOS.presupuesto}<span>Contrato y presupuesto</span></a>
      <a href="#certificados" data-ruta-mas="certificados">${ICONOS.factura}<span>Certificados y cobranza</span>${venc ? `<span class="badge">${venc}</span>` : ""}</a>
      <a href="#seguimiento">${ICONOS.curva}<span>Seguimiento y curva S</span></a>
      <a href="#cierre">${ICONOS.cierre}<span>Cierre de mes</span></a>
      <a href="#liquidacion">${ICONOS.bandera}<span>Cierre de proyecto</span></a>
      <a href="#socios">${ICONOS.socios}<span>Socios</span></a>
      <a href="#impuestos">${ICONOS.impuestos}<span>Impuestos</span></a>
      <a href="#base">${ICONOS.base}<span>Base de costos</span></a>
      <a href="#preguntar">${ICONOS.preguntar}<span>Preguntar</span></a>
      <a href="#ajustes/proyectos">${ICONOS.ajustes}<span>Proyectos</span></a>
      <a href="#ajustes/proveedores">${ICONOS.movimientos}<span>Proveedores</span></a>
      <a href="#ajustes/cuentas">${ICONOS.tablero}<span>Cuentas y categorías</span></a>
      <a href="#ajustes/datos">${ICONOS.descargar}<span>Datos, respaldo y papelera</span></a>
      <button type="button" id="mas-salir">${ICONOS.salir}<span>Salir</span></button>
    </nav>
  </section>
  <p class="chico mute" style="text-align:center;margin-top:18px">MICA — Minería Integral Catamarca · Versión 6</p>`;
  el.querySelector("#mas-salir").addEventListener("click", () => app.salir());
}
