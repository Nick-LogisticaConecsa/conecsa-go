// =====================================================================
// MEJORA CONTINUA · Proyectos Lean Six Sigma (DMAIC) con tablero Kanban
// Quien gestiona (admin) crea proyectos y tareas; cada responsable
// solo mueve el estado de SUS tareas: Por hacer → En proceso → Hecho.
// =====================================================================
const FASES = [['definir', 'D', 'Definir'], ['medir', 'M', 'Medir'], ['analizar', 'A', 'Analizar'], ['mejorar', 'M', 'Mejorar'], ['controlar', 'C', 'Controlar']];
const COLS = [['pendiente', 'Por hacer', 'bg-slate-100'], ['en_proceso', 'En proceso', 'bg-blue-50'], ['hecha', 'Hecho', 'bg-emerald-50']];
const PRIO = { alta: 'b-rojo', media: 'b-ambar', baja: 'b-gris' };

let proyectos = [], ptareas = [], mejoraLista = false, mejoraError = '';
let mjVista = 'proyectos', proyId = null, mjFiltro = 'activo';

const gestionaMejora = () => puede('mejora', 'editar');
const faseNombre = k => FASES.find(f => f[0] === k)?.[2] || k;

async function cargarMejora() {
  const [p, t] = await Promise.all([
    cliente.from('proyectos').select('*, responsable:perfiles!responsable_id(nombre)').order('created_at', { ascending: false }),
    cliente.from('proyecto_tareas').select('*, asignado:perfiles!asignado_a(nombre)').order('created_at')
  ]);
  mejoraError = (p.error || t.error) ? (p.error || t.error).message : '';
  proyectos = p.data || []; ptareas = t.data || [];
  mejoraLista = true;
  actualizarBadgeMejora();
}
function actualizarBadgeMejora() {
  const n = ptareas.filter(t => t.asignado_a === yo.id && t.estado !== 'hecha').length;
  $('badge-mejora').textContent = n; $('badge-mejora').classList.toggle('hidden', !n);
}
async function precargarMejora() { await cargarMejora(); }
async function abrirMejora() {
  if (!mejoraLista) await cargarMejora();
  pintarMejora();
}
async function refrescarMejora() { await cargarMejora(); pintarMejora(); }

function pintarMejora() {
  const el = $('v-mejora');
  if (mejoraError) {
    el.innerHTML = `<div class="max-w-2xl mx-auto card p-5 text-sm text-slate-600">
      <p class="font-bold text-slate-800 mb-1">Módulo aún no disponible</p>
      <p>No se pudieron leer los proyectos. Si es la primera vez, ejecuta <code class="bg-slate-100 px-1 rounded">supabase_setup.sql</code> en Supabase.</p>
      <p class="text-xs text-red-500 mt-2">${esc(mejoraError)}</p></div>`;
    return;
  }
  if (proyId && proyectos.some(p => p.id === proyId)) return pintarProyecto(el);
  proyId = null;

  const mias = ptareas.filter(t => t.asignado_a === yo.id && t.estado !== 'hecha').length;
  const cab = `<div class="flex gap-2 mb-4 items-center">
      <button onclick="mjVista='proyectos';pintarMejora()" class="seg ${mjVista === 'proyectos' ? 'seg-on' : 'seg-off'}">Proyectos</button>
      <button onclick="mjVista='mias';pintarMejora()" class="seg ${mjVista === 'mias' ? 'seg-on' : 'seg-off'}">Mis tareas${mias ? ` (${mias})` : ''}</button>
      ${gestionaMejora() ? `<button onclick="formProyecto()" class="btn btn-acc ml-auto !rounded-full !py-1.5">+ Proyecto</button>` : ''}
    </div>`;
  el.innerHTML = `<div class="max-w-2xl mx-auto">${cab}${mjVista === 'mias' ? htmlMisTareas() : htmlProyectos()}</div>`;
}

