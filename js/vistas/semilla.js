/* =========================================================
   Datos iniciales: se cargan una sola vez, la primera vez que
   alguien entra. Usan ids fijos, así no se duplican.
   ========================================================= */
import { S, guardar, borrar, guardarConfig } from "./db.js";
import { actualizarProyecto, idAvance } from "./presupuesto.js";

export const CATEGORIAS_INICIALES = {
  categoriasEstructura: ["Contadora y estudio", "Seguros", "Vehículos", "Cámaras y cuotas (CASEMICA)", "Bancos y comisiones", "Software y sistemas", "Oficina", "Otros"],
  categoriasMagna: ["Contadora de la SRL", "Cuota CASEMICA", "Bancos y comisiones", "Trámites y sellados", "Otros"],
  categoriasReserva: ["IVA", "Ingresos Brutos", "Ganancias", "Impuesto al cheque", "Otros impuestos"]
};

export function proyectoTresCruces() {
  return {
    id: "p_trescruces",
    nombre: "Tres Cruces",
    codigo: "MICA-TC",
    cliente: "Minera Cordillera S.A.U.",
    cuitCliente: "30-70954903-7",
    ubicacion: "Fiambalá, Tinogasta, Catamarca",
    tipoObra: "Servicio de instalación de bombas y estaciones de bombeo",
    estado: "activo",
    moneda: "USD",
    montoContrato: 174834,
    anticipo: 38000,
    anticipoCuotas: 3,
    alicuotaIVA: 21,
    retenciones: { gan: 0, iibb: 0, iva: 0 },
    fondoReparoPct: 0,
    plazoPago: 14,
    inicio: "",
    finPrevisto: "",
    participacion: { jeremias: 25, jorge: 25, julio: 25, jose: 25 },
    items: [
      { id: "it3", numero: "3", descripcion: "Relevamiento e inspección técnica del equipamiento y bombas en el depósito de Fiambalá, con Informe Técnico de Aptitud y Cómputo de faltantes", rubro: "Relevamiento en depósito", unidad: "Gl", cantidad: 1, precioUnitario: 2301 },
      { id: "it7", numero: "7", descripcion: "Servicio mensual de mano de obra en roster 14×14: especialista eléctrico, técnico en Seguridad e Higiene y dos ayudantes", rubro: "Servicio mensual en sitio", unidad: "Mes", cantidad: 3, precioUnitario: 25185 },
      { id: "it8", numero: "8", descripcion: "Alquiler de hidrogrúa con winche y operador habilitado, con herramientas y comunicación satelital", rubro: "Servicio mensual en sitio", unidad: "Mes", cantidad: 3, precioUnitario: 27106 },
      { id: "it9", numero: "9", descripcion: "Cambio de turno de la cuadrilla en roster 14×14, dos rotaciones por mes", rubro: "Servicio mensual en sitio", unidad: "Mes", cantidad: 3, precioUnitario: 5220 }
    ],
    notas: "Oferta MICA-TC-OE-001 Rev. 2. Escenario base de tres meses garantizados. Facturación en dólares, pago en pesos a cotización divisa vendedor BNA del día de pago. Anticipo amortizable en partes iguales sobre los tres certificados.",
    creadoPor: "semilla"
  };
}

export function sembrarSiHaceFalta() {
  if ((S.config.general || {}).semilla) return false;
  if (!S.cuentas.some(c => c.id === "c_magna")) {
    guardar("cuentas", { id: "c_magna", nombre: "Cuenta corriente Magna Desarrollos", banco: "", tipo: "banco", notas: "" });
  }
  if (!S.proyectos.some(p => p.id === "p_trescruces")) guardar("proyectos", proyectoTresCruces());
  guardarConfig("general", Object.assign({ semilla: 1, sembradoEl: new Date().toISOString() }, CATEGORIAS_INICIALES));
  return true;
}

