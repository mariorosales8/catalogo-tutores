const API = '';
const LANG_KEY = 'catalogo_lang';

const tutoresGrid = document.getElementById('tutores-grid');
const emptyState = document.getElementById('empty-state');
const viewMenu = document.getElementById('view-menu');
const viewDetail = document.getElementById('view-detail');
const btnBackHeader = document.getElementById('btn-back-header');

const btnSuggest = document.getElementById('btn-suggest');
const suggestModal = document.getElementById('suggest-modal');
const suggestForm = document.getElementById('suggest-form');
const suggestText = document.getElementById('suggest-text');
const suggestTutor = document.getElementById('suggest-tutor');
const suggestCount = document.getElementById('suggest-count');
const btnSuggestSend = document.getElementById('btn-suggest-send');

let tutores = [];
let currentTutor = null;

// --- i18n ---

const I18N = {
    es: {
        'header.title': 'Catálogo de Tutores',
        'header.sub': 'Elige un tutor y comienza a aprender',
        'back': 'Volver al menú',
        'lang.es': 'ES',
        'lang.en': 'EN',
        'menu.title': 'Tutores disponibles',
        'menu.sub': 'Selecciona un tutor para ver sus bloques de aprendizaje y abrir su prompt.',
        'empty.title': 'Aún no hay tutores',
        'empty.sub': 'El catálogo está vacío por ahora.',
        'error.title': 'Error de conexión',
        'error.sub': 'No se pudo cargar el catálogo.',
        'blocks': 'bloques',
        'block': 'bloque',
        'objectives': 'Objetivos de aprendizaje',
        'no_objectives': 'Sin objetivos.',
        'no_blocks.title': 'Sin bloques',
        'no_blocks.sub': 'Este tutor no tiene bloques definidos.',
        'open_chatgpt': 'Abrir en ChatGPT',
        'open_deepseek': 'Abrir en DeepSeek',
        'copy_prompt': 'Copiar prompt',
        'no_prompt': 'Este bloque no tiene prompt.',
        'copied': 'Prompt de "{{nombre}}" copiado.',
        'copy_fail': 'No se pudo copiar.',
        'load_tutor_fail': 'No se pudo cargar el tutor.',
        'suggest.label': 'Enviar sugerencia',
        'suggest.title': 'Sugerencias',
        'suggest.sub': 'Ayúdanos a mejorar el catálogo: nuevos tutores, temas, correcciones o lo que creas que podemos mejorar.',
        'suggest.tutor_label': 'Tutor (opcional)',
        'suggest.text_label': 'Tu sugerencia',
        'suggest.no_tutor': 'Sin especificar',
        'suggest.placeholder': 'Escribe aquí tu sugerencia…',
        'suggest.submit': 'Enviar',
        'suggest.cancel': 'Cancelar',
        'suggest.empty': 'Escribe una sugerencia antes de enviar.',
        'suggest.sent': '¡Gracias! Tu sugerencia fue enviada.',
        'suggest.fail': 'No se pudo enviar la sugerencia.',
    },
    en: {
        'header.title': 'Tutor Catalog',
        'header.sub': 'Choose a tutor and start learning',
        'back': 'Back to menu',
        'lang.es': 'ES',
        'lang.en': 'EN',
        'menu.title': 'Available tutors',
        'menu.sub': 'Select a tutor to see their learning blocks and open the prompt.',
        'empty.title': 'No tutors yet',
        'empty.sub': 'The catalog is currently empty.',
        'error.title': 'Connection error',
        'error.sub': 'The catalog could not be loaded.',
        'blocks': 'blocks',
        'block': 'block',
        'objectives': 'Learning objectives',
        'no_objectives': 'No objectives.',
        'no_blocks.title': 'No blocks',
        'no_blocks.sub': 'This tutor has no blocks defined.',
        'open_chatgpt': 'Open in ChatGPT',
        'open_deepseek': 'Open in DeepSeek',
        'copy_prompt': 'Copy prompt',
        'no_prompt': 'This block has no prompt.',
        'copied': 'Prompt for "{{nombre}}" copied.',
        'copy_fail': 'Could not copy.',
        'load_tutor_fail': 'The tutor could not be loaded.',
        'suggest.label': 'Send a suggestion',
        'suggest.title': 'Suggestions',
        'suggest.sub': 'Help us improve the catalog: new tutors, topics, corrections, or anything you think we can improve.',
        'suggest.tutor_label': 'Tutor (optional)',
        'suggest.text_label': 'Your suggestion',
        'suggest.no_tutor': 'Not specified',
        'suggest.placeholder': 'Write your suggestion here…',
        'suggest.submit': 'Send',
        'suggest.cancel': 'Cancel',
        'suggest.empty': 'Write a suggestion before sending.',
        'suggest.sent': 'Thank you! Your suggestion was sent.',
        'suggest.fail': 'The suggestion could not be sent.',
    },
};

