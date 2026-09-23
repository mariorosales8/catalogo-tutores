const API = '';
const TOKEN_KEY = 'catalogo_admin_token';

const viewLogin = document.getElementById('view-login');
const viewEditor = document.getElementById('view-editor');
const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const editor = document.getElementById('editor');
const btnSave = document.getElementById('btn-save');
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
    viewEditor.style.display = '';
}

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

// --- Editor ---

async function abrirEditor() {
    const res = await fetchWithToken(`${API}/admin/api/tutores`);
    if (res.status === 401 || res.status === 503) {
        setToken('');
        showLogin();
        return;
    }
    if (!res.ok) {
        setToken('');
        showLogin();
        return;
    }
    editor.value = await res.text();
    showEditor();
}

btnSave.addEventListener('click', async () => {
    let data;
    try {
        data = JSON.parse(editor.value);
    } catch {
        showToast('El JSON no es válido. Corrige el error antes de guardar.', 'error', 7000);
        return;
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.tutores)) {
        showToast('El JSON debe tener la forma {"tutores": [...]}', 'error', 7000);
        return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Guardando…';
    try {
        const res = await fetch(`${API}/admin/api/tutores`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data, null, 2),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo guardar');
        }
        editor.value = JSON.stringify(data, null, 2);
        showToast(`Guardado: ${data.tutores.length} tutores en el catálogo.`, 'success');
    } catch (err) {
        showToast(`Error al guardar: ${err.message}`, 'error', 6000);
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Guardar cambios';
    }
});

// --- Inicio ---

abrirEditor();