// --- Lista de proyectos ---
function progreso(pid) {
  const ts = ptareas.filter(t => t.proyecto_id === pid), h = ts.filter(t => t.estado === 'hecha').length;
  return { total: ts.length, hechas: h, pct: ts.length ? Math.round(h * 100 / ts.length) : 0 };
}
// Avance del indicador hacia la meta (sirve si el objetivo es subir o bajar el valor)
function avanceMeta(p) {
  if (p.valor_base == null || p.valor_meta == null || p.valor_actual == null || p.valor_base === p.valor_meta) return null;
  return Math.max(0, Math.min(100, Math.round((p.valor_actual - p.valor_base) / (p.valor_meta - p.valor_base) * 100)));
}
function stepper(fase, pid, clickable) {
  const idx = FASES.findIndex(f => f[0] === fase);
  return `<div class="flex items-center gap-1">${FASES.map(([k, l, n], i) =>
    `<button ${clickable ? `onclick="cambiarFase(${pid},'${k}')"` : 'disabled'} title="${n}" aria-label="${n}" class="step ${i < idx ? 'step-done' : i === idx ? 'step-on' : 'step-off'}">${l}</button>`
  ).join('<span class="step-line"></span>')}</div>`;
}
function htmlProyectos() {
  const filtros = [['activo', 'Activos'], ['pausado', 'Pausados'], ['cerrado', 'Cerrados']];
  const l = proyectos.filter(p => p.estado === mjFiltro);
  const chips = `<div class="flex gap-2 mb-4 overflow-x-auto scroll-x">${filtros.map(([k, n]) =>
    `<button onclick="mjFiltro='${k}';pintarMejora()" class="filtro ${k === mjFiltro ? 'filtro-on' : 'filtro-off'}">${n} (${proyectos.filter(p => p.estado === k).length})</button>`).join('')}</div>`;
  if (!l.length) return chips + `<p class="vacio">${proyectos.length ? 'No hay proyectos en este estado.' : (gestionaMejora() ? 'Crea tu primer proyecto de mejora con “+ Proyecto”.' : 'Aún no participas en ningún proyecto.')}</p>`;
  return chips + l.map(p => {
    const pr = progreso(p.id), vencido = p.fecha_meta && p.estado === 'activo' && diasHasta(p.fecha_meta) < 0;
    return `<button onclick="abrirProyecto(${p.id})" class="card block w-full text-left p-4 mb-3 hover:shadow-md transition">
      <div class="flex justify-between items-start gap-2">
        <span class="font-bold text-slate-800 text-[15px] leading-snug">${esc(p.nombre)}</span>
        <span class="chip bg-slate-100 text-slate-500">${esc(p.sucursal || 'Todas')}</span>
      </div>
      <div class="mt-3 flex items-center gap-3">${stepper(p.fase, p.id, false)}<span class="text-xs font-bold text-amber-700 whitespace-nowrap">${faseNombre(p.fase)}</span></div>
      <div class="mt-3"><div class="flex justify-between text-[11px] font-semibold text-slate-500 mb-1"><span>${pr.hechas} de ${pr.total} tareas</span><span>${pr.pct}%</span></div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:${pr.pct}%"></div></div></div>
      <div class="meta mt-3 flex flex-wrap gap-x-3 gap-y-1">
        <span>${ico('user')} ${esc(p.responsable?.nombre || 'Sin responsable')}</span>
        ${p.area ? `<span>${esc(p.area)}</span>` : ''}
        ${p.fecha_meta ? `<span class="${vencido ? '!text-red-600' : ''}">${ico('flag')} ${formFecha(p.fecha_meta)}${vencido ? ' (vencido)' : ''}</span>` : ''}
      </div></button>`;
  }).join('');
}

// --- Mis tareas (todas las de proyectos, para el usuario) ---
function htmlMisTareas() {
  const mias = ptareas.filter(t => t.asignado_a === yo.id);
  if (!mias.length) return '<p class="vacio">No tienes tareas de mejora asignadas.</p>';
  const orden = { en_proceso: 0, pendiente: 1, hecha: 2 };
  return [...mias].sort((a, b) => orden[a.estado] - orden[b.estado] || (a.fecha_limite || '9').localeCompare(b.fecha_limite || '9'))
    .map(t => cardTarea(t, true)).join('');
}

// --- Detalle de proyecto con Kanban ---
function abrirProyecto(id) { proyId = id; pintarMejora(); window.scrollTo(0, 0); }
function volverProyectos() { proyId = null; pintarMejora(); }

