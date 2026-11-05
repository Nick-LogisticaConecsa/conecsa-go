// =====================================================================
// MEJORA CONTINUA · Proyectos Lean Six Sigma (DMAIC) con tablero Kanban
// Crean proyectos admin, jefatura y quien tenga permiso de edición del módulo.
// Cada proyecto solo lo ven sus participantes (y el admin). Gestiona el proyecto quien lo
// creó, su responsable o el admin. Cada responsable mueve el estado de SUS tareas
// (Por hacer → En proceso → Hecho); los involucrados dejan comentarios y evidencia,
// y el responsable de la tarea puede solicitar un aplazo que el responsable/creador del proyecto resuelve.
// =====================================================================
const FASES = [['definir', 'D', 'Definir'], ['medir', 'M', 'Medir'], ['analizar', 'A', 'Analizar'], ['mejorar', 'M', 'Mejorar'], ['controlar', 'C', 'Controlar']];
const COLS = [['pendiente', 'Por hacer', 'bg-slate-100'], ['en_proceso', 'En proceso', 'bg-blue-50'], ['hecha', 'Hecho', 'bg-emerald-50']];
const PRIO = { alta: 'b-rojo', media: 'b-ambar', baja: 'b-gris' };

// Guía en lenguaje simple de cada fase (qué se hace, qué hay que revisar y qué se espera al final)
const GUIA = {
  definir: {
    pregunta: '¿Dónde duele?',
    que: 'Explica el problema con claridad, qué quieres lograr y hasta dónde llega el proyecto.',
    criterios: [['Problema escrito: qué pasa, cuánto y dónde', p => !!p.descripcion], ['Objetivo con meta y fecha', p => !!p.objetivo], ['Alcance: qué entra y qué no', p => !!p.alcance], ['Responsable y patrocinador elegidos', p => !!(p.responsable_id && p.patrocinador_id)]],
    resultado: 'Un problema claro y medible, con objetivo y equipo.',
    herramientas: ['Acta del proyecto', 'SIPOC (mapa del proceso)', 'Voz del cliente', 'Análisis de involucrados']
  },
  medir: {
    pregunta: '¿Cuánto duele?',
    que: 'Mide cómo está el proceso hoy, con datos y no con opiniones. Ese número es tu punto de partida.',
    criterios: [['Indicador y valor base anotados', p => !!p.indicador && p.valor_base != null], ['Al menos una medición registrada', p => (p.mediciones || []).length > 0]],
    resultado: 'Un número de partida confiable para comparar después.',
    herramientas: ['Hoja de registro de datos', 'Mapa del proceso actual', 'Plan de recolección de datos']
  },
  analizar: {
    pregunta: '¿Por qué duele?',
    que: 'Busca las causas reales del problema, no los síntomas. Comprueba con datos cuáles pesan más.',
    criterios: [['Posibles causas anotadas', p => (p.causas || []).length > 0], ['Al menos una causa verificada con datos', p => (p.causas || []).some(c => c.verificada)]],
    resultado: 'Pocas causas raíz comprobadas con datos.',
    herramientas: ['Diagrama de Ishikawa (6M)', '5 Porqués', 'Pareto 80/20']
  },
  mejorar: {
    pregunta: '¿Cómo lo curamos?',
    que: 'Propón soluciones para cada causa raíz y pruébalas en pequeño antes de extenderlas.',
    criterios: [['Soluciones propuestas para las causas', p => (p.soluciones || []).length > 0], ['Una solución probada en piloto que funciona', p => (p.soluciones || []).some(s => s.estado === 'funciona')]],
    resultado: 'Soluciones probadas que reducen las causas del problema.',
    herramientas: ['Lluvia de ideas', 'Matriz impacto / esfuerzo', 'Plan de piloto', 'Checklist 5S']
  },
  controlar: {
    pregunta: '¿Cómo evitamos que vuelva?',
    que: 'Deja la mejora funcionando: documenta el nuevo método y revisa el indicador con frecuencia.',
    criterios: [['Mediciones después de la mejora', p => (p.mediciones || []).length >= 2], ['Meta alcanzada', p => avanceMeta(p) === 100], ['Nuevo método documentado y personal capacitado', null]],
    resultado: 'La mejora se mantiene y todos saben cómo hacerlo.',
    herramientas: ['Plan de control', 'Procedimiento estándar', 'Tablero de indicadores', 'Lecciones aprendidas']
  }
};
let guiaAbierta = true;

let proyectos = [], ptareas = [], mejoraLista = false, mejoraError = '';
let mjVista = 'proyectos', proyId = null, mjFiltro = 'activo';
let ideas = [], proyBase = null;           // ideas del buzón; datos de partida del proyecto que se está creando (nuevo ciclo, idea, Flota)

const puedeCrearProyecto = () => !!yo && (['admin', 'jefatura'].includes(yo.rol) || puede('mejora', 'editar'));
const puedeRevisarIdeas = () => puedeCrearProyecto();
const gestionaProyecto = p => !!p && !!yo && (yo.rol === 'admin' || p.created_by === yo.id || p.responsable_id === yo.id);
const faseNombre = k => FASES.find(f => f[0] === k)?.[2] || k;
const aplazoPendiente = t => (t.comentarios || []).find(c => c.tipo === 'aplazo_solicitud' && !c.atendido_en);
const solicitudesPorResolver = () => ptareas.filter(t => aplazoPendiente(t) && gestionaProyecto(proyectos.find(p => p.id === t.proyecto_id)));
const participaTarea = t => t.asignado_a === yo.id || (t.participantes || []).some(x => x.usuario_id === yo.id);

async function cargarMejora() {
  const [p, t, i] = await Promise.all([
    cliente.from('proyectos').select('*, responsable:perfiles!responsable_id(nombre), miembros:proyecto_miembros(usuario_id, perfil:perfiles(nombre)), mediciones:proyecto_mediciones(id, fecha, valor, nota, registrado_por, created_at, autor:perfiles!registrado_por(nombre)), causas:proyecto_causas(id, categoria, descripcion, verificada, evidencia, created_by, created_at, autor:perfiles!created_by(nombre)), soluciones:proyecto_soluciones(id, causa_id, descripcion, estado, resultado, created_by, created_at, autor:perfiles!created_by(nombre))').order('created_at', { ascending: false }),
    cliente.from('proyecto_tareas').select('*, asignado:perfiles!asignado_a(nombre), participantes:proyecto_tarea_participantes(usuario_id, perfil:perfiles(nombre)), comentarios:proyecto_tarea_comentarios(id, tipo, texto, atendido_en, resultado, created_at, autor:perfiles!autor_id(nombre))').order('created_at'),
    cliente.from('ideas').select('*, autor:perfiles!created_by(nombre)').order('created_at', { ascending: false })
  ]);
  const err = p.error || t.error || i.error;
  mejoraError = err ? err.message : '';
  proyectos = p.data || []; ptareas = t.data || []; ideas = i.data || [];
  mejoraLista = true;
  actualizarBadgeMejora();
}
// Pendientes propios + solicitudes de aplazo por resolver
function actualizarBadgeMejora() {
  const n = ptareas.filter(t => t.asignado_a === yo.id && t.estado !== 'hecha').length + solicitudesPorResolver().length
    + (puedeRevisarIdeas() ? ideas.filter(x => x.estado === 'nueva').length : 0);
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
  const cab = `<div class="flex gap-2 mb-4 items-center overflow-x-auto scroll-x">
      <button onclick="mjVista='proyectos';pintarMejora()" class="seg ${mjVista === 'proyectos' ? 'seg-on' : 'seg-off'}">Proyectos</button>
      <button onclick="mjVista='mias';pintarMejora()" class="seg ${mjVista === 'mias' ? 'seg-on' : 'seg-off'}">Mis tareas${mias ? ` (${mias})` : ''}</button>
      <button onclick="mjVista='ideas';pintarMejora()" class="seg ${mjVista === 'ideas' ? 'seg-on' : 'seg-off'}">Ideas</button>
      ${puedeCrearProyecto() ? `<button onclick="formProyecto()" class="btn btn-acc ml-auto flex-none whitespace-nowrap !rounded-full !py-1.5">+ Proyecto</button>` : ''}
    </div>`;
  el.innerHTML = `<div class="max-w-2xl mx-auto">${cab}${htmlAlertaAplazos()}${mjVista === 'mias' ? htmlMisTareas() : mjVista === 'ideas' ? htmlIdeas() : htmlProyectos()}</div>`;
}