/* ---------- datos de ejemplo (solo modo local, para probar) ---------- */
export function datosDeEjemplo() {
  const mov = (o) => Object.assign({ cuenta: "c_magna", cotizacionFuente: "manual", demo: true, creadoPor: "julio", creadoEl: new Date().toISOString() }, o);
  const iva21 = t => Math.round((t - t / 1.21) * 100) / 100;
  const L = [];
  L.push(mov({ tipo: "ingreso", clase: "inicial", fecha: "2026-08-01", bolsillo: "MAGNA", montoARS: 9000000, cotizacion: 1345, concepto: "Saldo de la cuenta al empezar a usar la app" }));
  L.push(mov({ tipo: "pase", clase: "prestamo", fecha: "2026-08-03", bolsillo: "MAGNA", destino: "p_trescruces", montoARS: 6000000, cotizacion: 1350, socio: "julio", tasa: 8, concepto: "Préstamo de arranque" }));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-08-06", bolsillo: "p_trescruces", montoARS: 2420000, ivaARS: iva21(2420000), fiscal: "A", alicuota: 21, cotizacion: 1352, proveedor: "Seguridad Andina SRL", concepto: "EPP y ropa de trabajo", imputacion: "g", tipoCosto: "Materiales", subcategoria: "EPP y ropa de trabajo" }));
  L.push(mov(cobroEjemplo({ fecha: "2026-08-12", clase: "anticipo", cert: "ce_demo_ant", neto: 38000, tcPago: 1340, mep: 1362, factura: "0003-00000041", concepto: "Factura de anticipo" })));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-08-20", bolsillo: "p_trescruces", montoARS: 2900000, ivaARS: iva21(2900000), fiscal: "A", alicuota: 21, cotizacion: 1371, proveedor: "Ing. Paula Herrera", concepto: "Informe técnico de aptitud", imputacion: "i:it3", tipoCosto: "Subcontratos", subcategoria: "Servicios técnicos y profesionales" }));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-08-31", bolsillo: "p_trescruces", montoARS: 21500000, ivaARS: 0, fiscal: "S", cotizacion: 1380, proveedor: "Sueldos y cargas", concepto: "Cuadrilla agosto", imputacion: "i:it7", tipoCosto: "Mano de obra", subcategoria: "Quincenas" }));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-09-02", bolsillo: "p_trescruces", montoARS: 30250000, ivaARS: iva21(30250000), fiscal: "A", alicuota: 21, cotizacion: 1384, proveedor: "Grúas del Oeste SA", concepto: "Hidrogrúa agosto", imputacion: "i:it8", tipoCosto: "Equipos", subcategoria: "Alquiler de equipos" }));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-09-05", bolsillo: "p_trescruces", montoARS: 4100000, ivaARS: 0, fiscal: "B", cotizacion: 1386, proveedor: "Transporte Fiambalá", concepto: "Rotaciones agosto", imputacion: "i:it9", tipoCosto: "Subcontratos", subcategoria: "Subcontratos de obra" }));
  L.push(mov(cobroEjemplo({ fecha: "2026-09-18", clase: "cobro", cert: "ce_demo_c1", neto: 59812 - 38000 / 3, tcPago: 1385, mep: 1398, factura: "0003-00000052", concepto: "Certificado N° 1 (agosto 2026)" })));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-09-10", bolsillo: "p_trescruces", montoARS: 1850000, ivaARS: iva21(1850000), fiscal: "A", alicuota: 21, cotizacion: 1390, proveedor: "YPF Fiambalá", concepto: "Combustible camioneta", imputacion: "r:Servicio mensual en sitio", tipoCosto: "Indirectos", subcategoria: "Combustible de movilidad" }));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-09-30", bolsillo: "p_trescruces", montoARS: 21900000, ivaARS: 0, fiscal: "S", cotizacion: 1410, proveedor: "Sueldos y cargas", concepto: "Cuadrilla septiembre", imputacion: "i:it7", tipoCosto: "Mano de obra", subcategoria: "Quincenas" }));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-09-08", bolsillo: "ESTRUCTURA", montoARS: 650000, ivaARS: iva21(650000), fiscal: "A", alicuota: 21, cotizacion: 1388, proveedor: "Estudio Contable Ríos", concepto: "Honorarios septiembre", imputacion: "c:Contadora y estudio" }));
  L.push(mov({ tipo: "ingreso", clase: "aporte", fecha: "2026-08-10", bolsillo: "p_trescruces", montoARS: 3000000, cotizacion: 1358, socio: "jeremias", concepto: "Aporte de capital" }));
  L.push(mov({ tipo: "pase", clase: "devolucion", fecha: "2026-09-25", bolsillo: "p_trescruces", destino: "MAGNA", montoARS: 2500000, cotizacion: 1402, socio: "julio", concepto: "Devolución parcial del préstamo de arranque" }));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-09-15", bolsillo: "MAGNA", montoARS: 180000, ivaARS: 0, fiscal: "B", cotizacion: 1394, proveedor: "CASEMICA", concepto: "Cuota social septiembre", imputacion: "c:Cuota CASEMICA", recuperable: true }));
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-09-20", bolsillo: "RESERVA", montoARS: 4200000, ivaARS: 0, fiscal: "S", cotizacion: 1400, proveedor: "AFIP", concepto: "IVA agosto", imputacion: "c:IVA" }));
  // Factura con IVA de dos alícuotas y percepciones.
  L.push(mov({ tipo: "egreso", clase: "gasto", fecha: "2026-09-12", bolsillo: "p_trescruces", montoARS: 3365000, ivaARS: 485000, alicuota: "varias", percIIBB: 60000, percIVA: 90000, percGan: 0, fiscal: "A", cotizacion: 1391, proveedor: "Ferretería Industrial Andina", comprobante: "0005-00012345", concepto: "Materiales eléctricos y bulonería", imputacion: "g", tipoCosto: "Materiales", subcategoria: "Herramientas y consumibles" }));
  // Gasto que pagó José con su tarjeta: queda como préstamo suyo al proyecto.
  L.push(mov({ id: "mo_demo_jose", tipo: "egreso", clase: "gasto", fecha: "2026-09-22", bolsillo: "p_trescruces", montoARS: 420000, ivaARS: iva21(420000), alicuota: 21, fiscal: "A", cotizacion: 1401, proveedor: "YPF Fiambalá", comprobante: "0012-00098765", concepto: "Gasoil camioneta", imputacion: "g", tipoCosto: "Indirectos", subcategoria: "Combustible de movilidad", pagadoPor: "jose", creadoPor: "jose" }));
  L.push(mov({ id: "mo_demo_jose__prest", tipo: "ingreso", clase: "prestamo", fecha: "2026-09-22", bolsillo: "p_trescruces", montoARS: 420000, cotizacion: 1401, socio: "jose", tasa: 0, gastoVinculado: "mo_demo_jose", concepto: "Pagó un gasto: YPF Fiambalá · Gasoil camioneta", notas: "Generado por la app a partir del gasto. Se edita o borra desde el gasto.", creadoPor: "jose" }));
  L.push(mov({ tipo: "pase", clase: "reserva", fecha: "2026-09-19", bolsillo: "p_trescruces", destino: "RESERVA", montoARS: 9000000, cotizacion: 1398, concepto: "Reserva IVA septiembre" }));
  return L;
}

