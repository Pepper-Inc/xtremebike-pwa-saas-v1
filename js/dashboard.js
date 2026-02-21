/**
 * XTREME BIKE MANAGEMENT — DASHBOARD.JS
 * Module C: Admin Dashboard
 * Loads real metrics from Supabase
 */

window.XBM = window.XBM || {};

XBM.Dashboard = (function () {
    'use strict';

    /* ── SUPABASE: LOAD REAL STATS ───────────────────────────────── */
    async function loadStatsFromDB() {
        if (!window.db) return null;
        try {
            // Build date range using LOCAL timezone (not UTC)
            // This ensures classes saved at e.g. 07:00 local time are found correctly
            const now = new Date();
            const localISO = (h, m, s) => {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
                return d.toISOString();
            };
            const todayStart = localISO(0, 0, 0);
            const todayEnd = localISO(23, 59, 59);

            // Parallel queries
            const [bikesRes, attendRes, classRes] = await Promise.all([
                db.from('bikes').select('status'),
                db.from('attendances')
                    .select('status, credits_remaining')
                    .gte('updated_at', todayStart)
                    .lte('updated_at', todayEnd),
                db.from('classes')
                    .select('id, name, instructor_name, scheduled_at, status, capacity')
                    .gte('scheduled_at', todayStart)
                    .lte('scheduled_at', todayEnd)
                    .order('scheduled_at'),
            ]);

            const bikes = bikesRes.data || [];
            const attendances = attendRes.data || [];
            const classes = classRes.data || [];

            // Compute stats
            const occupied = bikes.filter(b => b.status === 'occupied').length;
            const blocked = bikes.filter(b => b.status === 'blocked').length;
            const pct = Math.round(((occupied + blocked) / 20) * 100);
            const attended = attendances.filter(a => a.status === 'attended').length;
            const income = attended * 120; // 120 MXN per attended session
            const active = attendances.filter(a => a.status !== 'noshow').length;

            return { occupied, blocked, pct, attended, income, active, classes };
        } catch (err) {
            console.warn('[Dashboard] Stats load error (using local data):', err.message);
            return null;
        }
    }

    /* ── UPDATE KPIs ─────────────────────────────────────────────── */
    async function updateKPIs() {
        // Try DB first
        const dbStats = await loadStatsFromDB();

        if (dbStats) {
            // Ocupación from DB
            const kpiOcEl = document.getElementById('kpi-ocupacion');
            if (kpiOcEl) XBM.animateNumber(kpiOcEl, dbStats.pct, '%');
            const subEl = document.getElementById('kpi-ocupacion-sub');
            if (subEl) subEl.textContent = `${dbStats.occupied + dbStats.blocked} de 20 bikes`;

            // Ingresos from DB
            const kpiInEl = document.getElementById('kpi-ingresos');
            if (kpiInEl) animateCurrency(kpiInEl, dbStats.income);

            // Usuarios activos from DB
            const kpiUEl = document.getElementById('kpi-usuarios');
            if (kpiUEl) XBM.animateNumber(kpiUEl, dbStats.active);

            // Update schedule if we got real classes
            if (dbStats.classes && dbStats.classes.length > 0) {
                buildScheduleFromDB(dbStats.classes);
            }
        } else {
            // Fallback: use local computed stats
            const stats = XBM.getStats();

            const kpiOcEl = document.getElementById('kpi-ocupacion');
            if (kpiOcEl) XBM.animateNumber(kpiOcEl, stats.pct, '%');
            const subEl = document.getElementById('kpi-ocupacion-sub');
            if (subEl) subEl.textContent = `${stats.occupied + stats.blocked} de ${XBM.TOTAL_BIKES} bikes`;

            const kpiInEl = document.getElementById('kpi-ingresos');
            if (kpiInEl) animateCurrency(kpiInEl, stats.income);

            const activeUsers = Object.values(XBM.attendees).flat()
                .filter(u => u.status === 'attended' || u.status === 'pending').length;
            const kpiUEl = document.getElementById('kpi-usuarios');
            if (kpiUEl) XBM.animateNumber(kpiUEl, activeUsers);
        }

        // Occupancy bar
        const occ = document.querySelector('.occ-bar-fill');
        if (occ && dbStats) {
            setTimeout(() => { occ.style.width = dbStats.pct + '%'; }, 100);
        }
    }

    function animateCurrency(el, target) {
        const start = performance.now();
        const dur = 900;
        function step(now) {
            const prog = Math.min((now - start) / dur, 1);
            const ease = 1 - Math.pow(1 - prog, 3);
            el.textContent = XBM.formatCurrency(Math.round(target * ease));
            if (prog < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    /* ── BUILD SCHEDULE FROM DB ──────────────────────────────────── */
    function buildScheduleFromDB(classes) {
        const container = document.getElementById('scheduleList');
        if (!container) return;
        container.innerHTML = '';

        classes.forEach((cls, i) => {
            const item = document.createElement('div');
            item.className = `schedule-item ${cls.status === 'active' ? 'is-active' : cls.status === 'done' ? 'is-done' : ''}`;
            item.style.animationDelay = `${i * 60}ms`;

            const time = new Date(cls.scheduled_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const badgeLabel = { active: 'En Vivo', done: 'Terminada', upcoming: 'Próxima', cancelled: 'Cancel.' }[cls.status] || cls.status;
            const badgeClass = `schedule-item__badge--${cls.status === 'upcoming' ? 'upcoming' : cls.status === 'active' ? 'active' : 'done'}`;

            item.innerHTML = `
        <span class="schedule-item__time">${time}</span>
        <div class="schedule-item__info">
          <p class="schedule-item__name">${cls.name}</p>
          <p class="schedule-item__instructor">Instructor: ${cls.instructor_name}</p>
        </div>
        <span class="schedule-item__badge ${badgeClass}">${badgeLabel}</span>
      `;
            container.appendChild(item);
        });
    }

    /* ── BUILD SCHEDULE FROM SEED ────────────────────────────────── */
    function buildSchedule() {
        const container = document.getElementById('scheduleList');
        if (!container) return;
        container.innerHTML = '';

        XBM.schedule.forEach((cls, i) => {
            const item = document.createElement('div');
            item.className = `schedule-item ${cls.status === 'active' ? 'is-active' : cls.status === 'done' ? 'is-done' : ''}`;
            item.style.animationDelay = `${i * 60}ms`;

            const badgeClass = { active: 'schedule-item__badge--active', done: 'schedule-item__badge--done', upcoming: 'schedule-item__badge--upcoming' }[cls.status] || '';
            const badgeLabel = { active: 'En Vivo', done: 'Terminada', upcoming: 'Próxima' }[cls.status] || cls.status;

            item.innerHTML = `
        <span class="schedule-item__time">${cls.label}</span>
        <div class="schedule-item__info">
          <p class="schedule-item__name">${cls.name}</p>
          <p class="schedule-item__instructor">Instructor: ${cls.instructor} · ${cls.reservations}/${cls.capacity} reserv.</p>
        </div>
        <span class="schedule-item__badge ${badgeClass}">${badgeLabel}</span>
      `;
            container.appendChild(item);
        });
    }

    /* ── ACTIVITY FEED ───────────────────────────────────────────── */
    function buildActivityFeed() {
        const feed = document.getElementById('activityFeed');
        if (!feed) return;
        feed.innerHTML = '';
        XBM.activityLog.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
        <span class="activity-item__dot activity-item__dot--${entry.type}" aria-hidden="true"></span>
        <span class="activity-item__text">${entry.text}</span>
        <span class="activity-item__time">${entry.time}</span>
      `;
            feed.appendChild(item);
        });
    }

    /* ── LIVE CLOCK ──────────────────────────────────────────────── */
    function startClock() {
        const el = document.getElementById('currentDate');
        const tick = () => { if (el) el.textContent = XBM.formatDate(); };
        tick();
        setInterval(tick, 60000);
    }

    /* ── INIT ────────────────────────────────────────────────────── */
    async function init() {
        startClock();
        buildSchedule();       // Show seed data immediately
        buildActivityFeed();
        await updateKPIs();    // Then overlay with real DB data

        document.getElementById('addClassBtn')?.addEventListener('click', () => {
            XBM.toast({ title: 'Agregar Clase', msg: 'Función disponible en la versión Pro.', type: 'info' });
        });
    }

    return { init, updateKPIs };
})();
