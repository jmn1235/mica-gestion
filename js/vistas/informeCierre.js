/* =========================================================
   Informe de cierre de proyecto (solo para los socios).
   - armar(): junta los números con los mismos cálculos de la
     pantalla de cierre. Las tablas las arma la app, no la IA.
   - html(): vista previa en pantalla.
   - pdf(): A4 con la marca MICA, encabezado y pie con número
     de página, y tablas que no se cortan entre páginas.
   - textoParaIA(): las mismas tablas en texto, para el
     comentario opcional de análisis.
   Montos: dólares MEP netos de IVA, salvo donde dice pesos o
   la moneda del contrato.
   ========================================================= */
import { S } from "./db.js";
import { SOCIOS } from "./config.js";
import * as M from "./modelo.js";
import * as P from "./presupuesto.js";
import * as C from "./certificados.js";
import * as I from "./impuestos.js";
import { esc, fmtUSD, fmtARS, fmtPct, fmtMoneda, fmtFecha, cargarScript, hoyISO } from "./ui.js";

const URL_PDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const URL_TABLAS = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
const n = v => Number(v) || 0;
const TOL = 1;

/* Columna: { t: título, n: numérica }. Fila: { c: [celdas], tipo: "" | "grupo" | "sub" | "total" | "det" }. */
/* malo: "pos" pinta de rojo los positivos (desvío = sobrecosto) en lugar de los negativos. */
const col = (t, num = true, malo = "neg") => ({ t, n: num, malo });
const fila = (c, tipo = "") => ({ c, tipo });

/* Estado de un paso de la liquidación, en palabras. */
function estadoPaso(x) {
  if (x.k === "resultado") return x.faltaUsd > TOL ? "Falta" : x.parcial ? "Espera cobros" : "Hecho";
  const nada = Math.abs(x.faltaUsd) <= TOL && !x.filas.some(f => Math.abs(f.usd ?? f.ars) > 0.5) && !(x.hechoUsd > 0.5 || x.hechoArs > 0.5);
  if (nada) return "No corresponde";
  if (x.faltaUsd > TOL) return "Falta";
  if (x.faltaUsd < -TOL) return "Sobra";
  return "Hecho";
}

