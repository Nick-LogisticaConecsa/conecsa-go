// --- CONFIGURACIÓN SUPABASE ---
// La llave "anon" es pública por diseño: la seguridad real está en las políticas RLS de la base.
const cliente = supabase.createClient(
  'https://vwhkupadhcfqbquayqzz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3aGt1cGFkaGNmcWJxdWF5cXp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MzM5MTMsImV4cCI6MjEwNjMwOTkxM30.tFwvSpDc_T4HF5ETVTrLjFAZDRLhzkFI61bHp-9Xy44'
);

// --- UTILIDADES ---
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';
const formFecha = f => f ? f.split('-').reverse().join('/') : '';
const isoHoy = () => new Date().toLocaleDateString('en-CA');           // YYYY-MM-DD en hora local
const diasHasta = f => Math.round((new Date(f + 'T00:00:00') - new Date(isoHoy() + 'T00:00:00')) / 864e5);
const fmtFH = ts => ts ? new Date(ts).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtNum = n => n == null ? '—' : Number(n).toLocaleString('es-PE');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nombreDe = id => usuarios.find(u => u.id === id)?.nombre || '—';
const ahoraLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
// Límite de una tarea: fecha y, si la tiene, hora. Sin hora vence al terminar el día.
const venceTs = (f, h) => f ? new Date(`${f}T${h ? h.slice(0, 5) : '23:59'}:00`) : null;
const estaVencido = (f, h, hecho) => !hecho && !!f && venceTs(f, h) < new Date();
const fmtLimite = (f, h) => formFecha(f) + (h ? ' ' + h.slice(0, 5) : '');
const tsLocal = ts => ts ? new Date(new Date(ts).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';


// --- ÍCONOS (trazo único de 1.8, estilo outline) ---
const ICONOS = {
  user: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  pin: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z',
  phone: 'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z',
  chat: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
  trash: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  pencil: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  warn: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  cal: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  flag: 'M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5',
  mail: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  truck: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-4.875c0-.42-.176-.826-.489-1.119l-3.2-3.2a1.125 1.125 0 00-.795-.33H15.75M2.25 14.25V6.375c0-.621.504-1.125 1.125-1.125h9.75c.621 0 1.125.504 1.125 1.125V14.25m-17.25 0h17.25',
  moto: 'M2.5 16.5a3 3 0 106 0 3 3 0 10-6 0zM15.5 16.5a3 3 0 106 0 3 3 0 10-6 0zM5.5 16.5l3-6h4l3 6M8.5 10.5L7.5 8H6M12.5 10.5l1.5-3h2.5',
  motocarga: 'M2.5 17a3 3 0 106 0 3 3 0 10-6 0zM14 17a3 3 0 106 0 3 3 0 10-6 0zM5.5 14V9h4.5M10 14V7h11v7M8.5 17h2.5'
};
const ico = (n, c = 'w-3.5 h-3.5') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="${c} inline-block flex-none align-[-2px]" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;

// Roles que pueden asignar tareas a otros y ver "Data" (los permisos de flota/contactos/mejora vienen de modulo_roles)
const PUEDE_ASIGNAR = ['admin', 'jefatura', 'asistente'];
const PUEDE_AVISAR = ['admin', 'jefatura'];
const SUCURSALES = ['Huancayo', 'Tarma', 'Huánuco'];
let yo = null, recursos = [], usuarios = [], tareas = [], avisos = [], permisosMod = [];
let tab = 'biblioteca', bib = 'formulario', sub = 'mias';

// Permisos por módulo (los define la tabla modulo_roles; admin puede todo)
// Lo que se muestra junto al nombre es el puesto en Conecsa; el rol solo decide permisos.
const puestoDe = u => u.puesto || u.rol;
const puede = (mod, nivel = 'ver') => !!yo && (yo.rol === 'admin' ||
  permisosMod.some(m => m.modulo === mod && m.rol === yo.rol && (m.nivel === 'editar' || m.nivel === nivel)));

function toast(msg, error) {
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' toast-err' : '');
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Ejecuta una consulta de Supabase; si falla avisa y devuelve null (si va bien, devuelve los datos o true)
async function db(consulta) {
  const { data, error } = await consulta;
  if (error) { console.error(error); toast(error.message || 'Ocurrió un error', true); return null; }
  return data ?? true;
}

// Evita doble clic mientras se guarda
async function lock(btn, fn) {
  if (btn.disabled) return;
  const txt = btn.textContent;
  btn.disabled = true; btn.textContent = 'Guardando…';
  try { await fn(); } finally { btn.disabled = false; btn.textContent = txt; }
}

// --- HOJA INFERIOR Y CAMPOS DE FORMULARIO ---
function abrirSheet(titulo, html) {
  $('sheet-titulo').textContent = titulo; $('sheet-body').innerHTML = html;
  $('sheet').classList.remove('hidden'); document.body.classList.add('overflow-hidden');
}
function cerrarSheet() { $('sheet').classList.add('hidden'); $('sheet-body').innerHTML = ''; document.body.classList.remove('overflow-hidden'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarSheet(); });

const campo = (id, label, { type = 'text', val = '', ph = '', extra = '' } = {}) =>
  `<label class="block mb-3"><span class="lbl">${label}</span><input id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}" ${extra} class="inp"></label>`;
const area = (id, label, val = '', rows = 3) =>
  `<label class="block mb-3"><span class="lbl">${label}</span><textarea id="${id}" rows="${rows}" class="inp">${esc(val)}</textarea></label>`;
// opts: [[valor, etiqueta], ...]
const lista = (id, label, opts, val = '') =>
  `<label class="block mb-3"><span class="lbl">${label}</span><select id="${id}" class="inp">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const fila = (...c) => `<div class="grid grid-cols-2 gap-3">${c.join('')}</div>`;
const val = id => $(id).value.trim();
const nul = id => val(id) || null;
const num = id => { const x = val(id); return x === '' ? null : Number(x); };

// Botones tipo píldora
const seg = (items, actual, fn) => items.map(([k, l]) =>
  `<button onclick="${fn}('${k}')" class="seg ${k === actual ? 'seg-on' : 'seg-off'}">${esc(l)}</button>`).join('');

// Hilo de comentarios (Tareas y Mejora). extra(c) permite añadir controles debajo de un comentario.
const TIPO_COM = { comentario: ['Comentario', 'b-gris'], evidencia: ['Evidencia', 'b-verde'], aplazo_solicitud: ['Solicitud de aplazo', 'b-ambar'], aplazo_resuelto: ['Aplazo', 'b-ambar'] };
const htmlHilo = (items, extra = () => '') => items.length ? items.map(c => `<div class="py-2.5 border-b border-slate-100 last:border-0">
    <div class="flex items-center gap-2 flex-wrap"><b class="text-sm text-slate-800">${esc(c.autor?.nombre || '—')}</b><span class="chip ${TIPO_COM[c.tipo][1]}">${TIPO_COM[c.tipo][0]}</span><span class="text-[11px] text-slate-500 ml-auto">${fmtFH(c.created_at)}</span></div>
    <p class="text-sm text-slate-700 mt-1 whitespace-pre-wrap leading-snug">${esc(c.texto)}</p>${extra(c)}</div>`).join('')
  : '<p class="text-sm text-slate-500 py-4 text-center">Aún no hay comentarios.</p>';
const porFecha = (a, b) => a.created_at.localeCompare(b.created_at);
// Lista de usuarios con casillas. clase: clase CSS de los checkbox; marcados: Set de ids
const checksUsuarios = (clase, lista, marcados = new Set()) => `<div class="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50 mb-3">${lista.length ? lista.map(u =>
  `<label class="flex items-center gap-3 p-2.5 text-sm cursor-pointer"><input type="checkbox" class="${clase} w-4 h-4 accent-[#0B1320]" value="${u.id}" ${marcados.has(u.id) ? 'checked' : ''}> <span class="font-medium">${esc(u.nombre)}</span> <span class="text-xs font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${esc(puestoDe(u))}</span></label>`).join('')
  : '<p class="text-xs text-slate-500 p-3">No hay personas para elegir.</p>'}</div>`;

// --- SESIÓN ---
function errLogin(msg) { $('error-msg').textContent = msg; $('error-msg').classList.remove('hidden'); }
function mostrarLogin(msg) {
  yo = null;
  $('splash').classList.add('hidden'); $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  if (msg) errLogin(msg); else $('error-msg').classList.add('hidden');
}
async function iniciarSesion() {
  const email = $('email').value.trim(), password = $('password').value;
  if (!email || !password) return errLogin('Ingresa tu correo y contraseña.');
  const btn = $('btn-entrar'); btn.disabled = true; btn.textContent = 'Ingresando…';
  const { error } = await cliente.auth.signInWithPassword({ email, password });
  if (error) errLogin('Correo o contraseña incorrectos.'); else await iniciarApp();
  btn.disabled = false; btn.textContent = 'Entrar';
}
async function cerrarSesion() {
  yo = null;
  await cliente.auth.signOut();
  tareas = []; avisos = []; permisosMod = [];
  mejoraLista = false; flotaLista = false;
  $('email').value = $('password').value = '';
  mostrarLogin();
}
async function iniciarApp() {
  $('login').classList.add('hidden'); $('splash').classList.remove('hidden');
  try {
    const { data: { user } } = await cliente.auth.getUser();
    if (!user) return mostrarLogin();
    const { data: p } = await cliente.from('perfiles').select('*').eq('id', user.id).maybeSingle();
    if (!p) {
      await cliente.auth.signOut();
      return mostrarLogin('Tu usuario aún no tiene perfil asignado. Pide al administrador que lo configure.');
    }
    yo = p;
    $('quien').textContent = `${p.nombre} · ${puestoDe(p)} | ${p.sucursal || 'Central'}`;

    const [r, u, m] = await Promise.all([
      cliente.from('enlaces').select('*').order('categoria').order('titulo'),
      cliente.from('perfiles').select('id,nombre,rol,puesto,sucursal').order('nombre'),
      cliente.from('modulo_roles').select('*')       // si aún no ejecutaste supabase_setup.sql, queda vacío
    ]);
    recursos = r.data || []; usuarios = u.data || []; permisosMod = m.data || [];
    await Promise.all([cargarTareas(), cargarAvisos()]);

    const esSuperior = PUEDE_ASIGNAR.includes(p.rol);
    $('sub-dadas').classList.toggle('hidden', !esSuperior);
    $('form-aviso').classList.toggle('hidden', !PUEDE_AVISAR.includes(p.rol));
    $('tab-flota').classList.toggle('hidden', !(puede('flota') || puede('contactos')));

    $('splash').classList.add('hidden'); $('app').classList.remove('hidden');
    irTab('biblioteca');
    precargarMejora();                                // para mostrar el contador de pendientes
  } catch (e) {
    console.error(e);
    mostrarLogin('No se pudo conectar. Revisa tu internet e intenta de nuevo.');
  }
}
cliente.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && yo) mostrarLogin('Tu sesión expiró. Ingresa nuevamente.'); });

// --- NAVEGACIÓN ---
document.querySelectorAll('.tab').forEach(b => b.onclick = () => irTab(b.dataset.tab));
function irTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.remove('tab-on', 'tab-off');
    b.classList.add(b.dataset.tab === t ? 'tab-on' : 'tab-off');
  });
  ['biblioteca', 'avisos', 'tareas', 'mejora', 'flota'].forEach(s => $('v-' + s).classList.toggle('hidden', s !== t));
  window.scrollTo(0, 0);
  if (t === 'biblioteca') { $('buscar').value = ''; pintarBiblioteca(); }
  else if (t === 'avisos') pintarAvisos();
  else if (t === 'tareas') subTareas(sub);
  else if (t === 'mejora') abrirMejora();
  else if (t === 'flota') abrirFlota();
}

// --- BIBLIOTECA (Formularios, Procesos, Data) ---
// Cada enlace puede limitarse a ciertos roles (columna roles_permitidos). La base ya filtra con RLS;
// aquí se repite el filtro por si la política aún no está aplicada.
const rolesDe = r => Array.isArray(r.roles_permitidos) ? r.roles_permitidos : [];
const veRecurso = r => yo.rol === 'admin' || (rolesDe(r).length ? rolesDe(r).includes(yo.rol) : (r.tipo || 'formulario') !== 'respuesta');
const quienVe = r => rolesDe(r).length ? rolesDe(r).join(', ') : ((r.tipo || 'formulario') === 'respuesta' ? 'Solo admin' : 'Todos');
const TIPOS_ENLACE = [['formulario', 'Formulario'], ['manual', 'Proceso'], ['herramienta', 'Herramienta de mejora'], ['respuesta', 'Data (respuestas)']];

function pintarBiblioteca() {
  const items = [['formulario', 'Formularios'], ['manual', 'Procesos'], ['herramienta', 'Herramientas']];
  if (yo.rol === 'admin' || recursos.some(r => r.tipo === 'respuesta' && veRecurso(r))) items.push(['respuesta', 'Data']);
  if (!items.some(i => i[0] === bib)) bib = 'formulario';
  $('bib-seg').innerHTML = seg(items, bib, 'irBib') +
    (yo.rol === 'admin' ? `<button onclick="formEnlace()" class="btn btn-acc ml-auto flex-none whitespace-nowrap !rounded-full !py-1.5">+ Enlace</button>` : '');
  pintarRecursos();
}
function irBib(k) { bib = k; $('buscar').value = ''; pintarBiblioteca(); }
function pintarRecursos() {
  const q = $('buscar').value.toLowerCase(), admin = yo.rol === 'admin';
  const items = recursos.filter(r => veRecurso(r) && (r.tipo || 'formulario') === bib && (r.titulo + ' ' + (r.descripcion || '')).toLowerCase().includes(q));

  if (!items.length) {
    const etiquetas = { formulario: 'formularios', manual: 'procesos', respuesta: 'bases de datos', herramienta: 'herramientas de mejora' };
    $('lista-recursos').innerHTML = `<p class="vacio">No hay ${etiquetas[bib] || 'elementos'} disponibles.</p>`;
    return;
  }
  // Las herramientas se agrupan por fase de la mejora (en orden); el resto, por categoría
  const grupos = {};
  items.forEach(r => {
    let cat;
    if (bib === 'herramienta') {
      const i = FASES.findIndex(f => f[0] === r.fase);
      cat = i < 0 ? 'Para cualquier fase' : `${i + 1}. ${FASES[i][2]} · ${GUIA[r.fase].pregunta}`;
    } else {
      cat = (r.categoria || 'General').trim() || 'General';
      cat = cat.charAt(0).toUpperCase() + cat.slice(1);
    }
    (grupos[cat] ||= []).push(r);
  });
  const textoAccion = bib === 'manual' ? 'Abrir documento' : bib === 'respuesta' ? 'Ver respuestas' : bib === 'herramienta' ? 'Abrir herramienta' : 'Llenar formulario';
  const orden = bib === 'herramienta' ? Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b, 'es')) : Object.entries(grupos);
  $('lista-recursos').innerHTML = orden.map(([cat, l]) => `
    <div class="mb-6">
      <h3 class="font-bold text-slate-500 text-xs uppercase tracking-wider mb-3 ml-1">${esc(cat)}</h3>
      ${l.map(r => `
        <div class="card mb-3 hover:shadow-md transition">
          <a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener" class="block p-4">
            <div class="flex justify-between items-start gap-2">
              <span class="font-bold text-slate-800 text-[15px]">${esc(r.titulo)}</span>
              ${r.version ? `<span class="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">v${esc(r.version)}</span>` : ''}
            </div>
            ${r.descripcion ? `<p class="text-sm text-slate-500 mt-1.5 leading-snug">${esc(r.descripcion)}</p>` : ''}
            <span class="inline-block mt-3 text-xs font-bold ${bib === 'respuesta' ? 'text-emerald-700' : 'text-amber-700'}">${textoAccion}</span>
          </a>
          ${admin ? `<div class="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100">
            <span class="meta flex-1 truncate">Lo ve: <b class="text-slate-700">${esc(quienVe(r))}</b></span>
            <button onclick="formEnlace(${r.id})" class="btn btn-sec btn-sm" aria-label="Editar">${ico('pencil', 'w-4 h-4')}</button>
            <button onclick="borrarEnlace(${r.id})" class="btn btn-del btn-sm" aria-label="Eliminar">${ico('trash', 'w-4 h-4')}</button></div>` : ''}
        </div>`).join('')}
    </div>`).join('');
}

async function cargarRecursos() {
  const r = await db(cliente.from('enlaces').select('*').order('categoria').order('titulo'));
  if (r) recursos = Array.isArray(r) ? r : [];
}
function formEnlace(id) {
  const r = id ? recursos.find(x => x.id === id) : {};
  const marcados = rolesDe(r);
  const roles = [...new Set(['jefatura', 'administrativo', 'asistente', ...usuarios.map(u => u.rol), ...marcados])].filter(x => x && x !== 'admin').sort();
  const cats = [...new Set(recursos.map(x => x.categoria).filter(Boolean))];
  abrirSheet(id ? 'Editar enlace' : 'Nuevo enlace', `
    ${campo('e-titulo', 'Título', { val: r.titulo })}
    ${campo('e-url', 'Enlace (URL)', { type: 'url', val: r.url, ph: 'https://forms.gle/…' })}
    ${fila(lista('e-tipo', 'Dónde aparece', TIPOS_ENLACE, r.tipo || bib), campo('e-ver', 'Versión', { val: r.version, ph: '1.0' }))}
    ${lista('e-fase', 'Fase de la mejora (solo para Herramientas)', [['', 'Para cualquier fase'], ...FASES.map(f => [f[0], `${f[2]} · ${GUIA[f[0]].pregunta}`])], r.fase || '')}
    ${campo('e-cat', 'Categoría', { val: r.categoria, ph: 'Almacén, Despacho…', extra: 'list="e-cats"' })}
    <datalist id="e-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    ${area('e-desc', 'Descripción (opcional)', r.descripcion, 2)}
    <div class="lbl">¿Quién lo puede ver?</div>
    <div class="flex flex-wrap gap-2 mb-2">${roles.map(x => `<label class="filtro filtro-off cursor-pointer"><input type="checkbox" class="chk-r accent-[#0B1320]" value="${esc(x)}" ${marcados.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('')}</div>
    <p class="meta mb-4">Sin marcar ninguno: Formularios, Procesos y Herramientas los ven todos; Data solo tú. Tú (admin) siempre ves todo.</p>
    <button onclick="lock(this,()=>guardarEnlace(${id || 0}))" class="btn btn-pri w-full !py-3">Guardar</button>`);
}
async function guardarEnlace(id) {
  if (!val('e-titulo')) return toast('Escribe un título.', true);
  if (!/^https?:\/\//i.test(val('e-url'))) return toast('El enlace debe empezar con https://', true);
  const roles = [...document.querySelectorAll('.chk-r:checked')].map(c => c.value);
  const f = { titulo: val('e-titulo'), url: val('e-url'), tipo: val('e-tipo'), fase: val('e-tipo') === 'herramienta' ? nul('e-fase') : null, version: nul('e-ver'), categoria: nul('e-cat'), descripcion: nul('e-desc'), roles_permitidos: roles.length ? roles : null };
  if (!await db(id ? cliente.from('enlaces').update(f).eq('id', id) : cliente.from('enlaces').insert(f))) return;
  cerrarSheet(); toast('Enlace guardado');
  await cargarRecursos(); bib = f.tipo; pintarBiblioteca();
}
async function borrarEnlace(id) {
  if (!confirm('¿Eliminar este enlace de la biblioteca?')) return;
  if (!await db(cliente.from('enlaces').delete().eq('id', id))) return;
  await cargarRecursos(); pintarBiblioteca();
}

// --- AVISOS ---
async function cargarAvisos() {
  const { data } = await cliente.from('avisos').select('*, autor:perfiles(nombre, sucursal)').order('fecha_creacion', { ascending: false });
  avisos = data || [];
}
function pintarAvisos() {
  if (!avisos.length) { $('lista-avisos').innerHTML = '<p class="vacio">Sin comunicados recientes.</p>'; return; }
  const puedeBorrar = PUEDE_AVISAR.includes(yo.rol);
  $('lista-avisos').innerHTML = avisos.map(a => {
    const fecha = new Date(a.fecha_creacion).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const imgHtml = a.imagen_url ? `<img src="${esc(safeUrl(a.imagen_url))}" alt="" class="mt-3 rounded-lg max-h-64 object-cover w-full border border-slate-200">` : '';
    const delBtn = puedeBorrar ? `<button onclick="borrarAviso(${a.id})" class="inline-flex items-center gap-1.5 text-red-600 text-xs font-bold mt-3 hover:underline">${ico('trash')} Eliminar aviso</button>` : '';
    return `
      <div class="card p-4 mb-4">
        <div class="flex justify-between items-start mb-2">
          <div>
            <span class="font-bold text-blue-900 text-sm">${esc(a.autor?.nombre || 'Administración')}</span>
            <span class="text-[10px] uppercase font-bold text-slate-500 ml-1 bg-slate-100 px-1.5 py-0.5 rounded">${esc(a.autor?.sucursal || 'Central')}</span>
          </div>
          <span class="text-[10px] font-semibold text-slate-500 whitespace-nowrap ml-2">${fecha}</span>
        </div>
        <p class="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">${esc(a.mensaje)}</p>
        ${imgHtml}${delBtn}
      </div>`;
  }).join('');
}
async function crearAviso() {
  const msj = $('a-mensaje').value.trim(), img = $('a-img').value.trim();
  if (!msj && !img) return;
  if (!await db(cliente.from('avisos').insert({ mensaje: msj, imagen_url: img || null }))) return;
  $('a-mensaje').value = ''; $('a-img').value = '';
  toast('Aviso publicado');
  await cargarAvisos(); pintarAvisos();
}
async function borrarAviso(id) {
  if (!confirm('¿Eliminar este aviso definitivamente?')) return;
  await db(cliente.from('avisos').delete().eq('id', id));
  await cargarAvisos(); pintarAvisos();
}

// --- TAREAS ---
async function cargarTareas() {
  const { data } = await cliente.from('tareas').select('*, creador:perfiles!creado_por(nombre), tarea_asignados(usuario_id, estado, perfil:perfiles(nombre)), tarea_comentarios(id, tipo, texto, created_at, autor:perfiles!autor_id(nombre)), subtareas(id, titulo, fecha_limite, hora_limite, asignado_a, estado, created_by, created_at, asignado:perfiles!asignado_a(nombre))').order('created_at', { ascending: false });
  tareas = data || [];
  const pend = tareas.filter(t => t.tarea_asignados.some(a => a.usuario_id === yo.id && a.estado !== 'hecha')).length;
  $('badge').textContent = pend; $('badge').classList.toggle('hidden', !pend);
}
function subTareas(s) {
  sub = s;
  document.querySelectorAll('.sub').forEach(b => b.className = 'sub seg ' + (b.id === 'sub-' + s ? 'seg-on' : 'seg-off'));
  pintarTareas();
}
function pintarTareas() {
  const l = sub === 'mias'
    ? tareas.filter(t => t.tarea_asignados.some(a => a.usuario_id === yo.id))
    : tareas.filter(t => t.creado_por === yo.id && t.tarea_asignados.some(a => a.usuario_id !== yo.id));
  if (!l.length) { $('lista-tareas').innerHTML = '<p class="vacio">No hay tareas aquí.</p>'; return; }
  $('lista-tareas').innerHTML = l.map(t => {
    const mia = t.tarea_asignados.find(a => a.usuario_id === yo.id);
    const vencida = estaVencido(t.fecha_limite, t.hora_limite, t.tarea_asignados.every(a => a.estado === 'hecha'));
    return `<div class="card p-4 mb-3">
      <div class="flex items-start justify-between gap-2"><div class="font-bold text-slate-800">${esc(t.titulo)}</div>
        ${puedeEditarTarea(t) ? `<button onclick="formEditarTarea(${t.id})" class="text-slate-400 hover:text-slate-700 flex-none" aria-label="Editar tarea">${ico('pencil', 'w-4 h-4')}</button>` : ''}</div>
      ${t.descripcion ? `<p class="text-sm text-slate-600 mt-1 leading-snug">${esc(t.descripcion)}</p>` : ''}
      <div class="meta mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 ${vencida ? '!text-red-600' : ''}">
        <span class="chip ${PRIO[t.prioridad] || 'b-gris'}">${esc((t.prioridad || '').toUpperCase())}</span>
        ${t.fecha_limite ? `<span>${ico(vencida ? 'warn' : 'cal')} ${vencida ? 'Vencida: ' : 'Para el '}${fmtLimite(t.fecha_limite, t.hora_limite)}</span>` : ''}
        <span>${ico('user')} De ${esc(t.creador?.nombre || '—')}</span>
      </div>
      ${sub === 'mias' && mia ? `
        <select onchange="cambiarEstado(${t.id}, this.value)" class="mt-3 text-xs font-bold p-2 rounded-lg border outline-none est-${mia.estado}">
          ${['pendiente', 'en_curso', 'hecha'].map(e => `<option value="${e}" ${e === mia.estado ? 'selected' : ''}>${e.replace('_', ' ').toUpperCase()}</option>`).join('')}
        </select>` : `
        <div class="flex flex-wrap gap-1.5 mt-3">${t.tarea_asignados.map(a => `<span class="text-[10px] font-bold px-2 py-1 rounded-full est-${a.estado}">${esc(a.perfil?.nombre || '—')}: ${a.estado.replace('_', ' ').toUpperCase()}</span>`).join('')}</div>
        <button onclick="borrarTarea(${t.id})" class="text-xs font-bold text-red-600 mt-3 hover:underline">Eliminar tarea</button>`}
      ${htmlSubtareas(t)}
      <button onclick="abrirHiloTarea(${t.id})" class="btn btn-sec btn-sm mt-3">${ico('chat', 'w-4 h-4')} Comentarios${(t.tarea_comentarios || []).length ? ` (${t.tarea_comentarios.length})` : ''}</button>
    </div>`;
  }).join('');
}

// Editan una tarea quien la creó y admin/jefatura que participan de ella
const puedeEditarTarea = t => t.creado_por === yo.id || ['admin', 'jefatura'].includes(yo.rol);
function formEditarTarea(id) {
  const t = tareas.find(x => x.id === id);
  abrirSheet('Editar tarea', `
    ${campo('et-titulo', 'Tarea', { val: t.titulo })}
    ${area('et-desc', 'Detalle (opcional)', t.descripcion, 2)}
    ${lista('et-prio', 'Prioridad', [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']], t.prioridad || 'media')}
    ${fila(campo('et-fecha', 'Fecha límite', { type: 'date', val: t.fecha_limite }), campo('et-hora', 'Hora límite (opcional)', { type: 'time', val: (t.hora_limite || '').slice(0, 5) }))}
    ${PUEDE_ASIGNAR.includes(yo.rol) ? `<div class="lbl">Asignada a</div>${checksUsuarios('chk-ea', usuarios, new Set(t.tarea_asignados.map(a => a.usuario_id)))}` : ''}
    <button onclick="lock(this,()=>guardarEdicionTarea(${id}))" class="btn btn-pri w-full !py-3">Guardar cambios</button>`);
}
async function guardarEdicionTarea(id) {
  const t = tareas.find(x => x.id === id), titulo = val('et-titulo'), fecha = nul('et-fecha'), hora = nul('et-hora');
  if (!titulo) return toast('Escribe un título para la tarea.', true);
  if (hora && !fecha) return toast('Para poner una hora, elige también la fecha.', true);
  const asigna = PUEDE_ASIGNAR.includes(yo.rol), ids = asigna ? [...document.querySelectorAll('.chk-ea:checked')].map(c => c.value) : [];
  if (asigna && !ids.length) return toast('Elige al menos una persona.', true);
  if (!await db(cliente.from('tareas').update({ titulo, descripcion: nul('et-desc'), prioridad: val('et-prio'), fecha_limite: fecha, hora_limite: hora }).eq('id', id))) return;
  if (asigna && !await sincronizar('tarea_asignados', 'tarea_id', id, t.tarea_asignados.map(a => a.usuario_id), ids)) return;
  cerrarSheet(); toast('Tarea actualizada'); await cargarTareas(); pintarTareas();
}

// --- SUBTAREAS (cada una con su fecha, hora y responsable) ---
function htmlSubtareas(t) {
  const ss = [...(t.subtareas || [])].sort((a, b) => (a.estado === 'hecha') - (b.estado === 'hecha')
    || (venceTs(a.fecha_limite, a.hora_limite) || Infinity) - (venceTs(b.fecha_limite, b.hora_limite) || Infinity) || a.id - b.id);
  const hechas = ss.filter(s => s.estado === 'hecha').length, creador = t.creado_por === yo.id;
  return `<div class="mt-3 pt-3 border-t border-slate-100">
    <div class="flex items-center justify-between"><span class="seccion">Subtareas${ss.length ? ` · ${hechas} de ${ss.length}` : ''}</span>
      <button onclick="formSubtarea(${t.id})" class="text-xs font-bold text-amber-700 hover:underline">+ Subtarea</button></div>
    ${ss.length ? `<div class="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2"><div class="h-full bg-emerald-500" style="width:${Math.round(hechas * 100 / ss.length)}%"></div></div>` : ''}
    ${ss.map(s => {
      const ok = s.estado === 'hecha', venc = estaVencido(s.fecha_limite, s.hora_limite, ok);
      const puedeMover = !s.asignado_a || s.asignado_a === yo.id || creador, puedeEditar = creador || s.created_by === yo.id;
      return `<div class="flex items-start gap-2.5 py-2 border-b border-slate-50 last:border-0">
        <input type="checkbox" class="mt-0.5 w-4 h-4 accent-[#0B1320] flex-none" ${ok ? 'checked' : ''} ${puedeMover ? '' : 'disabled'} onchange="cambiarEstadoSub(${s.id}, this.checked)" aria-label="Marcar subtarea como hecha">
        <div class="flex-1 min-w-0"><div class="text-sm ${ok ? 'line-through text-slate-400' : 'text-slate-700'}">${esc(s.titulo)}</div>
          <div class="text-[11px] flex flex-wrap gap-x-3 ${venc ? 'text-red-600 font-semibold' : 'text-slate-500'}">
            ${s.fecha_limite ? `<span>${ico(venc ? 'warn' : 'cal', 'w-3 h-3')} ${venc ? 'Vencida: ' : ''}${fmtLimite(s.fecha_limite, s.hora_limite)}</span>` : ''}
            ${s.asignado?.nombre ? `<span>${ico('user', 'w-3 h-3')} ${esc(s.asignado.nombre)}</span>` : ''}</div></div>
        ${puedeEditar ? `<button onclick="formSubtarea(${t.id},${s.id})" class="text-slate-400 hover:text-slate-700 flex-none" aria-label="Editar subtarea">${ico('pencil', 'w-4 h-4')}</button>` : ''}</div>`;
    }).join('')}</div>`;
}
function formSubtarea(tid, id) {
  const t = tareas.find(x => x.id === tid), s = id ? t.subtareas.find(x => x.id === id) : {};
  const ids = new Set([t.creado_por, ...t.tarea_asignados.map(a => a.usuario_id)]);
  const personas = usuarios.filter(u => ids.has(u.id));
  abrirSheet(id ? 'Editar subtarea' : 'Nueva subtarea', `
    <p class="text-sm font-semibold text-slate-700 mb-3">${esc(t.titulo)}${t.fecha_limite ? ` <span class="font-normal text-slate-500">· vence ${fmtLimite(t.fecha_limite, t.hora_limite)}</span>` : ''}</p>
    ${campo('su-titulo', '¿Qué hay que hacer?', { val: s.titulo })}
    ${lista('su-asig', 'Responsable', [['', '— Sin asignar —'], ...personas.map(u => [u.id, u.id === yo.id ? 'Yo' : u.nombre])], s.asignado_a || '')}
    ${fila(campo('su-fecha', 'Fecha límite', { type: 'date', val: s.fecha_limite }), campo('su-hora', 'Hora límite (opcional)', { type: 'time', val: (s.hora_limite || '').slice(0, 5) }))}
    <button onclick="lock(this,()=>guardarSubtarea(${tid},${id || 0}))" class="btn btn-pri w-full !py-3">Guardar</button>
    ${id ? `<button onclick="borrarSubtarea(${id})" class="btn btn-del w-full mt-2">Eliminar subtarea</button>` : ''}`);
}
async function guardarSubtarea(tid, id) {
  if (!val('su-titulo')) return toast('Escribe qué hay que hacer.', true);
  if (nul('su-hora') && !nul('su-fecha')) return toast('Para poner una hora, elige también la fecha.', true);
  const f = { titulo: val('su-titulo'), asignado_a: nul('su-asig'), fecha_limite: nul('su-fecha'), hora_limite: nul('su-hora') };
  const t = tareas.find(x => x.id === tid);
  if (t.fecha_limite && f.fecha_limite && venceTs(f.fecha_limite, f.hora_limite) > venceTs(t.fecha_limite, t.hora_limite)
      && !confirm('Esta subtarea vence después de la tarea principal. ¿Guardar de todos modos?')) return;
  if (!await db(id ? cliente.from('subtareas').update(f).eq('id', id) : cliente.from('subtareas').insert({ ...f, tarea_id: tid }))) return;
  cerrarSheet(); toast('Subtarea guardada'); await cargarTareas(); pintarTareas();
}
async function cambiarEstadoSub(id, hecha) {
  await db(cliente.rpc('cambiar_estado_subtarea', { p_id: id, p_estado: hecha ? 'hecha' : 'pendiente' }));
  await cargarTareas(); pintarTareas();
  const t = tareas.find(x => (x.subtareas || []).some(s => s.id === id));
  if (hecha && t && t.subtareas.every(s => s.estado === 'hecha')) toast('Subtareas listas: marca la tarea como hecha');
}
async function borrarSubtarea(id) {
  if (!confirm('¿Eliminar esta subtarea?')) return;
  if (!await db(cliente.from('subtareas').delete().eq('id', id))) return;
  cerrarSheet(); await cargarTareas(); pintarTareas();
}
function abrirHiloTarea(id) {
  const t = tareas.find(x => x.id === id); if (!t) return;
  abrirSheet('Comentarios · ' + t.titulo, `
    <div class="max-h-[45vh] overflow-y-auto mb-3">${htmlHilo([...(t.tarea_comentarios || [])].sort(porFecha))}</div>
    ${lista('tc-tipo', 'Tipo', [['comentario', 'Comentario'], ['evidencia', 'Evidencia (dónde quedó el trabajo)']])}
    ${area('tc-texto', 'Escribe aquí', '', 3)}
    <button onclick="lock(this,()=>enviarComentarioTarea(${id}))" class="btn btn-pri w-full !py-3">Enviar</button>`);
}
async function enviarComentarioTarea(id) {
  const texto = val('tc-texto');
  if (!texto) return toast('Escribe el comentario.', true);
  if (!await db(cliente.from('tarea_comentarios').insert({ tarea_id: id, tipo: val('tc-tipo'), texto }))) return;
  await cargarTareas(); pintarTareas(); abrirHiloTarea(id);
}
async function cambiarEstado(id, estado) {
  await db(cliente.from('tarea_asignados').update({ estado, actualizado: new Date().toISOString() }).eq('tarea_id', id).eq('usuario_id', yo.id));
  await cargarTareas(); pintarTareas();
  if (estado === 'hecha') toast('Deja en Comentarios dónde quedó la evidencia');
}
async function borrarTarea(id) {
  if (!confirm('¿Eliminar esta tarea de todos los involucrados?')) return;
  await db(cliente.from('tareas').delete().eq('id', id));
  await cargarTareas(); pintarTareas();
}
function toggleForm() {
  const f = $('form-tarea'); f.classList.toggle('hidden');
  if (f.classList.contains('hidden')) return;
  const sup = PUEDE_ASIGNAR.includes(yo.rol);
  $('bloque-asignar').classList.toggle('hidden', !sup); $('t-hint').classList.toggle('hidden', sup);
  const roles = [...new Set(usuarios.map(u => u.rol))];
  $('chips-rol').innerHTML = roles.map(r => `<button type="button" onclick="marcarRol('${esc(r)}')" class="text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-amber-100 hover:border-amber-300 hover:text-amber-800 transition uppercase tracking-wide">Rol: ${esc(r)}</button>`).join('');
  $('lista-usuarios').innerHTML = usuarios.filter(u => u.id !== yo.id).map(u => `<label class="flex items-center gap-3 p-2.5 text-sm hover:bg-white cursor-pointer"><input type="checkbox" class="chk-u w-4 h-4 accent-[#0B1320]" value="${u.id}" data-rol="${esc(u.rol)}"> <div><span class="font-medium">${esc(u.nombre)}</span> <span class="text-xs font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded ml-1">${esc(puestoDe(u))}</span></div></label>`).join('');
}
function marcarRol(rol) { document.querySelectorAll('.chk-u').forEach(c => { if (c.dataset.rol === rol) c.checked = true; }); }
async function crearTarea() {
  const titulo = $('t-titulo').value.trim();
  if (!titulo) return toast('Escribe un título para la tarea.', true);
  const fecha = $('t-fecha').value || null, hora = $('t-hora').value || null;
  if (hora && !fecha) return toast('Para poner una hora, elige también la fecha.', true);
  const t = await db(cliente.from('tareas').insert({ titulo, descripcion: $('t-desc').value.trim() || null, prioridad: $('t-prio').value, fecha_limite: fecha, hora_limite: hora }).select().single());
  if (!t) return;
  const ids = PUEDE_ASIGNAR.includes(yo.rol) ? [...document.querySelectorAll('.chk-u:checked')].map(c => c.value) : [];
  const destino = (ids.length ? ids : [yo.id]).map(u => ({ tarea_id: t.id, usuario_id: u }));
  if (!await db(cliente.from('tarea_asignados').insert(destino))) {
    await cliente.from('tareas').delete().eq('id', t.id);        // no dejar tareas huérfanas sin responsable
    return;
  }
  ['t-titulo', 't-desc', 't-fecha', 't-hora'].forEach(i => $(i).value = ''); $('form-tarea').classList.add('hidden');
  toast('Tarea creada');
  await cargarTareas(); subTareas(ids.length ? 'dadas' : 'mias');
}

// --- ARRANQUE ---
// La pantalla de carga (splash) cubre todo hasta saber si hay sesión: así no se ve el login de paso.
async function arrancar() {
  try {
    const { data: { session } } = await cliente.auth.getSession();
    if (session) await iniciarApp(); else mostrarLogin();
  } catch (e) { console.error(e); mostrarLogin(); }
}
