// =====================================================================
// FLOTA · Unidades (vencimientos y mantenimiento), Incidencias y Contactos
// =====================================================================
const TIPOS = { camion: 'Camión de reparto', moto: 'Moto', motocarga: 'Motocarga' };
const icoTipo = t => ico(t === 'moto' || t === 'motocarga' ? t : 'truck', 'w-5 h-5 text-slate-500');
const ESTADOS_VEH = { operativo: ['Operativo', 'b-verde'], en_taller: ['En taller', 'b-ambar'], inactivo: ['Inactivo', 'b-gris'] };
const SEVERIDAD = { alta: 'b-rojo', media: 'b-ambar', baja: 'b-gris' };
const ESTADOS_INC = { reportada: ['Reportada', 'b-rojo'], en_reparacion: ['En reparación', 'b-ambar'], resuelta: ['Resuelta', 'b-verde'] };
const TIPOS_MANT = { aceite: 'Cambio de aceite', preventivo: 'Preventivo', correctivo: 'Correctivo', llantas: 'Llantas', frenos: 'Frenos', otro: 'Otro' };
const CATS_CONTACTO = { mecanico: 'Mecánico', extintores: 'Extintores', grua: 'Grúa', llantas: 'Llantas', repuestos: 'Repuestos', electricista: 'Electricista', soat: 'SOAT / Seguros', otro: 'Otro' };
const SISTEMAS = ['Motor', 'Frenos', 'Eléctrico', 'Llantas', 'Transmisión / embrague', 'Suspensión / dirección', 'Carrocería / cabina', 'Documentos / seguridad', 'General'];
const ORIGENES = { checklist: 'Checklist', ruta: 'Ruta / chofer', inspeccion: 'Inspección', otro: 'Otro' };
const UMBRAL_DIAS = 30, UMBRAL_KM = 500;
const opcSistema = [['', '— Sin definir —'], ...SISTEMAS.map(x => [x, x])];
const diasEntre = (ini, fin) => Math.round((new Date(fin + 'T00:00:00') - new Date(ini + 'T00:00:00')) / 864e5);

let vehiculos = [], incidencias = [], contactos = [], flotaLista = false, flotaError = '';
let fl = 'unidades', fSuc = '', fTipo = '', fEst = '', fBusca = '', fInc = 'abiertas', fCat = '', fcBusca = '';

const editaFlota = () => puede('flota', 'editar');
const editaContactos = () => puede('contactos', 'editar');
const mismaSuc = (a, b) => !b || norm(a) === norm(b);

async function cargarFlota() {
  flotaError = '';
  if (typeof invalidarInforme === 'function') invalidarInforme();
  const pedidos = [];
  if (puede('flota')) {
    pedidos.push(cliente.from('vehiculos').select('*').order('placa').then(r => { if (r.error) throw r.error; vehiculos = r.data || []; }));
    pedidos.push(cliente.from('incidencias').select('*, vehiculo:vehiculos(placa,tipo,sucursal)').order('fecha_reporte', { ascending: false }).then(r => { if (r.error) throw r.error; incidencias = r.data || []; }));
  }
  if (puede('contactos')) pedidos.push(cliente.from('contactos').select('*').order('nombre').then(r => { if (r.error) throw r.error; contactos = r.data || []; }));
  try { await Promise.all(pedidos); } catch (e) { flotaError = e.message; }
  flotaLista = true;
}
async function abrirFlota() {
  if (!flotaLista) await cargarFlota();
  const subs = subsFlota();
  if (!subs.some(s => s[0] === fl)) fl = subs[0][0];
  pintarFlota();
}
async function refrescarFlota() { await cargarFlota(); pintarFlota(); }
function subsFlota() {
  const s = [];
  if (puede('flota')) s.push(['unidades', 'Unidades'], ['incidencias', 'Incidencias']);
  if (typeof puedeInforme === 'function' && puedeInforme()) s.push(['informe', 'Informe']);
  if (puede('contactos')) s.push(['contactos', 'Contactos']);
  return s;
}
function irFlota(k) { fl = k; pintarFlota(); }

function pintarFlota() {
  const el = $('v-flota');
  if (flotaError) {
    el.innerHTML = `<div class="max-w-2xl mx-auto card p-5 text-sm text-slate-600">
      <p class="font-bold text-slate-800 mb-1">No se pudo cargar Flota</p>
      <p>Revisa tu conexión e intenta de nuevo. Si sigue igual, avisa al administrador.</p>
      <p class="text-xs text-red-500 mt-2">${esc(flotaError)}</p></div>`;
    return;
  }
  const cuerpo = fl === 'unidades' ? htmlUnidades() : fl === 'incidencias' ? htmlIncidencias() : fl === 'informe' ? htmlInforme() : htmlContactos();
  el.innerHTML = `<div class="max-w-2xl mx-auto">
    <div class="no-print flex gap-2 mb-4 overflow-x-auto scroll-x">${seg(subsFlota(), fl, 'irFlota')}</div>${cuerpo}</div>`;
}