/* Cobro de ejemplo: el cliente paga en pesos al tipo de cambio del día y retiene Ganancias (2%) e IIBB (2,5%). */
function cobroEjemplo({ fecha, clase, cert, neto, tcPago, mep, factura, concepto }) {
  const r = v => Math.round(v * 100) / 100;
  const total = neto * 1.21;
  const brutoARS = total * tcPago;
  const retGan = r(neto * tcPago * 0.02), retIIBB = r(neto * tcPago * 0.025);
  const acred = r(brutoARS - retGan - retIIBB);
  return {
    tipo: "ingreso", clase, fecha, bolsillo: "p_trescruces", montoARS: acred, cotizacion: mep, montoUSD: r(acred / mep),
    retGan, retIIBB, retIVA: 0, retOtras: 0, retencionesARS: r(retGan + retIIBB), tcPago,
    ivaARS: r(brutoARS * 0.21 / 1.21), alicuota: 21, fiscal: "A", certificado: cert, comprobante: factura, concepto
  };
}

export function certificadosDeEjemplo() {
  const base = { proyecto: "p_trescruces", alicuotaIVA: 21, ajustes: [], demo: true, creadoPor: "julio" };
  return [
    Object.assign({}, base, { id: "ce_demo_ant", tipo: "anticipo", fecha: "2026-08-05", monto: 38000, factura: { numero: "0003-00000041", fecha: "2026-08-05", tc: 1330, vencimiento: "2026-08-19" } }),
    Object.assign({}, base, { id: "ce_demo_c1", tipo: "certificado", numero: 1, periodo: "2026-08", fecha: "2026-08-31", items: { it3: 1, it7: 1, it8: 1, it9: 1 }, amortAnticipo: 12666.67, fondoReparo: 0, factura: { numero: "0003-00000052", fecha: "2026-08-31", tc: 1375, vencimiento: "2026-09-14" } }),
    Object.assign({}, base, { id: "ce_demo_c2", tipo: "certificado", numero: 2, periodo: "2026-09", fecha: "2026-09-15", items: { it7: 1, it8: 1, it9: 1 }, amortAnticipo: 12666.67, fondoReparo: 0, factura: { numero: "0003-00000060", fecha: "2026-09-16", tc: 1392, vencimiento: "2026-09-30" } })
  ];
}

