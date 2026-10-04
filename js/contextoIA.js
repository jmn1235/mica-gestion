/* =========================================================
   Resumen compacto de los datos para mandarle a la IA.
   Números redondeados, sin datos personales más allá de los
   nombres de los socios y proveedores.
   ========================================================= */
import { S } from "./db.js";
import * as M from "./modelo.js";
import * as P from "./presupuesto.js";
import * as C from "./certificados.js";
import * as I from "./impuestos.js";

const r0 = v => Math.round(Number(v) || 0);

export function contextoProyecto(p) {
  const r = M.resumenProyecto(p);
  const sg = P.seguimiento(p);
  const cob = C.resumenCobranza(p);
  const res = I.reservaProyecto(p, r);
  const porMes = Object.entries(r.porMes).sort().slice(-8).map(([mes, v]) => ({ mes, cobrado_usd: r0(v.ventas), costos_usd: r0(v.costos) }));
  return {
    proyecto: p.nombre, codigo: p.codigo || "", cliente: p.cliente || "", estado: p.estado, moneda_contrato: p.moneda,
    contrato: r0(r.contrato), anticipo: r0(p.anticipo), plazo_pago_dias: p.plazoPago,
    participacion_pct: p.participacion,
    resultados_usd: {
      cobrado_neto_iva: r0(r.ventasUsd), costos: r0(r.costosUsd), honorarios: r0(r.honorariosUsd), intereses: r0(r.interesesUsd),
      antes_de_impuestos: r0(r.resultadoUsd), despues_iibb_y_cheque: r0(r.resultadoDespuesIIBBUsd), neto_de_ganancias: r0(r.resultadoNetoUsd),
      margen_pct: r.margen == null ? null : Math.round(r.margen * 1000) / 10, gastos_sin_factura: r0(r.sinFacturaUsd)
    },
    saldo_bolsillo_ars: r0(r.saldo.ars), prestamos_a_devolver_usd: r0(r.deudaUsd),
    costos_por_tipo_usd: Object.fromEntries(Object.entries(r.porTipo).map(([k, v]) => [k, r0(v)])),
    por_mes: porMes,
    avance: {
      fisico_pct: Math.round(sg.avanceFisico * 100), plan_pct: sg.planHoy == null ? null : Math.round(sg.planHoy * 100),
      gasto_pct: sg.avanceGasto == null ? null : Math.round(sg.avanceGasto * 100),
      costo_cotizado: r0(sg.costoCotizado), costo_real: r0(sg.costoReal), costo_proyectado_cierre: r0(sg.costoProyectado),
      margen_cotizado_pct: sg.margenCotizadoPct == null ? null : Math.round(sg.margenCotizadoPct * 1000) / 10,
      margen_proyectado_pct: sg.margenProyectadoPct == null ? null : Math.round(sg.margenProyectadoPct * 1000) / 10,
      rubros: sg.rubros.map(x => ({ rubro: x.nombre, cotizado: r0(x.cot), real: r0(x.real), avance_pct: Math.round(x.avance * 100), proyectado: r0(x.proyectado) }))
    },
    items: (p.items || []).map(it => ({ numero: it.numero, descripcion: it.descripcion.slice(0, 80), unidad: it.unidad, cantidad: it.cantidad, precio_unitario: it.precioUnitario })),
    cobranza: {
      certificado: r0(cob.certificadoBruto), facturado_neto: r0(cob.facturadoNeto), por_cobrar_con_iva: r0(cob.porCobrar), vencido: r0(cob.vencido),
      diferencia_cambio_usd: r0(cob.difCambio),
      documentos: cob.docs.map(d => ({ doc: C.tituloDoc(d.doc), periodo: d.doc.periodo || "", neto: r0(d.imp.neto), total: r0(d.imp.total), estado: d.estado, vencimiento: d.vencimiento, dias_vencido: d.diasVencido, saldo: r0(d.saldo) }))
    },
    impuestos: {
      iibb_usd: r0(r.impuestos.iibbUsd), cheque_usd: r0(r.impuestos.chequeUsd), ganancias_usd: r0(r.impuestos.gananciasCostoUsd),
      iva_a_pagar_ars: r0(res.iva.saldo), reserva_a_reservar_ars: r0(res.aReservar), reservado_ars: r0(res.reservado), falta_reservar_ars: r0(res.pendiente)
    },
    socios: M.cuentaSociosProyecto(p, r).filas.map(f => ({ socio: f.nombre, aportes: r0(f.aportes), prestamos: r0(f.prestamos), honorarios: r0(f.honorarios), resultado_neto: r0(f.resultado), a_favor: r0(f.aFavor) })),
    cierre: p.estado === "cerrado" && p.cierre ? {
      fecha: p.cierre.fecha, dolar_liquidacion: p.cierre.mep, resultado_final_usd: r0((p.cierre.resumen || {}).finalUsd),
      diferencia_cambio_usd: r0(p.cierre.difCambioUsd), estructura_fija_usd: r0(p.cierre.asignadoUsd),
      margen_final_pct: (p.cierre.resumen || {}).margenRealPct == null ? null : Math.round(p.cierre.resumen.margenRealPct * 1000) / 10,
      destino_resultado: !p.cierre.destino || p.cierre.destino === "repartir" ? "repartido" : "reinvertido en " + M.nombreBolsillo(p.cierre.destino)
    } : null
  };
}

