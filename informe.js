// =====================================================================
// INFORME MENSUAL DE FLOTA (pestaña dentro de Flota; solo admin y jefatura)
// Resume incidencias, mantenimiento, costos, km y documentos del mes y los
// compara con el mes anterior. Se puede imprimir o guardar como PDF.
// Los checklists diarios aún viven en Google Sheets (pestaña "Indicadores").
// =====================================================================
const KM_MAX_MES = 6000;                       // lecturas que superen esto se marcan "a revisar"
const PREV_TIPOS = ['aceite', 'preventivo', 'otro'];
let infMes = '', infSuc = '', infDatos = null, infCargando = false;

const puedeInforme = () => !!yo && ['admin', 'jefatura'].includes(yo.rol) && puede('flota');
const invalidarInforme = () => { infDatos = null; };

// --- fechas (todo como texto AAAA-MM-DD para comparar sin problemas de zona horaria) ---
const mesDesplazado = (mes, d) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m - 1 + d, 1).toLocaleDateString('en-CA').slice(0, 7); };
const rangoMes = mes => ({ ini: mes + '-01', fin: mesDesplazado(mes, 1) + '-01' });
const nombreMes = mes => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const sumaDias = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const dentro = (f, ini, fin) => !!f && f >= ini && f < fin;
const fechaLocal = ts => tsLocal(ts).slice(0, 10);
const soles = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function infIr(d) { infMes = mesDesplazado(infMes, d); invalidarInforme(); pintarFlota(); }
function infCambiaMes(v) { if (!v) return; infMes = v; invalidarInforme(); pintarFlota(); }
function infSetSuc(s) { infSuc = s; pintarFlota(); }

async function cargarInforme() {
  if (infCargando) return;
  infCargando = true;
  const mes = infMes, ini0 = rangoMes(mesDesplazado(mes, -1)).ini, fin = rangoMes(mes).fin;
  const [a, b] = await Promise.all([
    cliente.from('mantenimientos').select('*').gte('fecha', ini0).lt('fecha', fin),
    cliente.from('km_historial').select('vehiculo_id,km,registrado_en').gte('registrado_en', new Date(ini0 + 'T00:00:00').toISOString()).lt('registrado_en', new Date(fin + 'T00:00:00').toISOString()).order('registrado_en')
  ]);
  infDatos = (a.error || b.error) ? { mes, error: (a.error || b.error).message } : { mes, mant: a.data || [], kmh: b.data || [] };
  infCargando = false;
  if (fl === 'informe') pintarFlota();
}