function pintarProyecto(el) {
  const p = proyectos.find(x => x.id === proyId), pr = progreso(p.id), av = avanceMeta(p), g = gestionaMejora();
  const ts = ptareas.filter(t => t.proyecto_id === p.id);
  const estados = { activo: 'b-verde', pausado: 'b-ambar', cerrado: 'b-gris' };
  el.innerHTML = `
  <button onclick="volverProyectos()" class="text-sm font-semibold text-slate-500 hover:text-slate-800 mb-3">← Proyectos</button>
  <div class="card p-4 mb-4">
    <div class="flex justify-between items-start gap-2">
      <h2 class="font-bold text-lg text-slate-800 leading-snug">${esc(p.nombre)}</h2>
      <span class="chip ${estados[p.estado]}">${p.estado.toUpperCase()}</span>
    </div>
    <div class="meta mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      <span>${ico('user')} ${esc(p.responsable?.nombre || 'Sin responsable')}</span>
      <span>${ico('pin')} ${esc(p.sucursal || 'Todas las sucursales')}</span>
      ${p.area ? `<span>${esc(p.area)}</span>` : ''}
      ${p.fecha_inicio ? `<span>Inicio ${formFecha(p.fecha_inicio)}</span>` : ''}
      ${p.fecha_meta ? `<span>${ico('flag')} Meta ${formFecha(p.fecha_meta)}</span>` : ''}
    </div>
    ${p.descripcion ? `<p class="text-sm text-slate-600 mt-3 leading-relaxed whitespace-pre-wrap">${esc(p.descripcion)}</p>` : ''}
    <div class="mt-4"><div class="seccion mb-2">Fase DMAIC · ${faseNombre(p.fase)}</div>${stepper(p.fase, p.id, g)}</div>
    ${p.indicador ? `<div class="mt-4 pt-4 border-t border-slate-100">
      <div class="text-xs font-bold text-slate-500 mb-2">${esc(p.indicador)}</div>
      <div class="flex justify-between text-center">
        <div><div class="text-[11px] text-slate-500 font-semibold">BASE</div><div class="font-bold">${fmtNum(p.valor_base)}</div></div>
        <div><div class="text-[11px] text-slate-500 font-semibold">ACTUAL</div><div class="font-bold text-amber-600">${fmtNum(p.valor_actual)}</div></div>
        <div><div class="text-[11px] text-slate-500 font-semibold">META</div><div class="font-bold text-emerald-600">${fmtNum(p.valor_meta)}</div></div>
      </div>
      ${av != null ? `<div class="h-2 rounded-full bg-slate-200 overflow-hidden mt-3"><div class="h-full bg-amber-500" style="width:${av}%"></div></div><div class="text-[11px] text-slate-500 text-right mt-1">${av}% hacia la meta</div>` : ''}
    </div>` : ''}
    <div class="mt-4 flex justify-between text-[11px] font-semibold text-slate-500 mb-1"><span>${pr.hechas} de ${pr.total} tareas terminadas</span><span>${pr.pct}%</span></div>
    <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${pr.pct}%"></div></div>
    ${g ? `<div class="flex flex-wrap gap-2 mt-4">
      <button onclick="formProyecto(${p.id})" class="btn btn-sec">Editar proyecto</button>
      <button onclick="formPTarea(${p.id})" class="btn btn-acc">+ Tarea</button>
      <button onclick="borrarProyecto(${p.id})" class="btn btn-del ml-auto">Eliminar</button></div>` : ''}
  </div>
  <div class="kanban">${COLS.map(([k, n, bg]) => {
    const col = ts.filter(t => t.estado === k);
    return `<div class="col ${bg} rounded-xl p-3">
      <div class="flex justify-between items-center mb-3"><span class="font-bold text-sm text-slate-700">${n}</span><span class="chip bg-white text-slate-500">${col.length}</span></div>
      ${col.length ? col.map(t => cardTarea(t, false)).join('') : '<p class="text-xs text-slate-500 text-center py-6">Sin tareas</p>'}
    </div>`;
  }).join('')}</div>`;
}