function detectLang() {
    const nav = (navigator.language || 'es').toLowerCase();
    return nav.startsWith('en') ? 'en' : 'es';
}

let lang = localStorage.getItem(LANG_KEY) || detectLang();
if (lang !== 'es' && lang !== 'en') lang = 'es';

function t(key) {
    const d = I18N[lang] && I18N[lang][key] !== undefined ? I18N[lang] : I18N.es;
    return d[key] !== undefined ? d[key] : key;
}

function applyStaticLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
        btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
    });
    if (emptyState.querySelector('h2')) applyEmptyStateText();
}

function applyEmptyStateText() {
    const h2 = emptyState.querySelector('h2');
    const p = emptyState.querySelector('p');
    if (h2) h2.textContent = t(emptyState.dataset.state === 'error' ? 'error.title' : 'empty.title');
    if (p) p.textContent = t(emptyState.dataset.state === 'error' ? 'error.sub' : 'empty.sub');
}

function changeLang(newLang) {
    if (newLang === lang) return;
    const detailId = currentTutor ? currentTutor.id : null;
    lang = newLang;
    localStorage.setItem(LANG_KEY, lang);
    applyStaticLang();
    if (detailId) {
        loadTutorDetail(detailId);
    }
    loadTutores();
}

document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => changeLang(btn.dataset.lang));
});

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

// --- Registro de visitas ---

function registrarVisita(url) {
    fetch(`${API}${url}`, { method: 'POST' }).catch(() => {});
}

// --- API ---

async function loadTutores() {
    try {
        const res = await fetch(`${API}/api/tutores?lang=${encodeURIComponent(lang)}`);
        if (!res.ok) throw new Error('error');
        const data = await res.json();
        tutores = data.tutores || [];
        renderMenu();
    } catch (err) {
        emptyState.style.display = 'block';
        emptyState.dataset.state = 'error';
        emptyState.innerHTML = `<h2>${escapeHtml(t('error.title'))}</h2><p>${escapeHtml(t('error.sub'))}</p>`;
    }
}

async function loadTutorDetail(id) {
    try {
        const res = await fetch(`${API}/api/tutores/${encodeURIComponent(id)}?lang=${encodeURIComponent(lang)}`);
        if (!res.ok) throw new Error('error');
        currentTutor = await res.json();
        registrarVisita(`/api/tutores/${encodeURIComponent(id)}/visita`);
        renderDetail();
    } catch (err) {
        showToast(t('load_tutor_fail'), 'error');
        goToMenu();
    }
}

// --- Render: menú ---

function renderMenu() {
    tutoresGrid.innerHTML = '';
    if (!tutores.length) {
        emptyState.style.display = 'block';
        emptyState.dataset.state = 'empty';
        emptyState.innerHTML = `<h2>${escapeHtml(t('empty.title'))}</h2><p>${escapeHtml(t('empty.sub'))}</p>`;
        return;
    }
    emptyState.style.display = 'none';

    for (const tut of tutores) {
        const card = document.createElement('a');
        card.className = 'tutor-card';
        card.href = '#';
        card.setAttribute('data-id', tut.id);

        const bloquesLabel = tut.num_bloques === 1 ? `1 ${t('block')}` : `${tut.num_bloques} ${t('blocks')}`;

        card.innerHTML = `
            <div class="tutor-card-accent" style="background:${escapeHtml(tut.color || '#2557a7')}"></div>
            <h2>${escapeHtml(tut.tema)}</h2>
            <p>${escapeHtml(tut.descripcion || '')}</p>
            <div class="tutor-card-meta">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                ${bloquesLabel}
            </div>
        `;
        card.addEventListener('click', (e) => {
            e.preventDefault();
            openTutor(tut.id);
        });
        tutoresGrid.appendChild(card);
    }
}

// --- Render: detalle ---

