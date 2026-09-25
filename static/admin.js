const API = '';
const TOKEN_KEY = 'catalogo_admin_token';

const viewLogin = document.getElementById('view-login');
const viewEditor = document.getElementById('view-editor');
const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');

// --- Helpers ---

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '⚠️', warning: '🟡', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
}

async function fetchWithToken(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
}

// --- Vista ---

function showLogin() {
    viewLogin.style.display = '';
    viewEditor.style.display = 'none';
}

function showEditor() {
    viewLogin.style.display = 'none';
    viewEditor.style.display = 'block';
}

// --- Pestañas ---

let tutoresMap = null;

async function asegurarMapaTutores() {
    if (tutoresMap) return tutoresMap;
    const res = await fetchWithToken(`${API}/admin/api/tutores`);
    if (!res.ok) return (tutoresMap = {});
    let data;
    try {
        data = await res.json();
    } catch {
        return (tutoresMap = {});
    }
    const tutores = Array.isArray(data.tutores) ? data.tutores : [];
    const map = {};
    for (const t of tutores) {
        const bloques = {};
        for (const b of t.bloques || []) {
            bloques[String(b.id)] = b.nombre || '';
        }
        map[String(t.id)] = { tema: t.tema || t.id, bloques };
    }
    return (tutoresMap = map);
}

function nombreTutor(id) {
    if (tutoresMap && tutoresMap[String(id)]) return tutoresMap[String(id)].tema;
    return String(id);
}

function nombreBloque(tutorId, bloqueId) {
    const t = tutoresMap && tutoresMap[String(tutorId)];
    if (t && t.bloques[String(bloqueId)] != null) return t.bloques[String(bloqueId)];
    return String(bloqueId);
}

document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.admin-tab-btn').forEach(b => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-selected', String(b === btn));
        });
        document.querySelectorAll('.tab-panel').forEach(p => {
            p.classList.toggle('active', p.id === `tab-${tab}`);
        });
        if (tab === 'stats') cargarEstadisticas();
        if (tab === 'graficas') cargarGraficas();
        if (tab === 'sugerencias') cargarSugerencias();
    });
});

