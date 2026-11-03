/* =========================================================
   Versión de la app. Se actualiza en cada entrega (número y
   fecha de publicación) junto con la caché de sw.js. Se muestra
   abajo del menú (computadora), en «Más» (celular) y en la
   pantalla de entrada: así se sabe si ya se tomó la última.
   ========================================================= */
export const VERSION = { numero: 15, fecha: "2026-11-03" };

const fechaTxt = iso => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
export const textoVersion = () => `Versión ${VERSION.numero} · ${fechaTxt(VERSION.fecha)}`;