function renderDetail() {
    const tut = currentTutor;
    if (!tut) return;
    const accent = tut.color || '#2557a7';
    const bloques = Array.isArray(tut.bloques) ? tut.bloques : [];

    let bloquesHtml = bloques.map((b, i) => {
        const objetivos = Array.isArray(b.objetivos) ? b.objetivos : [];
        const objetivosHtml = objetivos.length
            ? `<ul>${objetivos.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>`
            : '';
        return `
            <div class="bloque">
                <div class="bloque-header">
                    <div class="bloque-id">${escapeHtml(b.id != null ? b.id : i + 1)}</div>
                    <span class="bloque-title">${escapeHtml(b.nombre || '')}</span>
                    <svg class="bloque-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div class="bloque-body" style="display:none;">
                    <div class="bloque-objetivos">
                        <h4>${escapeHtml(t('objectives'))}</h4>
                        ${objetivosHtml || `<p style="color:var(--text-dim);font-size:0.9rem;">${escapeHtml(t('no_objectives'))}</p>`}
                    </div>
                    <div class="prompt-box">${escapeHtml(b.prompt || '')}</div>
                    <div class="bloque-actions">
                        <div class="dropdown dropdown-primary" role="group">
                            <a class="btn primary dropdown-trigger" href="#" data-action="chatgpt" data-idx="${i}" target="_blank" rel="noopener">${escapeHtml(t('open_chatgpt'))}</a>
                            <button type="button" class="dropdown-toggle" data-idx="${i}" aria-label="${escapeHtml(t('open_chatgpt'))}" aria-haspopup="true" aria-expanded="false">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <div class="dropdown-menu" role="menu">
                                <a class="dropdown-item" href="#" data-action="deepseek" data-idx="${i}" target="_blank" rel="noopener" role="menuitem">${escapeHtml(t('open_deepseek'))}</a>
                            </div>
                        </div>
                        <button class="btn secondary" data-action="copy" data-idx="${i}">${escapeHtml(t('copy_prompt'))}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (!bloques.length) {
        bloquesHtml = `<div class="empty-state"><h2>${escapeHtml(t('no_blocks.title'))}</h2><p>${escapeHtml(t('no_blocks.sub'))}</p></div>`;
    }

    viewDetail.innerHTML = `
        <div class="detail-header">
            <div class="detail-accent" style="background:${escapeHtml(accent)}"></div>
            <h1 class="detail-title">${escapeHtml(tut.tema)}</h1>
        </div>
        ${tut.descripcion ? `<p class="detail-desc">${escapeHtml(tut.descripcion)}</p>` : ''}
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
            const bloque = bloques[idx];
            const prompt = bloque ? (bloque.prompt || '') : '';
            const action = el.dataset.action;
            const nombre = bloque ? (bloque.nombre || '') : '';

            if (!prompt) {
                showToast(t('no_prompt'), 'warning');
                return;
            }

            registrarVisita(`/api/tutores/${encodeURIComponent(tut.id)}/bloques/${encodeURIComponent(bloque.id)}/visita`);

            if (action === 'chatgpt') {
                window.open(chatgptUrl(prompt), '_blank');
            } else if (action === 'deepseek') {
                el.closest('.dropdown').classList.remove('open');
                window.open(deepseekUrl(prompt), '_blank');
            } else if (action === 'copy') {
                const ok = await copyText(prompt);
                showToast(ok ? t('copied').replace('{{nombre}}', nombre) : t('copy_fail'), ok ? 'success' : 'error');
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

// --- Sugerencias ---

function llenarSelectTutores() {
    const selected = suggestTutor.value;
    suggestTutor.innerHTML = `<option value="" data-i18n="suggest.no_tutor">${escapeHtml(t('suggest.no_tutor'))}</option>`;
    for (const tut of tutores) {
        const opt = document.createElement('option');
        opt.value = tut.id;
        opt.textContent = tut.tema;
        suggestTutor.appendChild(opt);
    }
    if (currentTutor) suggestTutor.value = currentTutor.id;
    else if (selected) suggestTutor.value = selected;
}

function openSuggestModal() {
    llenarSelectTutores();
    suggestText.value = '';
    suggestCount.textContent = '0';
    suggestModal.hidden = false;
    document.body.style.overflow = 'hidden';
    suggestText.focus();
}

function closeSuggestModal() {
    suggestModal.hidden = true;
    document.body.style.overflow = '';
}

btnSuggest.addEventListener('click', openSuggestModal);

document.getElementById('btn-suggest-cancel').addEventListener('click', closeSuggestModal);

suggestModal.addEventListener('click', (e) => {
    if (e.target === suggestModal) closeSuggestModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !suggestModal.hidden) closeSuggestModal();
});

suggestText.addEventListener('input', () => {
    suggestCount.textContent = String(suggestText.value.length);
});

suggestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const contenido = suggestText.value.trim();
    if (!contenido) {
        showToast(t('suggest.empty'), 'warning');
        return;
    }
    btnSuggestSend.disabled = true;
    btnSuggestSend.textContent = '…';
    try {
        const res = await fetch(`${API}/api/sugerencias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contenido,
                tutor_id: suggestTutor.value || null,
                lang,
            }),
        });
        if (!res.ok) throw new Error('error');
        closeSuggestModal();
        showToast(t('suggest.sent'), 'success');
    } catch (err) {
        showToast(t('suggest.fail'), 'error');
    } finally {
        btnSuggestSend.disabled = false;
        btnSuggestSend.textContent = t('suggest.submit');
    }
});

// --- Inicio ---

applyStaticLang();
loadTutores();