/* ---------- datos ---------- */
export function armar(p, liq, sg, cerrado) {
  const r = liq.r, x = r.impuestos, mep = liq.mep;
  const mon = p.moneda === "ARS" ? "ARS" : "USD";
  const fm = v => fmtMoneda(v, mon);
  const pct = (v, base) => (base > 0 ? fmtPct(v / base) : "—");
  const u = v => fmtUSD(v);
  const cob = C.resumenCobranza(p);
  const secciones = [];
  const items = p.items || [];

  /* 1. Resumen */
  const margenFinal = r.ventasUsd > 0 ? liq.finalUsd / r.ventasUsd : null;
  const margenReal = r.ventasUsd > 0 ? (r.ventasUsd - r.costosUsd) / r.ventasUsd : null;
  const kpis = [
    { rot: "Resultado final para los socios", val: u(liq.finalUsd), sub: "Dólares MEP, netos de IVA, impuestos y estructura" },
    { rot: "Margen final", val: margenFinal == null ? "—" : fmtPct(margenFinal), sub: "Resultado final sobre lo cobrado" },
    { rot: "Margen sobre costos", val: margenReal == null ? "—" : fmtPct(margenReal), sub: sg.hayCostos ? `Cotizado ${fmtPct(sg.margenCotizadoPct)}${sg.margenProyectadoPct != null ? ` · proyectado ${fmtPct(sg.margenProyectadoPct)}` : ""}` : "Sin costo cotizado para comparar" },
    { rot: "Cobrado neto de IVA", val: u(r.ventasUsd), sub: r.cobradoPct != null ? `${fmtPct(r.cobradoPct)} del contrato` : "" }
  ];
  const datosProy = [
    ["Proyecto", p.nombre + (p.codigo ? ` (${p.codigo})` : "")],
    ["Cliente", p.cliente || "—"],
    ["Contrato", `${fm(r.contrato)} sin IVA, en ${mon === "ARS" ? "pesos" : "dólares"}`],
    ["Inicio", p.inicio ? fmtFecha(p.inicio, true) : "—"],
    [cerrado ? "Cierre" : "Liquidación simulada al", fmtFecha(liq.fecha, true)],
    ["Dólar de la liquidación", fmtARS(mep, 2)],
    ["Estado", cerrado ? "Cerrado" : "Abierto: los números son una simulación a esa fecha y ese dólar"]
  ];
  if (items.length) datosProy.push(["Avance físico", fmtPct(sg.avanceFisico)]);
  if (cob.certificadoPct != null) datosProy.push(["Certificado del contrato", fmtPct(cob.certificadoPct)]);
  const margenes = {
    titulo: `Costo y margen: cotizado, proyectado y real (en ${mon === "ARS" ? "pesos" : "dólares"}, antes de impuestos)`,
    columnas: [col("", false), col("Cotizado"), col("Proyectado"), col("Real")],
    filas: [
      fila(["Venta", fm(sg.precio), fm(sg.precio), fm(r.ventasMon)]),
      fila(["Costo", sg.hayCostos ? fm(sg.costoCotizado) : "—", sg.hayCostos ? fm(sg.costoProyectado) : "—", fm(r.costosMon)]),
      fila(["Margen sobre la venta", sg.hayCostos ? fmtPct(sg.margenCotizadoPct) : "—", sg.hayCostos && sg.margenProyectadoPct != null ? fmtPct(sg.margenProyectadoPct) : "—", margenReal == null ? "—" : fmtPct(margenReal)], "total")
    ],
    nota: (sg.hayCostos ? "" : "El presupuesto no tiene costo cotizado: no se puede medir contra lo cotizado. ") + "La venta real es lo cobrado neto de IVA; la cotizada, el precio total del contrato."
  };
  secciones.push({ id: "resumen", titulo: "Resumen", kpis, pares: datosProy, tablas: [margenes] });

  /* 2. Ingresos */
  const tIng = [];
  if (cob.docs.length) {
    const tot = { neto: 0, iva: 0, total: 0, canc: 0, saldo: 0 };
    const filasDoc = cob.docs.map(d => {
      const f = d.doc.factura || {};
      tot.neto += d.imp.neto; tot.iva += d.imp.iva; tot.total += d.imp.total; tot.canc += d.cancelado; tot.saldo += d.facturado ? d.saldo : 0;
      return fila([C.tituloDoc(d.doc) + (d.doc.periodo ? ` · ${d.doc.periodo}` : ""), f.numero ? `${f.numero}${f.fecha ? " · " + fmtFecha(f.fecha) : ""}` : (f.fecha ? fmtFecha(f.fecha) : "Sin facturar"),
        fm(d.imp.neto), fm(d.imp.iva), fm(d.imp.total), fm(d.cancelado), d.facturado ? fm(d.saldo) : "—", (C.ESTADOS[d.estado] || {}).nombre || d.estado], "");
    });
    filasDoc.push(fila(["Total", "", fm(tot.neto), fm(tot.iva), fm(tot.total), fm(tot.canc), fm(tot.saldo), ""], "total"));
    tIng.push({ titulo: `Facturas y certificados (en ${mon === "ARS" ? "pesos" : "dólares del contrato"})`, columnas: [col("Documento", false), col("Factura", false), col("Neto"), col("IVA"), col("Total"), col("Cobrado"), col("Saldo"), col("Estado", false)], filas: filasDoc });
  }
  const sueltos = S.movimientos.filter(m => M.esVenta(m) && m.bolsillo === p.id && !m.certificado);
  const ret = x.retIibbArs + x.retGanArs + x.retIvaArs + x.retOtrasArs;
  const resumenCob = [
    fila(["Cobrado neto de IVA, en dólares MEP del día de cada cobro", u(r.ventasUsd)]),
    fila(["Retenciones que hizo el cliente (en pesos; ya son impuesto pagado)", fmtARS(ret)]),
    fila(["Pendiente de cobrar", fm(cob.porCobrar)]),
  ];
  if (sueltos.length) resumenCob.splice(1, 0, fila([`Cobros cargados sin certificado (${sueltos.length}), neto de IVA`, u(sueltos.reduce((a, m) => a + M.netoUsd(m), 0))]));
  if (cob.sinFacturar.length) resumenCob.push(fila([`Documentos sin facturar`, String(cob.sinFacturar.length)]));
  if (cob.anticipo.facturado || cob.anticipo.contrato) resumenCob.push(fila(["Anticipo facturado / falta amortizar", `${fm(cob.anticipo.facturado)} / ${fm(cob.anticipo.saldo)}`]));
  if (cob.fondo.retenido) resumenCob.push(fila(["Fondo de reparo retenido / falta devolver", `${fm(cob.fondo.retenido)} / ${fm(cob.fondo.saldo)}`]));
  if (mon === "USD" && Math.abs(cob.difCambio) > 0.5) resumenCob.push(fila(["Diferencia de cambio en la cobranza (MEP del cobro contra tipo de cambio de pago)", u(cob.difCambio)]));
  tIng.push({ titulo: "Cobranza", columnas: [col("", false), col("Importe")], filas: resumenCob });
  secciones.push({ id: "ingresos", titulo: "Ingresos", intro: "Cada factura o certificado con su IVA y su estado de cobro, y el resumen de la cobranza.", tablas: tIng });

  /* 3. Egresos */
  const costos = S.movimientos.filter(m => M.esCosto(m) && m.bolsillo === p.id);
  const totCos = r.costosUsd;
  const filasCat = [];
  const tipos = M.TIPOS_COSTO.concat(Object.keys(r.porTipo).filter(t => !M.TIPOS_COSTO.includes(t)));
  tipos.forEach(t => {
    const v = r.porTipo[t];
    if (!(Math.abs(v) > 0.5)) return;
    filasCat.push(fila([t === "Sin tipo" ? "Sin categoría" : M.nombreCategoria(t), u(v), pct(v, totCos)], "grupo"));
    Object.entries(r.porSubcat).filter(([k]) => k.startsWith(t + "|")).sort((a, b) => b[1] - a[1])
      .forEach(([k, s]) => { if (Math.abs(s) > 0.5) filasCat.push(fila([k.split("|")[1], u(s), pct(s, totCos)], "det")); });
  });
  filasCat.push(fila(["Total de costos", u(totCos), totCos ? "100%" : "—"], "total"));
  const porProv = {};
  costos.forEach(m => { const k = (m.proveedor || "").trim() || "Sin proveedor"; porProv[k] = porProv[k] || { usd: 0, n: 0 }; porProv[k].usd += M.netoUsd(m); porProv[k].n++; });
  const provs = Object.entries(porProv).sort((a, b) => b[1].usd - a[1].usd);
  const top = provs.slice(0, 10), resto = provs.slice(10);
  const filasProv = top.map(([k, v]) => fila([k, String(v.n), u(v.usd), pct(v.usd, totCos)]));
  if (resto.length) {
    const ru = resto.reduce((a, [, v]) => a + v.usd, 0), rn = resto.reduce((a, [, v]) => a + v.n, 0);
    filasProv.push(fila([`Otros ${resto.length} proveedores`, String(rn), u(ru), pct(ru, totCos)]));
  }
  const porFiscal = {};
  costos.forEach(m => { const k = m.fiscal || "?"; porFiscal[k] = (porFiscal[k] || 0) + M.netoUsd(m); });
  const filasFis = M.FISCAL.filter(f => Math.abs(porFiscal[f.id] || 0) > 0.5).map(f => fila([f.nombre, f.id === "X" ? "No" : "Sí", u(porFiscal[f.id]), pct(porFiscal[f.id], totCos)]));
  if (Math.abs(porFiscal["?"] || 0) > 0.5) filasFis.push(fila(["Sin indicar", "Sí", u(porFiscal["?"]), pct(porFiscal["?"], totCos)]));
  const tEgr = [
    { titulo: "Por categoría y subcategoría", columnas: [col("Categoría", false), col("Dólares MEP"), col("% del costo")], filas: filasCat },
    { titulo: "Principales proveedores", columnas: [col("Proveedor", false), col("Gastos"), col("Dólares MEP"), col("% del costo")], filas: filasProv },
    { titulo: "Por comprobante", columnas: [col("Comprobante", false), col("Se deduce de Ganancias", false), col("Dólares MEP"), col("% del costo")], filas: filasFis }
  ];
  if (liq.asignado) {
    const t = x.tasaGanEf || 0;
    tEgr.push({ titulo: "Parte de estructura de MICA y gastos de Magna", columnas: [col("", false), col("Dólares MEP")], filas: [
      fila(["Parte asignada al proyecto, según lo cobrado por cada proyecto", u(liq.asignado)]),
      fila([`Ahorro de Ganancias (${fmtPct(t, 0)}): esos gastos bajan el impuesto de Magna`, u(-liq.asignado * t)]),
      fila(["A cargo del proyecto", u(liq.asignadoNeto)], "total")
    ] });
  }
  secciones.push({ id: "egresos", titulo: "Egresos", intro: "Costos del proyecto netos de IVA y percepciones, en dólares MEP del día de cada gasto.", tablas: tEgr });

  /* 4. Resultado en cascada */
  const cas = [fila(["Cobrado, neto de IVA", u(r.ventasUsd), pct(r.ventasUsd, r.ventasUsd)]), fila(["Costos", u(-r.costosUsd), pct(-r.costosUsd, r.ventasUsd)])];
  if (r.honorariosUsd) cas.push(fila(["Honorarios de socios", u(-r.honorariosUsd), pct(-r.honorariosUsd, r.ventasUsd)]));
  if (r.interesesUsd) cas.push(fila(["Intereses de préstamos", u(-r.interesesUsd), pct(-r.interesesUsd, r.ventasUsd)]));
  if (r.interesesGanadosUsd) cas.push(fila(["Intereses ganados", u(r.interesesGanadosUsd), pct(r.interesesGanadosUsd, r.ventasUsd)]));
  cas.push(fila(["Resultado antes de impuestos", u(r.resultadoUsd), pct(r.resultadoUsd, r.ventasUsd)], "sub"));
  cas.push(fila([`Ingresos Brutos (${String(x.param.iibb).replace(".", ",")}%)`, u(-x.iibbUsd), pct(-x.iibbUsd, r.ventasUsd)]));
  cas.push(fila(["Impuesto al cheque", u(-x.chequeUsd), pct(-x.chequeUsd, r.ventasUsd)]));
  cas.push(fila(["Ganancias a cargo del proyecto", u(-x.gananciasCostoUsd), pct(-x.gananciasCostoUsd, r.ventasUsd)]));
  cas.push(fila(["Neto de impuestos", u(r.resultadoNetoUsd), pct(r.resultadoNetoUsd, r.ventasUsd)], "sub"));
  if (liq.asignado) cas.push(fila(["Parte de estructura y de Magna, neta de Ganancias", u(-liq.asignadoNeto), pct(-liq.asignadoNeto, r.ventasUsd)]));
  cas.push(fila(["Diferencia de cambio y redondeos", u(liq.difTotalUsd), pct(liq.difTotalUsd, r.ventasUsd)]));
  cas.push(fila(["Resultado final para los socios", u(liq.finalUsd), pct(liq.finalUsd, r.ventasUsd)], "total"));
  secciones.push({ id: "resultado", titulo: "Resultado en cascada", intro: "En dólares MEP, netos de IVA. La última columna es el porcentaje sobre lo cobrado.",
    tablas: [{ columnas: [col("", false), col("Dólares MEP"), col("% de lo cobrado")], filas: cas }],
    notas: ["La diferencia de cambio compara la caja en pesos, pasada al dólar de la liquidación, con lo que queda según las cuentas en dólares de cada día. Es lo que se ganó o perdió por tener la plata en pesos; también junta redondeos y errores de carga."] });

  /* 5. Impuestos y reservas */
  const iva = I.ivaProyecto(p);
  const aU = v => (mep > 0 ? v / mep : 0);
  const imp = [
    fila(["Ingresos Brutos", u(x.iibbUsd), u(-x.iibbRetenidoUsd), u(x.iibbAPagarUsd)]),
    fila(["Ganancias", u(x.gananciasCostoUsd), u(-(x.retGanUsd + x.percGanUsd)), u(x.gananciasAPagarUsd)]),
    fila(["Impuesto al cheque", u(x.chequeUsd), u(0), u(x.chequeUsd)]),
    fila(["IVA (no es costo)", u(aU(iva.debito)), u(-aU(iva.credito + iva.ret)), u(aU(iva.saldo))])
  ];
  const b = I.baseGanancias(r);
  const ganFilas = b.filas.map(f => fila([f.t, u(f.usd)], f.tipo || ""));
  const res = liq.foto.reserva;
  const paso1 = liq.pasos[0];
  const corresponde = res.aReservar + liq.ajusteReserva;
  const resFilas = res.conceptos.map(c => fila([c.nombre, fmtARS(c.ars)]));
  if (Math.abs(liq.ajusteReserva) > 1) resFilas.push(fila(["Impuestos de los propios pagos del cierre", fmtARS(liq.ajusteReserva)]));
  resFilas.push(fila(["Corresponde reservar", fmtARS(corresponde)], "sub"));
  resFilas.push(fila(["Ya reservado desde el proyecto", fmtARS(-res.reservado)]));
  resFilas.push(fila([paso1.faltaArs >= 0 ? "Falta reservar" : "Sobra: se puede liberar", fmtARS(Math.abs(paso1.faltaArs))], "total"));
  secciones.push({ id: "impuestos", titulo: "Impuestos y reservas", intro: "Estimaciones de gestión. La liquidación real la hace la contadora.", tablas: [
    { titulo: "Estimado, pagado a cuenta y falta pagar (dólares MEP)", columnas: [col("Impuesto", false), col("Estimado"), col("Pagado a cuenta"), col("Falta pagar")], filas: imp },
    { titulo: "De dónde sale Ganancias (dólares MEP)", columnas: [col("", false), col("Dólares MEP")], filas: ganFilas },
    { titulo: "Reserva fiscal del proyecto (pesos)", columnas: [col("", false), col("Pesos")], filas: resFilas }
  ], notas: [
    b.noDeducen.length ? `No se deducen de Ganancias (criterio prudente): ${b.noDeducen.map(f => `${f.t.toLowerCase()} ${u(f.usd)}`).join(", ")}. Suman unos ${u(b.extraUsd)} de impuesto.` : "",
    "Las retenciones y percepciones ya son impuesto pagado: bajan lo que falta pagar, no el resultado.",
    "Los pagos a ARCA salen de Magna · Reserva fiscal, que es común a todos los proyectos. Lo que sobre de Ganancias se libera en el cierre del ejercicio, cuando la contadora determina el impuesto real."
  ].filter(Boolean) });

  /* 6. Préstamos y socios */
  const tSoc = [];
  const pres = r.prestamos;
  if (pres.length) {
    const ps = pres.map(g => fila([g.nombre, u(g.recibidoUsd), u(g.interesUsd), u(-g.devueltoUsd), u(g.saldoUsd)]));
    const sum = k => pres.reduce((a, g) => a + g[k], 0);
    ps.push(fila(["Total", u(sum("recibidoUsd")), u(sum("interesUsd")), u(-sum("devueltoUsd")), u(sum("saldoUsd"))], "total"));
    tSoc.push({ titulo: "Préstamos al proyecto", columnas: [col("Prestamista", false), col("Capital"), col("Interés"), col("Devuelto"), col("Saldo")], filas: ps });
  }
  const pagos = liq.foto.pagos;
  const recibido = SOCIOS.map(s => {
    const pg = pagos[s.id] || {};
    const pr = pres.filter(g => g.socio === s.id).reduce((a, g) => a + g.devueltoUsd, 0);
    const v = [pr, n(pg.aportesDevueltos), n(pg.honorarios), n(pg.distribuido)];
    return { s, v, tot: v.reduce((a, z) => a + z, 0) };
  });
  const recFilas = recibido.map(x0 => fila([x0.s.nombre, ...x0.v.map(u), u(x0.tot)]));
  recFilas.push(fila(["Total", ...[0, 1, 2, 3].map(i => u(recibido.reduce((a, z) => a + z.v[i], 0))), u(recibido.reduce((a, z) => a + z.tot, 0))], "total"));
  tSoc.push({ titulo: "Lo que ya recibió cada socio", columnas: [col("Socio", false), col("Préstamos devueltos"), col("Aportes devueltos"), col("Honorarios"), col("Resultado"), col("Total")], filas: recFilas });
  const pasosF = liq.pasos.map(x0 => {
    const st = estadoPaso(x0);
    const faltaArs = x0.k === "impuestos" ? x0.faltaArs : x0.faltaUsd * mep;
    const hay = st === "Falta" || st === "Sobra" || st === "Espera cobros";
    return fila([`${x0.n}. ${x0.titulo}`, st, hay && Math.abs(x0.faltaUsd) > TOL ? u(x0.faltaUsd) : "—", hay && Math.abs(faltaArs) > 0.5 ? fmtARS(faltaArs) : "—"]);
  });
  tSoc.push({ titulo: "Liquidación paso a paso", columnas: [col("Paso", false), col("Estado", false), col("Falta (US$)"), col("Falta (pesos)")], filas: pasosF });
  const cf = liq.foto.cuenta.filas;
  const sumC = k => cf.reduce((a, f) => a + f[k], 0);
  const repFilas = cf.map(f => fila([f.nombre, fmtPct(f.pct, 0), u(f.aportes), u(f.prestamos), u(f.honorarios), u(f.resultado), u(-f.distribuido), u(f.aFavor)]));
  repFilas.push(fila(["Total", fmtPct(sumC("pct"), 0), u(sumC("aportes")), u(sumC("prestamos")), u(sumC("honorarios")), u(sumC("resultado")), u(-sumC("distribuido")), u(sumC("aFavor"))], "total"));
  tSoc.push({ titulo: "Reparto final: lo que le toca a cada socio y lo que queda a favor", columnas: [col("Socio", false), col("%"), col("Aportes"), col("Préstamos"), col("Honorarios"), col("Resultado"), col("Recibido"), col("A favor")], filas: repFilas });
  const notasSoc = [];
  const p6 = liq.pasos.find(z => z.k === "resultado");
  if (p6 && p6.parcial) notasSoc.push(`Hay facturas por cobrar: hoy se reparte lo que hay en caja y otros ${u(p6.aCobrarUsd)} quedan a favor de cada socio hasta el cobro.`);
  if (!cerrado && Math.abs(liq.difUsd) > TOL) notasSoc.push(`Con el proyecto abierto, la columna Resultado todavía no incluye la diferencia de cambio (${u(liq.difUsd)}): se suma al cerrar y se reparte según la participación.`);
  notasSoc.push("A favor = aportes + préstamos con su interés + honorarios pendientes + su parte del resultado − lo que ya recibió.");
  secciones.push({ id: "socios", titulo: "Préstamos y socios", intro: "En dólares MEP. Los préstamos llevan interés compuesto diario hasta la fecha de liquidación.", tablas: tSoc, notas: notasSoc });

  /* 7. Cotizado contra real por rubro */
  if (items.length) {
    const ventaRubro = {};
    items.forEach(it => { const k = it.rubro || "Sin rubro"; ventaRubro[k] = (ventaRubro[k] || 0) + P.ventaItem(it); });
    const lin = sg.rubros.map(z => ({ nombre: z.nombre, venta: ventaRubro[z.nombre] || 0, cot: z.cot, real: z.real }));
    if (sg.general.cot || sg.general.real) lin.push({ nombre: "Gastos generales de obra", venta: 0, cot: sg.general.cot, real: sg.general.real });
    if (Math.abs(sg.otros) > 0.5) lin.push({ nombre: "Imputado a ítems o rubros que ya no existen", venta: 0, cot: 0, real: sg.otros });
    const rf = lin.map(z => fila([z.nombre, fm(z.venta), z.cot ? fm(z.cot) : "—", fm(z.real), z.cot > 0 ? fmtPct(z.real / z.cot - 1) : "—", z.venta > 0 ? fmtPct(1 - z.real / z.venta) : "—"]));
    const tv = lin.reduce((a, z) => a + z.venta, 0), tc = lin.reduce((a, z) => a + z.cot, 0), tr = lin.reduce((a, z) => a + z.real, 0);
    rf.push(fila(["Total", fm(tv), tc ? fm(tc) : "—", fm(tr), tc > 0 ? fmtPct(tr / tc - 1) : "—", tv > 0 ? fmtPct(1 - tr / tv) : "—"], "total"));
    const notas7 = [];
    if (!sg.hayCostos) notas7.push("El presupuesto no tiene costo cotizado: se compara el costo real contra la venta de cada rubro.");
    notas7.push("Desvío = costo real ÷ costo cotizado − 1 (positivo es sobrecosto). Margen real = 1 − costo real ÷ venta. No incluye impuestos ni estructura.");
    secciones.push({ id: "cotizado", titulo: "Cotizado contra real por rubro", intro: `En ${mon === "ARS" ? "pesos nominales" : "dólares"}, la moneda del contrato.`,
      tablas: [{ columnas: [col("Rubro", false), col("Venta"), col("Costo cotizado"), col("Costo real"), col("Desvío", true, "pos"), col("Margen real")], filas: rf }], notas: notas7 });
  }

  return { proyecto: { nombre: p.nombre, codigo: p.codigo || "", cliente: p.cliente || "" }, fecha: liq.fecha, mep, cerrado, generado: hoyISO(), secciones };
}