// Alerta para quien gestiona el proyecto: el responsable de una tarea pidió aplazarla
function htmlAlertaAplazos() {
  const l = solicitudesPorResolver();
  if (!l.length) return '';
  return `<div class="card border-amber-300 bg-amber-50 p-3 mb-4">
    <div class="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">${ico('warn', 'w-4 h-4')} Solicitudes de aplazo (${l.length})</div>
    ${l.map(t => `<button onclick="abrirHiloPTarea(${t.id})" class="block w-full text-left py-2 border-t border-amber-200 first:border-0">
      <span class="text-[11px] font-bold text-amber-700">${esc(proyectos.find(p => p.id === t.proyecto_id)?.nombre || '')}</span>
      <span class="block text-sm font-semibold text-slate-800">${esc(t.titulo)} <span class="font-normal text-slate-500">· ${esc(t.asignado?.nombre || '')}</span></span></button>`).join('')}</div>`;
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
    `<button ${clickable ? `onclick="cambiarFase(${pid},'${k}')"` : 'disabled'} title="${n} · ${GUIA[k].pregunta}" aria-label="${n}: ${GUIA[k].pregunta}" class="step ${i < idx ? 'step-done' : i === idx ? 'step-on' : 'step-off'}">${l}</button>`
  ).join('<span class="step-line"></span>')}</div>`;
}
function htmlProyectos() {
  const filtros = [['activo', 'Activos'], ['pausado', 'Pausados'], ['cerrado', 'Cerrados']];
  const l = proyectos.filter(p => p.estado === mjFiltro);
  const chips = `<div class="flex gap-2 mb-4 overflow-x-auto scroll-x">${filtros.map(([k, n]) =>
    `<button onclick="mjFiltro='${k}';pintarMejora()" class="filtro ${k === mjFiltro ? 'filtro-on' : 'filtro-off'}">${n} (${proyectos.filter(p => p.estado === k).length})</button>`).join('')}</div>`;
  if (!l.length) return chips + `<p class="vacio">${proyectos.length ? 'No hay proyectos en este estado.' : (puedeCrearProyecto() ? 'Crea tu primer proyecto de mejora con “+ Proyecto”.' : 'Aún no participas en ningún proyecto.')}</p>`;
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
  const mias = ptareas.filter(participaTarea);
  if (!mias.length) return '<p class="vacio">No tienes tareas de mejora asignadas.</p>';
  const orden = { en_proceso: 0, pendiente: 1, hecha: 2 };
  return [...mias].sort((a, b) => orden[a.estado] - orden[b.estado] || (a.fecha_limite || '9').localeCompare(b.fecha_limite || '9'))
    .map(t => cardTarea(t, true)).join('');
}

// --- Detalle de proyecto con Kanban ---
function abrirProyecto(id) { proyId = id; pintarMejora(); window.scrollTo(0, 0); }
function volverProyectos() { proyId = null; pintarMejora(); }

function pintarProyecto(el) {
  const p = proyectos.find(x => x.id === proyId), pr = progreso(p.id), av = avanceMeta(p), g = gestionaProyecto(p);
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
    ${htmlActa(p, g)}
    <div class="mt-3"><div class="seccion mb-1.5">Participantes</div>
      <div class="flex flex-wrap gap-1.5">${(p.miembros || []).length ? p.miembros.map(m => `<span class="chip bg-slate-100 text-slate-600">${esc(m.perfil?.nombre || '—')}</span>`).join('') : '<span class="text-xs text-slate-500">Solo el responsable y quien lo creó.</span>'}</div></div>
    <div class="mt-4"><div class="seccion mb-2">Fase DMAIC · ${faseNombre(p.fase)}</div>${stepper(p.fase, p.id, g)}</div>
    ${p.indicador ? `<div class="mt-4 pt-4 border-t border-slate-100">
      <div class="text-xs font-bold text-slate-500 mb-2">${esc(p.indicador)}</div>
      <div class="flex justify-between text-center">
        <div><div class="text-[11px] text-slate-500 font-semibold">BASE</div><div class="font-bold">${fmtNum(p.valor_base)}</div></div>
        <div><div class="text-[11px] text-slate-500 font-semibold">ACTUAL</div><div class="font-bold text-amber-600">${fmtNum(p.valor_actual)}</div></div>
        <div><div class="text-[11px] text-slate-500 font-semibold">META</div><div class="font-bold text-emerald-600">${fmtNum(p.valor_meta)}</div></div>
      </div>
      ${av != null ? `<div class="h-2 rounded-full bg-slate-200 overflow-hidden mt-3"><div class="h-full bg-amber-500" style="width:${av}%"></div></div><div class="text-[11px] text-slate-500 text-right mt-1">${av}% hacia la meta</div>` : ''}
      ${htmlMediciones(p)}
    </div>` : ''}
    <div class="mt-4 flex justify-between text-[11px] font-semibold text-slate-500 mb-1"><span>${pr.hechas} de ${pr.total} tareas terminadas</span><span>${pr.pct}%</span></div>
    <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${pr.pct}%"></div></div>
    ${g ? `<div class="flex flex-wrap gap-2 mt-4">
      <button onclick="formProyecto(${p.id})" class="btn btn-sec">Editar proyecto</button>
      <button onclick="formPTarea(${p.id})" class="btn btn-acc">+ Tarea</button>
      ${p.estado !== 'cerrado' ? `<button onclick="formCierre(${p.id})" class="btn btn-pri">Cerrar proyecto</button>` : ''}
      <button onclick="borrarProyecto(${p.id})" class="btn btn-del ml-auto">Eliminar</button></div>` : ''}
  </div>
  ${htmlCierre(p, g)}
  ${htmlGuiaFase(p)}
  ${htmlCausasSoluciones(p)}
  <div class="kanban">${COLS.map(([k, n, bg]) => {
    const col = ts.filter(t => t.estado === k);
    return `<div class="col ${bg} rounded-xl p-3">
      <div class="flex justify-between items-center mb-3"><span class="font-bold text-sm text-slate-700">${n}</span><span class="chip bg-white text-slate-500">${col.length}</span></div>
      ${col.length ? col.map(t => cardTarea(t, false)).join('') : '<p class="text-xs text-slate-500 text-center py-6">Sin tareas</p>'}
    </div>`;
  }).join('')}</div>`;
}