// --- Autenticación ---

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
        const res = await fetch(`${API}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: passwordInput.value }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo iniciar sesión');
        }
        const data = await res.json();
        setToken(data.token);
        passwordInput.value = '';
        await abrirEditor();
    } catch (err) {
        loginError.textContent = err.message;
        loginError.style.display = '';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
    }
});

btnLogout.addEventListener('click', () => {
    setToken('');
    location.reload();
});

// --- Arranque del panel ---

async function abrirEditor() {
    const res = await fetchWithToken(`${API}/admin/api/tutores`);
    if (res.status === 401 || res.status === 503 || !res.ok) {
        setToken('');
        showLogin();
        return;
    }
    showEditor();
    tutoresMap = null;
    cargarEstadisticas();
}

// --- Estadísticas ---

let statsCache = null;

async function cargarEstadisticas() {
    const summary = document.getElementById('stats-summary');
    const list = document.getElementById('stats-list');
    list.innerHTML = '<p class="stat-none">Cargando…</p>';
    try {
        [statsCache, tutoresMap] = await Promise.all([
            fetchWithToken(`${API}/admin/api/stats`).then(async r => {
                if (!r.ok) throw new Error('error');
                return r.json();
            }),
            asegurarMapaTutores(),
        ]);
    } catch (err) {
        list.innerHTML = '<p class="stat-none">No se pudieron cargar las estadísticas.</p>';
        return;
    }

    const tStats = statsCache.tutores || {};
    const ids = Object.keys(tStats);
    let totalVisitas = 0;
    let totalBloques = 0;
    for (const id of ids) {
        totalVisitas += tStats[id].visitas || 0;
        for (const n of Object.values(tStats[id].bloques || {})) totalBloques += n;
    }

    summary.innerHTML = `
        <div class="stat-chip"><div class="stat-num">${ids.length}</div><div class="stat-label">Tutores con actividad</div></div>
        <div class="stat-chip"><div class="stat-num">${totalVisitas}</div><div class="stat-label">Visitas a tutores</div></div>
        <div class="stat-chip"><div class="stat-num">${totalBloques}</div><div class="stat-label">Uso de bloques</div></div>
    `;

    if (!ids.length) {
        list.innerHTML = '<p class="stat-none">Todavía no hay visitas registradas.</p>';
        return;
    }

    ids.sort((a, b) => (tStats[b].visitas || 0) - (tStats[a].visitas || 0));

    list.innerHTML = ids.map(id => {
        const s = tStats[id];
        const bloques = Object.entries(s.bloques || {});
        bloques.sort((a, b) => b[1] - a[1]);
        const rows = bloques.length
            ? bloques.map(([bid, n]) => `
                <div class="bloque-stat-row">
                    <span class="bloque-stat-id">${escapeHtml(bid)}</span>
                    <span class="bloque-stat-name">${escapeHtml(nombreBloque(id, bid))}</span>
                    <span class="bloque-stat-count">${escapeHtml(String(n))}</span>
                </div>`).join('')
            : '<p class="stat-none">Sin uso de bloques.</p>';
        return `
            <div class="tutor-stats">
                <div class="tutor-stats-head">
                    <h3>${escapeHtml(nombreTutor(id))}</h3>
                    <span class="tutor-visits">${s.visitas || 0} visitas</span>
                    <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div class="tutor-stats-body">${rows}</div>
            </div>`;
    }).join('');

    list.querySelectorAll('.tutor-stats-head').forEach(head => {
        head.addEventListener('click', () => {
            const ts = head.closest('.tutor-stats');
            ts.classList.toggle('open');
        });
    });
}

document.getElementById('btn-reset-stats').addEventListener('click', async () => {
    if (!confirm('¿Reiniciar todos los contadores de visitas? Esta acción no se puede deshacer.')) return;
    const btn = document.getElementById('btn-reset-stats');
    btn.disabled = true;
    try {
        const res = await fetchWithToken(`${API}/admin/api/stats`, { method: 'DELETE' });
        if (!res.ok) throw new Error('error');
        if (statsCache) statsCache.tutores = {};
        cargarEstadisticas();
        if (document.getElementById('tab-graficas').classList.contains('active')) cargarGraficas();
        showToast('Contadores reiniciados.', 'success');
    } catch (err) {
        showToast('No se pudieron reiniciar los contadores.', 'error');
    } finally {
        btn.disabled = false;
    }
});

// --- Gráficas ---

let chartDias = 1;
let chartVista = 'total';
let chartInstance = null;
let chartCargada = false;

const VISTA_COLORS = {
    total: '#0ea5e9',
    tutor: '#4a8bd8',
    bloques_tutor: '#a78bfa',
    bloque: '#f59e0b',
};
const VISTA_REQUIERE_TUTOR = { tutor: true, bloques_tutor: true, bloque: true };
const BLOQUE_PALETTE = ['#4a8bd8', '#a78bfa', '#f59e0b', '#0ea5e9', '#34d399', '#f87171', '#f472b6', '#22d3ee'];

const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
        x: {
            ticks: { color: '#6b6b85', maxTicksLimit: 12, maxRotation: 60, minRotation: 0 },
            grid: { color: 'rgba(255,255,255,0.08)' },
        },
        y: {
            beginAtZero: true,
            ticks: { color: '#6b6b85', precision: 0 },
            grid: { color: 'rgba(255,255,255,0.08)' },
        },
    },
};

function formatearEtiqueta(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(iso || '');
    if (!m) return iso;
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dia = Number(m[3]);
    const mes = meses[Number(m[2]) - 1];
    return `${dia} ${mes} ${m[4]}:00`;
}

function tutoresOrdenados() {
    return Object.keys(tutoresMap || {}).sort((a, b) =>
        tutoresMap[a].tema.localeCompare(tutoresMap[b].tema));
}

async function llenarSelectTutores() {
    const select = document.getElementById('chart-tutor');
    const actual = select.value;
    await asegurarMapaTutores();
    select.innerHTML = '';
    for (const id of tutoresOrdenados()) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = tutoresMap[id].tema;
        select.appendChild(opt);
    }
    if (select.value !== actual && [...select.options].some(o => o.value === actual)) {
        select.value = actual;
    }
}

function llenarSelectBloques() {
    const select = document.getElementById('chart-bloque');
    const tutorId = document.getElementById('chart-tutor').value;
    select.innerHTML = '';
    const bloques = (tutoresMap[tutorId] && tutoresMap[tutorId].bloques) || {};
    Object.keys(bloques)
        .sort((a, b) => Number(a) - Number(b))
        .forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${id} – ${bloques[id] || ''}`.trim();
            select.appendChild(opt);
        });
}

function actualizarVisibilidadCampos() {
    const requiereTutor = !!VISTA_REQUIERE_TUTOR[chartVista];
    document.getElementById('field-chart-tutor').style.display = requiereTutor ? '' : 'none';
    document.getElementById('field-chart-bloque').style.display = chartVista === 'bloque' ? '' : 'none';
    if (requiereTutor && !document.getElementById('chart-tutor').value) {
        document.getElementById('chart-tutor').value = tutoresOrdenados()[0] || '';
    }
    if (chartVista === 'bloque') {
        llenarSelectBloquesIfNeeded();
    }
}

function llenarSelectBloquesIfNeeded() {
    if (!document.getElementById('chart-bloque').options.length) llenarSelectBloques();
}

