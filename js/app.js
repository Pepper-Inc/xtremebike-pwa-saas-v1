/**
 * XTREME BIKE MANAGEMENT — APP.JS
 * Main application controller — routing & navigation
 */

(function () {
    'use strict';

    const MODULES = ['dashboard', 'roommap', 'checkin', 'users'];
    let currentModule = 'dashboard';
    let modulesInited = {};

    /* ── NAVIGATION ──────────────────────────────────────────────── */
    function navigateTo(moduleName) {
        if (!MODULES.includes(moduleName)) return;

        // Hide all modules
        MODULES.forEach(m => {
            const el = document.getElementById(`module-${m}`);
            if (el) el.classList.add('hidden');
        });

        // Show target
        const target = document.getElementById(`module-${moduleName}`);
        if (target) {
            target.classList.remove('hidden');
            // Trigger animation by forcing reflow
            void target.offsetWidth;
        }

        // Update nav links
        document.querySelectorAll('.sidenav__link').forEach(link => {
            const active = link.dataset.module === moduleName;
            link.classList.toggle('active', active);
            link.setAttribute('aria-current', active ? 'page' : 'false');
        });

        // Lazy-initialize modules on first visit
        if (!modulesInited[moduleName]) {
            modulesInited[moduleName] = true;

            if (moduleName === 'dashboard' && XBM.Dashboard) XBM.Dashboard.init();
            if (moduleName === 'roommap' && XBM.RoomMap) XBM.RoomMap.init();
            if (moduleName === 'checkin' && XBM.CheckIn) XBM.CheckIn.init();
            if (moduleName === 'users' && XBM.Users) XBM.Users.init();
        }

        currentModule = moduleName;

        // Close mobile nav
        closeMobileNav();
    }

    /* ── MOBILE NAV ──────────────────────────────────────────────── */
    function openMobileNav() {
        const nav = document.getElementById('sidenav');
        const toggle = document.getElementById('mobileNavToggle');
        nav?.classList.add('is-open');
        toggle?.setAttribute('aria-expanded', 'true');

        // Backdrop
        let backdrop = document.getElementById('navBackdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'navBackdrop';
            backdrop.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.6);
        z-index:99; backdrop-filter:blur(2px);
        animation: fadeIn 200ms ease both;
      `;
            backdrop.addEventListener('click', closeMobileNav);
            document.body.appendChild(backdrop);
        }
    }

    function closeMobileNav() {
        const nav = document.getElementById('sidenav');
        const toggle = document.getElementById('mobileNavToggle');
        nav?.classList.remove('is-open');
        toggle?.setAttribute('aria-expanded', 'false');
        document.getElementById('navBackdrop')?.remove();
    }

    /* ── INIT ────────────────────────────────────────────────────── */
    function init() {
        // Nav link clicks
        document.querySelectorAll('.sidenav__link').forEach(link => {
            link.addEventListener('click', () => {
                navigateTo(link.dataset.module);
            });
        });

        // Mobile toggle
        document.getElementById('mobileNavToggle')?.addEventListener('click', () => {
            const nav = document.getElementById('sidenav');
            if (nav?.classList.contains('is-open')) closeMobileNav();
            else openMobileNav();
        });

        // PWA install prompt (store for later)
        window.addEventListener('beforeinstallprompt', e => {
            e.preventDefault();
            window._pwaInstallPrompt = e;
        });

        // Init default module
        navigateTo('dashboard');
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