// Acta del proyecto (qué se quiere resolver y con qué alcance)
function htmlActa(p, g) {
  const campos = [['Problema', p.descripcion], ['Objetivo', p.objetivo], ['Alcance', p.alcance], ['Beneficio esperado', p.beneficio]].filter(c => c[1]);
  const pat = usuarios.find(u => u.id === p.patrocinador_id)?.nombre;
  const previo = proyectos.find(x => x.id === p.ciclo_de);
  const ciclo = previo ? `<p class="text-xs font-semibold text-slate-500 mt-2">Nuevo ciclo de: ${esc(previo.nombre)}</p>` : '';
  if (!campos.length && !pat) return ciclo + (g ? '<p class="text-xs text-slate-500 mt-3">Completa el acta del proyecto (problema, objetivo y alcance) con “Editar proyecto”.</p>' : '');
  return `${ciclo}<div class="mt-3 space-y-2">${campos.map(([t, v]) => `<div><div class="seccion">${t}</div><p class="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">${esc(v)}</p></div>`).join('')}
    ${pat ? `<div><div class="seccion">Patrocinador</div><p class="text-sm text-slate-600">${esc(pat)}</p></div>` : ''}</div>`;
}

// Guía de la fase actual + herramientas de la Biblioteca para esa fase
function htmlGuiaFase(p) {
  const gu = GUIA[p.fase]; if (!gu) return '';
  const idx = FASES.findIndex(f => f[0] === p.fase);
  const links = recursos.filter(r => r.tipo === 'herramienta' && r.fase === p.fase && veRecurso(r));
  return `<details class="card mb-4" ${guiaAbierta ? 'open' : ''} ontoggle="guiaAbierta=this.open">
    <summary class="p-4 cursor-pointer select-none"><span class="font-bold text-slate-800">Fase ${idx + 1} de 5 · ${faseNombre(p.fase)}</span>
      <span class="font-semibold text-amber-700 ml-1">${gu.pregunta}</span></summary>
    <div class="px-4 pb-4 text-sm text-slate-600">
      <p class="leading-relaxed">${gu.que}</p>
      <div class="seccion mt-3 mb-1">Antes de pasar a la siguiente fase</div>
      <ul class="space-y-1">${gu.criterios.map(([t, f]) => { const ok = f ? f(p) : null; return `<li class="flex gap-2"><span class="font-bold ${ok ? 'text-emerald-600' : 'text-slate-400'}">${ok ? '✓' : (f ? '○' : '•')}</span><span class="${ok ? 'text-slate-500' : ''}">${t}</span></li>`; }).join('')}</ul>
      <div class="seccion mt-3 mb-1">Resultado esperado</div><p>${gu.resultado}</p>
      <div class="seccion mt-3 mb-1.5">Herramientas que ayudan</div>
      <div class="flex flex-wrap gap-1.5">${gu.herramientas.map(h => `<span class="chip bg-slate-100 text-slate-600">${h}</span>`).join('')}</div>
      ${links.length ? `<div class="mt-3 grid gap-2">${links.map(r => `<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener" class="block rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-white">
          <span class="font-semibold text-slate-800">${esc(r.titulo)}</span>${r.descripcion ? `<span class="block text-xs text-slate-500 mt-0.5">${esc(r.descripcion)}</span>` : ''}
          <span class="block text-xs font-bold text-amber-700 mt-1">Abrir herramienta</span></a>`).join('')}</div>`
        : `<p class="text-xs text-slate-500 mt-3">Aún no hay enlaces de herramientas para esta fase${yo.rol === 'admin' ? '. Añádelos en Biblioteca → Herramientas.' : '.'}</p>`}
    </div></details>`;
}

// --- Cierre del proyecto y nuevo ciclo ---
const LOGRO = { si: ['Meta alcanzada', 'b-verde'], parcial: ['Meta lograda en parte', 'b-ambar'], no: ['Meta no alcanzada', 'b-rojo'] };

function htmlCierre(p, g) {
  if (p.estado !== 'cerrado') return '';
  const lg = LOGRO[p.logro];
  return `<div class="card p-4 mb-4 border-emerald-200 bg-emerald-50/40">
    <div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-slate-800">Proyecto cerrado</span>${lg ? `<span class="chip ${lg[1]}">${lg[0]}</span>` : ''}
      ${p.cerrado_en ? `<span class="text-xs text-slate-500 ml-auto">${fmtFH(p.cerrado_en)}</span>` : ''}</div>
    ${p.resultado ? `<div class="seccion mt-3">Resultado</div><p class="text-sm text-slate-700 whitespace-pre-wrap">${esc(p.resultado)}</p>` : ''}
    ${p.lecciones ? `<div class="seccion mt-3">Lecciones aprendidas</div><p class="text-sm text-slate-700 whitespace-pre-wrap">${esc(p.lecciones)}</p>` : ''}
    ${g ? `<div class="flex flex-wrap gap-2 mt-4"><button onclick="nuevoCiclo(${p.id})" class="btn btn-acc">Iniciar nuevo ciclo</button>
      <button onclick="reabrirProyecto(${p.id})" class="btn btn-sec">Reabrir</button></div>` : ''}</div>`;
}
function formCierre(pid) {
  const p = proyectos.find(x => x.id === pid), pr = progreso(pid), av = avanceMeta(p), pend = pr.total - pr.hechas;
  abrirSheet('Cerrar proyecto', `
    <div class="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 mb-3">
      ${p.indicador ? `<div>${esc(p.indicador)}: base <b>${fmtNum(p.valor_base)}</b> → actual <b>${fmtNum(p.valor_actual)}</b> · meta <b>${fmtNum(p.valor_meta)}</b>${av != null ? ` (${av}% hacia la meta)` : ''}</div>` : '<div>Este proyecto no tiene indicador.</div>'}
      <div class="mt-1">Tareas terminadas: ${pr.hechas} de ${pr.total}${pend ? ` <b class="text-amber-700">(quedan ${pend} sin terminar)</b>` : ''}</div></div>
    ${lista('ci-logro', '¿Se alcanzó la meta?', [['si', 'Sí, se alcanzó'], ['parcial', 'En parte'], ['no', 'No se alcanzó']], p.logro || (av == null ? 'parcial' : av >= 100 ? 'si' : av >= 50 ? 'parcial' : 'no'))}
    ${area('ci-res', 'Resultado: ¿qué cambió? (con números)', p.resultado, 3)}
    ${area('ci-lec', 'Lecciones aprendidas: ¿qué funcionó, qué no y qué haríamos distinto?', p.lecciones, 4)}
    <button onclick="lock(this,()=>guardarCierre(${pid}))" class="btn btn-pri w-full !py-3">Cerrar proyecto</button>`);
}
async function guardarCierre(pid) {
  if (!val('ci-lec')) return toast('Escribe al menos una lección aprendida.', true);
  const f = { estado: 'cerrado', logro: val('ci-logro'), resultado: nul('ci-res'), lecciones: val('ci-lec'), cerrado_en: new Date().toISOString() };
  if (!await db(cliente.from('proyectos').update(f).eq('id', pid))) return;
  cerrarSheet(); toast('Proyecto cerrado'); await refrescarMejora();
}
async function reabrirProyecto(pid) {
  if (!confirm('¿Reabrir el proyecto? Se conservan el resultado y las lecciones.')) return;
  if (!await db(cliente.from('proyectos').update({ estado: 'activo', cerrado_en: null }).eq('id', pid))) return;
  await refrescarMejora();
}
// Nuevo ciclo: parte del cierre anterior (misma gente e indicador; el valor actual pasa a ser la nueva base)
function nuevoCiclo(pid) {
  const p = proyectos.find(x => x.id === pid), base = p.nombre.replace(/ \(ciclo \d+\)$/, '');
  const n = Number(p.nombre.match(/\(ciclo (\d+)\)$/)?.[1] || 1) + 1;
  formProyecto(0, { nombre: `${base} (ciclo ${n})`, area: p.area, sucursal: p.sucursal, responsable_id: p.responsable_id, patrocinador_id: p.patrocinador_id,
    indicador: p.indicador, valor_base: p.valor_actual, miembros: p.miembros, cicloDe: pid });
}
// Abre el formulario de proyecto con datos de partida (desde una idea o desde Flota)
async function proponerProyecto(base) {
  irTab('mejora'); await abrirMejora();
  formProyecto(0, base);
}

