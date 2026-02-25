/**
 * CYKLBOARD MANAGEMENT — CLIENTS.JS
 * Module E: Clients Management
 */

window.CYKL = window.CYKL || {};

CYKL.Clients = (function () {
    'use strict';

    let clients = [];
    let filteredClients = [];
    let editingId = null;

    /* ── LOAD ALL CLIENTS ───────────────────────────────────── */
    async function loadClients() {
        if (!window.db) return [];
        try {
            const { data, error } = await db
                .from('profiles')
                .select('*')
                .eq('role', 'client')
                .order('full_name');
            if (error) throw error;
            clients = data || [];
            filteredClients = [...clients];

            // Re-apply any existing search filter
            const searchInput = document.getElementById('clientSearch');
            if (searchInput && searchInput.value) {
                const query = searchInput.value.toLowerCase();
                filteredClients = clients.filter(c =>
                    (c.full_name && c.full_name.toLowerCase().includes(query)) ||
                    (c.phone && c.phone.includes(query))
                );
            }

            return clients;
        } catch (err) {
            console.warn('[Clients] Load error:', err.message);
            return [];
        }
    }

    /* ── SAVE FULL PROFILE ───────────────────────────────────── */
    async function saveClient(id, changes) {
        if (!window.db) return false;
        try {
            const { data, error } = await db
                .from('profiles')
                .update({ ...changes, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select();
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("Permiso denegado por Supabase RLS o el usuario no existe.");
            }
            return true;
        } catch (err) {
            console.warn('[Clients] Save error:', err.message);
            CYKL.toast({ title: 'Error', msg: err.message, type: 'danger' });
            return false;
        }
    }

    /* ── ADD/REMOVE CREDITS ─────────────────────────────────── */
    async function adjustCredits(client, amt) {
        if (!window.db) return;
        const current = client.credits_remaining || 0;
        const newVal = current + amt;
        if (newVal < 0) return;

        const btnId = amt > 0 ? `addcred-${client.id}` : `subcred-${client.id}`;
        const btn = document.getElementById(btnId);
        if (btn) btn.disabled = true;

        const ok = await saveClient(client.id, { credits_remaining: newVal });
        if (btn) btn.disabled = false;

        if (ok) {
            client.credits_remaining = newVal;
            CYKL.toast({
                title: 'Créditos actualizados',
                msg: `${client.full_name} ahora tiene ${newVal} créd.`,
                type: 'success'
            });
            render(); // refresh UI
        }
    }

    /* ── RENDER CLIENT LIST ────────────────────────────────────── */
    function render() {
        const container = document.getElementById('clientsGrid');
        if (!container) return;

        if (filteredClients.length === 0) {
            container.innerHTML = `
        <div class="clients-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
          <p>Sin clientes registrados o no hay coincidencias</p>
          <button class="btn btn--primary" id="emptyInviteClientBtn">+ Nuevo Cliente</button>
        </div>`;
            document.getElementById('emptyInviteClientBtn')?.addEventListener('click', openInviteModal);
            return;
        }

        container.innerHTML = '';
        filteredClients.forEach((c) => {
            container.appendChild(buildClientCard(c));
        });

        // Add event listeners back
        filteredClients.forEach(c => {
            const card = document.getElementById(`ccard-${c.id}`);
            if (!card) return;
            card.querySelector(`#addcred-${c.id}`)?.addEventListener('click', () => adjustCredits(c, 1));
            card.querySelector(`#subcred-${c.id}`)?.addEventListener('click', () => adjustCredits(c, -1));
        });
    }

    /* ── BUILD CLIENT CARD ─────────────────────────────────────── */
    function buildClientCard(client) {
        const card = document.createElement('div');
        const isActive = client.is_active;
        card.className = `client-card ${!isActive ? 'client-card--inactive' : ''}`;
        card.id = `ccard-${client.id}`;

        const initials = (client.full_name || 'C').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const credits = client.credits_remaining ?? 0;

        card.innerHTML = `
      <div class="ccard__header">
        <div class="ccard__avatar" aria-hidden="true">${initials}</div>
        <div class="ccard__meta">
          <h3 class="ccard__name">${client.full_name || 'Sin Nombre'}</h3>
          <p class="ccard__email">${client.phone || client.id.slice(0, 8)}</p>
        </div>
      </div>
      <div class="ccard__stats">
        <div class="ccard__stat">
          <span class="ccard__stat-label">Créditos</span>
          <span class="ccard__stat-value ${credits > 0 ? 'ccard__stat-value--highlight' : 'ccard__stat-value--danger'}">${credits}</span>
        </div>
        <div class="ccard__stat">
          <span class="ccard__stat-label">Estado</span>
          <span class="ccard__stat-value">${isActive ? 'Activo' : 'Inactivo'}</span>
        </div>
      </div>
      <div class="ccard__actions">
        <button class="btn btn--outline btn--sm" id="subcred-${client.id}" ${credits <= 0 ? 'disabled' : ''} aria-label="Restar crédito">-1 Crédito</button>
        <button class="btn btn--primary btn--sm" id="addcred-${client.id}" aria-label="Sumar crédito">+1 Crédito</button>
      </div>
    `;
        return card;
    }

    /* ── REALTIME SUBSCRIPTION ───────────────────────────────── */
    function subscribeToClients() {
        if (!window.db) return;
        db.channel('clients-realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'profiles', filter: "role=eq.client" },
                async () => {
                    await loadAndRender();
                })
            .subscribe();
    }

    async function loadAndRender() {
        await loadClients();
        render();
    }

    /* ══════════════════════════════════════════════════════════
       INVITE MODAL (NEW CLIENT)
    ══════════════════════════════════════════════════════════ */
    function openInviteModal() {
        // Ensure listeners are attached if init hasn't run yet
        if (!CYKL.Clients._listenersAttached) {
            document.getElementById('sendInviteClientBtn')?.addEventListener('click', submitInvite);
            document.getElementById('inviteClientClose')?.addEventListener('click', closeInviteModal);
            document.getElementById('inviteClientOverlay')?.addEventListener('click', e => {
                if (e.target === e.currentTarget) closeInviteModal();
            });
            CYKL.Clients._listenersAttached = true;
        }

        document.getElementById('inviteClientEmail').value = '';
        document.getElementById('inviteClientName').value = '';
        document.getElementById('inviteClientPhone').value = '';
        document.getElementById('inviteClientCredits').value = '0';
        document.getElementById('inviteClientStatus').textContent = '';
        document.getElementById('inviteClientStatus').className = 'invite-status';

        const overlay = document.getElementById('inviteClientOverlay');
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('inviteClientEmail')?.focus(), 100);
    }

    function closeInviteModal() {
        document.getElementById('inviteClientOverlay').classList.remove('is-open');
        document.getElementById('inviteClientOverlay').setAttribute('aria-hidden', 'true');
    }

    async function submitInvite() {
        console.log('[Clients] submitInvite triggered');
        const email = document.getElementById('inviteClientEmail')?.value.trim();
        const fullName = document.getElementById('inviteClientName')?.value.trim();
        const phone = document.getElementById('inviteClientPhone')?.value.trim() || null;
        const credits = parseInt(document.getElementById('inviteClientCredits')?.value || '0', 10) || 0;
        const status = document.getElementById('inviteClientStatus');

        if (!email || !fullName) {
            CYKL.toast({ title: 'Campos requeridos', msg: 'Email y nombre son obligatorios.', type: 'danger' });
            return;
        }

        const btn = document.getElementById('sendInviteClientBtn');
        btn.disabled = true;
        btn.textContent = 'Enviando invitación...';
        status.textContent = '';

        try {
            // Using signInWithOtp will create the user if it doesn't exist
            const { error } = await db.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/') + 'login.html',
                    data: { full_name: fullName, role: 'client', phone: phone, credits_remaining: credits },
                },
            });
            if (error) throw error;

            console.log('[Clients] Invite success for:', email);
            status.className = 'invite-status invite-status--ok';
            status.textContent = `✓ Cliente registrado. Enlace enviado a ${email}`;
            CYKL.toast({ title: 'Cliente Creado', msg: fullName, type: 'success' });

            setTimeout(() => { closeInviteModal(); }, 2500);

        } catch (err) {
            console.error('[Clients] Invite error:', err);
            status.textContent = `Error: ${err.message}`;
            status.style.color = 'var(--color-danger)';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Crear y Enviar Acceso';
        }
    }

    /* ── INIT ────────────────────────────────────────────────── */
    async function init() {
        await loadAndRender();
        // Solo suscribir 1 vez!
        if (!CYKL.Clients._subscribed) {
            subscribeToClients();
            CYKL.Clients._subscribed = true;
        }

        // Search
        document.getElementById('clientSearch')?.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            filteredClients = clients.filter(c =>
                (c.full_name && c.full_name.toLowerCase().includes(query)) ||
                (c.phone && c.phone.includes(query))
            );
            render();
        });

        // Modals - ensure listeners are bound
        if (!CYKL.Clients._listenersAttached) {
            document.getElementById('sendInviteClientBtn')?.addEventListener('click', submitInvite);
            document.getElementById('inviteClientClose')?.addEventListener('click', closeInviteModal);
            document.getElementById('inviteClientOverlay')?.addEventListener('click', e => {
                if (e.target === e.currentTarget) closeInviteModal();
            });
            CYKL.Clients._listenersAttached = true;
        }

        document.getElementById('openClientModalBtn')?.addEventListener('click', openInviteModal);
    }

    return { init, openInviteModal };
})();
