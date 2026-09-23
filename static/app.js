const API = '';

const tutoresGrid = document.getElementById('tutores-grid');
const emptyState = document.getElementById('empty-state');
const viewMenu = document.getElementById('view-menu');
const viewDetail = document.getElementById('view-detail');
const btnBackHeader = document.getElementById('btn-back-header');

let tutores = [];
let currentTutor = null;

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

function switchView(view) {
    viewMenu.classList.toggle('active', view === 'menu');
    viewDetail.classList.toggle('active', view === 'detail');
    btnBackHeader.style.display = view === 'detail' ? 'inline-flex' : 'none';
}

function chatgptUrl(prompt) {
    const param = prompt.length > 10000 ? prompt.slice(0, 10000) : prompt;
    return `https://chatgpt.com/?prompt=${encodeURIComponent(param)}`;
}

function deepseekUrl(prompt) {
    const param = prompt.length > 10000 ? prompt.slice(0, 10000) : prompt;
    return `https://chat.deepseek.com/?prompt=${encodeURIComponent(param)}`;
}

function initDropdown(container) {
    if (!container) return;
    const toggle = container.querySelector('.dropdown-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        const open = container.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', e => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            container.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
        }
    });
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch (e2) {
            return false;
        }
    }
}

// --- API ---

async function loadTutores() {
    try {
        const res = await fetch(`${API}/api/tutores`);
        if (!res.ok) throw new Error('error');
        const data = await res.json();
        tutores = data.tutores || [];
        renderMenu();
    } catch (err) {
        emptyState.style.display = 'block';
        emptyState.innerHTML = '<h2>Error de conexión</h2><p>No se pudo cargar el catálogo.</p>';
    }
}

async function loadTutorDetail(id) {
    try {
        const res = await fetch(`${API}/api/tutores/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error('error');
        currentTutor = await res.json();
        renderDetail();
    } catch (err) {
        showToast('No se pudo cargar el tutor.', 'error');
        goToMenu();
    }
}

// --- Render: menú ---

function renderMenu() {
    tutoresGrid.innerHTML = '';
    if (!tutores.length) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    for (const t of tutores) {
        const card = document.createElement('a');
        card.className = 'tutor-card';
        card.href = '#';
        card.setAttribute('data-id', t.id);

        const bloquesLabel = t.num_bloques === 1 ? '1 bloque' : `${t.num_bloques} bloques`;

        card.innerHTML = `
            <div class="tutor-card-accent" style="background:${escapeHtml(t.color || '#2557a7')}"></div>
            <h2>${escapeHtml(t.tema)}</h2>
            <p>${escapeHtml(t.descripcion || '')}</p>
            <div class="tutor-card-meta">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                ${bloquesLabel}
            </div>
        `;
        card.addEventListener('click', (e) => {
            e.preventDefault();
            openTutor(t.id);
        });
        tutoresGrid.appendChild(card);
    }
}

// --- Render: detalle ---

function renderDetail() {
    const t = currentTutor;
    if (!t) return;
    const accent = t.color || '#2557a7';
    const bloques = Array.isArray(t.bloques) ? t.bloques : [];

    let bloquesHtml = bloques.map((b, i) => {
        const objetivos = Array.isArray(b.objetivos) ? b.objetivos : [];
        const objetivosHtml = objetivos.length
            ? `<ul>${objetivos.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>`
            : '';
        return `
            <div class="bloque ${i === 0 ? 'open' : ''}">
                <div class="bloque-header">
                    <div class="bloque-id">${escapeHtml(b.id != null ? b.id : i + 1)}</div>
                    <span class="bloque-title">${escapeHtml(b.nombre || '')}</span>
                    <svg class="bloque-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div class="bloque-body" ${i === 0 ? '' : 'style="display:none;"'}>
                    <div class="bloque-objetivos">
                        <h4>Objetivos de aprendizaje</h4>
                        ${objetivosHtml || '<p style="color:var(--text-dim);font-size:0.9rem;">Sin objetivos.</p>'}
                    </div>
                    <div class="prompt-box">${escapeHtml(b.prompt || '')}</div>
                    <div class="bloque-actions">
                        <div class="dropdown dropdown-primary" role="group" aria-label="Abrir prompt">
                            <a class="btn primary dropdown-trigger" href="#" data-action="chatgpt" data-idx="${i}" target="_blank" rel="noopener">Abrir en ChatGPT</a>
                            <button type="button" class="dropdown-toggle" data-idx="${i}" aria-label="Más opciones" aria-haspopup="true" aria-expanded="false">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <div class="dropdown-menu" role="menu">
                                <a class="dropdown-item" href="#" data-action="deepseek" data-idx="${i}" target="_blank" rel="noopener" role="menuitem">Abrir en DeepSeek</a>
                            </div>
                        </div>
                        <button class="btn secondary" data-action="copy" data-idx="${i}">Copiar prompt</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (!bloques.length) {
        bloquesHtml = '<div class="empty-state"><h2>Sin bloques</h2><p>Este tutor no tiene bloques definidos.</p></div>';
    }

    viewDetail.innerHTML = `
        <div class="detail-header">
            <div class="detail-accent" style="background:${escapeHtml(accent)}"></div>
            <h1 class="detail-title">${escapeHtml(t.tema)}</h1>
        </div>
        ${t.descripcion ? `<p class="detail-desc">${escapeHtml(t.descripcion)}</p>` : ''}
        <div class="bloques-list">
            ${bloquesHtml}
        </div>
    `;

    // Acordes de bloque
    viewDetail.querySelectorAll('.bloque-header').forEach(header => {
        header.addEventListener('click', () => {
            const bloque = header.closest('.bloque');
            const body = bloque.querySelector('.bloque-body');
            const isOpen = bloque.classList.contains('open');
            bloque.classList.toggle('open', !isOpen);
            body.style.display = isOpen ? 'none' : 'block';
        });
    });

    // Acciones
    viewDetail.querySelectorAll('.bloque-actions [data-action]').forEach(el => {
        el.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = Number(el.dataset.idx);
            const prompt = bloques[idx] ? (bloques[idx].prompt || '') : '';
            const action = el.dataset.action;
            const nombre = bloques[idx] ? (bloques[idx].nombre || '') : '';

            if (!prompt) {
                showToast('Este bloque no tiene prompt.', 'warning');
                return;
            }

            if (action === 'chatgpt') {
                window.open(chatgptUrl(prompt), '_blank');
            } else if (action === 'deepseek') {
                el.closest('.dropdown').classList.remove('open');
                window.open(deepseekUrl(prompt), '_blank');
            } else if (action === 'copy') {
                const ok = await copyText(prompt);
                showToast(ok ? `Prompt de "${nombre}" copiado.` : 'No se pudo copiar.', ok ? 'success' : 'error');
            }
        });
    });

    viewDetail.querySelectorAll('.bloque-actions .dropdown').forEach(dropdown => {
        initDropdown(dropdown);
    });

    switchView('detail');
    window.scrollTo(0, 0);
}

// --- Navegación ---

function openTutor(id) {
    loadTutorDetail(id);
}

function goToMenu() {
    currentTutor = null;
    switchView('menu');
    window.scrollTo(0, 0);
}

btnBackHeader.addEventListener('click', goToMenu);

window.addEventListener('popstate', () => {
    if (currentTutor) {
        goToMenu();
    }
});

// Inicio
loadTutores();
