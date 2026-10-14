/*
 * PathoLab demo - application shell: sign-in, sidebar navigation, menu bar,
 * shortcuts, row selection, and the screen router.
 */
(function (PL) {
  'use strict';

  const { store, ui, screens, dialogs } = { store: PL.store, ui: PL.ui, screens: PL.screens, dialogs: PL.dialogs };
  const { DomainError, S, svc, hasPerm, currentUser, ROLES } = { ...store, S: store.S };
  const $ = (id) => document.getElementById(id);

  const NAV = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'patients', label: 'Patients' },
    { key: 'orders', label: 'Orders' },
    { key: 'results', label: 'Result Entry' },
    { key: 'samples', label: 'Sample Tracking', perms: ['samples.manage'] },
    { key: 'operations', label: 'Lab Operations', perms: ['critical.notify', 'outsource.manage', 'inventory.manage', 'qc.manage', 'equipment.manage', 'analyser.import'] },
    { key: 'catalog', label: 'Test Catalog' },
    { key: 'reports', label: 'Reports' },
    { key: 'finance', label: 'Billing & Finance', perms: ['billing.collect', 'finance.manage'] },
    { key: 'mis', label: 'MIS Reports', perms: ['mis.view'] },
  ];

  const selection = {};
  let current = 'dashboard';
  const allowed = (perms) => !perms || !perms.length || perms.some((p) => hasPerm(p));

  // ---- selection --------------------------------------------------------------
  const sel = (t) => (selection[t] == null ? null : String(selection[t]));
  const setSel = (t, id) => { selection[t] = id == null ? null : id; };

  // ---- rendering ----------------------------------------------------------------
  function render() {
    const scr = screens[current];
    if (!scr) return;
    const body = $('page-body');
    const top = body.scrollTop;
    $('page-title').textContent = scr.title;
    $('page-sub').textContent = scr.sub || '';
    const toolbar = scr.toolbar ? scr.toolbar.call(scr) : '';
    $('page-actions').innerHTML = toolbar;
    const html = scr.body.call(scr);
    ui.keepFocus(() => { body.innerHTML = html; });
    body.scrollTop = top;
    refreshEnablement();
    if (scr.sync) scr.sync.call(scr);
    $('status').textContent = `Updated ${new Date().toLocaleTimeString('en-GB')}`;
  }
  function refreshEnablement() {
    document.querySelectorAll('[data-req]').forEach((b) => { b.disabled = !sel(b.dataset.req); });
  }
  function markSelected(tableId, id) {
    document.querySelectorAll(`table.grid[data-table="${tableId}"] tbody tr`).forEach((tr) => {
      tr.classList.toggle('sel', tr.dataset.id === String(id));
    });
  }

  function go(key, payload) {
    const nav = NAV.find((n) => n.key === key);
    if (!nav || !allowed(nav.perms)) { ui.toast('Your role cannot open that screen.', 'warn'); return; }
    if (key === 'results' && payload != null) screens.results.state.orderId = Number(payload);
    current = key;
    renderNav();
    render();
  }

  function renderNav() {
    const host = $('nav');
    host.innerHTML = NAV.filter((n) => allowed(n.perms)).map((n) =>
      `<button class="nav-item ${n.key === current ? 'on' : ''}" data-go="${n.key}">${ui.esc(n.label)}</button>`).join('');
  }

  // ---- errors -----------------------------------------------------------------
  function handle(e, title) {
    if (e instanceof DomainError) { ui.alertBox(title || 'Notice', e.message, 'warn'); return; }
    console.error(e);
    ui.alertBox('Unexpected error', `${title || 'Something went wrong'}: ${e && e.message ? e.message : e}`, 'bad');
  }

  // ---- menus ------------------------------------------------------------------
  const MENUS = [
    { label: 'File', items: [
      { text: 'New Order...', key: 'Ctrl+N', perms: ['orders.register'], run: () => dialogs.newOrder() },
      { text: 'New Patient...', key: 'Ctrl+Shift+N', perms: ['patients.manage'], run: () => dialogs.newPatient() },
      '-',
      { text: 'Change Password...', run: () => dialogs.changePassword() },
      { text: 'Sign Out', run: () => signOut() },
      '-',
      { text: 'Exit', key: 'Alt+F4', run: () => ui.toast('In the web demo, close the browser tab to exit.', 'info') },
    ] },
    { label: 'View', items: [
      ...NAV.map((n, i) => ({ text: n.label, key: i < 9 ? `Ctrl+${i + 1}` : '', perms: n.perms, run: () => go(n.key) })),
      '-',
      { text: 'Refresh', key: 'F5', run: () => render() },
    ] },
    { label: 'Tools', items: [
      { text: 'Settings...', perms: ['settings.manage'], run: () => dialogs.settings() },
      { text: 'Report Designer...', perms: ['settings.manage'], run: () => dialogs.reportDesigner() },
      '-',
      { text: 'Health Packages...', perms: ['packages.manage'], run: () => dialogs.packages() },
      { text: 'Masters...', perms: ['masters.manage'], run: () => dialogs.masters() },
      { text: 'Data & Backup...', perms: ['data.transfer', 'backup.manage'], run: () => dialogs.dataTools() },
      { text: 'Cloud Database & Sync...', perms: ['settings.manage'], run: () => dialogs.cloudSync() },
      { text: 'WhatsApp Messaging...', perms: ['settings.manage'], run: () => dialogs.whatsapp() },
      { text: 'Manage Users...', perms: ['users.manage'], run: () => dialogs.users() },
      { text: 'Roles & Permissions...', perms: ['users.manage'], run: () => dialogs.roles() },
      '-',
      { text: 'Quality Control...', perms: ['qc.manage'], run: () => { screens.operations.state.tab = 'qc'; go('operations'); } },
      { text: 'Audit Log...', perms: ['audit.view'], run: () => dialogs.audit() },
      { text: 'Verify Audit Trail', perms: ['audit.view'], run: () => verifyAudit() },
      { text: 'Export Audit Trail...', perms: ['audit.view'], run: () => exportAudit() },
      '-',
      { text: 'Back Up Database Now', perms: ['backup.manage'], run: () => { ui.download(`patholab-backup-${store.todayKey()}.json`, svc.exportJson()); ui.toast('Backup downloaded', 'ok'); } },
      { text: 'Check Database Integrity', perms: ['backup.manage'], run: () => ui.alertBox('Integrity check', 'The demo database passed the integrity check.', 'ok') },
      { text: 'Restore Built-in Test Catalog...', perms: ['catalog.manage'], run: restoreCatalog },
    ] },
    { label: 'Help', items: [
      { text: 'Licence...', run: () => dialogs.license() },
      '-',
      { text: 'About PathoLab', run: () => dialogs.about() },
    ] },
  ];

  function renderMenus() {
    const bar = $('menubar');
    bar.innerHTML = MENUS.map((m, i) => `<div class="menu" data-m="${i}"><button class="menu-btn">${ui.esc(m.label)}</button>` +
      `<div class="menu-pop">${m.items.map((it, j) => (it === '-' ? '<div class="menu-sep"></div>' :
        `<button class="menu-item" data-mi="${i}.${j}" ${allowed(it.perms) ? '' : 'disabled'}><span>${ui.esc(it.text)}</span>` +
        `${it.key ? `<kbd>${ui.esc(it.key)}</kbd>` : ''}</button>`)).join('')}</div></div>`).join('');
  }
  function closeMenus() { document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); }
  function verifyAudit() {
    const r = store.verifyAudit();
    if (r.intact) ui.alertBox('Audit trail', `The audit trail is intact. ${r.checked} entr(ies) verified.`, 'ok');
    else ui.alertBox('Audit trail altered', `The audit trail does not verify. The first altered entry is #${r.firstBroken}.`, 'bad');
  }
  function exportAudit() {
    const lines = ['id,when,user,action,detail,hash'].concat(S.audit.map((e) => [e.id, e.at, e.user, e.action, `"${String(e.detail).replace(/"/g, '""')}"`, e.hash].join(',')));
    ui.download('audit-trail.csv', lines.join('\n'), 'text/csv');
    ui.toast('Audit trail exported', 'ok');
  }
  function restoreCatalog() {
    ui.confirmBox('Restore built-in test catalogue', 'Add any built-in tests that are missing from the catalogue? Existing tests and their ranges are left alone.', { ok: 'Restore' })
      .then((yes) => {
        if (!yes) return;
        const added = svc.restoreCatalog();
        ui.toast(`${added} test(s) restored`, 'ok');
        render();
      });
  }

  // ---- sign in / out -----------------------------------------------------------
  const DEMO_USERS = [
    ['admin', 'admin123', 'Administrator'],
    ['pathologist', 'demo123', 'Pathologist'],
    ['technician', 'demo123', 'Lab Technician'],
    ['reception', 'demo123', 'Receptionist'],
  ];
  function showLogin() {
    $('app').hidden = true;
    $('login').hidden = false;
    $('login-error').hidden = true;
    $('login-user').value = '';
    $('login-pass').value = '';
    setTimeout(() => $('login-user').focus(), 0);
  }
  function attemptLogin(username, password) {
    const u = S.users.find((x) => x.username === String(username || '').trim().toLowerCase());
    if (!u || u.password !== password) {
      $('login-error').textContent = 'The user name or password is not correct.';
      $('login-error').hidden = false;
      $('login-pass').select();
      return;
    }
    if (!u.active) {
      $('login-error').textContent = 'This account is inactive. Ask an administrator to activate it.';
      $('login-error').hidden = false;
      return;
    }
    store.setSession(u.id);
    showApp();
  }
  function signOut() {
    ui.confirmBox('Sign out', 'Sign out of PathoLab?', { ok: 'Sign out' }).then((yes) => {
      if (!yes) return;
      store.setSession(null);
      showLogin();
    });
  }
  function showApp() {
    $('login').hidden = true;
    $('app').hidden = false;
    const user = currentUser();
    $('sb-user').textContent = `${user.username} (${ROLES[user.role].label})`;
    $('sidebar-user').textContent = `${user.fullName}\n${ROLES[user.role].label}`;
    applyLab();
    if (!NAV.find((n) => n.key === current && allowed(n.perms))) current = 'dashboard';
    renderMenus();
    renderNav();
    render();
  }
  function applyLab() {
    document.title = `PathoLab - ${S.lab.name}`;
    $('sb-lab').textContent = S.lab.name;
  }

  function buildLogin() {
    $('demo-accounts').innerHTML = DEMO_USERS.map(([u, p, label]) =>
      `<button type="button" class="acct" data-quick="${u}|${p}"><b>${ui.esc(label)}</b><span>${ui.esc(u)}</span></button>`).join('');
    $('login-form').addEventListener('submit', (e) => { e.preventDefault(); attemptLogin($('login-user').value, $('login-pass').value); });
    $('login-show').addEventListener('change', (e) => { $('login-pass').type = e.target.checked ? 'text' : 'password'; });
    $('demo-accounts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-quick]');
      if (!b) return;
      const [u, p] = b.dataset.quick.split('|');
      attemptLogin(u, p);
    });
    $('login-exit').addEventListener('click', () => ui.toast('In the web demo, close the browser tab to exit.', 'info'));
    $('login-reset').addEventListener('click', () => {
      ui.confirmBox('Reset demo data', 'Replace all demo data with the built-in sample data?', { danger: true, ok: 'Reset' })
        .then((yes) => { if (yes) { svc.reset(); ui.toast('Demo data reset', 'ok'); showLogin(); } });
    });
  }

  // ---- global event wiring ----------------------------------------------------
  const GLOBAL_ACTIONS = {
    newOrder: () => dialogs.newOrder(),
    refresh: () => render(),
  };

  function wire() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      const menuBtn = t.closest('.menu-btn');
      if (menuBtn) {
        const index = menuBtn.closest('.menu').dataset.m;
        const wasOpen = menuBtn.closest('.menu').classList.contains('open');
        closeMenus();
        if (!wasOpen) {
          renderMenus(); // refreshes enabled/disabled items for the current role
          document.querySelector(`.menu[data-m="${index}"]`).classList.add('open');
        }
        return;
      }
      const menuItem = t.closest('.menu-item');
      if (menuItem && !menuItem.disabled) {
        closeMenus();
        const [mi, ji] = menuItem.dataset.mi.split('.').map(Number);
        MENUS[mi].items[ji].run();
        return;
      }
      if (!t.closest('.menu')) closeMenus();

      const go_ = t.closest('[data-go]');
      if (go_) { go(go_.dataset.go); return; }

      const scr = screens[current];
      const actEl = t.closest('[data-act]');
      if (actEl) {
        if (actEl.disabled) return;
        const name = actEl.dataset.act;
        const fn = (scr.actions && scr.actions[name]) || GLOBAL_ACTIONS[name];
        if (fn) fn.call(scr, actEl);
        return;
      }

      const row = t.closest('table.grid tbody tr[data-id]');
      if (row && !t.closest('button, a, input, select, textarea, label')) {
        const tableId = row.closest('table.grid').dataset.table;
        setSel(tableId, row.dataset.id);
        markSelected(tableId, row.dataset.id);
        refreshEnablement();
        if (scr.onSelect) scr.onSelect.call(scr, tableId, row.dataset.id);
        else if (scr.detailTables && scr.detailTables.includes(tableId)) render();
        if (scr.sync) scr.sync.call(scr);
      }
    });

    document.addEventListener('dblclick', (e) => {
      if (e.target.closest('.dialog, .overlay')) return;
      const row = e.target.closest('table.grid tbody tr[data-id]');
      if (!row) return;
      const scr = screens[current];
      if (scr.dbl) scr.dbl.call(scr, row.closest('table.grid').dataset.table, row.dataset.id);
    });

    document.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.input;
      const scr = screens[current];
      if (key && scr.inputs && scr.inputs[key]) scr.inputs[key].call(scr, e.target);
    });
    document.addEventListener('change', (e) => {
      const key = e.target.dataset && e.target.dataset.change;
      const scr = screens[current];
      if (key && scr.inputs && scr.inputs[key]) scr.inputs[key].call(scr, e.target);
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.dataset && e.target.dataset.enter && e.key === 'Enter') {
        const scr = screens[current];
        if (scr.actions && scr.actions[e.target.dataset.enter]) scr.actions[e.target.dataset.enter].call(scr, e.target);
        return;
      }
      if (e.target.closest && e.target.closest('.overlay')) return;
      if ($('app').hidden) return;
      if (e.key === 'F5') { e.preventDefault(); render(); return; }
      if (e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key) && !e.shiftKey) {
        e.preventDefault();
        go(NAV[Number(e.key) - 1].key);
        return;
      }
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        if (e.shiftKey) dialogs.newPatient(); else dialogs.newOrder();
      }
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  }

  // ---- boot -------------------------------------------------------------------
  function boot() {
    store.load();
    store.restoreSession();
    buildLogin();
    wire();
    if (currentUser()) showApp(); else showLogin();
  }

  PL.app = {
    sel, setSel, go, refresh: () => render(), handle, applyLab,
    restored: () => { store.setSession(null); showLogin(); ui.toast('Backup restored', 'ok'); },
    selection,
  };

  document.addEventListener('DOMContentLoaded', boot);
})(window.PL = window.PL || {});