// --- cálculo de los indicadores de un mes ---
function calcMes(mes) {
  const { ini, fin } = rangoMes(mes), ultimo = sumaDias(fin, -1), hoy = isoHoy();
  const esActual = mes === hoy.slice(0, 7);
  const diasMes = diasEntre(ini, fin), diasEf = esActual ? Number(hoy.slice(8, 10)) : diasMes;
  const vs = vehiculos.filter(v => mismaSuc(v.sucursal, infSuc)), activos = vs.filter(v => v.estado !== 'inactivo');
  const ids = new Set(vs.map(v => v.id)), placa = id => vs.find(v => v.id === id)?.placa || '—';
  const inc = incidencias.filter(i => ids.has(i.vehiculo_id));

  const rep = inc.filter(i => dentro(fechaLocal(i.fecha_reporte), ini, fin));
  const res = inc.filter(i => i.estado === 'resuelta' && dentro(i.fecha_solucion, ini, fin));
  const abiertas = inc.filter(i => fechaLocal(i.fecha_reporte) < fin && !(i.estado === 'resuelta' && i.fecha_solucion && i.fecha_solucion < fin));
  const antiguas = abiertas.filter(i => diasEntre(fechaLocal(i.fecha_reporte), ultimo) > 30).length;
  const dias = res.map(i => diasEntre(fechaLocal(i.fecha_reporte), i.fecha_solucion)).filter(x => x >= 0);
  const mttr = dias.length ? dias.reduce((s, x) => s + x, 0) / dias.length : null;

  // disponibilidad: cada día calendario con la unidad inmovilizada cuenta como perdido
  let diasPerdidos = 0;
  inc.filter(i => i.inmovilizo === true).forEach(i => {
    const a = fechaLocal(i.fecha_reporte), b = (i.estado === 'resuelta' && i.fecha_solucion) ? i.fecha_solucion : hoy;
    const s = a > ini ? a : ini, e = b < ultimo ? b : ultimo;
    if (e >= s) diasPerdidos += diasEntre(s, e) + 1;
  });
  const disp = activos.length && diasEf ? Math.max(0, 1 - diasPerdidos / (activos.length * diasEf)) : null;

  const pareto = {}, porUnidad = {};
  rep.forEach(i => { const k = i.sistema || 'Sin definir'; pareto[k] = (pareto[k] || 0) + 1; porUnidad[placa(i.vehiculo_id)] = (porUnidad[placa(i.vehiculo_id)] || 0) + 1; });

  const mant = (infDatos?.mant || []).filter(m => ids.has(m.vehiculo_id) && dentro(m.fecha, ini, fin));
  const prev = mant.filter(m => PREV_TIPOS.includes(m.tipo)).length;
  const conProg = mant.filter(m => m.fecha_programada), aTiempo = conProg.filter(m => m.fecha <= m.fecha_programada).length;
  const costoMant = mant.reduce((s, m) => s + Number(m.costo || 0), 0), costoInc = res.reduce((s, i) => s + Number(i.costo || 0), 0);

  // km recorridos: último km del mes − último km anterior al mes (o el primero del mes si no hay)
  let kmTotal = 0, kmRevisar = 0;
  const porVeh = {};
  (infDatos?.kmh || []).filter(k => ids.has(k.vehiculo_id)).forEach(k => (porVeh[k.vehiculo_id] ||= []).push({ km: k.km, f: fechaLocal(k.registrado_en), t: k.registrado_en }));
  Object.values(porVeh).forEach(l => {
    l.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
    const enMes = l.filter(x => dentro(x.f, ini, fin)); if (!enMes.length) return;
    const antes = l.filter(x => x.f < ini), base = (antes.length ? antes[antes.length - 1] : enMes[0]).km, fin_ = enMes[enMes.length - 1].km, d = fin_ - base;
    if (antes.length === 0 && enMes.length < 2) return;
    if (d < 0 || d > KM_MAX_MES) kmRevisar++; else kmTotal += d;
  });

  // documentos al corte (con los datos actuales de cada unidad)
  const corte = esActual ? hoy : ultimo, limite = sumaDias(corte, 30);
  const DOCS = [['venc_inspeccion', 'Inspección'], ['venc_soat', 'SOAT'], ['venc_tarjeta_circulacion', 'T. circulación'], ['venc_tarjeta_mercancias', 'T. mercancías']];
  const vencidos = [], porVencer = [];
  activos.forEach(v => DOCS.forEach(([c, n]) => {
    if (!v[c]) return;
    if (v[c] < corte) vencidos.push(`${v.placa} ${n}`); else if (v[c] <= limite) porVencer.push(`${v.placa} ${n}`);
  }));
  const kmPasado = activos.filter(v => v.km_prox_mantenimiento != null && v.km_actual > v.km_prox_mantenimiento).map(v => v.placa);

  return { diasMes, diasEf, activos: activos.length, rep, res, abiertas, antiguas, mttr, diasPerdidos, disp, sinInm: rep.filter(i => i.inmovilizo == null).length,
    sinSis: rep.filter(i => !i.sistema).length, reinc: rep.filter(i => i.reincidente).length, pareto, porUnidad, mant, prev, conProg: conProg.length, aTiempo,
    costoMant, costoInc, kmTotal, kmRevisar, corte, vencidos, porVencer, kmPasado };
}

// --- presentación ---
function delta(act, ant, { menorMejor = true, fmt = x => x, neutro = false } = {}) {
  if (ant == null || act == null) return '';
  const d = act - ant;
  if (Math.abs(d) < 1e-9) return '<div class="text-[11px] text-slate-500">igual que el mes anterior</div>';
  const bueno = menorMejor ? d < 0 : d > 0;
  const cls = neutro ? 'text-slate-500' : bueno ? 'text-emerald-700' : 'text-red-600';
  return `<div class="text-[11px] font-semibold ${cls}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} vs mes anterior</div>`;
}
const filaInf = (nombre, valor, extra = '', nota = '') => `
  <div class="flex items-baseline justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
    <div class="min-w-0"><div class="text-sm font-medium text-slate-700">${nombre}</div>${nota ? `<div class="text-[11px] text-slate-500 leading-snug">${nota}</div>` : ''}</div>
    <div class="text-right flex-none"><div class="text-base font-bold text-slate-800">${valor}</div>${extra}</div>
  </div>`;
