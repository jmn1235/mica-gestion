/* =========================================================
   Gráficos livianos en SVG: barras agrupadas por mes y barras
   horizontales. Un solo eje, marcas finas, tooltip al pasar el
   mouse o tocar, leyenda cuando hay dos series o más.
   ========================================================= */
import { esc } from "./ui.js";

/* Escala "redonda" para el eje. */
function pasoLindo(max, n = 4) {
  if (max <= 0) return 1;
  const bruto = max / n;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / pot;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot;
}
const corto = v => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " M";
  if (a >= 1e3) return (v / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 0 }) + " k";
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
};

/**
 * Barras agrupadas.
 * etiquetas: ["Ago 26", ...]; series: [{nombre, color, valores:[...]}]; fmt: número → texto
 */
export function barrasAgrupadas(el, opciones) {
  dibujarBarras(el, opciones);
  // Se vuelve a dibujar si cambia el ancho, así el texto del eje no se achica.
  if (window.ResizeObserver && !el._obs) {
    let ancho = el.clientWidth;
    el._obs = new ResizeObserver(() => {
      if (!el.isConnected) { el._obs.disconnect(); return; }
      if (Math.abs(el.clientWidth - ancho) > 30) { ancho = el.clientWidth; dibujarBarras(el, opciones); }
    });
    el._obs.observe(el);
  }
}

function dibujarBarras(el, { etiquetas, series, fmt, alto = 240, titulosTip }) {
  const W = Math.max(280, Math.round(el.clientWidth || 720));
  const H = W < 520 ? Math.round(alto * 0.8) : alto, m = { t: 12, r: 8, b: 28, l: 48 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.max(0, ...series.flatMap(s => s.valores));
  const paso = pasoLindo(max || 1);
  const tope = Math.ceil((max || 1) / paso) * paso;
  const y = v => m.t + ih - (v / tope) * ih;
  const n = etiquetas.length || 1;
  const banda = iw / n;
  const ns = series.length;
  const gap = 2;
  const anchoBarra = Math.max(4, Math.min(28, (banda * 0.62 - gap * (ns - 1)) / ns));
  const grupo = anchoBarra * ns + gap * (ns - 1);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.nombre).join(" y "))} por mes">`;
  svg += `<g class="grilla">`;
  for (let v = paso; v <= tope + 1e-9; v += paso) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
  svg += `</g><g class="eje">`;
  for (let v = 0; v <= tope + 1e-9; v += paso) svg += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${corto(v)}</text>`;
  const cadaCuanto = Math.ceil(n / 12);
  etiquetas.forEach((e, i) => { if (i % cadaCuanto === 0) svg += `<text x="${m.l + banda * i + banda / 2}" y="${H - 8}" text-anchor="middle">${esc(e)}</text>`; });
  svg += `</g>`;
  etiquetas.forEach((e, i) => {
    const x0 = m.l + banda * i + (banda - grupo) / 2;
    svg += `<rect class="golpe" data-i="${i}" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${ih}"/>`;
    svg += `<g data-g="${i}" pointer-events="none">`;
    series.forEach((s, k) => {
      const v = s.valores[i] || 0;
      if (v <= 0) return;
      const x = x0 + k * (anchoBarra + gap);
      const h = Math.max(1, (v / tope) * ih);
      const r = Math.min(4, anchoBarra / 2, h);
      const yb = m.t + ih;
      // Esquinas redondeadas solo arriba; la base queda recta sobre el eje.
      svg += `<path fill="${s.color}" d="M${x},${yb} V${yb - h + r} Q${x},${yb - h} ${x + r},${yb - h} H${x + anchoBarra - r} Q${x + anchoBarra},${yb - h} ${x + anchoBarra},${yb - h + r} V${yb} Z"/>`;
    });
    svg += `</g>`;
  });
  svg += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/></svg>`;
  const leyenda = ns > 1 ? `<div class="leyenda" style="margin-bottom:10px">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.nombre)}</span>`).join("")}</div>` : "";
  el.innerHTML = `${leyenda}<div class="graf">${svg}<div class="graf-tip"></div></div>`;
  const graf = el.querySelector(".graf"), tip = el.querySelector(".graf-tip"), svgEl = el.querySelector("svg");
  const mostrar = (i, evX) => {
    el.querySelectorAll("g.sobre").forEach(g => g.classList.remove("sobre"));
    const g = el.querySelector(`g[data-g="${i}"]`); if (g) g.classList.add("sobre");
    tip.innerHTML = `<b>${esc(titulosTip ? titulosTip[i] : etiquetas[i])}</b>` + series.map(s => `<div class="fila-tip"><span><i style="background:${s.color}"></i>${esc(s.nombre)}</span><span>${fmt(s.valores[i] || 0)}</span></div>`).join("");
    const rect = svgEl.getBoundingClientRect(), gr = graf.getBoundingClientRect();
    const escala = rect.width / W;
    let x = (m.l + banda * i + banda / 2) * escala;
    const mitad = 90;
    x = Math.max(mitad, Math.min(gr.width - mitad, x));
    tip.style.left = x + "px";
    tip.style.top = (m.t * escala + 2) + "px";
    tip.classList.add("visible");
  };
  const ocultar = () => { tip.classList.remove("visible"); el.querySelectorAll("g.sobre").forEach(g => g.classList.remove("sobre")); };
  // El índice se calcula por la posición del puntero: funciona igual con mouse y con el dedo.
  let ultimo = -1;
  const indice = e => {
    const rect = svgEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const i = Math.floor((x - m.l) / banda);
    return i >= 0 && i < n ? i : -1;
  };
  const alMover = e => { const i = indice(e); if (i < 0) { ocultar(); ultimo = -1; } else if (i !== ultimo) { ultimo = i; mostrar(i); } };
  svgEl.addEventListener("pointermove", alMover);
  svgEl.addEventListener("pointerdown", alMover);
  svgEl.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { ocultar(); ultimo = -1; } });
}

