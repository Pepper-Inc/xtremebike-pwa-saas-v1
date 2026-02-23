/**
 * XTREME BIKE MANAGEMENT — CHECKIN.JS
 * Module B: Instructor Attendance Check-in
 * Persists attendance to Supabase attendances table
 */

window.XBM = window.XBM || {};

XBM.CheckIn = (function () {
    'use strict';

    let activeClassKey = '1800';
    let activeClassId = null;   // Supabase UUID for the active class

    /* ── SUPABASE: LOAD CLASSES ──────────────────────────────────── */
    async function loadClassesFromDB() {
        if (!window.db) return;
        try {
            const today = new Date().toISOString().slice(0, 10);
            const { data, error } = await db
                .from('classes')
                .select('*')
                .gte('scheduled_at', today + 'T00:00:00')
                .lte('scheduled_at', today + 'T23:59:59')
                .order('scheduled_at');

            if (error) throw error;
            if (!data || data.length === 0) return;

            // Populate the class select dropdown with real DB data
            const sel = document.getElementById('classSelect');
            if (!sel) return;
            sel.innerHTML = '';
            data.forEach(cls => {
                const time = new Date(cls.scheduled_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                const opt = document.createElement('option');
                opt.value = cls.id;   // Use UUID as value
                opt.textContent = `${time} — ${cls.name} · Instructor: ${cls.instructor_name}`;
                opt.dataset.status = cls.status;
                if (cls.status === 'active') opt.selected = true;
                sel.appendChild(opt);
            });

            // Set active class
            const active = data.find(c => c.status === 'active') || data[0];
            if (active) {
                activeClassId = active.id;
                activeClassKey = active.id; // override key to UUID
            }
        } catch (err) {
            console.warn('[CheckIn] Classes load error (using seed data):', err.message);
        }
    }

    /* ── SUPABASE: LOAD ATTENDEES FOR CLASS ──────────────────────── */
    async function loadAttendeesFromDB(classId) {
        if (!window.db || !classId || classId.length < 10) return null; // local key
        try {
            // Fetch both real-time attendances and reservations for this class
            const [attRes, resRes] = await Promise.all([
                db.from('attendances').select('*').eq('class_id', classId),
                db.from('reservations').select('*').eq('class_id', classId)
            ]);

            const attendances = attRes.data || [];
            const reservations = resRes.data || [];

            // If we have nothing in the database, return null to allow fallback
            if (attendances.length === 0 && reservations.length === 0) return null;

            // Merge: Start with reservations as the base (since people book first)
            // Then overlay attendance status if it exists.
            const mergedMap = new Map();

            reservations.forEach(r => {
                mergedMap.set(r.user_name, {
                    id: r.id,
                    user_name: r.user_name,
                    bike_number: r.bike_id,
                    credits_remaining: r.credits_remaining,
                    status: 'pending' // Default if no attendance found
                });
            });

            // If something is in attendances, it overrides/augments the record
            attendances.forEach(a => {
                const existing = mergedMap.get(a.user_name);
                if (existing) {
                    existing.status = a.status;
                    existing.id = a.id; // Use attendance ID for updates
                } else {
                    mergedMap.set(a.user_name, a);
                }
            });

            return Array.from(mergedMap.values()).sort((a, b) => a.bike_number - b.bike_number);
        } catch (err) {
            console.warn('[CheckIn] Attendees load error:', err.message);
            return null;
        }
    }

    /* ── SUPABASE: UPSERT ATTENDANCE STATUS ──────────────────────── */
    async function saveAttendanceToDB(classId, user, newStatus) {
        if (!window.db || !classId || classId.length < 10) return;
        try {
            // Check if record exists
            const { data: existing } = await db
                .from('attendances')
                .select('id')
                .eq('class_id', classId)
                .eq('user_name', user.name)
                .single();

            if (existing) {
                await db.from('attendances').update({
                    status: newStatus,
                    credits_remaining: user.credits,
                    updated_at: new Date().toISOString(),
                    updated_by: XBM.Auth?.user?.id || null,
                }).eq('id', existing.id);
            } else {
                await db.from('attendances').insert({
                    class_id: classId,
                    user_name: user.name,
                    bike_number: user.bike,
                    credits_remaining: user.credits,
                    status: newStatus,
                    updated_by: XBM.Auth?.user?.id || null,
                });
            }
        } catch (err) {
            console.warn('[CheckIn] Attendance save error:', err.message);
        }
    }

    /* ── SUPABASE: REALTIME (attendances) ────────────────────────── */
    function subscribeToAttendances() {
        if (!window.db) return;
        db.channel('checkin-realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'attendances' },
                () => { loadClass(activeClassKey); })
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'reservations' },
                () => { loadClass(activeClassKey); })
            .subscribe();
    }

    /* ── LOAD CLASS LIST ─────────────────────────────────────────── */
    async function loadClass(classKey) {
        activeClassKey = classKey;

        const list = document.getElementById('checkinList');
        if (!list) return;
        list.innerHTML = `
      <div style="text-align:center;padding:2rem;color:var(--text-muted);">
        <p style="font-size:1.25rem;">⏳</p>
        <p style="margin-top:0.5rem;font-size:0.875rem;">Cargando asistentes...</p>
      </div>`;

        // Try DB first
        let dbRows = await loadAttendeesFromDB(classKey);

        if (dbRows && dbRows.length > 0) {
            // Map DB rows → internal format
            const attendees = dbRows.map((row, i) => ({
                id: row.id,
                name: row.user_name,
                bike: row.bike_number,
                credits: row.credits_remaining,
                status: row.status,
            }));

            renderAttendees(list, attendees, classKey);
            updateSummaryFromArray(attendees);
        } else {
            // Fall back to local seed data
            const attendees = XBM.attendees[classKey] || [];
            if (attendees.length === 0) {
                list.innerHTML = `
          <div style="text-align:center;padding:3rem;color:var(--text-muted);">
            <p style="font-size:1.5rem;">📋</p>
            <p style="margin-top:0.5rem;">Sin reservaciones para esta clase.</p>
          </div>`;
                updateSummary(classKey);
                return;
            }
            renderAttendees(list, attendees, classKey);
            updateSummary(classKey);
        }
    }

    /* ── RENDER LIST ─────────────────────────────────────────────── */
    function renderAttendees(list, attendees, classKey) {
        list.innerHTML = '';
        attendees.forEach((user, idx) => {
            const card = createUserCard(user, classKey, idx);
            list.appendChild(card);
        });
    }

    /* ── CREATE USER CARD ────────────────────────────────────────── */
    function createUserCard(user, classKey, delay = 0) {
        const card = document.createElement('div');
        card.className = `user-card ${user.status !== 'pending' ? 'is-' + user.status : ''}`;
        card.id = `user-card-${user.id}`;
        card.setAttribute('role', 'listitem');
        card.style.animationDelay = `${delay * 50}ms`;

        const creditsClass = user.credits <= 1 ? 'user-card__credits--low' : '';

        card.innerHTML = `
      <div class="user-card__avatar" aria-hidden="true">${XBM.getInitials(user.name)}</div>
      <div class="user-card__bike" aria-label="Bike ${user.bike}">${user.bike}</div>
      <div class="user-card__info">
        <p class="user-card__name">${user.name}</p>
        <div class="user-card__meta">
          <span class="user-card__credits ${creditsClass}" aria-label="${user.credits} créditos">
            <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            ${user.credits} créd.
          </span>
          <span>· Bike #${user.bike}</span>
        </div>
      </div>
      <span class="user-card__status user-card__status--${user.status}" id="status-${user.id}" aria-live="polite">
        ${statusLabel(user.status)}
      </span>
      <div class="user-card__actions" role="group" aria-label="Acciones para ${user.name}">
        <button class="action-btn action-btn--attend ${user.status === 'attended' ? 'active' : ''}"
          id="attend-${user.id}"
          data-uid="${user.id}"
          aria-label="Marcar asistió"
          aria-pressed="${user.status === 'attended'}">✓</button>
        <button class="action-btn action-btn--noshow ${user.status === 'noshow' ? 'active' : ''}"
          id="noshow-${user.id}"
          data-uid="${user.id}"
          aria-label="Marcar no-show"
          aria-pressed="${user.status === 'noshow'}">✗</button>
        <button class="action-btn action-btn--qr"
          id="qr-${user.id}"
          aria-label="Ver QR de ${user.name}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
            <path d="M14 14h3v3M17 14h3M14 17v3"/>
          </svg>
        </button>
      </div>
    `;

        card.querySelector(`#attend-${user.id}`)?.addEventListener('click', () => setStatus(user, 'attended', classKey));
        card.querySelector(`#noshow-${user.id}`)?.addEventListener('click', () => setStatus(user, 'noshow', classKey));
        card.querySelector(`#qr-${user.id}`)?.addEventListener('click', () => XBM.QR?.generateUserQR(user));

        return card;
    }

    /* ── SET STATUS ──────────────────────────────────────────────── */
    function setStatus(user, newStatus, classKey) {
        const prevStatus = user.status;

        if (prevStatus === newStatus) {
            user.status = 'pending';
        } else {
            user.status = newStatus;

            // Deduct credit on attend
            if (newStatus === 'attended' && prevStatus !== 'attended') {
                if (user.credits > 0) {
                    user.credits--;
                    XBM.addActivity({ type: 'info', text: `<strong>${user.name}</strong> — 1 crédito descontado. Quedan: ${user.credits}` });
                } else {
                    XBM.toast({ title: 'Sin créditos', msg: `${user.name} no tiene créditos disponibles.`, type: 'danger' });
                }
            }

            // Also update local seed if using seed data
            const seedList = XBM.attendees[classKey];
            if (seedList) {
                const seedUser = seedList.find(u => u.id === user.id);
                if (seedUser) { seedUser.status = user.status; seedUser.credits = user.credits; }
            }
        }

        // Persist to DB (non-blocking)
        saveAttendanceToDB(activeClassKey, user, user.status);

        // Re-render card
        const list = document.getElementById('checkinList');
        const oldCard = document.getElementById(`user-card-${user.id}`);
        if (oldCard && list) list.replaceChild(createUserCard(user, classKey), oldCard);

        // Toast
        if (user.status === 'attended') {
            XBM.toast({ title: '✓ Asistió', msg: user.name, type: 'success' });
            XBM.addActivity({ type: 'success', text: `<strong>${user.name}</strong> — Asistencia confirmada · Bike #${user.bike}` });
        } else if (user.status === 'noshow') {
            XBM.toast({ title: '✗ No-show', msg: user.name, type: 'danger' });
            XBM.addActivity({ type: 'danger', text: `<strong>${user.name}</strong> — No-show · Bike #${user.bike} liberada` });
        }

        updateSummary(classKey);
    }

    /* ── LABELS ──────────────────────────────────────────────────── */
    function statusLabel(status) {
        return { pending: 'Pendiente', attended: 'Asistió', noshow: 'No-show' }[status] || 'Pendiente';
    }

    /* ── UPDATE SUMMARY ──────────────────────────────────────────── */
    function updateSummary(classKey) {
        const attendees = XBM.attendees[classKey] || [];
        updateSummaryFromArray(attendees);
    }

    function updateSummaryFromArray(attendees) {
        const attended = attendees.filter(u => u.status === 'attended').length;
        const noshow = attendees.filter(u => u.status === 'noshow').length;
        const pending = attendees.filter(u => u.status === 'pending').length;
        const elA = document.getElementById('ciAttended');
        const elN = document.getElementById('ciNoshow');
        const elP = document.getElementById('ciPending');
        if (elA) elA.textContent = `${attended} Asistieron`;
        if (elN) elN.textContent = `${noshow} No-show`;
        if (elP) elP.textContent = `${pending} Pendientes`;
    }

    /* ── BULK ACTIONS ────────────────────────────────────────────── */
    function markAllAttended() {
        const attendees = XBM.attendees[activeClassKey] || [];
        attendees.forEach(u => { if (u.status === 'pending') { u.status = 'attended'; if (u.credits > 0) u.credits--; } });
        loadClass(activeClassKey);
        XBM.toast({ title: 'Todos marcados', msg: 'Asistencia completa registrada.', type: 'success' });
    }

    function markAllNoshow() {
        const attendees = XBM.attendees[activeClassKey] || [];
        attendees.forEach(u => { if (u.status === 'pending') u.status = 'noshow'; });
        loadClass(activeClassKey);
        XBM.toast({ title: 'Todos marcados', msg: 'No-show completo registrado.', type: 'danger' });
    }

    /* ── EXPORT CSV ──────────────────────────────────────────────── */
    function exportCheckin() {
        const attendees = XBM.attendees[activeClassKey] || [];
        if (!attendees.length) { XBM.toast({ title: 'Sin datos', msg: 'No hay asistentes para exportar.', type: 'info' }); return; }

        const csv = ['Nombre,Bike,Créditos Restantes,Estado', ...attendees.map(u =>
            `"${u.name}",${u.bike},${u.credits},"${statusLabel(u.status)}"`)].join('\n');

        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `checkin-${activeClassKey}.csv` });
        a.click();
        URL.revokeObjectURL(url);
        XBM.toast({ title: '↓ Reporte Exportado', msg: 'Archivo CSV generado.', type: 'neon' });
    }

    /* ── INIT ────────────────────────────────────────────────────── */
    async function init() {
        // Try to load real classes from DB and update the dropdown
        await loadClassesFromDB();

        // Load the default/active class
        await loadClass(activeClassKey);

        // Subscribe to realtime updates
        subscribeToAttendances();

        document.getElementById('loadClassBtn')?.addEventListener('click', async () => {
            const sel = document.getElementById('classSelect');
            const key = sel?.value || activeClassKey;
            activeClassId = key;
            activeClassKey = key;
            await loadClass(key);
            XBM.toast({ title: 'Clase cargada', msg: sel?.options[sel.selectedIndex]?.text || '', type: 'neon' });
        });

        document.getElementById('markAllAttendedBtn')?.addEventListener('click', markAllAttended);
        document.getElementById('markAllNoshowBtn')?.addEventListener('click', markAllNoshow);
        document.getElementById('exportCheckinBtn')?.addEventListener('click', exportCheckin);
    }

    return { init, loadClass, updateSummary, get _activeClassKey() { return activeClassKey; } };
})();