// --- Buzón de ideas (Kaizen): todos proponen, jefatura revisa ---
const EST_IDEA = { nueva: ['Nueva', 'b-ambar'], en_revision: ['En revisión', 'b-gris'], proyecto: ['Convertida en proyecto', 'b-verde'], descartada: ['Descartada', 'b-rojo'] };

function htmlIdeas() {
  const rev = puedeRevisarIdeas();
  const cab = `<div class="flex items-center justify-between gap-3 mb-3"><p class="text-sm text-slate-500">${rev ? 'Ideas enviadas por el equipo.' : 'Cuéntanos qué se podría mejorar. Jefatura la revisa y te responde.'}</p>
    <button onclick="formIdea()" class="btn btn-acc btn-sm flex-none">+ Idea</button></div>`;
  if (!ideas.length) return cab + '<p class="vacio">Aún no hay ideas. Una idea pequeña también cuenta.</p>';
  return cab + ideas.map(x => {
    const [en, cl] = EST_IDEA[x.estado], mia = x.created_by === yo.id;
    return `<div class="card p-4 mb-3">
      <div class="flex items-start justify-between gap-2"><span class="font-bold text-slate-800 leading-snug">${esc(x.titulo)}</span><span class="chip ${cl} flex-none">${en}</span></div>
      ${x.descripcion ? `<p class="text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-snug">${esc(x.descripcion)}</p>` : ''}
      <div class="meta mt-2">${esc(x.autor?.nombre || '—')}${x.sucursal ? ' · ' + esc(x.sucursal) : ''} · ${fmtFH(x.created_at)}</div>
      ${x.respuesta ? `<div class="mt-2 bg-slate-50 rounded-lg p-2.5 text-sm text-slate-700"><div class="seccion">Respuesta</div>${esc(x.respuesta)}</div>` : ''}
      ${x.proyecto_id && proyectos.some(p => p.id === x.proyecto_id) ? `<button onclick="mjVista='proyectos';abrirProyecto(${x.proyecto_id})" class="text-xs font-bold text-amber-700 mt-2">Ver el proyecto</button>` : ''}
      <div class="flex flex-wrap gap-2 mt-3">
        ${rev && x.estado !== 'proyecto' ? `<button onclick="ideaAProyecto(${x.id})" class="btn btn-acc btn-sm">Convertir en proyecto</button><button onclick="formRevisarIdea(${x.id})" class="btn btn-sec btn-sm">Responder</button>` : ''}
        ${mia && x.estado === 'nueva' ? `<button onclick="borrarIdea(${x.id})" class="btn btn-del btn-sm ml-auto" aria-label="Eliminar">${ico('trash', 'w-4 h-4')}</button>` : ''}</div></div>`;
  }).join('');
}
function formIdea() {
  abrirSheet('Nueva idea de mejora', `
    ${campo('id-titulo', '¿Qué se podría mejorar?', { ph: 'Ej. Etiquetar los estantes del almacén' })}
    ${area('id-desc', 'Cuéntanos más: qué pasa hoy y cómo lo mejorarías (opcional)', '', 3)}
    ${lista('id-suc', 'Sucursal', [['', 'Todas'], ...SUCURSALES.map(s => [s, s])], yo.sucursal || '')}
    <button onclick="lock(this,()=>guardarIdea())" class="btn btn-pri w-full !py-3">Enviar idea</button>`);
}
async function guardarIdea() {
  if (!val('id-titulo')) return toast('Escribe tu idea en pocas palabras.', true);
  if (!await db(cliente.from('ideas').insert({ titulo: val('id-titulo'), descripcion: nul('id-desc'), sucursal: nul('id-suc') }))) return;
  cerrarSheet(); toast('Idea enviada. ¡Gracias!'); mjVista = 'ideas'; await refrescarMejora();
}
async function borrarIdea(id) {
  if (!confirm('¿Eliminar esta idea?')) return;
  if (!await db(cliente.from('ideas').delete().eq('id', id))) return;
  await refrescarMejora();
}
function formRevisarIdea(id) {
  const x = ideas.find(i => i.id === id);
  abrirSheet('Responder idea', `
    <p class="text-sm font-semibold text-slate-700 mb-3">${esc(x.titulo)}</p>
    ${lista('ir-est', 'Estado', [['nueva', 'Nueva'], ['en_revision', 'En revisión'], ['descartada', 'Descartada']], x.estado)}
    ${area('ir-res', 'Respuesta para quien la envió', x.respuesta, 3)}
    <button onclick="lock(this,()=>guardarRevisionIdea(${id}))" class="btn btn-pri w-full !py-3">Guardar</button>`);
}
async function guardarRevisionIdea(id) {
  const f = { estado: val('ir-est'), respuesta: nul('ir-res'), atendida_por: yo.id, atendida_en: new Date().toISOString() };
  if (!await db(cliente.from('ideas').update(f).eq('id', id))) return;
  cerrarSheet(); toast('Respuesta guardada'); await refrescarMejora();
}
// La idea pasa a ser un proyecto; quien la envió queda como participante
function ideaAProyecto(id) {
  const x = ideas.find(i => i.id === id);
  proponerProyecto({ nombre: x.titulo, descripcion: x.descripcion || '', sucursal: x.sucursal || '', ideaId: id, miembros: x.created_by !== yo.id ? [{ usuario_id: x.created_by }] : [] });
}