async function cargarGraficas() {
    const canvas = document.getElementById('chart-visitas');
    const fallback = document.getElementById('chart-fallback');
    if (!chartCargada) {
        chartCargada = true;
        await llenarSelectTutores();
        actualizarVisibilidadCampos();
        llenarSelectBloques();
    }
    if (typeof Chart === 'undefined') {
        fallback.style.display = 'block';
        fallback.textContent = 'No se pudo cargar la librería de gráficas (revisa tu conexión).';
        return;
    }
    actualizarVisibilidadCampos();

    const tutorSel = document.getElementById('chart-tutor');
    const bloqueSel = document.getElementById('chart-bloque');
    const requiereTutor = !!VISTA_REQUIERE_TUTOR[chartVista];
    const tutorId = requiereTutor ? tutorSel.value : '';
    const bloqueId = chartVista === 'bloque' ? bloqueSel.value : '';
    if (requiereTutor && !tutorId) {
        fallback.style.display = 'block';
        fallback.textContent = 'No hay tutores registrados.';
        return;
    }
    if (chartVista === 'bloque' && !bloqueId) {
        fallback.style.display = 'block';
        fallback.textContent = 'Selecciona un bloque.';
        return;
    }

    const horas = chartDias * 24;
    fallback.style.display = 'none';
    let series;
    try {
        let url;
        if (chartVista === 'bloques_tutor') {
            url = `${API}/admin/api/stats/timeline/bloques?horas=${horas}&tutor_id=${encodeURIComponent(tutorId)}`;
        } else {
            const params = new URLSearchParams({ horas: String(horas) });
            if (tutorId) params.set('tutor_id', tutorId);
            if (bloqueId) params.set('bloque_id', bloqueId);
            url = `${API}/admin/api/stats/timeline?${params.toString()}`;
        }
        const res = await fetchWithToken(url);
        if (!res.ok) throw new Error('error');
        series = await res.json();
    } catch (err) {
        fallback.style.display = 'block';
        fallback.textContent = 'No se pudieron cargar los datos de la gráfica.';
        return;
    }

    const etiquetas = (series.etiquetas || []).map(formatearEtiqueta);
    if (chartInstance) chartInstance.destroy();

    const tema = tutorId && tutoresMap[tutorId] ? tutoresMap[tutorId].tema : '';

    if (chartVista === 'bloques_tutor') {
        const nombreBloques = (tutoresMap[tutorId] && tutoresMap[tutorId].bloques) || {};
        const ids = Object.keys(series.bloques || {}).sort((a, b) => Number(a) - Number(b));
        const total = ids.reduce((acc, id) => {
            const s = series.bloques[id] || [];
            return acc + (s.length ? s[s.length - 1] : 0);
        }, 0);
        if (!ids.length || !total) {
            fallback.style.display = 'block';
            fallback.textContent = 'No hay datos en este rango.';
            return;
        }
        const datasets = ids.map((bid, i) => ({
            label: nombreBloques[bid] ? `${bid} – ${nombreBloques[bid]}` : `Bloque ${bid}`,
            data: series.bloques[bid],
            borderColor: BLOQUE_PALETTE[i % BLOQUE_PALETTE.length],
            backgroundColor: 'rgba(255,255,255,0.02)',
            fill: false,
            tension: 0.3,
            pointRadius: 0.5,
            pointHitRadius: 6,
            borderWidth: 2,
        }));
        chartInstance = new Chart(canvas, {
            type: 'line',
            data: { labels: etiquetas, datasets },
            options: { ...baseChartOptions, plugins: {
                legend: { labels: { color: '#ececf4', boxWidth: 14, boxHeight: 3, font: { size: 12 } } },
                title: { display: true, text: `Uso de bloques de ${tema} (acumulado)`, color: '#ececf4', font: { size: 14, weight: '600' }, padding: { bottom: 8 } },
                tooltip: { backgroundColor: '#16161f', borderColor: 'rgba(255,255,255,0.16)', borderWidth: 1, titleColor: '#ececf4', bodyColor: '#9a9ab0' },
            } },
        });
        return;
    }

    const datos = chartVista === 'total' || chartVista === 'tutor'
        ? (series.visitas_tutor || [])
        : (series.visitas_bloque || []);
    const total = datos.length ? datos[datos.length - 1] : 0;
    if (!total) {
        fallback.style.display = 'block';
        fallback.textContent = 'No hay datos en este rango.';
        return;
    }

    let titulo = '';
    let leyenda = '';
    if (chartVista === 'total') { titulo = 'Visitas a todos los tutores (acumulado)'; leyenda = 'Visitas totales'; }
    else if (chartVista === 'tutor') { titulo = `Visitas a ${tema} (acumulado)`; leyenda = 'Visitas'; }
    else {
        const nombreBloque = tutoresMap[tutorId] && tutoresMap[tutorId].bloques[bloqueId];
        titulo = `Visitas al bloque ${bloqueId}${nombreBloque ? ` – ${nombreBloque}` : ''} (acumulado)`;
        leyenda = 'Visitas al bloque';
    }

    const color = VISTA_COLORS[chartVista] || '#4a8bd8';
    chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: etiquetas,
            datasets: [{
                label: leyenda,
                data: datos,
                borderColor: color,
                backgroundColor: 'rgba(255,255,255,0.04)',
                fill: true,
                tension: 0.3,
                pointRadius: 1,
                pointHitRadius: 8,
                borderWidth: 2,
            }],
        },
        options: { ...baseChartOptions, plugins: {
            legend: { labels: { color: '#ececf4', boxWidth: 14, boxHeight: 3, font: { size: 12 } } },
            title: { display: true, text: titulo, color: '#ececf4', font: { size: 14, weight: '600' }, padding: { bottom: 8 } },
            tooltip: { backgroundColor: '#16161f', borderColor: 'rgba(255,255,255,0.16)', borderWidth: 1, titleColor: '#ececf4', bodyColor: '#9a9ab0' },
        } },
    });
}

