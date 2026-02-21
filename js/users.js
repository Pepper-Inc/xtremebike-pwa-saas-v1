/**
 * XTREME BIKE MANAGEMENT — USERS.JS
 * Module D: User Management (Admin only)
 *
 * Features:
 *  - List all instructors + admins from Supabase profiles table
 *  - Edit name, role, credits, phone (inline)
 *  - Invite new user via magic link (OTP — no service key needed)
 *  - Toggle active/inactive status
 *  - Real-time updates via Supabase subscription
 */

window.XBM = window.XBM || {};

XBM.Users = (function () {
    'use strict';

    let profiles = [];
    let editingId = null;

    /* ── LOAD ALL PROFILES ───────────────────────────────────── */
    async function loadProfiles() {
        if (!window.db) return [];
        try {
            const { data, error } = await db
                .from('profiles')
                .select('*')
                .order('role')
                .order('full_name');
            if (error) throw error;
            profiles = data || [];
            return profiles;
        } catch (err) {
            console.warn('[Users] Load error:', err.message);
            return [];
        }
    }

    /* ── SAVE PROFILE CHANGES ────────────────────────────────── */
    async function saveProfile(id, changes) {
        if (!window.db) return false;
        try {
            const { error } = await db
                .from('profiles')
                .update({ ...changes, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (err) {
            console.warn('[Users] Save error:', err.message);
            XBM.toast({ title: 'Error al guardar', msg: err.message, type: 'danger' });
            return false;
        }
    }

    /* ── INVITE USER (magic link / OTP) ─────────────────────── */
    async function inviteUser(email, fullName, role) {
        if (!window.db) return false;
        try {
            // Send magic link — creates user if not exists
            const { error } = await db.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/') + 'login.html',
                    data: { full_name: fullName, role },
                },
            });
            if (error) throw error;
            return true;
        } catch (err) {
            console.warn('[Users] Invite error:', err.message);
            XBM.toast({ title: 'Error al invitar', msg: err.message, type: 'danger' });
            return false;
        }
    }

    /* ── RENDER USER LIST ─────────────────────────────────────── */
    function render() {
        const container = document.getElementById('usersGrid');
        if (!container) return;

        if (profiles.length === 0) {
            container.innerHTML = `
        <div class="users-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/>
            <line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
          <p>Sin usuarios registrados</p>
          <button class="btn btn--primary" id="emptyInviteBtn">+ Invitar primer instructor</button>
        </div>`;
            document.getElementById('emptyInviteBtn')?.addEventListener('click', openInviteModal);
            return;
        }

        container.innerHTML = '';
        const isAdmin = XBM.Auth?.profile?.role === 'admin';

        profiles.forEach((p, i) => {
            const card = buildUserCard(p, isAdmin, i);
            container.appendChild(card);
        });

        updateUserStats();
    }

    /* ── BUILD USER CARD ─────────────────────────────────────── */
    function buildUserCard(profile, isAdmin, delay = 0) {
        const card = document.createElement('div');
        card.className = `user-mgmt-card ${!profile.is_active ? 'user-mgmt-card--inactive' : ''}`;
        card.id = `ucard-${profile.id}`;
        card.style.animationDelay = `${delay * 60}ms`;

        const initials = (profile.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const roleBadge = profile.role === 'admin' ? 'admin' : 'instructor';
        const roleLabel = profile.role === 'admin' ? 'Admin' : 'Instructor';
        const status = profile.is_active ? 'Activo' : 'Inactivo';
        const statusCls = profile.is_active ? 'status--active' : 'status--inactive';
        const credits = profile.credits_remaining ?? 0;
        const lowCredit = credits <= 2;

        card.innerHTML = `
      <div class="ucard__header">
        <div class="ucard__avatar" aria-hidden="true">${initials}</div>
        <div class="ucard__meta">
          <h3 class="ucard__name">${profile.full_name || '—'}</h3>
          <p class="ucard__email">${profile.id.slice(0, 8)}…</p>
        </div>
        <span class="ucard__role-badge ucard__role-badge--${roleBadge}">${roleLabel}</span>
      </div>

      <div class="ucard__stats">
        <div class="ucard__stat">
          <span class="ucard__stat-label">Créditos</span>
          <span class="ucard__stat-value ${lowCredit ? 'ucard__stat-value--low' : ''}">${credits}</span>
        </div>
        <div class="ucard__stat">
          <span class="ucard__stat-label">Teléfono</span>
          <span class="ucard__stat-value">${profile.phone || '—'}</span>
        </div>
        <div class="ucard__stat">
          <span class="ucard__stat-label">Estado</span>
          <span class="ucard__stat-value ${statusCls}">${status}</span>
        </div>
      </div>

      ${isAdmin ? `
      <div class="ucard__actions">
        <button class="btn btn--ghost btn--sm ucard__edit-btn"
          id="edit-${profile.id}"
          aria-label="Editar ${profile.full_name}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>
        <button class="btn btn--outline btn--sm ucard__toggle-btn"
          id="toggle-${profile.id}"
          aria-label="${profile.is_active ? 'Desactivar' : 'Activar'} usuario">
          ${profile.is_active
                    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Desactivar`
                    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Activar`}
        </button>
      </div>` : ''}
    `;

        if (isAdmin) {
            card.querySelector(`#edit-${profile.id}`)?.addEventListener('click', () => openEditModal(profile));
            card.querySelector(`#toggle-${profile.id}`)?.addEventListener('click', () => toggleActive(profile));
        }

        return card;
    }

    /* ── UPDATE STATS BANNER ─────────────────────────────────── */
    function updateUserStats() {
        const total = profiles.length;
        const active = profiles.filter(p => p.is_active).length;
        const admins = profiles.filter(p => p.role === 'admin').length;
        const instruct = profiles.filter(p => p.role === 'instructor').length;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('usersTotal', total);
        set('usersActive', active);
        set('usersAdmins', admins);
        set('usersInstructors', instruct);
    }

    /* ── TOGGLE ACTIVE STATUS ────────────────────────────────── */
    async function toggleActive(profile) {
        const newVal = !profile.is_active;
        const label = newVal ? 'activar' : 'desactivar';
        if (!confirm(`¿${label.charAt(0).toUpperCase() + label.slice(1)} a ${profile.full_name}?`)) return;

        const ok = await saveProfile(profile.id, { is_active: newVal });
        if (!ok) return;

        profile.is_active = newVal;
        const card = document.getElementById(`ucard-${profile.id}`);
        if (card) card.replaceWith(buildUserCard(profile, true));

        XBM.toast({ title: `Usuario ${newVal ? 'activado' : 'desactivado'}`, msg: profile.full_name, type: newVal ? 'success' : 'danger' });
        XBM.addActivity?.({ type: newVal ? 'success' : 'danger', text: `<strong>${profile.full_name}</strong> — cuenta ${newVal ? 'activada' : 'desactivada'}` });
        updateUserStats();
    }

    /* ══════════════════════════════════════════════════════════
       EDIT MODAL
    ══════════════════════════════════════════════════════════ */
    function openEditModal(profile) {
        editingId = profile.id;

        document.getElementById('editUserName').value = profile.full_name || '';
        document.getElementById('editUserPhone').value = profile.phone || '';
        document.getElementById('editUserRole').value = profile.role || 'instructor';
        document.getElementById('editUserCredits').value = profile.credits_remaining ?? 0;
        document.getElementById('editUserNotes').value = profile.notes || '';
        document.getElementById('editModalTitle').textContent = `Editar: ${profile.full_name}`;

        const overlay = document.getElementById('editUserOverlay');
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.getElementById('editUserName').focus();
    }

    function closeEditModal() {
        editingId = null;
        document.getElementById('editUserOverlay').classList.remove('is-open');
        document.getElementById('editUserOverlay').setAttribute('aria-hidden', 'true');
    }

    async function submitEditModal() {
        if (!editingId) return;

        const changes = {
            full_name: document.getElementById('editUserName').value.trim(),
            phone: document.getElementById('editUserPhone').value.trim() || null,
            role: document.getElementById('editUserRole').value,
            credits_remaining: parseInt(document.getElementById('editUserCredits').value, 10) || 0,
            notes: document.getElementById('editUserNotes').value.trim() || null,
        };

        if (!changes.full_name) {
            XBM.toast({ title: 'Campo requerido', msg: 'El nombre no puede estar vacío.', type: 'danger' });
            return;
        }

        const btn = document.getElementById('saveEditUserBtn');
        btn.disabled = true;
        btn.textContent = 'Guardando…';

        const ok = await saveProfile(editingId, changes);
        btn.disabled = false;
        btn.textContent = 'Guardar Cambios';

        if (!ok) return;

        // Update local state
        const p = profiles.find(p => p.id === editingId);
        if (p) Object.assign(p, changes);

        closeEditModal();
        render();
        XBM.toast({ title: '✓ Perfil actualizado', msg: changes.full_name, type: 'success' });
        XBM.addActivity?.({ type: 'info', text: `<strong>${changes.full_name}</strong> — perfil actualizado` });
    }

    /* ══════════════════════════════════════════════════════════
       INVITE MODAL
    ══════════════════════════════════════════════════════════ */
    function openInviteModal() {
        document.getElementById('inviteEmail').value = '';
        document.getElementById('inviteName').value = '';
        document.getElementById('inviteRole').value = 'instructor';
        document.getElementById('inviteStatus').textContent = '';
        document.getElementById('inviteStatus').className = 'invite-status';

        const overlay = document.getElementById('inviteUserOverlay');
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.getElementById('inviteEmail').focus();
    }

    function closeInviteModal() {
        document.getElementById('inviteUserOverlay').classList.remove('is-open');
        document.getElementById('inviteUserOverlay').setAttribute('aria-hidden', 'true');
    }

    async function submitInvite() {
        const email = document.getElementById('inviteEmail').value.trim();
        const fullName = document.getElementById('inviteName').value.trim();
        const role = document.getElementById('inviteRole').value;
        const status = document.getElementById('inviteStatus');

        if (!email || !fullName) {
            XBM.toast({ title: 'Campos requeridos', msg: 'Email y nombre son obligatorios.', type: 'danger' });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            XBM.toast({ title: 'Email inválido', msg: 'Verifica el formato del correo.', type: 'danger' });
            return;
        }

        const btn = document.getElementById('sendInviteBtn');
        btn.disabled = true;
        btn.textContent = 'Enviando invitación…';
        status.textContent = '';

        const ok = await inviteUser(email, fullName, role);

        btn.disabled = false;
        btn.textContent = 'Enviar Invitación';

        if (ok) {
            status.className = 'invite-status invite-status--ok';
            status.textContent = `✓ Enlace de acceso enviado a ${email}. El instructor debe hacer clic en el enlace para activar su cuenta.`;
            XBM.toast({ title: '✉ Invitación enviada', msg: email, type: 'success' });
            XBM.addActivity?.({ type: 'info', text: `Invitación enviada a <strong>${fullName}</strong> (${email})` });
            // Auto-close after 4s
            setTimeout(() => { closeInviteModal(); loadAndRender(); }, 4000);
        }
    }

    /* ── REALTIME SUBSCRIPTION ───────────────────────────────── */
    function subscribeToProfiles() {
        if (!window.db) return;
        db.channel('profiles-realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'profiles' },
                async () => {
                    await loadAndRender();
                })
            .subscribe();
    }

    async function loadAndRender() {
        await loadProfiles();
        render();
    }

    /* ── INIT ────────────────────────────────────────────────── */
    async function init() {
        await loadAndRender();
        subscribeToProfiles();

        // Edit modal
        document.getElementById('editUserOverlay')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeEditModal();
        });
        document.getElementById('editUserClose')?.addEventListener('click', closeEditModal);
        document.getElementById('saveEditUserBtn')?.addEventListener('click', submitEditModal);

        // Invite modal
        document.getElementById('inviteUserOverlay')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeInviteModal();
        });
        document.getElementById('inviteUserClose')?.addEventListener('click', closeInviteModal);
        document.getElementById('sendInviteBtn')?.addEventListener('click', submitInvite);
        document.getElementById('openInviteBtn')?.addEventListener('click', openInviteModal);

        // Keyboard
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('editUserOverlay')?.classList.contains('is-open')) closeEditModal();
            if (document.getElementById('inviteUserOverlay')?.classList.contains('is-open')) closeInviteModal();
        });
    }

    return { init, loadAndRender };
})();