// --- Historial del indicador ---
const puedeEditarReg = (p, autorId) => gestionaProyecto(p) || autorId === yo.id;

function svgMediciones(p) {
  const m = [...(p.mediciones || [])].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  if (m.length < 2) return '';
  const W = 320, H = 130, pl = 40, pr = 10, pt = 12, pb = 22;
  const meta = p.valor_meta != null ? Number(p.valor_meta) : null;
  const vals = [...m.map(x => Number(x.valor)), ...(meta != null ? [meta] : [])];
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const X = i => pl + i * (W - pl - pr) / (m.length - 1), Y = v => pt + (max - v) * (H - pt - pb) / span;
  const pts = m.map((x, i) => `${X(i).toFixed(1)},${Y(Number(x.valor)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full mt-3" role="img" aria-label="Evolución del indicador" font-family="Figtree, sans-serif">
    <line x1="${pl}" x2="${pl}" y1="${pt}" y2="${H - pb}" stroke="#cbd5e1"/><line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="#cbd5e1"/>
    ${meta != null ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(meta).toFixed(1)}" y2="${Y(meta).toFixed(1)}" stroke="#059669" stroke-dasharray="4 3"/><text x="${W - pr}" y="${(Y(meta) - 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#059669">Meta</text>` : ''}
    <polyline points="${pts}" fill="none" stroke="#F59E0B" stroke-width="2"/>
    ${m.map((x, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(Number(x.valor)).toFixed(1)}" r="3" fill="#0B1320"/>`).join('')}
    <text x="${pl - 4}" y="${pt + 3}" text-anchor="end" font-size="9" fill="#64748b">${fmtNum(max)}</text>
    <text x="${pl - 4}" y="${H - pb}" text-anchor="end" font-size="9" fill="#64748b">${fmtNum(min)}</text>
    <text x="${pl}" y="${H - 6}" font-size="9" fill="#64748b">${formFecha(m[0].fecha)}</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end" font-size="9" fill="#64748b">${formFecha(m[m.length - 1].fecha)}</text></svg>`;
}
function htmlMediciones(p) {
  if (!p.indicador) return '';
  const m = [...(p.mediciones || [])].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
  return `${svgMediciones(p)}
    <div class="flex items-center justify-between mt-3"><span class="seccion">Mediciones (${m.length})</span>
      <button onclick="formMedicion(${p.id})" class="btn btn-sec btn-sm">+ Medición</button></div>
    ${m.slice(0, 5).map(x => `<div class="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0 text-sm">
      <span class="text-xs text-slate-500 w-16 flex-none">${formFecha(x.fecha)}</span><b class="w-16 flex-none">${fmtNum(x.valor)}</b>
      <span class="flex-1 text-xs text-slate-500">${esc(x.nota || '')} <span class="text-slate-400">${esc(x.autor?.nombre || '')}</span></span>
      ${puedeEditarReg(p, x.registrado_por) ? `<button onclick="borrarMedicion(${x.id})" class="text-slate-400 hover:text-red-600" aria-label="Eliminar medición">${ico('trash', 'w-4 h-4')}</button>` : ''}</div>`).join('')}
    ${m.length > 5 ? `<p class="text-[11px] text-slate-500 mt-1">Se muestran las 5 más recientes.</p>` : ''}`;
}
function formMedicion(pid) {
  const p = proyectos.find(x => x.id === pid);
  abrirSheet('Nueva medición', `
    <p class="text-sm text-slate-500 mb-3">${esc(p.indicador)}</p>
    ${fila(campo('me-fecha', 'Fecha', { type: 'date', val: isoHoy() }), campo('me-valor', 'Valor medido', { type: 'number', extra: 'step="any"' }))}
    ${campo('me-nota', 'Nota (opcional)', { ph: 'Ej. semana 2, después del piloto' })}
    <button onclick="lock(this,()=>guardarMedicion(${pid}))" class="btn btn-pri w-full !py-3">Guardar</button>`);
}
async function guardarMedicion(pid) {
  const valor = num('me-valor');
  if (valor == null || Number.isNaN(valor)) return toast('Escribe el valor medido.', true);
  if (!await db(cliente.from('proyecto_mediciones').insert({ proyecto_id: pid, fecha: val('me-fecha') || isoHoy(), valor, nota: nul('me-nota') }))) return;
  cerrarSheet(); toast('Medición guardada'); await refrescarMejora();
}
async function borrarMedicion(id) {
  if (!confirm('¿Eliminar esta medición?')) return;
  if (!await db(cliente.from('proyecto_mediciones').delete().eq('id', id))) return;
  await refrescarMejora();
}

// --- Causas raíz y soluciones ---
const CAT6M = [['metodos', 'Métodos'], ['mano_obra', 'Mano de obra'], ['materiales', 'Materiales'], ['maquinas', 'Máquinas'], ['medicion', 'Medición'], ['medio_ambiente', 'Medio ambiente']];
const EST_SOL = { propuesta: ['Propuesta', 'b-gris'], en_piloto: ['En piloto', 'b-ambar'], funciona: ['Funciona', 'b-verde'], descartada: ['Descartada', 'b-rojo'] };
const recorte = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

function htmlCausasSoluciones(p) {
  const causas = [...(p.causas || [])].sort(porFecha), sols = [...(p.soluciones || [])].sort(porFecha);
  const abierto = ['analizar', 'mejorar'].includes(p.fase) || causas.length || sols.length;
  const lapiz = (fn, id) => `<button onclick="${fn}(${p.id},${id})" class="text-slate-400 hover:text-slate-700" aria-label="Editar">${ico('pencil', 'w-4 h-4')}</button>`;
  return `<details class="card mb-4" ${abierto ? 'open' : ''}>
    <summary class="p-4 cursor-pointer select-none font-bold text-slate-800">Causas y soluciones <span class="font-normal text-slate-500">(${causas.length} causas · ${sols.length} soluciones)</span></summary>
    <div class="px-4 pb-4">
      <div class="flex items-center justify-between"><span class="seccion">Causas del problema</span><button onclick="formCausa(${p.id})" class="btn btn-sec btn-sm">+ Causa</button></div>
      ${causas.length ? causas.map(c => `<div class="py-2 border-b border-slate-100 last:border-0">
          <div class="flex items-center gap-1.5 flex-wrap"><span class="chip bg-indigo-50 text-indigo-700">${CAT6M.find(x => x[0] === c.categoria)?.[1] || c.categoria}</span>
            <span class="chip ${c.verificada ? 'b-verde' : 'b-gris'}">${c.verificada ? 'Verificada con datos' : 'Sin verificar'}</span>
            ${puedeEditarReg(p, c.created_by) ? `<span class="ml-auto">${lapiz('formCausa', c.id)}</span>` : ''}</div>
          <p class="text-sm text-slate-700 mt-1 whitespace-pre-wrap">${esc(c.descripcion)}</p>
          ${c.evidencia ? `<p class="text-xs text-slate-500 mt-0.5">Evidencia: ${esc(c.evidencia)}</p>` : ''}</div>`).join('')
        : '<p class="text-xs text-slate-500 py-2">Aún no hay causas. Anota las que se te ocurran y luego verifica cuáles se confirman con datos.</p>'}
      <div class="flex items-center justify-between mt-4"><span class="seccion">Soluciones</span><button onclick="formSolucion(${p.id})" class="btn btn-sec btn-sm">+ Solución</button></div>
      ${sols.length ? sols.map(s => { const [en, cl] = EST_SOL[s.estado], causa = causas.find(c => c.id === s.causa_id); return `<div class="py-2 border-b border-slate-100 last:border-0">
          <div class="flex items-center gap-1.5 flex-wrap"><span class="chip ${cl}">${en}</span>
            ${puedeEditarReg(p, s.created_by) ? `<span class="ml-auto">${lapiz('formSolucion', s.id)}</span>` : ''}</div>
          <p class="text-sm text-slate-700 mt-1 whitespace-pre-wrap">${esc(s.descripcion)}</p>
          ${causa ? `<p class="text-xs text-slate-500 mt-0.5">Para la causa: ${esc(recorte(causa.descripcion, 70))}</p>` : ''}
          ${s.resultado ? `<p class="text-xs text-slate-500 mt-0.5">Resultado: ${esc(s.resultado)}</p>` : ''}</div>`; }).join('')
        : '<p class="text-xs text-slate-500 py-2">Aún no hay soluciones. Propón una por cada causa verificada y pruébala en pequeño antes de extenderla.</p>'}
    </div></details>`;
}
function formCausa(pid, id) {
  const c = id ? proyectos.find(p => p.id === pid).causas.find(x => x.id === id) : {};
  abrirSheet(id ? 'Editar causa' : 'Nueva causa', `
    ${lista('ca-cat', 'Categoría', CAT6M, c.categoria || 'metodos')}
    ${area('ca-desc', '¿Qué causa el problema?', c.descripcion, 3)}
    ${lista('ca-ver', '¿La verificaste con datos?', [['no', 'No, todavía'], ['si', 'Sí']], c.verificada ? 'si' : 'no')}
    ${area('ca-ev', 'Dato o evidencia que la respalda (opcional)', c.evidencia, 2)}
    <button onclick="lock(this,()=>guardarCausa(${pid},${id || 0}))" class="btn btn-pri w-full !py-3">Guardar</button>
    ${id ? `<button onclick="borrarCausa(${id})" class="btn btn-del w-full mt-2">Eliminar causa</button>` : ''}`);
}
async function guardarCausa(pid, id) {
  if (!val('ca-desc')) return toast('Describe la causa.', true);
  const f = { categoria: val('ca-cat'), descripcion: val('ca-desc'), verificada: val('ca-ver') === 'si', evidencia: nul('ca-ev') };
  if (!await db(id ? cliente.from('proyecto_causas').update(f).eq('id', id) : cliente.from('proyecto_causas').insert({ ...f, proyecto_id: pid }))) return;
  cerrarSheet(); toast('Causa guardada'); await refrescarMejora();
}
async function borrarCausa(id) {
  if (!confirm('¿Eliminar esta causa? Las soluciones ligadas quedan sin causa.')) return;
  if (!await db(cliente.from('proyecto_causas').delete().eq('id', id))) return;
  cerrarSheet(); await refrescarMejora();
}
function formSolucion(pid, id) {
  const p = proyectos.find(x => x.id === pid), s = id ? p.soluciones.find(x => x.id === id) : {};
  abrirSheet(id ? 'Editar solución' : 'Nueva solución', `
    ${area('so-desc', '¿Qué se va a hacer?', s.descripcion, 3)}
    ${lista('so-causa', 'Para qué causa', [['', '— Sin causa asignada —'], ...(p.causas || []).map(c => [c.id, recorte(c.descripcion, 60)])], s.causa_id || '')}
    ${lista('so-est', 'Estado', Object.entries(EST_SOL).map(([k, v]) => [k, v[0]]), s.estado || 'propuesta')}
    ${area('so-res', 'Resultado del piloto (opcional)', s.resultado, 2)}
    <button onclick="lock(this,()=>guardarSolucion(${pid},${id || 0}))" class="btn btn-pri w-full !py-3">Guardar</button>
    ${id ? `<button onclick="borrarSolucion(${id})" class="btn btn-del w-full mt-2">Eliminar solución</button>` : ''}`);
}
async function guardarSolucion(pid, id) {
  if (!val('so-desc')) return toast('Describe la solución.', true);
  const f = { descripcion: val('so-desc'), causa_id: val('so-causa') ? Number(val('so-causa')) : null, estado: val('so-est'), resultado: nul('so-res') };
  if (!await db(id ? cliente.from('proyecto_soluciones').update(f).eq('id', id) : cliente.from('proyecto_soluciones').insert({ ...f, proyecto_id: pid }))) return;
  cerrarSheet(); toast('Solución guardada'); await refrescarMejora();
}
async function borrarSolucion(id) {
  if (!confirm('¿Eliminar esta solución?')) return;
  if (!await db(cliente.from('proyecto_soluciones').delete().eq('id', id))) return;
  cerrarSheet(); await refrescarMejora();
}

function cardTarea(t, conProyecto) {
  const g = gestionaProyecto(proyectos.find(x => x.id === t.proyecto_id)), mia = t.asignado_a === yo.id, puedeMover = mia || g;
  const vencida = t.aplazada_hasta ? t.estado !== 'hecha' && new Date(t.aplazada_hasta) < new Date() : estaVencido(t.fecha_limite, t.hora_limite, t.estado === 'hecha');
  const p = conProyecto ? proyectos.find(x => x.id === t.proyecto_id) : null;
  const coms = t.comentarios || [], conEvidencia = coms.some(c => c.tipo === 'evidencia');
  const otros = (t.participantes || []).filter(x => x.usuario_id !== t.asignado_a);
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
      ${t.fecha_limite ? `<span class="chip ${vencida ? 'b-rojo' : 'b-gris'}">${ico(vencida ? 'warn' : 'cal', 'w-3 h-3')} ${t.aplazada_hasta ? fmtFH(t.aplazada_hasta) : fmtLimite(t.fecha_limite, t.hora_limite)}</span>` : ''}
      <span class="chip ${mia ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}">${ico('user', 'w-3 h-3')} ${esc(mia ? 'Yo' : (t.asignado?.nombre || 'Sin asignar'))}</span>
      ${t.aplazos ? `<span class="chip b-gris">Aplazada ${t.aplazos}×</span>` : ''}
      ${aplazoPendiente(t) ? '<span class="chip b-ambar">Aplazo solicitado</span>' : ''}
      ${t.estado === 'hecha' ? `<span class="chip ${conEvidencia ? 'b-verde' : 'b-ambar'}">${conEvidencia ? 'Con evidencia' : 'Sin evidencia'}</span>` : ''}
    </div>
    ${otros.length ? `<div class="text-[11px] text-slate-500 mt-2">Con: ${otros.map(x => esc(x.perfil?.nombre || '—')).join(', ')}</div>` : ''}
    ${t.estado === 'hecha' && t.completada_en ? `<div class="text-[11px] text-emerald-600 font-semibold mt-2">Terminada ${fmtFH(t.completada_en)}</div>` : ''}
    ${puedeMover ? `<div class="flex flex-wrap gap-2 mt-3">${siguiente.map(([e, n, c]) => `<button onclick="moverPTarea(${t.id},'${e}')" class="btn ${c} btn-sm">${n}</button>`).join('')}
      ${g ? `<button onclick="formPTarea(${t.proyecto_id},${t.id})" class="btn btn-sec btn-sm ml-auto" aria-label="Editar">${ico('pencil', 'w-4 h-4')}</button>
      <button onclick="borrarPTarea(${t.id})" class="btn btn-del btn-sm" aria-label="Eliminar">${ico('trash', 'w-4 h-4')}</button>` : ''}</div>` : ''}
    <button onclick="abrirHiloPTarea(${t.id})" class="btn btn-sec btn-sm mt-3">${ico('chat', 'w-4 h-4')} Comentarios${coms.length ? ` (${coms.length})` : ''}</button>
  </div>`;
}

// --- Comentarios, evidencia y aplazos de una tarea ---
function abrirHiloPTarea(tid) {
  const t = ptareas.find(x => x.id === tid); if (!t) return;
  const g = gestionaProyecto(proyectos.find(p => p.id === t.proyecto_id)), resp = t.asignado_a === yo.id;
  const participa = resp || g || (t.participantes || []).some(x => x.usuario_id === yo.id);
  const pend = aplazoPendiente(t);
  const resolver = c => {
    if (c.tipo !== 'aplazo_solicitud') return '';
    if (c.atendido_en) return `<div class="mt-1"><span class="chip ${c.resultado === 'aprobado' ? 'b-verde' : 'b-gris'}">${c.resultado === 'aprobado' ? 'Aprobado' : 'Rechazado'}</span></div>`;
    if (!g) return '<div class="mt-1 text-[11px] font-semibold text-amber-700">Esperando respuesta del responsable del proyecto</div>';
    return `<div class="mt-2 bg-amber-50 rounded-lg p-3">
      ${campo('ap-hasta', 'Nueva fecha y hora límite', { type: 'datetime-local', val: tsLocal(new Date(Date.now() + 864e5)), extra: `min="${ahoraLocal()}"` })}
      ${campo('ap-nota', 'Nota (opcional)', { ph: 'Motivo o indicación' })}
      <div class="flex gap-2"><button onclick="resolverAplazo(${c.id},${tid},true)" class="btn btn-acc flex-1">Aplazar</button>
        <button onclick="resolverAplazo(${c.id},${tid},false)" class="btn btn-sec flex-1">Rechazar</button></div></div>`;
  };
  const tipos = [['comentario', 'Comentario'], ['evidencia', 'Evidencia (dónde quedó el trabajo)']];
  if (resp && t.estado !== 'hecha' && !pend) tipos.push(['aplazo_solicitud', 'Solicitar aplazo (avisa al responsable del proyecto)']);
  abrirSheet('Comentarios · ' + t.titulo, `
    <div class="max-h-[45vh] overflow-y-auto mb-3">${htmlHilo([...(t.comentarios || [])].sort(porFecha), resolver)}</div>
    ${participa ? `${lista('pc-tipo', 'Tipo', tipos)}${area('pc-texto', 'Escribe aquí', '', 3)}
      <button onclick="lock(this,()=>enviarComentarioPTarea(${tid}))" class="btn btn-pri w-full !py-3">Enviar</button>`
      : '<p class="text-xs text-slate-500 text-center">Solo los involucrados en la tarea pueden comentar.</p>'}`);
}
async function enviarComentarioPTarea(tid) {
  const texto = val('pc-texto');
  if (!texto) return toast('Escribe el comentario.', true);
  if (!await db(cliente.from('proyecto_tarea_comentarios').insert({ tarea_id: tid, tipo: val('pc-tipo'), texto }))) return;
  await refrescarMejora(); abrirHiloPTarea(tid);
}
async function resolverAplazo(cid, tid, aprobar) {
  const hasta = val('ap-hasta');
  if (aprobar && !hasta) return toast('Indica la nueva fecha y hora.', true);
  if (!await db(cliente.rpc('resolver_aplazo', { p_solicitud: cid, p_aprobar: aprobar, p_hasta: aprobar ? new Date(hasta).toISOString() : null, p_nota: nul('ap-nota') }))) return;
  toast(aprobar ? 'Aplazo aprobado' : 'Aplazo rechazado');
  await refrescarMejora(); abrirHiloPTarea(tid);
}

async function moverPTarea(id, estado) {
  if (!await db(cliente.rpc('cambiar_estado_ptarea', { p_id: id, p_estado: estado }))) return;
  await refrescarMejora();
}

// --- Gestión (solo quien tenga permiso de edición) ---
const opcionesUsuarios = (conVacio, lista = usuarios) => [...(conVacio ? [['', '— Sin asignar —']] : []), ...lista.map(u => [u.id, `${u.nombre} (${puestoDe(u)})`])];
// Personas de un proyecto: quien lo creó, su responsable y los participantes elegidos (más quien ya tenga la tarea)
function personasProyecto(pid, extra = []) {
  const p = proyectos.find(x => x.id === pid);
  const ids = new Set([p?.created_by, p?.responsable_id, ...(p?.miembros || []).map(m => m.usuario_id), ...extra].filter(Boolean));
  return usuarios.filter(u => ids.has(u.id));
}

function formProyecto(id, base) {
  const p = id ? proyectos.find(x => x.id === id) : (base || {});
  proyBase = id ? null : (base || null);
  abrirSheet(id ? 'Editar proyecto' : 'Nuevo proyecto de mejora', `
    ${campo('p-nombre', 'Nombre del proyecto', { val: p.nombre, ph: 'Ej. Reducir despachos que salen tarde' })}
    <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1 mb-2">Acta del proyecto</div>
    ${area('p-desc', 'Problema: ¿qué pasa, cuánto y dónde?', p.descripcion, 3)}
    ${area('p-obj', 'Objetivo: ¿qué quieres lograr, cuánto y para cuándo?', p.objetivo, 2)}
    ${area('p-alc', 'Alcance: ¿qué incluye y qué no?', p.alcance, 2)}
    ${area('p-ben', 'Beneficio esperado', p.beneficio, 2)}
    ${fila(campo('p-area', 'Área', { val: p.area, ph: 'Almacén, Despacho…' }), lista('p-suc', 'Sucursal', [['', 'Todas'], ...SUCURSALES.map(s => [s, s])], p.sucursal || ''))}
    ${lista('p-resp', 'Responsable (lidera el proyecto)', opcionesUsuarios(true), p.responsable_id || '')}
    ${lista('p-pat', 'Patrocinador (quien lo respalda y quita obstáculos)', opcionesUsuarios(true).map(o => o[0] === '' ? ['', '— Sin patrocinador —'] : o), p.patrocinador_id || '')}
    <div class="lbl">Participantes (solo ellos verán el proyecto)</div>
    ${checksUsuarios('chk-m', usuarios.filter(u => u.id !== yo.id), new Set((p.miembros || []).map(m => m.usuario_id)))}
    <p class="text-[11px] text-slate-500 -mt-2 mb-3">Tú, el responsable y el administrador siempre lo ven.</p>
    ${fila(lista('p-fase', 'Fase DMAIC', FASES.map(f => [f[0], f[2]]), p.fase || 'definir'), lista('p-estado', 'Estado', [['activo', 'Activo'], ['pausado', 'Pausado'], ['cerrado', 'Cerrado']], p.estado || 'activo'))}
    ${fila(campo('p-ini', 'Inicio', { type: 'date', val: p.fecha_inicio }), campo('p-meta', 'Fecha meta', { type: 'date', val: p.fecha_meta }))}
    <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1 mb-2">Indicador (opcional)</div>
    ${campo('p-ind', 'Qué se mide', { val: p.indicador, ph: 'Ej. Minutos por despacho' })}
    ${fila(campo('p-base', 'Valor base', { type: 'number', val: p.valor_base ?? '', extra: 'step="any"' }), campo('p-actual', 'Valor actual (sigue a las mediciones)', { type: 'number', val: p.valor_actual ?? '', extra: 'step="any"' }))}
    ${campo('p-vmeta', 'Valor meta', { type: 'number', val: p.valor_meta ?? '', extra: 'step="any"' })}
    <button onclick="lock(this,()=>guardarProyecto(${id || 0}))" class="btn btn-pri w-full !py-3 mt-2">Guardar</button>`);
}
async function guardarProyecto(id) {
  if (!val('p-nombre')) return toast('Ponle un nombre al proyecto.', true);
  const marcados = [...document.querySelectorAll('.chk-m:checked')].map(c => c.value);
  const fila = {
    nombre: val('p-nombre'), descripcion: nul('p-desc'), objetivo: nul('p-obj'), alcance: nul('p-alc'), beneficio: nul('p-ben'),
    area: nul('p-area'), sucursal: nul('p-suc'), responsable_id: nul('p-resp'), patrocinador_id: nul('p-pat'), fase: val('p-fase'), estado: val('p-estado'),
    fecha_inicio: nul('p-ini'), fecha_meta: nul('p-meta'),
    indicador: nul('p-ind'), valor_base: num('p-base'), valor_actual: num('p-actual'), valor_meta: num('p-vmeta')
  };
  if (!id && proyBase?.cicloDe) fila.ciclo_de = proyBase.cicloDe;
  const r = await db(id ? cliente.from('proyectos').update(fila).eq('id', id).select().single() : cliente.from('proyectos').insert(fila).select().single());
  if (!r) return;
  if (!await sincronizar('proyecto_miembros', 'proyecto_id', r.id, (proyectos.find(x => x.id === id)?.miembros || []).map(m => m.usuario_id), marcados)) return;
  if (!id && proyBase?.ideaId) await db(cliente.from('ideas').update({ estado: 'proyecto', proyecto_id: r.id, atendida_por: yo.id, atendida_en: new Date().toISOString() }).eq('id', proyBase.ideaId));
  proyBase = null; mjVista = 'proyectos';
  cerrarSheet(); toast('Proyecto guardado');
  if (!id) proyId = r.id;
  await refrescarMejora();
}
// Deja en la tabla de vínculos exactamente a los usuarios marcados (agrega y quita la diferencia)
async function sincronizar(tabla, colPadre, padreId, antes, ahora) {
  const nuevos = ahora.filter(u => !antes.includes(u)), quitar = antes.filter(u => !ahora.includes(u));
  if (nuevos.length && !await db(cliente.from(tabla).insert(nuevos.map(u => ({ [colPadre]: padreId, usuario_id: u }))))) return false;
  if (quitar.length && !await db(cliente.from(tabla).delete().eq(colPadre, padreId).in('usuario_id', quitar))) return false;
  return true;
}
async function cambiarFase(pid, fase) {
  const p = proyectos.find(x => x.id === pid);
  if (!p || p.fase === fase) return;
  // Al avanzar, avisa qué le falta a la fase actual (no bloquea: quien gestiona decide)
  if (FASES.findIndex(f => f[0] === fase) > FASES.findIndex(f => f[0] === p.fase)) {
    const falta = GUIA[p.fase].criterios.filter(([, f]) => f && !f(p)).map(([t]) => t);
    if (falta.length && !confirm(`En ${faseNombre(p.fase)} aún falta:\n• ${falta.join('\n• ')}\n\n¿Pasar a ${faseNombre(fase)} de todos modos?`)) return;
  }
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
    ${lista('pt-asig', 'Responsable de la tarea', opcionesUsuarios(true, personasProyecto(pid, [t.asignado_a])), t.asignado_a || '')}
    <div class="lbl">Involucrados en la tarea (podrán comentar)</div>
    ${checksUsuarios('chk-pp', personasProyecto(pid, (t.participantes || []).map(x => x.usuario_id)), new Set((t.participantes || []).map(x => x.usuario_id)))}
    ${lista('pt-prio', 'Prioridad', [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']], t.prioridad || 'media')}
    ${fila(campo('pt-fecha', 'Fecha límite', { type: 'date', val: t.fecha_limite }), campo('pt-hora', 'Hora límite (opcional)', { type: 'time', val: (t.hora_limite || '').slice(0, 5) }))}
    ${lista('pt-fase', 'Etapa DMAIC (opcional)', [['', '—'], ...FASES.map(f => [f[0], f[2]])], t.fase || (proyectos.find(p => p.id === pid)?.fase) || '')}
    <button onclick="lock(this,()=>guardarPTarea(${pid},${id || 0}))" class="btn btn-pri w-full !py-3 mt-2">Guardar</button>`);
}
async function guardarPTarea(pid, id) {
  if (!val('pt-titulo')) return toast('Escribe qué hay que hacer.', true);
  const fila = {
    titulo: val('pt-titulo'), descripcion: nul('pt-desc'), asignado_a: nul('pt-asig'),
    prioridad: val('pt-prio'), fecha_limite: nul('pt-fecha'), hora_limite: nul('pt-hora'), fase: nul('pt-fase')
  };
  if (fila.hora_limite && !fila.fecha_limite) return toast('Para poner una hora, elige también la fecha.', true);
  const previa = id ? ptareas.find(x => x.id === id) : null;
  // si cambió la fecha u hora a mano, ya no rige el aplazo aprobado
  if (previa && (fila.fecha_limite !== previa.fecha_limite || fila.hora_limite !== ((previa.hora_limite || '').slice(0, 5) || null))) fila.aplazada_hasta = null;
  const involucrados = [...document.querySelectorAll('.chk-pp:checked')].map(c => c.value).filter(u => u !== fila.asignado_a);
  const r = await db(id ? cliente.from('proyecto_tareas').update(fila).eq('id', id).select().single() : cliente.from('proyecto_tareas').insert({ ...fila, proyecto_id: pid }).select().single());
  if (!r) return;
  if (!await sincronizar('proyecto_tarea_participantes', 'tarea_id', r.id, (previa?.participantes || []).map(x => x.usuario_id), involucrados)) return;
  cerrarSheet(); toast('Tarea guardada');
  await refrescarMejora();
}
async function borrarPTarea(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  if (!await db(cliente.from('proyecto_tareas').delete().eq('id', id))) return;
  await refrescarMejora();
}