export function proveedoresDeEjemplo() {
  return ["Seguridad Andina SRL", "Ing. Paula Herrera", "Sueldos y cargas", "Grúas del Oeste SA", "Transporte Fiambalá", "YPF Fiambalá", "Estudio Contable Ríos", "CASEMICA"]
    .map(n => ({ nombre: n, cuit: "", rubro: "", notas: "", demo: true }));
}

/* Presupuesto de ejemplo para Tres Cruces: costos cotizados, ventanas y avance. Solo para probar. */
const COSTOS_EJEMPLO = {
  it3: { costo: { mo: 900, sub: 650 }, desde: "2026-08", hasta: "2026-08" },
  it7: { costo: { mo: 16200, mat: 700 }, desde: "2026-08", hasta: "2026-10" },
  it8: { costo: { eq: 18600 }, desde: "2026-08", hasta: "2026-10" },
  it9: { costo: { sub: 3300 }, desde: "2026-08", hasta: "2026-10" }
};
export function avancesDeEjemplo() {
  return [
    { id: idAvance("p_trescruces", "2026-08"), proyecto: "p_trescruces", mes: "2026-08", cantidades: { it3: 1, it7: 1, it8: 1, it9: 1 }, cargadoPor: "julio", demo: true },
    { id: idAvance("p_trescruces", "2026-09"), proyecto: "p_trescruces", mes: "2026-09", cantidades: { it7: 1, it8: 0.9, it9: 1 }, cargadoPor: "julio", demo: true }
  ];
}

/* Fichas de una obra anterior inventada, para ver cómo se usa la base de costos. */
export function fichasDeEjemplo() {
  const base = { origen: "manual", obra: "Obra de ejemplo", cliente: "Cliente de ejemplo", anio: "2025", fecha: "2025-11-30", tipoObra: "Instalación de bombas y cañerías", ubicacion: "Catamarca", moneda: "USD", demo: true, notas: "Dato de ejemplo para probar la app.", creadoPor: "julio" };
  const gg = 0.11;
  const L = [
    ["Movimiento de suelos", "Excavación de zanja para cañería, a máquina", "m3", 1850, [0, 3.9, 8.6, 0, 0.7], 12, 19.5],
    ["Cañerías", "Provisión y tendido de cañería HDPE 160 mm PN10, termofusionada", "m", 2400, [21.4, 4.1, 1.9, 0, 0.6], 26.5, 39],
    ["Cañerías", "Prueba hidráulica de cañería por tramos", "m", 2400, [0.3, 0.9, 0.4, 0, 0], 1.4, 2.6],
    ["Montaje electromecánico", "Montaje de bomba sumergible con tablero y conexionado", "u", 6, [420, 1350, 610, 0, 95], 2200, 3600],
    ["Obra civil", "Hormigón H-21 para bases de equipos, con encofrado", "m3", 18, [165, 118, 22, 0, 9], 290, 455],
    ["Servicio mensual en sitio", "Cuadrilla en roster 14×14: especialista eléctrico, técnico en Seguridad e Higiene y dos ayudantes", "Mes", 4, [650, 16900, 0, 0, 820], 16900, 25185],
    ["Servicio mensual en sitio", "Alquiler de hidrogrúa con winche y operador habilitado", "Mes", 4, [0, 0, 19400, 0, 0], 18600, 27106],
    ["Servicio mensual en sitio", "Cambio de turno de la cuadrilla, dos rotaciones por mes", "Mes", 4, [0, 0, 0, 3550, 0], 3300, 5220]
  ];
  const r4 = v => Math.round(v * 10000) / 10000;
  return L.map(([rubro, descripcion, unidad, cantidad, c, cot, pv], i) => {
    const real = { mat: c[0], mo: c[1], eq: c[2], sub: c[3], ind: c[4] };
    real.item = r4(c.reduce((a, x) => a + x, 0)); real.gg = r4(real.item * gg); real.total = r4(real.item + real.gg);
    return Object.assign({}, base, { id: "fi_demo_" + (i + 1), numero: String(i + 1), rubro, descripcion, unidad, cantidad, real, cot: { total: cot }, ggPct: gg, puVenta: pv,
      desvioPct: r4(real.item / cot - 1), margenPct: r4(1 - real.total / pv) });
  });
}