export function contextoGeneral() {
  const mica = M.resumenMica();
  const mg = M.resumenMagna();
  const ultimos = S.movimientos.slice().sort(M.ordenMov).slice(0, 40).map(m => ({
    fecha: m.fecha, tipo: m.tipo, clase: m.clase, bolsillo: M.nombreBolsillo(m.bolsillo), destino: m.destino ? M.nombreBolsillo(m.destino) : undefined,
    proveedor: m.proveedor || undefined, concepto: (m.concepto || "").slice(0, 60) || undefined, imputacion: M.nombreImputacion(m, 40) || undefined,
    ars: r0(m.montoARS), usd: r0(M.usd(m)), fiscal: m.fiscal || undefined
  }));
  return {
    fecha_de_hoy: new Date().toISOString().slice(0, 10),
    moneda_de_analisis: "USD MEP (cada movimiento congelado al dólar MEP de su fecha)",
    mica: {
      cobrado_usd: r0(mica.ventasUsd), costos_usd: r0(mica.costosUsd), estructura_usd: r0(mica.estructura.gastosUsd),
      resultado_antes_impuestos_usd: r0(mica.resultadoUsd), neto_para_repartir_usd: r0(mica.resultadoNetoUsd),
      socios: mica.socios.map(s => ({ socio: s.nombre, aportes: r0(s.aportes), prestamos: r0(s.prestamos), honorarios: r0(s.honorarios), reintegros: r0(s.reintegro), resultado_neto: r0(s.resultado), distribuido: r0(s.distribuido), a_favor: r0(s.aFavor) }))
    },
    magna: {
      saldo_cuenta_ars: r0(mg.total),
      bolsillos: mg.bolsillos.map(b => ({ bolsillo: b.nombre, saldo_ars: r0(b.saldo.ars) })),
      reintegro_pendiente_a_julio_ars: r0(mg.reintegro.ars),
      prestamos_de_magna: mg.prestamosDados.map(x => ({ a: x.proyecto.nombre, saldo_usd: r0(x.saldoUsd), interes_usd: r0(x.interesUsd) }))
    },
    proyectos: M.proyectosOrdenados().map(contextoProyecto),
    base_de_costos: {
      nota: "Costo real por unidad de ítems de obras cerradas o cargadas a mano, en USD sin IVA. item_u = costo del ítem; total_u = con gastos generales de la obra.",
      fichas: S.fichas.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 150).map(f => ({
        obra: f.obra, anio: f.anio, rubro: f.rubro || undefined, descripcion: String(f.descripcion || "").slice(0, 70), unidad: f.unidad, cantidad: Math.round(Number(f.cantidad) * 100) / 100,
        item_u: Math.round(f.real.item * 100) / 100, total_u: Math.round(f.real.total * 100) / 100,
        cotizado_u: f.cot && f.cot.total ? Math.round(f.cot.total * 100) / 100 : undefined, desvio_pct: f.desvioPct == null ? undefined : Math.round(f.desvioPct * 1000) / 10
      }))
    },
    ultimos_movimientos: ultimos
  };
}
