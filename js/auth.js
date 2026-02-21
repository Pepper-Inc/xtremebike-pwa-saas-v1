/**
 * XTREME BIKE MANAGEMENT — AUTH.JS
 * Authentication state management, session handling, user profile
 */

window.XBM = window.XBM || {};

XBM.Auth = (function () {
    'use strict';

    let currentUser = null;
    let currentProfile = null;

    /* ── GET SESSION ──────────────────────────────────────────── */
    async function getSession() {
        const { data, error } = await db.auth.getSession();
        if (error || !data.session) return null;
        return data.session;
    }

    /* ── GET PROFILE ──────────────────────────────────────────── */
    async function getProfile(userId) {
        const { data, error } = await db
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.warn('[Auth] Profile fetch error:', error.message);
            return null;
        }
        return data;
    }

    /* ── LOGIN ────────────────────────────────────────────────── */
    async function login(email, password) {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }

    /* ── LOGOUT ───────────────────────────────────────────────── */
    async function logout() {
        await db.auth.signOut();
        window.location.href = 'login.html';
    }

    /* ── REQUIRE AUTH (guard for index.html) ──────────────────── */
    async function requireAuth() {
        const session = await getSession();
        if (!session) {
            window.location.href = 'login.html';
            return null;
        }

        currentUser = session.user;
        currentProfile = await getProfile(currentUser.id);

        // If profile doesn't exist yet (race condition), create a minimal one
        if (!currentProfile) {
            const { data } = await db.from('profiles').upsert({
                id: currentUser.id,
                full_name: currentUser.email.split('@')[0],
                role: 'instructor',
            }).select().single();
            currentProfile = data;
        }

        return { user: currentUser, profile: currentProfile };
    }

    /* ── REDIRECT IF ALREADY LOGGED IN (guard for login.html) ─── */
    async function redirectIfAuthenticated() {
        const session = await getSession();
        if (session) window.location.href = 'index.html';
    }

    /* ── UPDATE SIDEBAR UI WITH REAL USER ─────────────────────── */
    function hydrateSidebar(profile) {
        if (!profile) return;

        const nameEl = document.querySelector('.sidenav__session-name');
        const roleEl = document.querySelector('.sidenav__session-role');
        const avatarEl = document.querySelector('.sidenav__avatar');

        if (nameEl) nameEl.textContent = profile.full_name || 'Usuario';
        if (roleEl) roleEl.textContent = profile.role === 'admin' ? 'Administrador' : 'Instructor';
        if (avatarEl) avatarEl.textContent = (profile.full_name || 'U')[0].toUpperCase();

        // Logout button (inject if sidebar footer exists)
        const footer = document.querySelector('.sidenav__footer');
        if (footer && !document.getElementById('logoutBtn')) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logoutBtn';
            logoutBtn.className = 'logout-btn';
            logoutBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Cerrar Sesión`;
            logoutBtn.setAttribute('aria-label', 'Cerrar sesión');
            logoutBtn.addEventListener('click', () => {
                if (confirm('¿Cerrar sesión?')) logout();
            });
            footer.appendChild(logoutBtn);
        }
    }

    /* ── WATCH AUTH STATE ─────────────────────────────────────── */
    function onAuthStateChange(callback) {
        return db.auth.onAuthStateChange((_event, session) => {
            callback(session);
        });
    }

    /* ── PUBLIC API ───────────────────────────────────────────── */
    return {
        login,
        logout,
        getSession,
        getProfile,
        requireAuth,
        redirectIfAuthenticated,
        hydrateSidebar,
        onAuthStateChange,
        get user() { return currentUser; },
        get profile() { return currentProfile; },
    };
})();
