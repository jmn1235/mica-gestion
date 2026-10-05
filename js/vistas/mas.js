/* =========================================================
   Más (celular): accesos que no entran en la barra inferior.
   ========================================================= */
import { estado } from "../db.js";
import { app } from "../contexto.js";
import { esc, cabecera, ICONOS } from "../ui.js";
import { vencidasTodas } from "../certificados.js";
import * as PER from "../permisos.js";
import { contador } from "./aprobaciones.js";

export function render(el) {
  const u = app.usuario;
  const venc = vencidasTodas().length;
  const nAp = contador();
  const admin = PER.esAdmin();
  const nombreAp = admin ? "Aprobaciones" : PER.esOperativo() ? "Mis cargas" : "Cambios pendientes";
  el.innerHTML = cabecera("", "Más", `${esc(u.nombre)} · ${esc(PER.nombreRol(PER.rol()))} · ${estado.modo === "nube" ? "datos en la nube" : "modo local"}`) + `
  <section class="panel" style="padding:4px 16px">
    <nav class="menu-mas">
      <a href="#aprobaciones" data-ruta-mas="aprobaciones">${ICONOS.ok}<span>${nombreAp}</span>${nAp ? `<span class="badge">${nAp}</span>` : ""}</a>
      <a href="#presupuesto">${ICONOS.presupuesto}<span>Contrato y presupuesto</span></a>
      <a href="#certificados" data-ruta-mas="certificados">${ICONOS.factura}<span>Certificados y cobranza</span>${venc ? `<span class="badge">${venc}</span>` : ""}</a>
      <a href="#seguimiento">${ICONOS.curva}<span>Seguimiento y curva S</span></a>
      <a href="#cierre">${ICONOS.cierre}<span>Cierre de mes</span></a>
      <a href="#liquidacion">${ICONOS.bandera}<span>Cierre de proyecto</span></a>
      <a href="#socios">${ICONOS.socios}<span>Socios</span></a>
      <a href="#impuestos">${ICONOS.impuestos}<span>Impuestos</span></a>
      <a href="#base">${ICONOS.base}<span>Base de costos</span></a>
      <a href="#preguntar">${ICONOS.preguntar}<span>Preguntar</span></a>
      ${admin ? `<a href="#ajustes/proyectos">${ICONOS.ajustes}<span>Proyectos</span></a>
      <a href="#ajustes/proveedores">${ICONOS.movimientos}<span>Proveedores</span></a>
      <a href="#ajustes/cuentas">${ICONOS.tablero}<span>Cuentas y categorías</span></a>
      <a href="#ajustes/usuarios">${ICONOS.socios}<span>Usuarios y permisos</span></a>
      <a href="#ajustes/datos">${ICONOS.descargar}<span>Datos, respaldo y papelera</span></a>` : `<a href="#ajustes/datos">${ICONOS.descargar}<span>Exportar y datos</span></a>
      <a href="#ajustes/ia">${ICONOS.chispa}<span>Mi clave de IA</span></a>`}
      <a href="ayuda.html" target="_blank" rel="noopener">${ICONOS.preguntar}<span>Guía de uso</span></a>
      <button type="button" id="mas-salir">${ICONOS.salir}<span>Salir</span></button>
    </nav>
  </section>
  <p class="chico mute" style="text-align:center;margin-top:18px">MICA — Minería Integral Catamarca · Versión 7</p>`;
  el.querySelector("#mas-salir").addEventListener("click", () => app.salir());
}