/** Barras horizontales de una sola serie: filas [{rotulo, valor, detalle?}] */
export function barrasHorizontales(filas, fmt) {
  const max = Math.max(0, ...filas.map(f => f.valor));
  if (!filas.length || max <= 0) return `<div class="vacio">Todavía no hay datos.</div>`;
  return `<div class="barras-h">${filas.map(f => `
    <div class="barra-h" title="${esc(f.rotulo)}: ${esc(fmt(f.valor))}${f.detalle ? " · " + esc(f.detalle) : ""}">
      <span class="r">${esc(f.rotulo)}</span>
      <span class="pista"><i style="width:${Math.max(0.5, (f.valor / max) * 100)}%"></i></span>
      <span class="n">${esc(fmt(f.valor))}</span>
    </div>`).join("")}</div>`;
}

/**
 * Líneas acumuladas (curva S). Un solo eje.
 * series: [{nombre, color, valores:[número|null], punteada?}]; los null cortan la línea.
 */
export function lineas(el, opciones) {
  dibujarLineas(el, opciones);
  if (window.ResizeObserver && !el._obsL) {
    let ancho = el.clientWidth;
    el._obsL = new ResizeObserver(() => {
      if (!el.isConnected) { el._obsL.disconnect(); return; }
      if (Math.abs(el.clientWidth - ancho) > 30) { ancho = el.clientWidth; dibujarLineas(el, opciones); }
    });
    el._obsL.observe(el);
  }
}