const seccionInf = (titulo, cuerpo) => `<div class="card p-4 mb-4 break-inside-avoid"><h3 class="font-bold text-slate-800 mb-1">${titulo}</h3>${cuerpo}</div>`;
const lista3 = (arr, vacio) => arr.length ? esc(arr.slice(0, 6).join(', ')) + (arr.length > 6 ? ` y ${arr.length - 6} más` : '') : vacio;

function htmlInforme() {
  if (!infMes) infMes = mesActual0();
  if (!infDatos || infDatos.mes !== infMes) { cargarInforme(); return '<p class="vacio">Calculando el informe…</p>'; }
  if (infDatos.error) return `<div class="card p-5 text-sm text-slate-600"><p class="font-bold text-slate-800 mb-1">No se pudo calcular el informe</p><p>Ejecuta <code class="bg-slate-100 px-1 rounded">supabase_flota_v2.sql</code> en Supabase si aún no lo hiciste.</p><p class="text-xs text-red-500 mt-2">${esc(infDatos.error)}</p></div>`;

  const c = calcMes(infMes), p = calcMes(mesDesplazado(infMes, -1));
  const pct = x => x == null ? 'Sin datos' : (x * 100).toFixed(1) + '%';
  const maxP = Math.max(1, ...Object.values(c.pareto));
  const paretoHtml = Object.entries(c.pareto).sort((a, b) => b[1] - a[1]).map(([k, n]) => `
    <div class="py-1.5"><div class="flex justify-between text-sm"><span class="text-slate-700">${esc(k)}</span><b>${n}</b></div>
    <div class="h-2 rounded-full bg-slate-100 overflow-hidden mt-1"><div class="h-full bg-amber-500" style="width:${Math.round(n / maxP * 100)}%"></div></div></div>`).join('') || '<p class="text-sm text-slate-500 py-2">Sin incidencias reportadas en el mes.</p>';
  const topUni = Object.entries(c.porUnidad).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${esc(k)} (${n})`).join(', ') || 'Ninguna';
  const totPrev = c.prev + c.rep.length, totPrevAnt = p.prev + p.rep.length;
  const pPrev = totPrev ? c.prev / totPrev : null, pPrevAnt = totPrevAnt ? p.prev / totPrevAnt : null;
  const cumpl = c.conProg ? c.aTiempo / c.conProg : null, cumplAnt = p.conProg ? p.aTiempo / p.conProg : null;
  const costoTot = c.costoMant + c.costoInc, costoTotAnt = p.costoMant + p.costoInc;
  const costoKm = c.kmTotal > 0 ? costoTot / c.kmTotal : null;
  const avisos = [
    c.sinInm ? `${c.sinInm} incidencia${c.sinInm > 1 ? 's' : ''} sin dato de “¿inmovilizó la unidad?” (la disponibilidad puede estar subestimada).` : '',
    c.sinSis ? `${c.sinSis} incidencia${c.sinSis > 1 ? 's' : ''} sin sistema afectado (aparecen como “Sin definir”).` : '',
    c.kmRevisar ? `${c.kmRevisar} unidad${c.kmRevisar > 1 ? 'es' : ''} con lecturas de km a revisar (no se suman a los km recorridos).` : ''
  ].filter(Boolean);

  return `
  <div class="hidden print:block mb-4">
    <h1 class="text-xl font-bold">Informe mensual de flota · ${nombreMes(infMes)}</h1>
    <p class="text-sm text-slate-600">Sucursal: ${esc(infSuc || 'Todas')} · ${c.activos} unidades activas · Generado el ${formFecha(isoHoy())}</p>
  </div>
  <div class="no-print flex flex-wrap items-center gap-2 mb-3">
    <button onclick="infIr(-1)" class="btn btn-sec btn-sm" aria-label="Mes anterior">‹</button>
    <input type="month" value="${infMes}" onchange="infCambiaMes(this.value)" class="inp !w-auto !bg-white">
    <button onclick="infIr(1)" class="btn btn-sec btn-sm" aria-label="Mes siguiente">›</button>
    <button onclick="window.print()" class="btn btn-acc btn-sm ml-auto">Imprimir / PDF</button>
  </div>
  <div class="no-print">${pillsSuc(infSuc, 'infSetSuc')}</div>
  <h2 class="font-bold text-lg text-slate-800 mb-3 no-print">${nombreMes(infMes)} <span class="text-sm font-medium text-slate-500">· ${esc(infSuc || 'Todas las sucursales')} · ${c.activos} unidades activas</span></h2>

  ${seccionInf('Fallas y atención',
    filaInf('Incidencias reportadas', c.rep.length, delta(c.rep.length, p.rep.length)) +
    filaInf('Incidencias resueltas en el mes', c.res.length, delta(c.res.length, p.res.length, { neutro: true })) +
    filaInf('Abiertas al cierre del mes', c.abiertas.length, '', c.antiguas ? `${c.antiguas} con más de 30 días abiertas` : 'Ninguna con más de 30 días') +
    filaInf('Tiempo medio de reparación', c.mttr == null ? 'Sin datos' : c.mttr.toFixed(1) + ' d', delta(c.mttr, p.mttr, { fmt: x => x.toFixed(1) + ' d' }), 'Días entre el reporte y la solución') +
    filaInf('Reincidencias', c.reinc, delta(c.reinc, p.reinc), 'Misma falla en la misma unidad en 30 días o menos. Meta: 0'))}

  ${seccionInf('Disponibilidad de flota',
    filaInf('Disponibilidad', pct(c.disp), delta(c.disp, p.disp, { menorMejor: false, fmt: x => (x * 100).toFixed(1) + ' pts' }), `${c.diasPerdidos} días-unidad con la unidad inmovilizada (${c.diasEf} días × ${c.activos} unidades)`) +
    filaInf('Unidades con más incidencias', `<span class="text-sm">${topUni}</span>`))}

  ${seccionInf('Fallas por sistema', paretoHtml)}

  ${seccionInf('Mantenimiento',
    filaInf('Mantenimientos preventivos realizados', c.prev, delta(c.prev, p.prev, { menorMejor: false })) +
    filaInf('Preventivo frente a correctivo', pPrev == null ? 'Sin datos' : Math.round(pPrev * 100) + '% preventivo', delta(pPrev, pPrevAnt, { menorMejor: false, fmt: x => Math.round(x * 100) + ' pts' }), `${c.prev} preventivos y ${c.rep.length} fallas atendidas`) +
    filaInf('Cumplimiento de lo programado', cumpl == null ? 'Sin datos' : `${c.aTiempo} de ${c.conProg} (${Math.round(cumpl * 100)}%)`, delta(cumpl, cumplAnt, { menorMejor: false, fmt: x => Math.round(x * 100) + ' pts' }), 'Mantenimientos con fecha programada hechos a tiempo') +
    filaInf('Unidades con mantenimiento por km pasado', c.kmPasado.length, '', lista3(c.kmPasado, 'Ninguna') + ' (estado actual)'))}

  ${seccionInf('Costos y uso',
    filaInf('Costo de mantenimientos', soles(c.costoMant), delta(c.costoMant, p.costoMant, { fmt: soles })) +
    filaInf('Costo de reparaciones de fallas', soles(c.costoInc), delta(c.costoInc, p.costoInc, { fmt: soles }), 'Costos registrados en incidencias resueltas del mes') +
    filaInf('Costo total', soles(costoTot), delta(costoTot, costoTotAnt, { fmt: soles }), 'Si un mismo gasto está en ambos registros, se cuenta dos veces') +
    filaInf('Km recorridos', c.kmTotal ? fmtNum(c.kmTotal) + ' km' : 'Sin datos', delta(c.kmTotal || null, p.kmTotal || null, { menorMejor: false, neutro: true, fmt: x => fmtNum(x) + ' km' }), 'Según las actualizaciones de km registradas en la app') +
    filaInf('Costo por km', costoKm == null ? 'Sin datos' : 'S/ ' + costoKm.toFixed(2)))}

  ${seccionInf(`Documentos al ${formFecha(c.corte)}`,
    filaInf('Documentos vencidos', c.vencidos.length, '', lista3(c.vencidos, 'Ninguno') + '. Meta: 0') +
    filaInf('Documentos por vencer (30 días)', c.porVencer.length, '', lista3(c.porVencer, 'Ninguno')))}

  ${avisos.length ? `<div class="card p-4 mb-4 bg-amber-50 border-amber-200 break-inside-avoid"><h3 class="font-bold text-amber-900 mb-1">Datos por completar</h3><ul class="text-sm text-amber-900 list-disc pl-5 space-y-0.5">${avisos.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}

  <p class="text-xs text-slate-500 mb-6">Los indicadores de checklists diarios (cumplimiento, salidas con falla, permisos faltantes) se calculan por ahora en el Google Sheet, pestaña “Indicadores”. Los documentos y el mantenimiento por km reflejan el estado actual de cada unidad.</p>`;
}
const mesActual0 = () => isoHoy().slice(0, 7);
