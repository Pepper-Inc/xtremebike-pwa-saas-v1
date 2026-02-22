/**
 * XTREME BIKE MANAGEMENT — CLIENTS.JS
 * Module E: Clients Management
 */

window.XBM = window.XBM || {};

XBM.Clients = (function () {
    'use strict';

    let clients = [];
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
            XBM.toast({ title: 'Error', msg: err.message, type: 'danger' });
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
            XBM.toast({ 
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

        if (clients.length === 0) {
            container.innerHTML = `
        <div class="clients-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
          <p>Sin clientes registrados</p>
          <button class="btn btn--primary" id="emptyInviteClientBtn">+ Nuevo Cliente</button>
        </div>`;
            return;
        }

        container.innerHTML = '';
        clients.forEach((c) => {
            container.appendChild(buildClientCard(c));
        });

        // Add event listeners back
        clients.forEach(c => {
            const card = document.getElementById(`ccard-${c.id}`);
            if(!card) return;
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

    /* ── INIT ────────────────────────────────────────────────── */
    async function init() {
        await loadAndRender();
        // Solo suscribir 1 vez!
        if(!XBM.Clients._subscribed) {
            subscribeToClients();
            XBM.Clients._subscribed = true;
        }
    }

    return { init };
})();