function cardTarea(t, conProyecto) {
  const g = gestionaMejora(), mia = t.asignado_a === yo.id, puedeMover = mia || g;
  const vencida = t.fecha_limite && t.estado !== 'hecha' && diasHasta(t.fecha_limite) < 0;
  const p = conProyecto ? proyectos.find(x => x.id === t.proyecto_id) : null;
  const siguiente = {
    pendiente: [['en_proceso', 'Iniciar', 'btn-pri']],
    en_proceso: [['hecha', 'Terminar', 'btn-acc'], ['pendiente', 'Pausar', 'btn-sec']],
    hecha: [['en_proceso', 'Reabrir', 'btn-sec']]
  }[t.estado];
  return `<div class="card p-3 mb-3 ${mia ? 'ring-1 ring-amber-400' : ''}">
    ${p ? `<button onclick="abrirProyecto(${p.id});mjVista='proyectos'" class="text-[11px] font-bold text-amber-700 uppercase tracking-wide mb-1 text-left">${esc(p.nombre)}</button>` : ''}
    <div class="font-semibold text-sm text-slate-800 leading-snug">${esc(t.titulo)}</div>
    ${t.descripcion ? `<p class="text-xs text-slate-500 mt-1 leading-snug">${esc(t.descripcion)}</p>` : ''}
    <div class="flex flex-wrap gap-1.5 mt-2">
      <span class="chip ${PRIO[t.prioridad]}">${t.prioridad.toUpperCase()}</span>
      ${t.fase ? `<span class="chip bg-indigo-50 text-indigo-700">${faseNombre(t.fase)}</span>` : ''}
      ${t.fecha_limite ? `<span class="chip ${vencida ? 'b-rojo' : 'b-gris'}">${ico(vencida ? 'warn' : 'cal', 'w-3 h-3')} ${formFecha(t.fecha_limite)}</span>` : ''}
      <span class="chip ${mia ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}">${ico('user', 'w-3 h-3')} ${esc(mia ? 'Yo' : (t.asignado?.nombre || 'Sin asignar'))}</span>
    </div>
    ${t.estado === 'hecha' && t.completada_en ? `<div class="text-[11px] text-emerald-600 font-semibold mt-2">Terminada ${fmtFH(t.completada_en)}</div>` : ''}
    ${puedeMover ? `<div class="flex flex-wrap gap-2 mt-3">${siguiente.map(([e, n, c]) => `<button onclick="moverPTarea(${t.id},'${e}')" class="btn ${c} btn-sm">${n}</button>`).join('')}
      ${g ? `<button onclick="formPTarea(${t.proyecto_id},${t.id})" class="btn btn-sec btn-sm ml-auto" aria-label="Editar">${ico('pencil', 'w-4 h-4')}</button>
      <button onclick="borrarPTarea(${t.id})" class="btn btn-del btn-sm" aria-label="Eliminar">${ico('trash', 'w-4 h-4')}</button>` : ''}</div>` : ''}
  </div>`;
}

async function moverPTarea(id, estado) {
  if (!await db(cliente.rpc('cambiar_estado_ptarea', { p_id: id, p_estado: estado }))) return;
  await refrescarMejora();
}

// --- Gestión (solo quien tenga permiso de edición) ---
const opcionesUsuarios = (conVacio) => [...(conVacio ? [['', '— Sin asignar —']] : []), ...usuarios.map(u => [u.id, `${u.nombre} (${puestoDe(u)})`])];