/* ---------- vista previa en pantalla ---------- */
const MENOS = "−";
const celda = (v, num, malo = "neg") => num && (malo === "pos" ? /^\d/.test(String(v)) && v !== "0,0%" : String(v).startsWith(MENOS)) ? `<span class="num neg">${esc(v)}</span>` : esc(v);

function tablaHtml(t) {
  const cls = { grupo: "grupo", sub: "sub", total: "total", det: "det" };
  return `${t.titulo ? `<h4 class="inf-tit">${esc(t.titulo)}</h4>` : ""}
    <div class="tabla-env"><table class="tabla tabla-compacta tabla-informe">${t.columnas.some(c => c.t) ? `<thead><tr>${t.columnas.map(c => `<th${c.n ? ' class="n"' : ""}>${esc(c.t)}</th>`).join("")}</tr></thead>` : ""}<tbody>
      ${t.filas.map(f => `<tr${cls[f.tipo] ? ` class="${cls[f.tipo]}"` : ""}>${f.c.map((v, i) => `<td${t.columnas[i] && t.columnas[i].n ? ' class="n"' : ""}>${celda(v, t.columnas[i] && t.columnas[i].n, t.columnas[i] && t.columnas[i].malo)}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div>${t.nota ? `<p class="panel-sub" style="margin-top:6px">${esc(t.nota)}</p>` : ""}`;
}

export function html(d, comentario, formatear) {
  return d.secciones.map((s, i) => `<section class="inf-sec"><h3 class="inf-h">${i + 1}. ${esc(s.titulo)}</h3>
    ${s.intro ? `<p class="panel-sub">${esc(s.intro)}</p>` : ""}
    ${s.kpis ? `<div class="inf-kpis">${s.kpis.map(k => `<div class="kpi"><div class="kpi-rot">${esc(k.rot)}</div><div class="kpi-val">${celda(k.val, true)}</div><div class="kpi-sub">${esc(k.sub)}</div></div>`).join("")}</div>` : ""}
    ${s.pares ? `<table class="tabla tabla-compacta tabla-informe"><tbody>${s.pares.map(([a, b]) => `<tr><td class="mute">${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</tbody></table>` : ""}
    ${s.tablas.map(tablaHtml).join("")}
    ${(s.notas || []).map(t => `<p class="panel-sub" style="margin-top:8px">${esc(t)}</p>`).join("")}</section>`).join("")
    + (comentario ? `<section class="inf-sec"><h3 class="inf-h">${d.secciones.length + 1}. Análisis de la IA</h3><div class="informe">${formatear(comentario)}</div></section>` : "");
}

/* ---------- texto para la IA ---------- */
export function textoParaIA(d) {
  const linea = c => c.join(" | ");
  return d.secciones.map(s => [`## ${s.titulo}`,
    ...(s.kpis || []).map(k => `${k.rot}: ${k.val} (${k.sub})`),
    ...(s.pares || []).map(([a, b]) => `${a}: ${b}`),
    ...s.tablas.flatMap(t => [t.titulo ? `### ${t.titulo}` : "", linea(t.columnas.map(c => c.t || "Concepto")), ...t.filas.map(f => linea(f.c)), t.nota || ""]),
    ...(s.notas || [])].filter(Boolean).join("\n")).join("\n\n");
}

/* ---------- PDF ---------- */
// Helvetica del PDF no tiene algunos signos: se reemplazan por equivalentes.
const limpiar = s => String(s ?? "").replace(/−/g, "-").replace(/[   ]/g, " ").replace(/→/g, "->").replace(/≈/g, "~");
const ROJO = [225, 38, 45], NEGRO = [26, 26, 26], GRIS = [110, 110, 110], GRIS_C = [236, 236, 236], FONDO = [246, 246, 246];

async function imagen(src) {
  try {
    const blob = await (await fetch(src)).blob();
    const url = await new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = mal; fr.readAsDataURL(blob); });
    const dim = await new Promise(ok => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => ok(null); im.src = url; });
    return dim ? { url, ...dim } : null;
  } catch (e) { return null; }
}

