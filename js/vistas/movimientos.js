/* =========================================================
   Movimientos: historial del contexto elegido, con filtros,
   edición y borrado a la papelera.
   ========================================================= */
import { S, mandarAPapelera } from "../db.js";
import { app, fijarCtx } from "../contexto.js";
import * as M from "../modelo.js";
import * as PER from "../permisos.js";
import { $, $$, esc, num, fmtARS, fmtUSD, fmtFecha, mesLabel, toast, confirmar2, cabecera, ICONOS } from "../ui.js";

/* Los filtros se recuerdan mientras la app está abierta. */
const filtro = { texto: "", mes: "", tipo: "", bolsillo: "", imp: "", ctx: "" };
let limite = 150;

export function render(el) {
  const ctx = app.ctx;
  const claveCtx = ctx.tipo + ":" + (ctx.id || "");
  if (filtro.ctx !== claveCtx) { Object.assign(filtro, { mes: "", bolsillo: "", imp: "", ctx: claveCtx }); limite = 150; }
  const conj = M.conjuntoDe(ctx);
  const todos = M.movimientosDe(ctx);
  const p = ctx.tipo === "proyecto" ? M.proyecto(ctx.id) : null;
  const meses = Array.from(new Set(todos.map(M.mesDe))).filter(Boolean).sort().reverse();

  const nombre = p ? p.nombre : ctx.tipo === "mica" ? "MICA: proyectos y estructura" : "Magna: toda la cuenta";
  const puedeCargar = PER.esAdmin() || (PER.esOperativo() && PER.proyectosPermitidos().length > 0);
  let h = cabecera("", "Movimientos", esc(nombre), puedeCargar ? `<a class="btn btn-pri" href="#cargar">${ICONOS.cargar}${PER.esAdmin() ? "Cargar" : "Proponer gasto"}</a>` : "");
  h += PER.avisoPendientesHtml(s => s.coleccion !== "movimientos" || conj.has((s.datos || s.anterior || {}).bolsillo));

  const opt = (v, t, sel) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(t)}</option>`;
  let impOpts = "";
  if (p) {
    impOpts = opt("", "Toda imputación", filtro.imp)
      + (p.items || []).map(it => opt("i:" + it.id, "Ítem " + it.numero, filtro.imp)).join("")
      + M.rubrosDe(p).map(r => opt("r:" + r, "Rubro " + r, filtro.imp)).join("")
      + opt("g", "General de obra", filtro.imp);
  }
  h += `<div class="filtros">
    <div class="buscar">${ICONOS.buscar}<input class="input" id="m-texto" type="search" placeholder="Buscar proveedor, concepto, comprobante…" value="${esc(filtro.texto)}" aria-label="Buscar"></div>
    <select id="m-mes" aria-label="Mes">${opt("", "Todos los meses", filtro.mes)}${meses.map(m => opt(m, mesLabel(m), filtro.mes)).join("")}</select>
    <select id="m-tipo" aria-label="Tipo">${opt("", "Todo tipo", filtro.tipo)}${opt("egreso", "Gastos y egresos", filtro.tipo)}${opt("ingreso", "Ingresos", filtro.tipo)}${opt("pase", "Pases", filtro.tipo)}</select>
    ${ctx.tipo !== "proyecto" ? `<select id="m-bol" aria-label="Bolsillo">${opt("", "Todos los bolsillos", filtro.bolsillo)}${M.bolsillos().filter(b => conj.has(b.id)).map(b => opt(b.id, b.nombre, filtro.bolsillo)).join("")}</select>` : ""}
    ${p ? `<select id="m-imp" aria-label="Imputación">${impOpts}</select>` : ""}
  </div><div id="m-lista"></div>`;
  el.innerHTML = h;

  const pintarLista = () => {
    const t = filtro.texto.trim().toLowerCase();
    const lista = todos.filter(m => {
      if (filtro.mes && M.mesDe(m) !== filtro.mes) return false;
      if (filtro.tipo && m.tipo !== filtro.tipo) return false;
      if (filtro.bolsillo && m.bolsillo !== filtro.bolsillo && m.destino !== filtro.bolsillo) return false;
      if (filtro.imp && (m.imputacion || "") !== filtro.imp) return false;
      if (t) {
        const txt = [m.proveedor, m.concepto, m.comprobante, m.notas, M.nombreImputacion(m), M.nombreClase(m.tipo, m.clase), M.socioNombre(m.socio), M.nombreBolsillo(m.bolsillo), M.nombreBolsillo(m.destino)].join(" ").toLowerCase();
        if (!txt.includes(t)) return false;
      }
      return true;
    });
    // Para un filtro por bolsillo, el signo se mide contra ese bolsillo.
    const ref = filtro.bolsillo ? new Set([filtro.bolsillo]) : conj;
    let entra = 0, sale = 0, costos = 0;
    lista.forEach(m => {
      const s = M.signo(m, ref);
      if (s > 0) entra += Number(m.montoARS) || 0;
      if (s < 0) sale += Number(m.montoARS) || 0;
      if (M.esCosto(m) && ref.has(m.bolsillo)) costos += M.netoUsd(m);
    });
    const cont = $("#m-lista", el);
    if (!lista.length) {
      cont.innerHTML = `<div class="panel vacio"><b>${todos.length ? "Nada coincide con el filtro" : "Todavía no hay movimientos"}</b>${todos.length ? "Probá con otro mes o borrá la búsqueda." : "Cargá el primer gasto desde «Cargar»."}</div>`;
      return;
    }
    let filas = "", mesAnt = "";
    lista.slice(0, limite).forEach(m => {
      const mes = M.mesDe(m);
      if (mes !== mesAnt && !filtro.mes) { filas += `<div class="mov-mes">${esc(mesLabel(mes))}</div>`; mesAnt = mes; }
      filas += filaMov(m, ref);
    });
    cont.innerHTML = `
      <div class="resumen-filtro">
        <div><span>Movimientos</span><b>${lista.length}</b></div>
        <div><span>Entró</span><b>${num(entra, fmtARS)}</b></div>
        <div><span>Salió</span><b>${num(-sale, fmtARS)}</b></div>
        <div><span>Neto</span><b>${num(entra - sale, fmtARS)}</b></div>
        ${costos > 0 ? `<div><span>Costos sin IVA</span><b>${num(costos, fmtUSD)}</b></div>` : ""}
      </div>
      <div class="panel" style="padding:6px 16px">
        <div class="lista-mov">
          <div class="mov mov-cab"><div>Fecha</div><div>Detalle</div><div style="text-align:right">Pesos</div><div style="text-align:right">Dólares</div><div></div></div>
          ${filas}
        </div>
        ${lista.length > limite ? `<div style="text-align:center;padding:14px"><button class="btn btn-sec" id="m-mas">Ver ${Math.min(150, lista.length - limite)} más</button></div>` : ""}
      </div>`;
    $$(".mov[data-id]", cont).forEach(row => {
      const abrir = () => {
        if (row.dataset.cert) {
          const c = S.certificados.find(x => x.id === row.dataset.cert);
          if (c) { fijarCtx({ tipo: "proyecto", id: c.proyecto }); $$(".sel-ctx").forEach(x => { x.value = "p:" + c.proyecto; }); return app.ir("certificados/" + encodeURIComponent(c.id)); }
        }
        app.ir("cargar/" + encodeURIComponent(row.dataset.id));
      };
      row.addEventListener("click", e => { if (!e.target.closest("[data-borrar]")) abrir(); });
      row.addEventListener("keydown", e => { if (e.key === "Enter" && e.target === row) abrir(); });
    });
    $$("[data-borrar]", cont).forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      confirmar2(b, () => {
        const m = S.movimientos.find(x => x.id === b.dataset.borrar);
        if (!m) return;
        if (!PER.esAdmin()) {
          PER.proponer({ coleccion: "movimientos", accion: "baja", docId: m.id });
          return toast("Pedido de baja enviado: Julio lo tiene que aprobar");
        }
        mandarAPapelera("movimientos", m, app.usuario.socio);
        toast("Movimiento enviado a la papelera");
      });
    }));
    const mas = $("#m-mas", cont);
    if (mas) mas.addEventListener("click", () => { limite += 150; pintarLista(); });
  };

  const enlazar = (id, campo, ev = "change") => { const n = $(id, el); if (n) n.addEventListener(ev, () => { filtro[campo] = n.value; limite = 150; pintarLista(); }); };
  enlazar("#m-texto", "texto", "input");
  enlazar("#m-mes", "mes");
  enlazar("#m-tipo", "tipo");
  enlazar("#m-bol", "bolsillo");
  enlazar("#m-imp", "imp");
  pintarLista();
}

function filaMov(m, ref) {
  const s = M.signo(m, ref);
  const interno = s === 0;
  const ars = interno ? m.montoARS : s * m.montoARS;
  const us = interno ? M.usd(m) : s * M.usd(m);
  const partes = [];
  if (m.tipo === "pase") partes.push(`${esc(M.nombreBolsillo(m.bolsillo))} → ${esc(M.nombreBolsillo(m.destino))}`);
  else if (M.esCosto(m)) partes.push(esc(M.nombreImputacion(m, 44) || "Sin imputar"));
  else partes.push(esc(M.nombreClase(m.tipo, m.clase)));
  if (m.tipo !== "pase" && ref.size > 1) partes.push(esc(M.nombreBolsillo(m.bolsillo)));
  if (m.socio && !M.esCosto(m)) partes.push(esc(M.socioNombre(m.socio)));
  if (M.esCosto(m)) partes.push(({ A: "Factura A", B: "Factura B/C", S: "Sueldo, cargas o tasa" })[m.fiscal] || "Sin factura");
  if (m.recuperable) partes.push("Recuperable");
  const tags = [];
  if (m.tipo === "pase") tags.push(`<span class="tag tag-borde">Pase</span>`);
  if (m.cotizacionFuente === "aprox") tags.push(`<span class="tag tag-alerta" title="Se usó la cotización de otro día">Cotización a revisar</span>`);
  if (m.retencionesARS) tags.push(`<span class="tag tag-borde" title="Retenciones sufridas">Ret. ${esc(fmtARS(m.retencionesARS))}</span>`);
  if (m.demo) tags.push(`<span class="tag tag-borde">Ejemplo</span>`);
  const sol = S.solicitudes.find(x => x.estado === "pendiente" && x.coleccion === "movimientos" && x.docId === m.id);
  if (sol) tags.push(`<span class="tag tag-alerta" title="Pedido de ${esc(PER.socioNombre(sol.autor))}">${sol.accion === "baja" ? "Baja pendiente" : "Cambio pendiente"}</span>`);
  const editable = PER.puedeEditarMov(m);
  return `<div class="mov" data-id="${esc(m.id)}"${m.certificado ? ` data-cert="${esc(m.certificado)}"` : ""} tabindex="0">
    <div class="mov-fecha">${fmtFecha(m.fecha)}</div>
    <div class="mov-cuerpo"><div class="mov-tit">${esc(M.tituloMov(m))}</div>
      <div class="mov-sub">${partes.map((x, i) => `<span${i ? ' class="pto"' : ""}>${x}</span>`).join("")}${tags.join("")}</div></div>
    <div class="mov-ars">${interno ? `<span class="num">${fmtARS(ars)}</span>` : num(ars, fmtARS)}</div>
    <div class="mov-usd">${interno ? `<span class="num">${fmtUSD(us)}</span>` : num(us, fmtUSD)}</div>
    <div class="mov-acc">
      ${editable ? `<button class="btn-icono" title="${PER.esAdmin() ? "Editar" : "Proponer un cambio"}" aria-label="Editar">${ICONOS.editar}</button>
      <button class="btn-icono" data-borrar="${esc(m.id)}" title="${PER.esAdmin() ? "Borrar" : "Pedir la baja"}" aria-label="Borrar">${ICONOS.borrar}</button>` : ""}
    </div>
  </div>`;
}