function formProyecto(id) {
  const p = id ? proyectos.find(x => x.id === id) : {};
  abrirSheet(id ? 'Editar proyecto' : 'Nuevo proyecto de mejora', `
    ${campo('p-nombre', 'Nombre del proyecto', { val: p.nombre, ph: 'Ej. Reducir tiempo de despacho' })}
    ${area('p-desc', 'Problema / objetivo', p.descripcion)}
    ${fila(campo('p-area', 'Área', { val: p.area, ph: 'Almacén, Despacho…' }), lista('p-suc', 'Sucursal', [['', 'Todas'], ...SUCURSALES.map(s => [s, s])], p.sucursal || ''))}
    ${lista('p-resp', 'Responsable del proyecto', opcionesUsuarios(true), p.responsable_id || '')}
    ${fila(lista('p-fase', 'Fase DMAIC', FASES.map(f => [f[0], f[2]]), p.fase || 'definir'), lista('p-estado', 'Estado', [['activo', 'Activo'], ['pausado', 'Pausado'], ['cerrado', 'Cerrado']], p.estado || 'activo'))}
    ${fila(campo('p-ini', 'Inicio', { type: 'date', val: p.fecha_inicio }), campo('p-meta', 'Fecha meta', { type: 'date', val: p.fecha_meta }))}
    <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1 mb-2">Indicador (opcional)</div>
    ${campo('p-ind', 'Qué se mide', { val: p.indicador, ph: 'Ej. Minutos por despacho' })}
    ${fila(campo('p-base', 'Valor base', { type: 'number', val: p.valor_base ?? '', extra: 'step="any"' }), campo('p-actual', 'Valor actual', { type: 'number', val: p.valor_actual ?? '', extra: 'step="any"' }))}
    ${campo('p-vmeta', 'Valor meta', { type: 'number', val: p.valor_meta ?? '', extra: 'step="any"' })}
    <button onclick="lock(this,()=>guardarProyecto(${id || 0}))" class="btn btn-pri w-full !py-3 mt-2">Guardar</button>`);
}
async function guardarProyecto(id) {
  if (!val('p-nombre')) return toast('Ponle un nombre al proyecto.', true);
  const fila = {
    nombre: val('p-nombre'), descripcion: nul('p-desc'), area: nul('p-area'), sucursal: nul('p-suc'),
    responsable_id: nul('p-resp'), fase: val('p-fase'), estado: val('p-estado'),
    fecha_inicio: nul('p-ini'), fecha_meta: nul('p-meta'),
    indicador: nul('p-ind'), valor_base: num('p-base'), valor_actual: num('p-actual'), valor_meta: num('p-vmeta')
  };
  const r = await db(id ? cliente.from('proyectos').update(fila).eq('id', id).select().single() : cliente.from('proyectos').insert(fila).select().single());
  if (!r) return;
  cerrarSheet(); toast('Proyecto guardado');
  if (!id) proyId = r.id;
  await refrescarMejora();
}
async function cambiarFase(pid, fase) {
  const p = proyectos.find(x => x.id === pid);
  if (!p || p.fase === fase) return;
  if (!await db(cliente.from('proyectos').update({ fase }).eq('id', pid))) return;
  await refrescarMejora();
}
async function borrarProyecto(id) {
  if (!confirm('¿Eliminar el proyecto y todas sus tareas? No se puede deshacer.')) return;
  if (!await db(cliente.from('proyectos').delete().eq('id', id))) return;
  proyId = null; await refrescarMejora();
}

function formPTarea(pid, id) {
  const t = id ? ptareas.find(x => x.id === id) : {};
  abrirSheet(id ? 'Editar tarea' : 'Nueva tarea', `
    ${campo('pt-titulo', 'Tarea', { val: t.titulo, ph: '¿Qué hay que hacer?' })}
    ${area('pt-desc', 'Detalle (opcional)', t.descripcion, 2)}
    ${lista('pt-asig', 'Responsable', opcionesUsuarios(true), t.asignado_a || '')}
    ${fila(lista('pt-prio', 'Prioridad', [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']], t.prioridad || 'media'), campo('pt-fecha', 'Fecha límite', { type: 'date', val: t.fecha_limite }))}
    ${lista('pt-fase', 'Etapa DMAIC (opcional)', [['', '—'], ...FASES.map(f => [f[0], f[2]])], t.fase || (proyectos.find(p => p.id === pid)?.fase) || '')}
    <button onclick="lock(this,()=>guardarPTarea(${pid},${id || 0}))" class="btn btn-pri w-full !py-3 mt-2">Guardar</button>`);
}
async function guardarPTarea(pid, id) {
  if (!val('pt-titulo')) return toast('Escribe qué hay que hacer.', true);
  const fila = {
    titulo: val('pt-titulo'), descripcion: nul('pt-desc'), asignado_a: nul('pt-asig'),
    prioridad: val('pt-prio'), fecha_limite: nul('pt-fecha'), fase: nul('pt-fase')
  };
  if (!await db(id ? cliente.from('proyecto_tareas').update(fila).eq('id', id) : cliente.from('proyecto_tareas').insert({ ...fila, proyecto_id: pid }))) return;
  cerrarSheet(); toast('Tarea guardada');
  await refrescarMejora();
}
async function borrarPTarea(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  if (!await db(cliente.from('proyecto_tareas').delete().eq('id', id))) return;
  await refrescarMejora();
}