export function cargarEjemplo() {
  datosDeEjemplo().forEach(m => guardar("movimientos", m));
  fichasDeEjemplo().forEach(f => { if (!S.fichas.some(x => x.id === f.id)) guardar("fichas", f); });
  proveedoresDeEjemplo().forEach(p => { if (!S.proveedores.some(x => x.nombre === p.nombre)) guardar("proveedores", p); });
  if (S.proyectos.some(p => p.id === "p_trescruces")) {
    actualizarProyecto("p_trescruces", p => {
      let cambio = false;
      (p.items || []).forEach(it => {
        const e = COSTOS_EJEMPLO[it.id];
        if (!e) return;
        if (!it.costo || !Object.keys(it.costo).length) { it.costo = e.costo; cambio = true; }
        if (!it.desde) { it.desde = e.desde; it.hasta = e.hasta; cambio = true; }
      });
      if (!p.presupuestoGeneral) { p.presupuestoGeneral = 9500; cambio = true; }
      if (!(p.honorarios || []).length) {
        p.honorarios = [
          { id: "ho_demo1", socio: "julio", concepto: "Gerenciamiento del proyecto", modo: "mo", porcentaje: 5, desde: "2026-08", hasta: "" },
          { id: "ho_demo2", socio: "jorge", concepto: "Dirección técnica", modo: "mensual", monto: 600, desde: "2026-08", hasta: "2026-10" }
        ];
        p.honorariosEjemplo = true;
      }
      if (cambio) p.presupuestoEjemplo = true;
    });
    avancesDeEjemplo().forEach(a => { if (!S.avances.some(x => x.id === a.id)) guardar("avances", a); });
    certificadosDeEjemplo().forEach(c => { if (!S.certificados.some(x => x.id === c.id)) guardar("certificados", c); });
  }
}

export function quitarEjemplo() {
  S.movimientos.filter(m => m.demo).forEach(m => borrar("movimientos", m.id));
  S.proveedores.filter(p => p.demo).forEach(p => borrar("proveedores", p.id));
  S.avances.filter(a => a.demo).forEach(a => borrar("avances", a.id));
  S.certificados.filter(c => c.demo).forEach(c => borrar("certificados", c.id));
  S.fichas.filter(f => f.demo).forEach(f => borrar("fichas", f.id));
  const p = S.proyectos.find(x => x.id === "p_trescruces");
  if (p && (p.presupuestoEjemplo || p.honorariosEjemplo)) {
    actualizarProyecto("p_trescruces", pp => {
      if (pp.presupuestoEjemplo) {
        (pp.items || []).forEach(it => { if (COSTOS_EJEMPLO[it.id]) { it.costo = {}; it.desde = ""; it.hasta = ""; } });
        pp.presupuestoGeneral = 0;
        delete pp.presupuestoEjemplo;
        delete pp.lineaBase;
      }
      if (pp.honorariosEjemplo) { pp.honorarios = (pp.honorarios || []).filter(h => !String(h.id).startsWith("ho_demo")); delete pp.honorariosEjemplo; }
    });
  }
}