document.querySelectorAll('.range-btn[data-days]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn[data-days]').forEach(b => b.classList.toggle('active', b === btn));
        chartDias = Number(btn.dataset.days);
        cargarGraficas();
    });
});
document.querySelector('.range-btn[data-days="1"]').classList.add('active');

document.querySelectorAll('.chart-views .range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-views .range-btn').forEach(b => b.classList.toggle('active', b === btn));
        chartVista = btn.dataset.vista;
        cargarGraficas();
    });
});

document.getElementById('chart-tutor').addEventListener('change', () => {
    llenarSelectBloques();
    if (chartVista === 'bloque') {
        const sel = document.getElementById('chart-bloque');
        if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
    }
    cargarGraficas();
});

document.getElementById('chart-bloque').addEventListener('change', () => {
    cargarGraficas();
});

// --- Sugerencias ---

let autosLoaded = false;

function formatearFecha(iso) {
    try {
        return new Date(iso).toLocaleString();
    } catch (e) {
        return iso;
    }
}

async function cargarSugerencias() {
    const list = document.getElementById('suggestions-list');
    list.innerHTML = '<p class="stat-none">Cargando…</p>';
    try {
        tutoresMap = await asegurarMapaTutores();
        const res = await fetchWithToken(`${API}/admin/api/sugerencias`);
        if (!res.ok) throw new Error('error');
        const data = await res.json();
        renderSugerencias(data.sugerencias || []);
        autosLoaded = true;
    } catch (err) {
        list.innerHTML = '<p class="stat-none">No se pudieron cargar las sugerencias.</p>';
    }
}

function renderSugerencias(sugerencias) {
    const list = document.getElementById('suggestions-list');
    document.getElementById('sug-count').textContent = `${sugerencias.length} sugerencia${sugerencias.length === 1 ? '' : 's'}`;
    if (!sugerencias.length) {
        list.innerHTML = '<p class="stat-none">Todavía no hay sugerencias.</p>';
        return;
    }
    sugerencias.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    list.innerHTML = sugerencias.map(s => {
        const tutorTag = s.tutor_id ? `<span class="sug-tag">${escapeHtml(nombreTutor(s.tutor_id))}</span>` : '';
        const langTag = `<span class="sug-tag sug-lang">${escapeHtml((s.lang || 'es').toUpperCase())}</span>`;
        return `
            <div class="sug-item" data-id="${escapeHtml(s.id)}">
                <div class="sug-meta">
                    <span class="sug-date">${escapeHtml(formatearFecha(s.fecha))}</span>
                    <div style="display:flex;gap:0.4rem;align-items:center;">${tutorTag}${langTag}</div>
                </div>
                <div class="sug-content">${escapeHtml(s.contenido)}</div>
                <button type="button" class="btn-delete-sug" data-id="${escapeHtml(s.id)}">Eliminar</button>
            </div>`;
    }).join('');

    list.querySelectorAll('.btn-delete-sug').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('¿Eliminar esta sugerencia?')) return;
            try {
                const res = await fetchWithToken(`${API}/admin/api/sugerencias/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('error');
                const el = list.querySelector(`.sug-item[data-id="${CSS.escape(id)}"]`);
                if (el) el.remove();
                const remanentes = list.querySelectorAll('.sug-item').length;
                document.getElementById('sug-count').textContent = `${remanentes} sugerencia${remanentes === 1 ? '' : 's'}`;
                if (!remanentes) list.innerHTML = '<p class="stat-none">Todavía no hay sugerencias.</p>';
                showToast('Sugerencia eliminada.', 'success');
            } catch (err) {
                showToast('No se pudo eliminar la sugerencia.', 'error');
            }
        });
    });
}

// --- Inicio ---

abrirEditor();