// ---------------------------------------------------------------------
// Semáforos
// ---------------------------------------------------------------------
function estFecha(f) {
  if (!f) return { cls: 'b-gris', rank: 3, txt: 'Sin fecha', d: null };
  const d = diasHasta(f);
  if (d < 0) return { cls: 'b-rojo', rank: 0, txt: `Vencido hace ${-d} d`, d };
  if (d === 0) return { cls: 'b-rojo', rank: 0, txt: 'Vence hoy', d };
  if (d <= UMBRAL_DIAS) return { cls: 'b-ambar', rank: 1, txt: `Vence en ${d} d`, d };
  return { cls: 'b-verde', rank: 2, txt: `Vigente · ${d} d`, d };
}
function estKm(v) {
  if (v.km_prox_mantenimiento == null) return { cls: 'b-gris', rank: 3, txt: 'Sin definir', d: null };
  const falta = v.km_prox_mantenimiento - v.km_actual;
  if (falta <= 0) return { cls: 'b-rojo', rank: 0, txt: `Pasado por ${fmtNum(-falta)} km`, d: falta };
  if (falta <= UMBRAL_KM) return { cls: 'b-ambar', rank: 1, txt: `Faltan ${fmtNum(falta)} km`, d: falta };
  return { cls: 'b-verde', rank: 2, txt: `Faltan ${fmtNum(falta)} km`, d: falta };
}
// Todo lo que vence en una unidad, con su semáforo
function controles(v) {
  const c = [
    ['Inspección', v.venc_inspeccion, estFecha(v.venc_inspeccion)],
    ['SOAT', v.venc_soat, estFecha(v.venc_soat)],
    ['T. circulación', v.venc_tarjeta_circulacion, estFecha(v.venc_tarjeta_circulacion)],
  ];
  if (v.tipo === 'camion' || v.venc_tarjeta_mercancias) c.push(['T. mercancías', v.venc_tarjeta_mercancias, estFecha(v.venc_tarjeta_mercancias)]);
  c.push(['Cambio aceite', v.fecha_prox_aceite, estFecha(v.fecha_prox_aceite)]);
  return c;
}
// 0 = rojo, 1 = ámbar, 2 = todo ok. Los datos vacíos (gris) no cuentan como alerta.
const peorRank = v => Math.min(2, estKm(v).rank, ...controles(v).map(c => c[2].rank));
const menorDia = v => Math.min(...controles(v).map(c => c[2].d).filter(d => d != null), 9999);