export async function pdf(d, comentario) {
  await cargarScript(URL_PDF);
  await cargarScript(URL_TABLAS);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  if (typeof doc.autoTable !== "function") throw new Error("No se pudo cargar el generador de tablas del PDF.");
  const W = 210, H = 297, MI = 15, ANCHO = W - 2 * MI, ARRIBA = 24, ABAJO = H - 18;
  const logo = await imagen("img/logo-mica-negro.png");
  let y = MI;

  const texto = (t, x0, y0, o = {}) => {
    doc.setFont("helvetica", o.bold ? "bold" : "normal"); doc.setFontSize(o.size || 9); doc.setTextColor(...(o.color || NEGRO));
    const ls = doc.splitTextToSize(limpiar(t), o.ancho || ANCHO);
    doc.text(ls, x0, y0, { align: o.align || "left", lineHeightFactor: 1.35 });
    return ls.length * (o.size || 9) * 0.3528 * 1.35;
  };
  const alto = (t, size = 9, ancho = ANCHO) => { doc.setFontSize(size); return doc.splitTextToSize(limpiar(t), ancho).length * size * 0.3528 * 1.35; };
  const lugar = h => { if (y + h > ABAJO) { doc.addPage(); y = ARRIBA; } };

  /* Portada */
  if (logo) doc.addImage(logo.url, "PNG", MI, y, 10.5 * logo.w / logo.h, 10.5);
  texto("Solo para los socios", W - MI, y + 5, { size: 8, color: GRIS, align: "right" });
  y += 24;
  doc.setFillColor(...ROJO); doc.rect(MI, y - 5, 1.6, 15, "F");
  y += texto("Informe de cierre de proyecto", MI + 5, y, { size: 19, bold: true });
  y += texto(`${d.proyecto.nombre}${d.proyecto.cliente ? " · " + d.proyecto.cliente : ""}`, MI + 5, y + 1, { size: 12, color: GRIS }) + 3;
  y += texto(d.cerrado ? `Cerrado el ${fmtFecha(d.fecha, true)} · dólar ${fmtARS(d.mep, 2)}` : `Simulación al ${fmtFecha(d.fecha, true)} · dólar ${fmtARS(d.mep, 2)} · el proyecto sigue abierto`, MI + 5, y, { size: 9, color: GRIS }) + 6;

  const resumen = d.secciones[0];
  const gap = 4, kw = (ANCHO - gap * 3) / 4, kh = 30;
  resumen.kpis.forEach((k, i) => {
    const x0 = MI + i * (kw + gap);
    doc.setFillColor(...(i === 0 ? NEGRO : FONDO)); doc.roundedRect(x0, y, kw, kh, 1.5, 1.5, "F");
    const claro = i === 0;
    const hr = texto(k.rot, x0 + 3.5, y + 5.5, { size: 7, bold: true, color: claro ? [210, 210, 210] : GRIS, ancho: kw - 7 });
    const v = limpiar(k.val), yv = y + 5.5 + hr + 4.2;
    texto(v, x0 + 3.5, yv, { size: 13.5, bold: true, color: claro ? [255, 255, 255] : (v.startsWith("-") ? ROJO : NEGRO), ancho: kw - 7 });
    texto(k.sub, x0 + 3.5, yv + 5.2, { size: 6.5, color: claro ? [200, 200, 200] : GRIS, ancho: kw - 7 });
  });
  y += kh + 8;

  const estiloFila = (t, data) => {
    const f = t.filas[data.row.index];
    if (!f) return;
    const c = t.columnas[data.column.index] || {};
    if (f.tipo === "total") { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [238, 238, 238]; }
    if (f.tipo === "sub") { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = FONDO; }
    if (f.tipo === "grupo") data.cell.styles.fontStyle = "bold";
    if (f.tipo === "det" && data.column.index === 0) data.cell.styles.cellPadding = { top: 1.4, bottom: 1.4, left: 6, right: 2 };
    if (f.tipo === "det") data.cell.styles.textColor = [70, 70, 70];
    const raw = String(data.cell.raw);
    if (c.n && (c.malo === "pos" ? /^\d/.test(raw) && raw !== "0,0%" : raw.startsWith("-"))) data.cell.styles.textColor = ROJO;
  };
  // Alto estimado de una tabla: las columnas de texto se reparten lo que dejan las numéricas; cada renglón crece con sus líneas.
  const altoTabla = t => {
    const head = t.columnas.some(c => c.t), body = t.filas.map(f => f.c.map(limpiar));
    const nNum = t.columnas.filter(c => c.n).length, nTxt = t.columnas.length - nNum;
    const anchoTxt = Math.max(30, (ANCHO - nNum * 22) / Math.max(1, nTxt)) - 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.2);
    return body.reduce((a, c) => a + 3.4 + 3.6 * Math.max(1, ...c.map((v, i) => t.columnas[i] && t.columnas[i].n ? 1 : Math.ceil(doc.getTextWidth(v) / anchoTxt))), 0)
      + (head ? 6.5 : 0) + (t.titulo ? 7 : 0);
  };
  const tabla = t => {
    const head = t.columnas.some(c => c.t) ? [t.columnas.map(c => limpiar(c.t))] : undefined;
    const body = t.filas.map(f => f.c.map(limpiar));
    const filasAlto = altoTabla(t);
    if (filasAlto < ABAJO - ARRIBA && y + filasAlto > ABAJO) { doc.addPage(); y = ARRIBA; }
    else lugar(t.titulo ? 22 : 15);
    if (t.titulo) { y += texto(t.titulo, MI, y + 3, { size: 9.5, bold: true }) + 1.5; }
    const colStyles = {};
    t.columnas.forEach((c, i) => { if (c.n) colStyles[i] = { halign: "right", cellWidth: "wrap" }; });
    doc.autoTable({
      startY: y, head, body, theme: "plain", margin: { left: MI, right: MI, top: ARRIBA, bottom: H - ABAJO },
      styles: { font: "helvetica", fontSize: 8.2, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, textColor: NEGRO, lineColor: GRIS_C, lineWidth: { bottom: 0.15 }, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: NEGRO, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.4 },
      columnStyles: colStyles, rowPageBreak: "avoid", showHead: "everyPage",
      didParseCell: data => {
        if (data.section === "head") { if (t.columnas[data.column.index] && t.columnas[data.column.index].n) data.cell.styles.halign = "right"; return; }
        estiloFila(t, data);
      }
    });
    y = doc.lastAutoTable.finalY + 2;
    if (t.nota) y += texto(t.nota, MI, y + 3, { size: 7.5, color: GRIS }) + 1;
    y += 4;
  };
  const notas = ns => ns.forEach(t => { const h0 = alto(t, 7.8); lugar(h0 + 2); y += texto(t, MI, y + 3, { size: 7.8, color: GRIS }) + 1.5; });

  /* Datos del proyecto de la portada */
  const paresT = { columnas: [col("", false), col("", false)], filas: resumen.pares.map(([a, b]) => fila([a, b])) };
  doc.autoTable({ startY: y, body: paresT.filas.map(f => f.c.map(limpiar)), theme: "plain", margin: { left: MI, right: MI, top: ARRIBA, bottom: H - ABAJO },
    styles: { font: "helvetica", fontSize: 8.6, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, textColor: NEGRO, lineColor: GRIS_C, lineWidth: { bottom: 0.15 } },
    columnStyles: { 0: { cellWidth: 52, textColor: GRIS } } });
  y = doc.lastAutoTable.finalY + 7;
  resumen.tablas.forEach(tabla);
  notas(resumen.notas || []);

  /* Secciones */
  d.secciones.slice(1).forEach((s, i) => {
    const hIntro = s.intro ? alto(s.intro, 8.5) : 0;
    // El título de la sección va en la misma página que su primera tabla.
    const primera = s.tablas[0] ? Math.min(altoTabla(s.tablas[0]), ABAJO - ARRIBA - 30) : 30;
    lugar(12 + hIntro + primera);
    y += 3;
    doc.setFillColor(...ROJO); doc.rect(MI, y - 4.2, 1.4, 6, "F");
    y += texto(`${i + 2}. ${s.titulo}`, MI + 4, y, { size: 13, bold: true }) + 1;
    if (s.intro) y += texto(s.intro, MI, y + 1.5, { size: 8.5, color: GRIS }) + 3;
    s.tablas.forEach(tabla);
    notas(s.notas || []);
    y += 3;
  });

  /* Análisis de la IA */
  if (comentario) {
    lugar(40);
    y += 3;
    doc.setFillColor(...ROJO); doc.rect(MI, y - 4.2, 1.4, 6, "F");
    y += texto(`${d.secciones.length + 1}. Análisis de la IA`, MI + 4, y, { size: 13, bold: true }) + 1;
    y += texto("Comentario redactado por la IA a partir de las tablas de este informe. Revisalo antes de usarlo.", MI, y + 1.5, { size: 8.5, color: GRIS }) + 3;
    String(comentario).split("\n").forEach(l0 => {
      let l = l0.replace(/\*\*(.+?)\*\*/g, "$1").trimEnd();
      if (!l.trim()) { y += 2; return; }
      const tit = /^#{1,4}\s/.test(l), vin = /^\s*[-•*]\s+/.test(l);
      l = l.replace(/^#{1,4}\s/, "").replace(/^\s*[-•*]\s+/, "");
      const size = tit ? 10 : 9, sang = vin ? 5 : 0;
      const h0 = alto(l, size, ANCHO - sang);
      lugar(h0 + (tit ? 6 : 1));
      if (tit) y += 2.5;
      if (vin) texto("•", MI + 1.2, y + 3, { size });
      y += texto(l, MI + sang, y + 3, { size, bold: tit, ancho: ANCHO - sang }) + (tit ? 1 : 0.8);
    });
  }

  /* Encabezado y pie en todas las páginas */
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i > 1) {
      if (logo) doc.addImage(logo.url, "PNG", MI, 8, 7 * logo.w / logo.h, 7);
      texto(`Informe de cierre · ${d.proyecto.nombre}`, W - MI, 12.5, { size: 8, color: GRIS, align: "right" });
      doc.setDrawColor(...ROJO); doc.setLineWidth(0.5); doc.line(MI, 17, W - MI, 17);
    }
    doc.setDrawColor(...GRIS_C); doc.setLineWidth(0.2); doc.line(MI, H - 13, W - MI, H - 13);
    texto(`MICA · Minería Integral Catamarca · Uso interno de los socios · Generado el ${fmtFecha(d.generado, true)}`, MI, H - 8.5, { size: 7, color: GRIS });
    texto(`Página ${i} de ${total}`, W - MI, H - 8.5, { size: 7, color: GRIS, align: "right" });
  }
  const nombre = `Informe de cierre ${d.proyecto.codigo || d.proyecto.nombre} ${d.fecha}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
  doc.save(nombre);
  return nombre;
}
