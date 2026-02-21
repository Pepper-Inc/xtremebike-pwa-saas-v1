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

        // Wire the static logout button in HTML (no dynamic injection needed)
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn._wired) {
            logoutBtn._wired = true;
            logoutBtn.addEventListener('click', () => {
                if (confirm('¿Cerrar sesión?')) logout();
            });
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