function dibujarLineas(el, { etiquetas, titulosTip, series, fmt, fmtEje, alto = 280, minTope = 0 }) {
  const W = Math.max(280, Math.round(el.clientWidth || 720));
  const H = W < 520 ? Math.round(alto * 0.82) : alto, m = { t: 14, r: 14, b: 28, l: 46 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const n = etiquetas.length;
  const max = Math.max(minTope, ...series.flatMap(s => s.valores.filter(v => v != null)));
  const paso = pasoLindo(max || 1);
  const tope = Math.ceil((max || 1) / paso - 1e-9) * paso;
  const x = i => (n > 1 ? m.l + (i * iw) / (n - 1) : m.l + iw / 2);
  const y = v => m.t + ih - (v / tope) * ih;
  const fe = fmtEje || corto;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.nombre).join(", "))}">`;
  svg += `<g class="grilla">`;
  for (let v = paso; v <= tope + 1e-9; v += paso) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
  svg += `</g><g class="eje">`;
  for (let v = 0; v <= tope + 1e-9; v += paso) svg += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fe(v))}</text>`;
  const cada = Math.ceil(n / Math.max(2, Math.floor(iw / 64)));
  etiquetas.forEach((e, i) => { if (i % cada === 0 || i === n - 1) svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="${n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}">${esc(e)}</text>`; });
  svg += `</g><line class="base" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/>`;
  series.forEach(s => {
    let d = "", abierta = false, ultimo = -1;
    s.valores.forEach((v, i) => {
      if (v == null) { abierta = false; return; }
      d += (abierta ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1);
      abierta = true; ultimo = i;
    });
    if (!d) return;
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.punteada ? ' stroke-dasharray="6 5"' : ""}/>`;
    if (ultimo >= 0 && !s.punteada) svg += `<circle cx="${x(ultimo)}" cy="${y(s.valores[ultimo])}" r="4.5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`;
  });
  svg += `<g class="cursor" visibility="hidden"><line class="cursor-linea" y1="${m.t}" y2="${m.t + ih}" stroke="#94959A" stroke-width="1"/>${series.map((s, k) => `<circle data-k="${k}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>`).join("")}</g>`;
  svg += `</svg>`;
  const leyenda = series.length > 1 ? `<div class="leyenda" style="margin-bottom:10px">${series.map(s => `<span><i style="background:${s.color}${s.punteada ? ";height:2px;border-radius:0" : ""}"></i>${esc(s.nombre)}</span>`).join("")}</div>` : "";
  el.innerHTML = `${leyenda}<div class="graf">${svg}<div class="graf-tip"></div></div>`;
  const graf = el.querySelector(".graf"), tip = el.querySelector(".graf-tip"), svgEl = el.querySelector("svg"), cursor = el.querySelector(".cursor");
  let ultimo = -1;
  const mostrar = i => {
    const xi = x(i);
    cursor.setAttribute("visibility", "visible");
    const ln = cursor.querySelector(".cursor-linea"); ln.setAttribute("x1", xi); ln.setAttribute("x2", xi);
    series.forEach((s, k) => {
      const c = cursor.querySelector(`circle[data-k="${k}"]`); const v = s.valores[i];
      if (v == null) c.setAttribute("visibility", "hidden");
      else { c.setAttribute("visibility", "visible"); c.setAttribute("cx", xi); c.setAttribute("cy", y(v)); }
    });
    tip.innerHTML = `<b>${esc(titulosTip ? titulosTip[i] : etiquetas[i])}</b>` + series.map(s => `<div class="fila-tip"><span><i style="background:${s.color}"></i>${esc(s.nombre)}</span><span>${s.valores[i] == null ? "—" : esc(fmt(s.valores[i]))}</span></div>`).join("");
    const esc2 = svgEl.getBoundingClientRect().width / W;
    const gw = graf.getBoundingClientRect().width;
    tip.style.left = Math.max(95, Math.min(gw - 95, xi * esc2)) + "px";
    tip.style.top = (m.t * esc2 + 2) + "px";
    tip.classList.add("visible");
  };
  const ocultar = () => { tip.classList.remove("visible"); cursor.setAttribute("visibility", "hidden"); ultimo = -1; };
  const alMover = e => {
    const rect = svgEl.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    if (px < m.l - 10 || px > W - m.r + 10) { ocultar(); return; }
    const i = n > 1 ? Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1)))) : 0;
    if (i !== ultimo) { ultimo = i; mostrar(i); }
  };
  svgEl.addEventListener("pointermove", alMover);
  svgEl.addEventListener("pointerdown", alMover);
  svgEl.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") ocultar(); });
}
