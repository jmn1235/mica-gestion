/* =========================================================
   Planillas Excel con formato: encabezados con los colores de
   MICA, fila de títulos fija, filtros, montos y fechas con su
   formato, totales con fórmulas y hoja lista para imprimir.
   Usa ExcelJS (se carga la primera vez que se exporta).
   ========================================================= */
import { cargarScript, descargar } from "./ui.js";

const URL_EXCELJS = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
export const COLOR = { rojo: "FFE1262D", negro: "FF141416", gris: "FF5C5D62", grisMedio: "FF94959A", grisClaro: "FFE7E3E2", fondo: "FFF7F5F4", blanco: "FFFFFFFF" };
const FUENTE = "Arial";

export const FMT = {
  ars: '#,##0.00;[Red]-#,##0.00;"-"',
  usd: '#,##0.00;[Red]-#,##0.00;"-"',
  num: "#,##0.####",
  entero: "0",
  pct: '0.0"%"',
  tc: "#,##0.00",
  fecha: "dd/mm/yyyy",
  mes: '0000"-"00',
  texto: "@"
};

export async function nuevoLibro() {
  await cargarScript(URL_EXCELJS);
  const wb = new window.ExcelJS.Workbook();
  wb.creator = "MICA · Gestión";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

export async function guardarLibro(wb, nombre) {
  const buf = await wb.xlsx.writeBuffer();
  descargar(nombre, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

/* Letra de una columna (1 = A). */
export function letra(n) {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* "2026-09-14" → fecha de Excel (sin corrimiento por huso horario). */
export function fechaExcel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const borde = c => ({ style: "thin", color: { argb: c } });

/* Agrega una hoja con tabla.
   columnas: [{ t: "Título", k: "clave", f: "ars|usd|num|pct|tc|fecha|texto|entero", w: ancho, total: true, formula: (fila, col) => "..." }]
   filas: objetos con las claves.
   op: { titulo, subtitulo, notas: [texto], totales: true, horizontal: true, congelarCol: n, tabColor } */
export function hojaTabla(wb, nombre, columnas, filas, op = {}) {
  const ws = wb.addWorksheet(nombre.slice(0, 31), {
    properties: { tabColor: op.tabColor ? { argb: op.tabColor } : undefined, defaultRowHeight: 16 },
    pageSetup: { paperSize: 9, orientation: op.horizontal === false ? "portrait" : "landscape", fitToPage: true, fitToWidth: columnas.length > 18 ? 2 : 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L&8MICA · Gestión — ${nombre}&R&8Página &P de &N` }
  });
  ws.columns = columnas.map(c => ({ key: c.k, width: c.w || 14 }));
  let fila = 1;
  const nCols = columnas.length;
  if (op.titulo) {
    const t = ws.getRow(fila);
    t.getCell(1).value = op.titulo;
    t.getCell(1).font = { name: FUENTE, size: 14, bold: true, color: { argb: COLOR.negro } };
    t.height = 22;
    fila++;
    if (op.subtitulo) {
      const s = ws.getRow(fila);
      s.getCell(1).value = op.subtitulo;
      s.getCell(1).font = { name: FUENTE, size: 9, color: { argb: COLOR.gris } };
      fila++;
    }
    // Línea roja de acento bajo el título.
    for (let c = 1; c <= nCols; c++) ws.getRow(fila).getCell(c).border = { top: { style: "medium", color: { argb: COLOR.rojo } } };
    ws.getRow(fila).height = 6;
    fila++;
  }
  const filaEnc = fila;
  const enc = ws.getRow(filaEnc);
  columnas.forEach((c, i) => {
    const cell = enc.getCell(i + 1);
    cell.value = c.t;
    cell.font = { name: FUENTE, size: 9, bold: true, color: { argb: COLOR.blanco } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.rojo } };
    cell.alignment = { vertical: "middle", horizontal: c.a || (["ars", "usd", "num", "pct", "tc", "entero"].includes(c.f) ? "right" : c.f === "mes" ? "center" : "left"), wrapText: true };
    cell.border = { bottom: borde(COLOR.rojo) };
  });
  enc.height = 30;
  const primera = filaEnc + 1;
  filas.forEach((o, j) => {
    const r = ws.getRow(primera + j);
    columnas.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      let v = o[c.k];
      if (c.formula) {
        const res = typeof v === "number" ? v : undefined;
        cell.value = { formula: c.formula(primera + j, i + 1, colDe), result: res };
      } else if (c.f === "fecha") cell.value = fechaExcel(v);
      else if (["ars", "usd", "num", "pct", "tc", "entero", "mes"].includes(c.f)) cell.value = v === "" || v == null || isNaN(Number(v)) ? null : (c.f === "ars" || c.f === "usd" ? r2(v) : Number(v));
      else cell.value = v == null ? "" : String(v);
      cell.numFmt = FMT[c.f] || "General";
      cell.font = { name: FUENTE, size: 9, color: { argb: COLOR.negro } };
      cell.alignment = { vertical: "top", horizontal: c.a || (c.f === "mes" ? "center" : undefined), wrapText: c.f === "texto" && (c.w || 14) >= 28 };
      cell.border = { bottom: borde(COLOR.grisClaro) };
      if (j % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.fondo } };
    });
  });
  const ultima = primera + filas.length - 1;
  // Totales: SUBTOTAL respeta los filtros (suma solo lo que se ve).
  let filaTot = null;
  if (op.totales && filas.length) {
    filaTot = ultima + 1;
    const r = ws.getRow(filaTot);
    columnas.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      if (i === 0) cell.value = "Total";
      if (c.total) {
        const L = letra(i + 1);
        const suma = filas.reduce((a, o) => a + (Number(o[c.k]) || 0), 0);
        cell.value = { formula: `SUBTOTAL(109,${L}${primera}:${L}${ultima})`, result: r2(suma) };
        cell.numFmt = FMT[c.f] || FMT.ars;
      }
      cell.font = { name: FUENTE, size: 9, bold: true, color: { argb: COLOR.negro } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.grisClaro } };
      cell.border = { top: borde(COLOR.negro), bottom: borde(COLOR.negro) };
    });
  }
  if (!filas.length) {
    ws.getRow(primera).getCell(1).value = "Sin datos para este período.";
    ws.getRow(primera).getCell(1).font = { name: FUENTE, size: 9, italic: true, color: { argb: COLOR.gris } };
  }
  if (op.notas && op.notas.length) {
    let f = (filaTot || Math.max(ultima, primera)) + 2;
    op.notas.forEach(n => {
      const cell = ws.getRow(f++).getCell(1);
      cell.value = n;
      cell.font = { name: FUENTE, size: 8, italic: true, color: { argb: COLOR.gris } };
    });
  }
  ws.views = [{ state: "frozen", ySplit: filaEnc, xSplit: op.congelarCol || 0, showGridLines: false }];
  if (filas.length) ws.autoFilter = { from: { row: filaEnc, column: 1 }, to: { row: ultima, column: nCols } };
  ws.pageSetup.printTitlesRow = `${filaEnc}:${filaEnc}`;
  function colDe(k) { const i = columnas.findIndex(c => c.k === k); return i < 0 ? null : letra(i + 1); }
  return { ws, filaEnc, primera, ultima, filaTot, col: colDe };
}

/* Columnas armadas a partir de los nombres de las claves (para las hojas del Excel completo). */
export function columnasDe(filas, anchos = [], formatos = {}) {
  const claves = filas.length ? Object.keys(filas[0]) : ["Sin datos"];
  return claves.map((k, i) => {
    let f = formatos[k];
    if (!f) {
      const muestra = filas.map(o => o[k]).find(v => v !== "" && v != null);
      if (/^(Fecha|Desde|Hasta|Emisión|Vencimiento|Fecha factura|Fecha de cierre)$/i.test(k) || (typeof muestra === "string" && /^\d{4}-\d{2}-\d{2}$/.test(muestra))) f = "fecha";
      else if (typeof muestra === "number") f = /%/.test(k) ? "pct" : /USD/.test(k) ? "usd" : /(ARS|Monto|IVA|Neto|Bruto|Total|Cobrado|Saldo|Contrato|Anticipo|Venta|Costo|Precio|Fondo|Amortización|Retenci|Ret\.|Percep)/i.test(k) ? "ars" : /Dólar|TC/i.test(k) ? "tc" : "num";
      else f = "texto";
    }
    return { t: k, k, f, w: anchos[i] || Math.min(40, Math.max(10, String(k).length + 2)) };
  });
}

/* Hoja de texto (para "Léeme"): título, logo opcional y párrafos. */
export async function hojaTexto(wb, nombre, titulo, parrafos, op = {}) {
  const ws = wb.addWorksheet(nombre.slice(0, 31), {
    views: [{ showGridLines: false }], properties: { tabColor: { argb: COLOR.negro } },
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
  });
  const alto = (txt, ancho) => Math.max(15, Math.ceil(String(txt || "").length / ancho) * 13.5);
  ws.columns = [{ width: 3 }, { width: 34 }, { width: 90 }];
  let f = 2;
  if (op.logo) {
    try {
      const res = await fetch(op.logo);
      if (res.ok) {
        const id = wb.addImage({ buffer: await res.arrayBuffer(), extension: "png" });
        ws.addImage(id, { tl: { col: 1, row: 1 }, ext: { width: 150, height: 48 } });
        f = 6;
      }
    } catch (e) { /* sin logo */ }
  }
  const t = ws.getRow(f).getCell(2);
  t.value = titulo; t.font = { name: FUENTE, size: 16, bold: true, color: { argb: COLOR.negro } };
  ws.mergeCells(f, 2, f, 3);
  ws.getRow(f).height = 24;
  f++;
  for (let c = 2; c <= 3; c++) ws.getRow(f).getCell(c).border = { top: { style: "medium", color: { argb: COLOR.rojo } } };
  f++;
  parrafos.forEach(p => {
    const r = ws.getRow(f++);
    if (Array.isArray(p)) {
      r.getCell(2).value = p[0]; r.getCell(2).font = { name: FUENTE, size: 10, bold: true, color: { argb: COLOR.negro } };
      r.getCell(3).value = p[1]; r.getCell(3).font = { name: FUENTE, size: 10, color: { argb: COLOR.negro } };
      r.getCell(2).alignment = r.getCell(3).alignment = { vertical: "top", wrapText: true };
      r.height = alto(p[1], 95);
    } else if (p && p.seccion) {
      f++;
      const c = ws.getRow(f - 1).getCell(2);
      c.value = p.seccion; c.font = { name: FUENTE, size: 11, bold: true, color: { argb: COLOR.rojo } };
    } else {
      r.getCell(2).value = p || ""; r.getCell(2).font = { name: FUENTE, size: 10, color: { argb: COLOR.gris } };
      ws.mergeCells(f - 1, 2, f - 1, 3);
      r.getCell(2).alignment = { vertical: "top", wrapText: true };
      r.height = alto(p, 125);
    }
  });
  return ws;
}
