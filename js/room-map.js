/**
 * XTREME BIKE MANAGEMENT — ROOM-MAP.JS
 * Module A: Interactive Room Map
 * Persists bike state to Supabase (bikes + reservations tables)
 */

window.XBM = window.XBM || {};

XBM.RoomMap = (function () {
    'use strict';

    let selectedBikeId = null;
    let currentFilter = 'all';

    const BIKE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="5.5" cy="17.5" r="3.5"/>
    <circle cx="18.5" cy="17.5" r="3.5"/>
    <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V9.5l-3-3H5.5"/>
    <path d="M12 9.5l4 1.5 2 6.5"/>
  </svg>`;

    const BLOCK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;

    /* ── SUPABASE: LOAD BIKES ─────────────────────────────────── */
    async function loadBikesFromDB() {
        if (!window.db) return;
        try {
            const { data, error } = await db.from('bikes').select('*').order('id');
            if (error) throw error;
            if (!data || data.length === 0) return;

            data.forEach(row => {
                const b = XBM.bikeStates.find(b => b.id === row.id);
                if (b) {
                    b.status = row.status;
                    b.user = row.current_user_name || null;
                    b.credits = row.credits_remaining;
                }
            });
        } catch (err) {
            console.warn('[RoomMap] DB load (fallback to seed):', err.message);
        }
    }

    /* ── SUPABASE: SAVE BIKE ──────────────────────────────────── */
    async function saveBikeToDB(bike) {
        if (!window.db) return;
        try {
            await db.from('bikes').update({
                status: bike.status,
                current_user_name: bike.user || null,
                credits_remaining: bike.credits ?? null,
                updated_at: new Date().toISOString(),
                updated_by: XBM.Auth?.user?.id || null,
            }).eq('id', bike.id);
        } catch (err) {
            console.warn('[RoomMap] Bike save error:', err.message);
        }
    }

    /* ── SUPABASE: SAVE RESERVATION ───────────────────────────── */
    async function saveReservationToDB({ bikeId, userName, creditsLeft }) {
        if (!window.db) return;
        try {
            await db.from('reservations').insert({
                bike_id: bikeId,
                user_name: userName,
                credits_used: 1,
                credits_remaining: creditsLeft,
                created_by: XBM.Auth?.user?.id || null,
            });
        } catch (err) {
            console.warn('[RoomMap] Reservation save error:', err.message);
        }
    }

    /* ── SUPABASE: RESET ALL BIKES ────────────────────────────── */
    async function resetBikesInDB() {
        if (!window.db) return;
        try {
            await db.from('bikes').update({
                status: 'available',
                current_user_name: null,
                credits_remaining: null,
                current_class_id: null,
                updated_at: new Date().toISOString(),
            }).gte('id', 1);
        } catch (err) {
            console.warn('[RoomMap] Reset DB error:', err.message);
        }
    }

    /* ── REALTIME: SUBSCRIBE TO BIKES TABLE ───────────────────── */
    function subscribeToRealtime() {
        if (!window.db) return;
        db.channel('bikes-realtime')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'bikes' },
                payload => {
                    const row = payload.new;
                    const bike = XBM.bikeStates.find(b => b.id === row.id);
                    if (!bike) return;

                    bike.status = row.status;
                    bike.user = row.current_user_name || null;
                    bike.credits = row.credits_remaining;

                    // Re-render that card only
                    const card = document.getElementById(`bike-${row.id}`);
                    if (card) card.replaceWith(createBikeCard(bike));

                    updateStats();
                    updateMiniRoom();
                    if (typeof XBM.Dashboard?.updateKPIs === 'function') XBM.Dashboard.updateKPIs();
                })
            .subscribe();
    }

    /* ── BUILD GRID ───────────────────────────────────────────── */
    function buildGrid() {
        const grid = document.getElementById('roomGrid');
        if (!grid) return;
        grid.innerHTML = '';
        XBM.bikeStates.forEach(bike => grid.appendChild(createBikeCard(bike)));
        updateStats();
        updateMiniRoom();
    }

    function createBikeCard(bike) {
        const card = document.createElement('div');
        card.className = `bike-card bike-card--${bike.status}`;
        card.id = `bike-${bike.id}`;
        card.dataset.id = bike.id;
        card.setAttribute('role', 'gridcell');
        card.setAttribute('aria-label', `Bike ${bike.id} — ${bikeStatusLabel(bike.status)}${bike.user ? ': ' + bike.user : ''}`);
        card.setAttribute('tabindex', '0');

        const icon = bike.status === 'blocked' ? BLOCK_ICON_SVG : BIKE_ICON_SVG;
        const userText = bike.user ? bike.user.split(' ')[0] : '';

        card.innerHTML = `
      <span class="bike-card__number">${bike.id}</span>
      <span class="bike-card__icon">${icon}</span>
      <span class="bike-card__user">${userText}</span>
    `;

        card.addEventListener('click', e => handleBikeClick(e, bike.id));
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBikeClick(e, bike.id); }
        });
        return card;
    }

    function bikeStatusLabel(status) {
        return { available: 'Disponible', occupied: 'Ocupada', blocked: 'Bloqueada' }[status] || status;
    }

    /* ── HANDLE BIKE CLICK ────────────────────────────────────── */
    function handleBikeClick(e, bikeId) {
        const bike = XBM.bikeStates.find(b => b.id === bikeId);
        if (!bike) return;
        XBM.addRipple(e.currentTarget, e);

        if (bike.status === 'available') {
            openBookingModal(bikeId);
        } else if (bike.status === 'occupied') {
            XBM.toast({ title: `Bike #${bikeId} Ocupada`, msg: `Asignada a: ${bike.user}`, type: 'info' });
        } else if (bike.status === 'blocked') {
            XBM.toast({ title: `Bike #${bikeId} Bloqueada`, msg: 'Esta bike está fuera de servicio.', type: 'danger' });
        }
    }

    /* ── BOOKING MODAL ────────────────────────────────────────── */
    function openBookingModal(bikeId) {
        selectedBikeId = bikeId;
        document.querySelectorAll('.bike-card').forEach(c => c.classList.remove('bike-card--selected'));
        const card = document.getElementById(`bike-${bikeId}`);
        if (card) card.classList.add('bike-card--selected');

        document.getElementById('modalBikeBadge').textContent = bikeId;
        document.getElementById('modalTitle').textContent = `Bike #${bikeId}`;
        document.getElementById('bookingName').value = '';
        document.getElementById('bookingCredits').value = '';

        const overlay = document.getElementById('modalOverlay');
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.getElementById('bookingName').focus();
    }

    function closeModal() {
        const overlay = document.getElementById('modalOverlay');
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');

        if (selectedBikeId) {
            const card = document.getElementById(`bike-${selectedBikeId}`);
            if (card) {
                const bike = XBM.bikeStates.find(b => b.id === selectedBikeId);
                if (bike) {
                    card.classList.remove('bike-card--selected');
                    card.classList.add(`bike-card--${bike.status}`);
                }
            }
        }
        selectedBikeId = null;
    }

    /* ── CONFIRM BOOKING ──────────────────────────────────────── */
    function confirmBooking() {
        const name = document.getElementById('bookingName').value.trim();
        const credits = parseInt(document.getElementById('bookingCredits').value, 10);
        const cls = document.getElementById('bookingClass').value;

        if (!name) {
            XBM.toast({ title: 'Campo requerido', msg: 'Ingresa el nombre del usuario.', type: 'danger' });
            document.getElementById('bookingName').focus();
            return;
        }
        if (isNaN(credits) || credits < 1) {
            XBM.toast({ title: 'Créditos insuficientes', msg: 'El usuario necesita al menos 1 crédito.', type: 'danger' });
            return;
        }

        const bike = XBM.bikeStates.find(b => b.id === selectedBikeId);
        if (!bike || bike.status !== 'available') return;

        const creditsLeft = credits - 1;
        bike.status = 'occupied';
        bike.user = name;
        bike.class = cls;
        bike.credits = creditsLeft;

        const card = document.getElementById(`bike-${selectedBikeId}`);
        if (card) {
            card.className = 'bike-card bike-card--occupied';
            card.setAttribute('aria-label', `Bike ${selectedBikeId} — Ocupada: ${name}`);
            const firstName = name.split(' ')[0];
            card.innerHTML = `<span class="bike-card__number">${selectedBikeId}</span><span class="bike-card__icon">${BIKE_ICON_SVG}</span><span class="bike-card__user">${firstName}</span>`;
        }

        const overlay = document.getElementById('modalOverlay');
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');

        const storedId = selectedBikeId;
        selectedBikeId = null;

        // Persist to Supabase (non-blocking)
        saveBikeToDB(bike);
        saveReservationToDB({ bikeId: storedId, userName: name, creditsLeft });

        XBM.toast({ title: `Bike #${storedId} Reservada`, msg: `${name} · ${creditsLeft} créd. restantes`, type: 'success' });
        XBM.addActivity({ type: 'neon', text: `<strong>Bike #${storedId}</strong> reservada por ${name}` });

        updateStats();
        updateMiniRoom();
        if (typeof XBM.Dashboard?.updateKPIs === 'function') XBM.Dashboard.updateKPIs();

        if (card) card.addEventListener('click', e => handleBikeClick(e, storedId));
    }

    /* ── BLOCK BIKE ───────────────────────────────────────────── */
    function blockBike() {
        if (!selectedBikeId) return;
        const bike = XBM.bikeStates.find(b => b.id === selectedBikeId);
        if (!bike || bike.status !== 'available') return;

        bike.status = 'blocked';
        bike.user = null;

        const card = document.getElementById(`bike-${selectedBikeId}`);
        if (card) {
            card.className = 'bike-card bike-card--blocked';
            card.setAttribute('aria-label', `Bike ${selectedBikeId} — Bloqueada`);
            card.innerHTML = `<span class="bike-card__number">${selectedBikeId}</span><span class="bike-card__icon">${BLOCK_ICON_SVG}</span><span class="bike-card__user"></span>`;
            card.addEventListener('click', e => handleBikeClick(e, selectedBikeId));
        }

        const storedId = selectedBikeId;
        document.getElementById('modalOverlay').classList.remove('is-open');
        document.getElementById('modalOverlay').setAttribute('aria-hidden', 'true');
        selectedBikeId = null;

        // Persist to Supabase
        saveBikeToDB(bike);

        XBM.toast({ title: `Bike #${storedId} Bloqueada`, msg: 'Marcada como fuera de servicio.', type: 'danger' });
        XBM.addActivity({ type: 'danger', text: `<strong>Bike #${storedId}</strong> bloqueada por mantenimiento` });

        updateStats();
        updateMiniRoom();
        if (typeof XBM.Dashboard?.updateKPIs === 'function') XBM.Dashboard.updateKPIs();
    }

    /* ── RESET ROOM ───────────────────────────────────────────── */
    async function resetRoom() {
        if (!confirm('¿Resetear toda la sala? Esto libera todas las bicicletas.')) return;

        XBM.bikeStates.forEach(b => { b.status = 'available'; b.user = null; b.class = null; b.credits = null; });

        await resetBikesInDB();

        buildGrid();
        applyFilter(currentFilter);
        XBM.toast({ title: 'Sala Reseteada', msg: 'Todas las bikes están disponibles.', type: 'neon' });
        XBM.addActivity({ type: 'info', text: '<strong>Sala</strong> reseteada para nueva clase' });
        if (typeof XBM.Dashboard?.updateKPIs === 'function') XBM.Dashboard.updateKPIs();
    }

    /* ── FILTER ───────────────────────────────────────────────── */
    function applyFilter(filter) {
        currentFilter = filter;
        document.querySelectorAll('#roomGrid .bike-card').forEach(card => {
            const bike = XBM.bikeStates.find(b => b.id === parseInt(card.dataset.id, 10));
            if (!bike) return;
            card.classList.toggle('bike-card--hidden', filter !== 'all' && bike.status !== filter);
        });
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const active = btn.dataset.filter === filter;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active);
        });
    }

    /* ── STATS & MINI ROOM ────────────────────────────────────── */
    function updateStats() {
        const s = XBM.getStats();
        const avEl = document.getElementById('rmAvailableCount');
        const ocEl = document.getElementById('rmOccupiedCount');
        const blEl = document.getElementById('rmBlockedCount');
        if (avEl) avEl.textContent = s.available;
        if (ocEl) ocEl.textContent = s.occupied;
        if (blEl) blEl.textContent = s.blocked;
    }

    function updateMiniRoom() {
        const mini = document.getElementById('miniRoom');
        if (!mini) return;
        mini.innerHTML = '';
        XBM.bikeStates.forEach(bike => {
            const dot = document.createElement('div');
            dot.className = `mini-bike mini-bike--${bike.status}`;
            dot.title = `Bike #${bike.id}${bike.user ? ': ' + bike.user : ''}`;
            mini.appendChild(dot);
        });
    }

    /* ── INIT ─────────────────────────────────────────────────── */
    async function init() {
        // Load real state from Supabase, fall back to local seed data
        await loadBikesFromDB();
        buildGrid();

        // Subscribe to live updates from other devices
        subscribeToRealtime();

        // Modal
        document.getElementById('modalClose')?.addEventListener('click', closeModal);
        document.getElementById('modalOverlay')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeModal();
        });
        document.getElementById('confirmBookingBtn')?.addEventListener('click', confirmBooking);
        document.getElementById('blockBikeBtn')?.addEventListener('click', blockBike);

        // Controls
        document.getElementById('resetRoomBtn')?.addEventListener('click', resetRoom);
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
        });

        // Keyboard
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && document.getElementById('modalOverlay')?.classList.contains('is-open')) {
                closeModal();
            }
        });
    }

    return { init, updateMiniRoom, updateStats };
})();