// ---------------------------------------------------------------------
// UNIDADES
// ---------------------------------------------------------------------
function pillsSuc(actual, fn) {
  return `<div class="flex gap-2 overflow-x-auto scroll-x mb-3">${[['', 'Todas'], ...SUCURSALES.map(s => [s, s])].map(([k, n]) =>
    `<button onclick="${fn}('${k}')" class="filtro ${norm(k) === norm(actual) ? 'filtro-on' : 'filtro-off'}">${n}</button>`).join('')}</div>`;
}
function htmlUnidades() {
  const base = vehiculos.filter(v => mismaSuc(v.sucursal, fSuc) && (!fTipo || v.tipo === fTipo));
  const venc = base.filter(v => v.estado !== 'inactivo' && peorRank(v) === 0).length;
  const prox = base.filter(v => v.estado !== 'inactivo' && peorRank(v) === 1).length;
  const taller = base.filter(v => v.estado === 'en_taller').length;
  const q = norm(fBusca);
  let l = base.filter(v => !q || norm(`${v.placa} ${v.marca} ${v.modelo} ${v.conductor}`).includes(q));
  if (fEst === 'rojo') l = l.filter(v => v.estado !== 'inactivo' && peorRank(v) === 0);
  if (fEst === 'ambar') l = l.filter(v => v.estado !== 'inactivo' && peorRank(v) === 1);
  if (fEst === 'taller') l = l.filter(v => v.estado === 'en_taller');
  l = [...l].sort((a, b) => peorRank(a) - peorRank(b) || menorDia(a) - menorDia(b) || a.placa.localeCompare(b.placa));

  const estado = (k, n, txt, punto) => `<button onclick="fEst=fEst==='${k}'?'':'${k}';pintarFlota()" class="filtro ${fEst === k ? 'filtro-on' : 'filtro-off'}"><span class="w-2 h-2 rounded-full ${punto}"></span>${txt} <b>${n}</b></button>`;
  return `
    <div class="flex gap-2 overflow-x-auto scroll-x mb-3">${estado('rojo', venc, 'Con vencidos', 'bg-red-500')}${estado('ambar', prox, 'Por vencer', 'bg-amber-500')}${estado('taller', taller, 'En taller', 'bg-slate-400')}</div>
    ${pillsSuc(fSuc, 'setFSuc')}
    <div class="flex gap-2 mb-4">
      <input oninput="fBusca=this.value;pintarListaUnidades()" value="${esc(fBusca)}" placeholder="Buscar placa, marca, conductor…" class="inp flex-1 !bg-white">
      <select onchange="fTipo=this.value;pintarFlota()" class="inp !w-auto !bg-white"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, n]) => `<option value="${k}" ${k === fTipo ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    ${editaFlota() ? `<button onclick="formVehiculo()" class="btn btn-acc w-full mb-4">+ Agregar unidad</button>` : ''}
    <div id="lista-unidades">${htmlListaUnidades(l)}</div>`;
}
function setFSuc(s) { fSuc = s; pintarFlota(); }
function pintarListaUnidades() { pintarFlota(); const i = document.querySelector('#v-flota input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }

function htmlListaUnidades(l) {
  if (!l.length) return `<p class="vacio">${vehiculos.length ? 'Ninguna unidad coincide con el filtro.' : 'Aún no hay unidades registradas.'}</p>`;
  return l.map(v => {
    const [en, ec] = ESTADOS_VEH[v.estado] || [v.estado, 'b-gris'], k = estKm(v);
    const pills = controles(v).map(([n, f, e]) => `<span class="chip ${e.cls}">${n}${f ? ' · ' + formFecha(f).slice(0, 5) + '/' + f.slice(2, 4) : ''}</span>`).join('');
    const abiertas = incidencias.filter(i => i.vehiculo_id === v.id && i.estado !== 'resuelta').length;
    return `<button onclick="abrirVehiculo(${v.id})" class="card block w-full text-left p-4 mb-3 hover:shadow-md transition ${peorRank(v) === 0 && v.estado !== 'inactivo' ? 'ring-1 ring-red-300' : ''}">
      <div class="flex justify-between items-start gap-2">
        <div><span class="text-lg font-bold tracking-wider text-slate-800 inline-flex items-center gap-2">${icoTipo(v.tipo)} ${esc(v.placa)}</span>
          <div class="text-xs text-slate-500 mt-0.5">${esc(TIPOS[v.tipo] || v.tipo)}${v.marca ? ' · ' + esc(v.marca) : ''}${v.modelo ? ' ' + esc(v.modelo) : ''}</div></div>
        <div class="flex flex-col items-end gap-1"><span class="chip bg-slate-100 text-slate-500">${esc(v.sucursal)}</span><span class="chip ${ec}">${en}</span></div>
      </div>
      <div class="flex flex-wrap gap-1.5 mt-3">${pills}</div>
      <div class="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
        <span><b class="text-slate-800">${fmtNum(v.km_actual)} km</b> <span class="text-slate-500">· ${fmtFH(v.km_actualizado_en)}</span></span>
        <span class="chip ${k.cls}">Mant.: ${k.txt}</span>
      </div>
      ${abiertas ? `<div class="mt-2 text-xs font-bold text-red-600">${ico('warn')} ${abiertas} incidencia${abiertas > 1 ? 's' : ''} abierta${abiertas > 1 ? 's' : ''}</div>` : ''}
    </button>`;
  }).join('');
}

// --- Detalle de una unidad ---
async function abrirVehiculo(id) {
  const v = vehiculos.find(x => x.id === id); if (!v) return;
  const k = estKm(v), [en, ec] = ESTADOS_VEH[v.estado] || [v.estado, 'b-gris'];
  const docs = controles(v).map(([n, f, e]) => `<div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
      <span class="text-sm font-medium text-slate-700">${n}</span>
      <span class="text-right"><span class="text-xs text-slate-500 mr-2">${f ? formFecha(f) : '—'}</span><span class="chip ${e.cls}">${e.txt}</span></span></div>`).join('');
  const inc = incidencias.filter(i => i.vehiculo_id === id && i.estado !== 'resuelta');
  abrirSheet(`${v.placa} · ${TIPOS[v.tipo]}`, `
    <div class="flex flex-wrap gap-2 mb-3"><span class="chip ${ec}">${en}</span><span class="chip bg-slate-100 text-slate-500">${esc(v.sucursal)}</span>
      ${v.conductor ? `<span class="chip bg-slate-100 text-slate-600">${ico('user', 'w-3 h-3')} ${esc(v.conductor)}</span>` : ''}
      ${v.marca || v.modelo || v.anio ? `<span class="chip bg-slate-100 text-slate-500">${esc([v.marca, v.modelo, v.anio].filter(Boolean).join(' '))}</span>` : ''}</div>
    <div class="seccion mb-1">Documentos y vencimientos</div>
    <div class="mb-4">${docs}</div>
    <div class="seccion mb-1">Kilometraje</div>
    <div class="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
      <div class="flex justify-between"><span class="text-slate-500">Actual</span><b>${fmtNum(v.km_actual)} km</b></div>
      <div class="text-[11px] text-slate-500 text-right">Actualizado ${fmtFH(v.km_actualizado_en)}${v.km_actualizado_por ? ' por ' + esc(nombreDe(v.km_actualizado_por)) : ''}</div>
      <div class="flex justify-between mt-2"><span class="text-slate-500">Próximo mantenimiento</span><span><b>${v.km_prox_mantenimiento != null ? fmtNum(v.km_prox_mantenimiento) + ' km' : '—'}</b> <span class="chip ${k.cls}">${k.txt}</span></span></div>
    </div>
    ${v.notas ? `<p class="text-sm text-slate-600 mb-4 whitespace-pre-wrap">${esc(v.notas)}</p>` : ''}
    ${editaFlota() ? `<div class="grid grid-cols-2 gap-2 mb-4">
      <button onclick="formKm(${id})" class="btn btn-pri">Actualizar km</button>
      <button onclick="formMantenimiento(${id})" class="btn btn-pri">Registrar mantenimiento</button>
      <button onclick="formIncidencia(0,${id})" class="btn btn-acc">Reportar falla</button>
      <button onclick="formVehiculo(${id})" class="btn btn-sec">Editar unidad</button></div>` : ''}
    ${inc.length ? `<div class="seccion !text-red-600 mb-1">Incidencias abiertas</div>${inc.map(i => `<div class="text-sm py-1.5 border-b border-slate-100"><b>${esc(i.titulo)}</b> <span class="chip ${SEVERIDAD[i.severidad]}">${i.severidad.toUpperCase()}</span>${i.inmovilizo ? ' <span class="chip b-rojo">Inmovilizada</span>' : ''}<div class="text-[11px] text-slate-500">${fmtFH(i.fecha_reporte)}</div></div>`).join('')}<div class="mb-4"></div>` : ''}
    <div class="seccion mb-1">Historial de mantenimientos</div>
    <div id="veh-mant" class="text-sm text-slate-500 mb-4">Cargando…</div>
    ${editaFlota() ? `<button onclick="borrarVehiculo(${id})" class="btn btn-del w-full">Eliminar unidad</button>` : ''}`);

  const { data } = await cliente.from('mantenimientos').select('*').eq('vehiculo_id', id).order('fecha', { ascending: false }).limit(10);
  const el = $('veh-mant'); if (!el) return;
  el.innerHTML = (data || []).length ? data.map(m => `<div class="py-2 border-b border-slate-100 last:border-0 text-slate-700">
      <div class="flex justify-between"><b>${TIPOS_MANT[m.tipo] || m.tipo}${m.sistema ? ' · ' + esc(m.sistema) : ''}</b><span class="text-xs text-slate-500">${formFecha(m.fecha)}</span></div>
      <div class="text-xs text-slate-500">${m.km != null ? fmtNum(m.km) + ' km' : ''}${m.taller ? ' · ' + esc(m.taller) : ''}${m.costo != null ? ' · S/ ' + Number(m.costo).toFixed(2) : ''}</div>
      ${m.fecha_programada ? `<div class="mt-0.5">${m.fecha > m.fecha_programada ? `<span class="chip b-ambar">Con ${diasEntre(m.fecha_programada, m.fecha)} d de retraso</span>` : '<span class="chip b-verde">A tiempo</span>'} <span class="text-xs text-slate-500">programado ${formFecha(m.fecha_programada)}</span></div>` : ''}
      ${m.detalle ? `<div class="text-xs text-slate-500">${esc(m.detalle)}</div>` : ''}</div>`).join('') : 'Sin registros todavía.';
}

function formVehiculo(id) {
  const v = id ? vehiculos.find(x => x.id === id) : {};
  abrirSheet(id ? 'Editar unidad' : 'Nueva unidad', `
    ${fila(campo('v-placa', 'Placa', { val: v.placa, ph: 'ABC-123', extra: 'style="text-transform:uppercase"' }), lista('v-tipo', 'Tipo', Object.entries(TIPOS), v.tipo || 'camion'))}
    ${fila(campo('v-marca', 'Marca', { val: v.marca }), campo('v-modelo', 'Modelo', { val: v.modelo }))}
    ${fila(campo('v-anio', 'Año', { type: 'number', val: v.anio ?? '' }), lista('v-suc', 'Sucursal', SUCURSALES.map(s => [s, s]), v.sucursal || SUCURSALES[0]))}
    ${fila(lista('v-estado', 'Estado', Object.entries(ESTADOS_VEH).map(([k, n]) => [k, n[0]]), v.estado || 'operativo'), campo('v-cond', 'Conductor habitual', { val: v.conductor }))}
    <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1 mb-2">Vencimientos</div>
    ${fila(campo('v-insp', 'Inspección vehicular', { type: 'date', val: v.venc_inspeccion }), campo('v-soat', 'SOAT', { type: 'date', val: v.venc_soat }))}
    ${fila(campo('v-tcirc', 'Tarjeta de circulación', { type: 'date', val: v.venc_tarjeta_circulacion }), campo('v-tmerc', 'Tarjeta de mercancías', { type: 'date', val: v.venc_tarjeta_mercancias }))}
    <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1 mb-2">Kilometraje y mantenimiento</div>
    ${fila(campo('v-km', 'Km actual', { type: 'number', val: v.km_actual ?? 0, extra: 'min="0"' }), campo('v-kmprox', 'Km próx. mantenimiento', { type: 'number', val: v.km_prox_mantenimiento ?? '', extra: 'min="0"' }))}
    ${campo('v-aceite', 'Próximo cambio de aceite', { type: 'date', val: v.fecha_prox_aceite })}
    ${area('v-notas', 'Notas', v.notas, 2)}
    <button onclick="lock(this,()=>guardarVehiculo(${id || 0}))" class="btn btn-pri w-full !py-3 mt-2">Guardar</button>`);
}
async function guardarVehiculo(id) {
  const placa = val('v-placa').toUpperCase();
  if (!placa) return toast('La placa es obligatoria.', true);
  const f = {
    placa, tipo: val('v-tipo'), marca: nul('v-marca'), modelo: nul('v-modelo'), anio: num('v-anio'), sucursal: val('v-suc'),
    estado: val('v-estado'), conductor: nul('v-cond'), km_actual: num('v-km') ?? 0, km_prox_mantenimiento: num('v-kmprox'),
    fecha_prox_aceite: nul('v-aceite'), venc_inspeccion: nul('v-insp'), venc_soat: nul('v-soat'),
    venc_tarjeta_circulacion: nul('v-tcirc'), venc_tarjeta_mercancias: nul('v-tmerc'), notas: nul('v-notas')
  };
  if (!await db(id ? cliente.from('vehiculos').update(f).eq('id', id) : cliente.from('vehiculos').insert(f))) return;
  cerrarSheet(); toast('Unidad guardada'); await refrescarFlota();
}
async function borrarVehiculo(id) {
  if (!confirm('¿Eliminar la unidad con todo su historial? No se puede deshacer.')) return;
  if (!await db(cliente.from('vehiculos').delete().eq('id', id))) return;
  cerrarSheet(); await refrescarFlota();
}

function formKm(id) {
  const v = vehiculos.find(x => x.id === id);
  abrirSheet(`Actualizar km · ${v.placa}`, `
    <p class="text-sm text-slate-500 mb-3">Último registro: <b>${fmtNum(v.km_actual)} km</b> (${fmtFH(v.km_actualizado_en)}). La fecha y hora se guardan solas.</p>
    ${campo('k-km', 'Kilometraje actual', { type: 'number', val: v.km_actual, extra: 'min="0" inputmode="numeric"' })}
    <button onclick="lock(this,()=>guardarKm(${id}))" class="btn btn-pri w-full !py-3">Guardar</button>`);
}
async function guardarKm(id) {
  const v = vehiculos.find(x => x.id === id), km = num('k-km');
  if (km == null || km < 0) return toast('Ingresa un kilometraje válido.', true);
  if (km < v.km_actual && !confirm(`El km ingresado (${fmtNum(km)}) es menor al registrado (${fmtNum(v.km_actual)}). ¿Continuar?`)) return;
  if (!await db(cliente.from('vehiculos').update({ km_actual: km }).eq('id', id))) return;
  cerrarSheet(); toast('Kilometraje actualizado'); await refrescarFlota();
}

function formMantenimiento(id) {
  const v = vehiculos.find(x => x.id === id);
  abrirSheet(`Mantenimiento · ${v.placa}`, `
    ${fila(lista('m-tipo', 'Tipo', Object.entries(TIPOS_MANT), 'preventivo'), campo('m-fecha', 'Fecha', { type: 'date', val: isoHoy() }))}
    ${fila(lista('m-sis', 'Sistema', opcSistema, ''), campo('m-prog', 'Estaba programado para', { type: 'date' }))}
    ${fila(campo('m-km', 'Km al momento', { type: 'number', val: v.km_actual }), campo('m-costo', 'Costo (S/)', { type: 'number', extra: 'step="0.01" min="0"' }))}
    ${fila(campo('m-taller', 'Taller / proveedor'), campo('m-quien', 'Realizado por'))}
    ${area('m-detalle', 'Detalle', '', 2)}
    <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1 mb-2">Actualizar próximos (opcional)</div>
    ${fila(campo('m-kmprox', 'Próx. mantenimiento (km)', { type: 'number', val: v.km_prox_mantenimiento ?? '' }), campo('m-aceite', 'Próx. cambio de aceite', { type: 'date', val: v.fecha_prox_aceite }))}
    <button onclick="lock(this,()=>guardarMantenimiento(${id}))" class="btn btn-pri w-full !py-3 mt-2">Guardar</button>`);
}
async function guardarMantenimiento(id) {
  const km = num('m-km');
  const reg = { vehiculo_id: id, tipo: val('m-tipo'), fecha: val('m-fecha') || isoHoy(), sistema: nul('m-sis'), fecha_programada: nul('m-prog'), km, costo: num('m-costo'), taller: nul('m-taller'), realizado_por: nul('m-quien'), detalle: nul('m-detalle') };
  if (!await db(cliente.from('mantenimientos').insert(reg))) return;
  const v = vehiculos.find(x => x.id === id), cambios = {};
  if (km != null && km > v.km_actual) cambios.km_actual = km;
  if (num('m-kmprox') !== v.km_prox_mantenimiento) cambios.km_prox_mantenimiento = num('m-kmprox');
  if (nul('m-aceite') !== v.fecha_prox_aceite) cambios.fecha_prox_aceite = nul('m-aceite');
  if (Object.keys(cambios).length && !await db(cliente.from('vehiculos').update(cambios).eq('id', id))) return;
  cerrarSheet(); toast('Mantenimiento registrado'); await refrescarFlota();
}

// ---------------------------------------------------------------------
// INCIDENCIAS
// ---------------------------------------------------------------------
function htmlIncidencias() {
  const l = incidencias.filter(i => (fInc === 'abiertas' ? i.estado !== 'resuelta' : i.estado === 'resuelta') && mismaSuc(i.vehiculo?.sucursal, fSuc));
  const nAb = incidencias.filter(i => i.estado !== 'resuelta').length;
  return `
    <div class="flex gap-2 mb-3 items-center">
      <button onclick="fInc='abiertas';pintarFlota()" class="seg ${fInc === 'abiertas' ? 'seg-on' : 'seg-off'}">Abiertas (${nAb})</button>
      <button onclick="fInc='resueltas';pintarFlota()" class="seg ${fInc === 'resueltas' ? 'seg-on' : 'seg-off'}">Resueltas</button>
      ${editaFlota() ? `<button onclick="formIncidencia()" class="btn btn-acc ml-auto !rounded-full !py-1.5">+ Reportar</button>` : ''}
    </div>
    ${pillsSuc(fSuc, 'setFSuc')}
    ${htmlParetoSistemas()}
    ${l.length ? l.map(cardIncidencia).join('') : `<p class="vacio">${fInc === 'abiertas' ? 'Sin incidencias abiertas.' : 'Aún no hay incidencias resueltas.'}</p>`}`;
}
// Pareto: qué sistemas concentran las fallas de los últimos 90 días (el 80/20 de la mejora continua)
function paretoSistemas() {
  const desde = Date.now() - 90 * 864e5, cont = {};
  const l = incidencias.filter(i => i.sistema && new Date(i.fecha_reporte).getTime() >= desde && mismaSuc(i.vehiculo?.sucursal, fSuc));
  l.forEach(i => { cont[i.sistema] = (cont[i.sistema] || 0) + 1; });
  return { total: l.length, filas: Object.entries(cont).sort((a, b) => b[1] - a[1]) };
}
function htmlParetoSistemas() {
  const { total, filas } = paretoSistemas();
  if (total < 3) return '';
  const max = filas[0][1], puedeProy = typeof puedeCrearProyecto === 'function' && puedeCrearProyecto();
  let acum = 0;
  return `<div class="card p-4 mb-4">
    <div class="font-bold text-slate-800">Qué sistemas fallan más</div>
    <p class="text-xs text-slate-500 mb-3">Últimos 90 días${fSuc ? ' · ' + esc(fSuc) : ''}. Las filas en ámbar suman cerca del 80% de las fallas: conviene atacarlas primero.</p>
    ${filas.map(([s, n]) => {
      const prior = acum * 100 / total < 80; acum += n;
      return `<div class="mb-2"><div class="flex justify-between text-xs mb-0.5"><span class="font-semibold ${prior ? 'text-slate-800' : 'text-slate-500'}">${esc(s)}</span><span class="text-slate-500">${n} · acumulado ${Math.round(acum * 100 / total)}%</span></div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full ${prior ? 'bg-amber-500' : 'bg-slate-300'}" style="width:${Math.round(n * 100 / max)}%"></div></div></div>`;
    }).join('')}
    ${puedeProy ? `<button onclick="proyectoPorSistema()" class="btn btn-acc btn-sm mt-2">Crear proyecto para “${esc(filas[0][0])}”</button>` : ''}</div>`;
}
function proyectoPorSistema() {
  const { total, filas } = paretoSistemas(), [sis, n] = filas[0];
  proponerProyecto({ nombre: `Reducir fallas de ${sis} en la flota${fSuc ? ' de ' + fSuc : ''}`,
    descripcion: `${sis} concentra ${n} de ${total} fallas (${Math.round(n * 100 / total)}%) en los últimos 90 días${fSuc ? ' en ' + fSuc : ''}.`,
    area: 'Flota', sucursal: fSuc || '', indicador: `Fallas de ${sis} por mes`, valor_base: Math.round(n / 3 * 10) / 10 });
}
function proyectoPorIncidencia(id) {
  const i = incidencias.find(x => x.id === id), placa = i.vehiculo?.placa || '';
  const n = incidencias.filter(x => x.vehiculo_id === i.vehiculo_id && x.sistema === i.sistema && Date.now() - new Date(x.fecha_reporte).getTime() <= 90 * 864e5).length;
  proponerProyecto({ nombre: `Reducir fallas de ${i.sistema} en ${placa}`,
    descripcion: `La unidad ${placa} tuvo ${n} fallas de ${i.sistema} en los últimos 90 días (última: ${i.titulo}).`,
    area: 'Flota', sucursal: i.vehiculo?.sucursal || '', indicador: `Fallas de ${i.sistema} por mes` });
}

function cardIncidencia(i) {
  const [en, ec] = ESTADOS_INC[i.estado], res = i.estado === 'resuelta';
  return `<div class="card p-4 mb-3">
    <div class="flex justify-between items-start gap-2">
      <div><div class="font-bold tracking-wider text-slate-800">${icoTipo(i.vehiculo?.tipo)} ${esc(i.vehiculo?.placa || '—')} <span class="text-xs font-semibold text-slate-500 tracking-normal">${esc(i.vehiculo?.sucursal || '')}</span></div>
        <div class="font-semibold text-sm text-slate-700 mt-0.5">${esc(i.titulo)}</div></div>
      <div class="flex flex-col items-end gap-1"><span class="chip ${ec}">${en}</span><span class="chip ${SEVERIDAD[i.severidad]}">${i.severidad.toUpperCase()}</span></div>
    </div>
    <div class="flex flex-wrap gap-1.5 mt-2">
      ${i.sistema ? `<span class="chip bg-indigo-50 text-indigo-700">${esc(i.sistema)}</span>` : ''}
      ${i.inmovilizo ? '<span class="chip b-rojo">Inmovilizó la unidad</span>' : ''}
      ${i.reincidente ? `<span class="chip b-ambar">${ico('warn', 'w-3 h-3')} Reincidencia</span>` : ''}
      ${i.origen ? `<span class="chip b-gris">${esc(ORIGENES[i.origen] || i.origen)}</span>` : ''}
    </div>
    ${i.descripcion ? `<p class="text-sm text-slate-600 mt-2 leading-snug whitespace-pre-wrap">${esc(i.descripcion)}</p>` : ''}
    <div class="text-xs text-slate-500 mt-2">Reportado ${fmtFH(i.fecha_reporte)}${i.reportado_por ? ' por ' + esc(i.reportado_por) : ''}${i.km_reporte != null ? ' · ' + fmtNum(i.km_reporte) + ' km' : ''}</div>
    ${i.reincidente && i.sistema && typeof puedeCrearProyecto === 'function' && puedeCrearProyecto() ? `<button onclick="proyectoPorIncidencia(${i.id})" class="btn btn-sec btn-sm mt-3">Proponer proyecto de mejora</button>` : ''}
    ${res ? `<div class="mt-3 bg-emerald-50 rounded-lg p-3 text-sm">
      <div class="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Solución</div>
      <div class="text-slate-700 whitespace-pre-wrap">${esc(i.solucion || 'Sin detalle')}</div>
      <div class="text-xs text-slate-500 mt-1.5">${[i.resuelto_por ? 'Por ' + esc(i.resuelto_por) : '', i.taller ? esc(i.taller) : '', i.fecha_solucion ? formFecha(i.fecha_solucion) : '', i.fecha_solucion ? diasEntre(tsLocal(i.fecha_reporte).slice(0, 10), i.fecha_solucion) + ' d de atención' : '', i.costo != null ? 'S/ ' + Number(i.costo).toFixed(2) : ''].filter(Boolean).join(' · ')}</div></div>` : ''}
    ${editaFlota() ? `<div class="flex flex-wrap gap-2 mt-3">
      ${!res ? `${i.estado === 'reportada' ? `<button onclick="estadoIncidencia(${i.id},'en_reparacion')" class="btn btn-sec btn-sm">En reparación</button>` : ''}
      <button onclick="formResolver(${i.id})" class="btn btn-acc btn-sm">Marcar resuelta</button>` : `<button onclick="estadoIncidencia(${i.id},'en_reparacion')" class="btn btn-sec btn-sm">Reabrir</button>`}
      <button onclick="formIncidencia(${i.id})" class="btn btn-sec btn-sm ml-auto" aria-label="Editar">${ico('pencil', 'w-4 h-4')}</button>
      <button onclick="borrarIncidencia(${i.id})" class="btn btn-del btn-sm" aria-label="Eliminar">${ico('trash', 'w-4 h-4')}</button></div>` : ''}
  </div>`;
}
function formIncidencia(id, vehId) {
  const i = id ? incidencias.find(x => x.id === id) : {};
  const opts = vehiculos.map(v => [v.id, `${v.placa} · ${TIPOS[v.tipo]} · ${v.sucursal}`]);
  if (!opts.length) return toast('Primero registra al menos una unidad.', true);
  abrirSheet(id ? 'Editar incidencia' : 'Reportar falla', `
    ${lista('i-veh', 'Unidad', opts, i.vehiculo_id || vehId || '')}
    ${campo('i-titulo', 'Falla', { val: i.titulo, ph: 'Ej. Ruido en frenos, luz de motor…' })}
    ${area('i-desc', 'Descripción', i.descripcion, 3)}
    ${fila(lista('i-sev', 'Severidad', [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']], i.severidad || 'media'), lista('i-est', 'Estado', Object.entries(ESTADOS_INC).filter(e => e[0] !== 'resuelta').map(([k, n]) => [k, n[0]]), i.estado === 'resuelta' ? 'en_reparacion' : (i.estado || 'reportada')))}
    ${fila(lista('i-sis', 'Sistema afectado', opcSistema, i.sistema || ''), lista('i-inm', '¿Inmovilizó la unidad?', [['', 'No sé / aún no'], ['si', 'Sí, no salió a ruta'], ['no', 'No, siguió operando']], i.inmovilizo === true ? 'si' : i.inmovilizo === false ? 'no' : ''))}
    ${fila(campo('i-quien', 'Reportado por', { val: i.reportado_por, ph: 'Chofer / supervisor' }), campo('i-fecha', 'Fecha y hora', { type: 'datetime-local', val: id ? tsLocal(i.fecha_reporte) : ahoraLocal() }))}
    ${fila(lista('i-ori', '¿Cómo se detectó?', [['', '—'], ...Object.entries(ORIGENES)], i.origen || ''), campo('i-km', 'Km de la unidad', { type: 'number', val: i.km_reporte ?? '', extra: 'min="0" inputmode="numeric"', ph: 'Solo número' }))}
    ${campo('i-taller', 'Taller / proveedor (si ya se sabe)', { val: i.taller })}
    <button onclick="lock(this,()=>guardarIncidencia(${id || 0}))" class="btn btn-pri w-full !py-3 mt-2">Guardar</button>`);
}
async function guardarIncidencia(id) {
  if (!val('i-titulo')) return toast('Describe brevemente la falla.', true);
  const f = {
    vehiculo_id: Number(val('i-veh')), titulo: val('i-titulo'), descripcion: nul('i-desc'), severidad: val('i-sev'),
    reportado_por: nul('i-quien'), fecha_reporte: $('i-fecha').value ? new Date($('i-fecha').value).toISOString() : new Date().toISOString(),
    sistema: nul('i-sis'), inmovilizo: { si: true, no: false }[val('i-inm')] ?? null, origen: nul('i-ori'), km_reporte: num('i-km'), taller: nul('i-taller')
  };
  const actual = id ? incidencias.find(x => x.id === id) : null;
  if (!actual || actual.estado !== 'resuelta') f.estado = val('i-est');
  if (!await db(id ? cliente.from('incidencias').update(f).eq('id', id) : cliente.from('incidencias').insert(f))) return;
  cerrarSheet(); toast('Incidencia guardada'); fInc = 'abiertas'; await refrescarFlota();
}
async function estadoIncidencia(id, estado) {
  const cambios = { estado };
  if (estado !== 'resuelta') Object.assign(cambios, { solucion: null, resuelto_por: null, fecha_solucion: null, costo: null });
  if (!await db(cliente.from('incidencias').update(cambios).eq('id', id))) return;
  if (estado !== 'resuelta') fInc = 'abiertas';
  await refrescarFlota();
}
function formResolver(id) {
  const i = incidencias.find(x => x.id === id);
  abrirSheet(`Resolver · ${i.vehiculo?.placa || ''}`, `
    <p class="text-sm font-semibold text-slate-700 mb-3">${esc(i.titulo)}</p>
    ${area('r-sol', '¿Qué se hizo?', i.solucion, 3)}
    ${fila(campo('r-quien', 'Quién lo resolvió', { val: i.resuelto_por, ph: 'Mecánico / taller' }), campo('r-fecha', 'Fecha', { type: 'date', val: i.fecha_solucion || isoHoy() }))}
    ${fila(campo('r-taller', 'Taller / proveedor', { val: i.taller }), campo('r-costo', 'Costo (S/) opcional', { type: 'number', val: i.costo ?? '', extra: 'step="0.01" min="0"' }))}
    <button onclick="lock(this,()=>guardarResolucion(${id}))" class="btn btn-pri w-full !py-3">Marcar como resuelta</button>`);
}
async function guardarResolucion(id) {
  if (!val('r-sol')) return toast('Indica qué se hizo para resolverla.', true);
  const f = { estado: 'resuelta', solucion: val('r-sol'), resuelto_por: nul('r-quien'), fecha_solucion: val('r-fecha') || isoHoy(), costo: num('r-costo'), taller: nul('r-taller') };
  if (!await db(cliente.from('incidencias').update(f).eq('id', id))) return;
  cerrarSheet(); toast('Incidencia resuelta'); await refrescarFlota();
}
async function borrarIncidencia(id) {
  if (!confirm('¿Eliminar esta incidencia?')) return;
  if (!await db(cliente.from('incidencias').delete().eq('id', id))) return;
  await refrescarFlota();
}

// ---------------------------------------------------------------------
// CONTACTOS (agenda de proveedores)
// ---------------------------------------------------------------------
const soloDigitos = t => String(t || '').replace(/[^\d+]/g, '');
const waLink = t => { let d = soloDigitos(t).replace('+', ''); if (/^9\d{8}$/.test(d)) d = '51' + d; return `https://wa.me/${d}`; };

function htmlContactos() {
  const q = norm(fcBusca);
  const l = contactos.filter(c => (!fCat || c.categoria === fCat) && mismaSuc(c.sucursal || fSuc, fSuc) && (!q || norm(`${c.nombre} ${c.empresa} ${c.notas} ${c.direccion}`).includes(q)));
  const cats = [...new Set(contactos.map(c => c.categoria))];
  return `
    ${pillsSuc(fSuc, 'setFSuc')}
    <div class="flex gap-2 mb-3">
      <input oninput="fcBusca=this.value;pintarListaContactos()" value="${esc(fcBusca)}" placeholder="Buscar nombre, empresa…" class="inp flex-1 !bg-white">
      ${editaContactos() ? `<button onclick="formContacto()" class="btn btn-acc">+ Nuevo</button>` : ''}
    </div>
    <div class="flex gap-2 overflow-x-auto scroll-x mb-4">${[['', 'Todos'], ...cats.map(c => [c, CATS_CONTACTO[c] || c])].map(([k, n]) =>
      `<button onclick="fCat='${esc(k)}';pintarFlota()" class="filtro ${k === fCat ? 'filtro-on' : 'filtro-off'}">${esc(n)}</button>`).join('')}</div>
    ${l.length ? l.map(cardContacto).join('') : '<p class="vacio">No hay contactos que coincidan.</p>'}`;
}
function pintarListaContactos() { pintarFlota(); const i = document.querySelector('#v-flota input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
function cardContacto(c) {
  const ini = (c.nombre || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const botones = [
    c.telefono ? `<a href="tel:${esc(soloDigitos(c.telefono))}" class="btn btn-pri btn-sm">${ico('phone')} Llamar</a>` : '',
    c.telefono ? `<a href="${esc(waLink(c.telefono))}" target="_blank" rel="noopener" class="btn btn-sm bg-emerald-700 text-white hover:bg-emerald-800">${ico('chat')} WhatsApp</a>` : '',
    c.maps_url ? `<a href="${esc(safeUrl(c.maps_url))}" target="_blank" rel="noopener" class="btn btn-sec btn-sm">${ico('pin')} Mapa</a>` : ''
  ].join('');
  return `<div class="card p-4 mb-3">
    <div class="flex gap-3">
      <div class="h-11 w-11 flex-none rounded-full bg-[#0B1320] text-amber-400 font-bold flex items-center justify-center">${esc(ini)}</div>
      <div class="min-w-0 flex-1">
        <div class="font-bold text-slate-800 leading-tight">${esc(c.nombre)}</div>
        ${c.empresa ? `<div class="text-sm text-slate-500">${esc(c.empresa)}</div>` : ''}
        <div class="flex flex-wrap gap-1.5 mt-1.5"><span class="chip bg-amber-100 text-amber-800">${esc(CATS_CONTACTO[c.categoria] || c.categoria)}</span>${c.sucursal ? `<span class="chip bg-slate-100 text-slate-500">${esc(c.sucursal)}</span>` : ''}</div>
      </div>
    </div>
    <div class="text-sm text-slate-600 mt-3 space-y-0.5">
      ${c.telefono ? `<div>${ico('phone')} ${esc(c.telefono)}${c.telefono2 ? ' · ' + esc(c.telefono2) : ''}</div>` : ''}
      ${c.email ? `<div class="truncate">${ico('mail')} <a href="mailto:${esc(c.email)}" class="underline">${esc(c.email)}</a></div>` : ''}
      ${c.direccion ? `<div>${ico('pin')} ${esc(c.direccion)}</div>` : ''}
      ${c.notas ? `<div class="text-xs text-slate-500 pt-1 whitespace-pre-wrap">${esc(c.notas)}</div>` : ''}
    </div>
    <div class="flex flex-wrap gap-2 mt-3">${botones}
      ${editaContactos() ? `<button onclick="formContacto(${c.id})" class="btn btn-sec btn-sm ml-auto" aria-label="Editar">${ico('pencil', 'w-4 h-4')}</button><button onclick="borrarContacto(${c.id})" class="btn btn-del btn-sm" aria-label="Eliminar">${ico('trash', 'w-4 h-4')}</button>` : ''}</div>
  </div>`;
}
function formContacto(id) {
  const c = id ? contactos.find(x => x.id === id) : {};
  abrirSheet(id ? 'Editar contacto' : 'Nuevo contacto', `
    ${campo('c-nombre', 'Nombre de contacto', { val: c.nombre })}
    ${campo('c-empresa', 'Empresa / taller', { val: c.empresa })}
    ${fila(lista('c-cat', 'Categoría', Object.entries(CATS_CONTACTO), c.categoria || 'mecanico'), lista('c-suc', 'Sucursal / ciudad', [['', 'Todas'], ...SUCURSALES.map(s => [s, s])], c.sucursal || ''))}
    ${fila(campo('c-tel', 'Teléfono / celular', { type: 'tel', val: c.telefono }), campo('c-tel2', 'Teléfono 2', { type: 'tel', val: c.telefono2 }))}
    ${campo('c-email', 'Correo', { type: 'email', val: c.email })}
    ${campo('c-dir', 'Dirección', { val: c.direccion })}
    ${campo('c-maps', 'Enlace de Google Maps', { type: 'url', val: c.maps_url, ph: 'https://maps.app.goo.gl/…' })}
    ${area('c-notas', 'Notas', c.notas, 2)}
    <button onclick="lock(this,()=>guardarContacto(${id || 0}))" class="btn btn-pri w-full !py-3 mt-2">Guardar</button>`);
}
async function guardarContacto(id) {
  if (!val('c-nombre')) return toast('El nombre es obligatorio.', true);
  const f = { nombre: val('c-nombre'), empresa: nul('c-empresa'), categoria: val('c-cat'), sucursal: nul('c-suc'), telefono: nul('c-tel'), telefono2: nul('c-tel2'), email: nul('c-email'), direccion: nul('c-dir'), maps_url: nul('c-maps'), notas: nul('c-notas') };
  if (!await db(id ? cliente.from('contactos').update(f).eq('id', id) : cliente.from('contactos').insert(f))) return;
  cerrarSheet(); toast('Contacto guardado'); await refrescarFlota();
}
async function borrarContacto(id) {
  if (!confirm('¿Eliminar este contacto?')) return;
  if (!await db(cliente.from('contactos').delete().eq('id', id))) return;
  await refrescarFlota();
}
