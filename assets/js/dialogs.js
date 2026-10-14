/*
 * PathoLab demo - dialogs (the desktop app's forms and menu windows) and the
 * printable documents (report, invoice, receipt).
 */
(function (PL) {
  'use strict';

  const { S, svc, q } = { S: PL.store.S, svc: PL.store.svc, q: PL.store.q };
  const { esc, money, fdate, fdt, fdtShort, badge, form, modal, alertBox, confirmBox, toast, table, printHtml, card } = PL.ui;
  const { label, patientById, patientName, doctorById, orderById, orderTotals, testByCode, computeFlag, rangeText, isCritical, ageYears, priceOf, defaultPriceList, todayKey, DEPARTMENTS, KINDS, CONTAINER, PERM_GROUPS, ROLES, DomainError } = PL.store;
  const EXPENSE_CATEGORIES = ['Reagents', 'Consumables', 'Salaries', 'Rent', 'Utilities', 'Equipment maintenance', 'Courier / transport', 'Marketing', 'Other'];
  const PAY_METHODS = [['CASH', 'Cash'], ['CARD', 'Card'], ['UPI', 'UPI'], ['CHEQUE', 'Cheque'], ['BANK_TRANSFER', 'Bank transfer']];
  const opts = (list, selected, blank) => (blank != null ? [['', blank]] : []).concat(list)
    .map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(selected == null ? '' : selected) ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const nowDate = () => new Date().toISOString().slice(0, 10);

  // ---- generic helpers ------------------------------------------------------
  // Tabbed dialog. Inputs carry data-k="path.to.key" and are read back on save.
  function tabbed({ title, width = 640, tabs, onSave, saveLabel = 'Save' }) {
    const head = `<div class="tabs">${tabs.map((t, i) => `<button type="button" class="tab ${i ? '' : 'on'}" data-tab="${i}">${esc(t.title)}</button>`).join('')}</div>`;
    const panes = tabs.map((t, i) => `<div class="pane" ${i ? 'hidden' : ''} data-pane="${i}">${t.html}</div>`).join('');
    const ctx = modal({
      title, width, body: head + panes + '<div class="form-error" hidden></div>', buttons: [
        { label: 'Cancel' },
        {
          label: saveLabel, primary: true, onClick: (c) => {
            const values = readAll(c.body);
            const err = c.body.querySelector('.form-error');
            try { onSave(values, c); c.close(); } catch (e) {
              if (!(e instanceof DomainError)) throw e;
              err.textContent = e.message; err.hidden = false;
            }
          },
        },
      ],
    });
    ctx.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      ctx.body.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
      ctx.body.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    });
    return ctx;
  }
  function readAll(root) {
    const out = {};
    root.querySelectorAll('[data-k]').forEach((el) => {
      const path = el.dataset.k.split('.');
      let obj = out;
      path.slice(0, -1).forEach((p) => { obj[p] = obj[p] || {}; obj = obj[p]; });
      obj[path[path.length - 1]] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }
  const ctl = (path, value, o = {}) => {
    const cls = o.full ? 'field full' : 'field';
    const v = value == null ? '' : value;
    let input;
    if (o.select) input = `<select data-k="${path}">${opts(o.select, v, o.blank)}</select>`;
    else if (o.textarea) input = `<textarea data-k="${path}" rows="${o.rows || 3}">${esc(v)}</textarea>`;
    else input = `<input data-k="${path}" type="${o.type || 'text'}" value="${esc(v)}" ${o.step ? `step="${o.step}"` : 'step="any"'} placeholder="${esc(o.placeholder || '')}">`;
    return `<label class="${cls}"><span>${esc(o.label)}${o.required ? ' *' : ''}</span>${input}</label>`;
  };
  const check = (path, value, text) => `<label class="check full"><input type="checkbox" data-k="${path}" ${value ? 'checked' : ''}> ${esc(text)}</label>`;

  // A list with per-row action buttons that re-renders in place.
  function listDialog({ title, width = 640, load, cols, row, actions, addLabel, onAdd, footerNote }) {
    const ctx = modal({ title, width, body: '<div class="list-host"></div>', buttons: [{ label: 'Close', primary: true }] });
    const host = ctx.body.querySelector('.list-host');
    const draw = () => {
      const items = load();
      const rows = items.map((it) => ({
        id: it.id,
        cells: row(it).concat([`<span class="row-actions">${actions.map((a, i) =>
          `<button class="${a.danger ? 'danger' : ''}" data-i="${i}" data-id="${esc(it.id)}">${esc(a.label(it))}</button>`).join('')}</span>`]),
      }));
      host.innerHTML = (onAdd ? `<div class="toolbar-row"><button class="primary" data-add>${esc(addLabel)}</button></div>` : '') +
        table({ id: 'list-' + title.replace(/\W/g, ''), cols: cols.concat([{ h: '' }]), rows }) +
        (footerNote ? `<p class="muted small">${esc(footerNote)}</p>` : '');
    };
    ctx.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]') && onAdd) { onAdd(() => draw()); return; }
      const b = e.target.closest('[data-i]');
      if (b) {
        const item = load().find((x) => String(x.id) === b.dataset.id);
        const a = actions[Number(b.dataset.i)];
        if (item) a.onClick(item, () => draw());
      }
    });
    draw();
    return ctx;
  }

  // ---- patients ------------------------------------------------------------------
  function patientForm(p) {
    form({
      title: p ? 'Edit Patient' : 'Register Patient', width: 560,
      fields: [
        { name: 'firstName', label: 'First name', required: true, value: p ? p.firstName : '' },
        { name: 'lastName', label: 'Last name', value: p ? p.lastName : '' },
        { name: 'gender', label: 'Gender', type: 'select', required: true, value: p ? p.gender : 'M', options: [['M', 'Male'], ['F', 'Female'], ['O', 'Other']] },
        { name: 'age', label: 'Age (years)', type: 'number', min: 0, max: 120, value: p && !p.dob ? p.age : '' },
        { name: 'dob', label: 'Date of birth (optional, overrides age)', type: 'date', value: p ? p.dob : '' },
        { name: 'phone', label: 'Phone', value: p ? p.phone : '' },
        { name: 'email', label: 'E-mail', value: p ? p.email : '' },
        { name: 'bloodGroup', label: 'Blood group', type: 'select', value: p ? p.bloodGroup : '', options: [['', '-'], ...['A Positive', 'A Negative', 'B Positive', 'B Negative', 'AB Positive', 'AB Negative', 'O Positive', 'O Negative'].map((x) => [x, x])] },
        { name: 'address', label: 'Address', type: 'textarea', full: true, value: p ? p.address : '' },
        { name: 'whatsappConsent', label: 'WhatsApp messages', type: 'select', full: true, value: p && p.whatsappConsent ? '1' : '0',
          options: [['0', 'Not agreed (no WhatsApp messages)'], ['1', 'Patient agrees to receive WhatsApp messages']] },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, value: p ? p.notes : '' },
      ],
      onSubmit: (v) => {
        const saved = svc.savePatient(v, p ? p.id : null);
        toast(p ? 'Patient updated' : `Registered ${saved.mrn}`, 'ok');
        PL.app.setSel('patients', saved.id);
        PL.app.refresh();
        if (!p) {
          confirmBox('Order tests?', `${patientName(saved)} has been registered.\n\nCreate an order now?`, { ok: 'Create order' })
            .then((yes) => { if (yes) newOrder(saved.id); });
        }
      },
    });
  }

  // ---- orders -----------------------------------------------------------------------
  function newOrder(patientId) {
    if (!S.patients.length) { alertBox('New Order', 'Register a patient first.', 'warn'); return; }
    const plist = defaultPriceList();
    const testRows = (filter) => DEPARTMENTS.concat(['Panels'])
      .map((dept) => {
        const list = S.tests.filter((t) => t.active && (dept === 'Panels' ? t.kind === 'panel' : t.dept === dept && t.kind !== 'panel'));
        if (!list.length) return '';
        return `<div class="grp" data-grp="${esc(dept)}"><div class="grp-title">${esc(dept)}</div>` +
          list.map((t) => `<label class="pick" data-name="${esc((t.name + ' ' + t.code).toLowerCase())}">` +
            `<input type="checkbox" data-test="${t.code}" data-price="${priceOf(t, plist)}"> <span>${esc(t.name)}</span>` +
            `<span class="muted small">${esc(t.code)}</span><span class="num">${money(priceOf(t, plist))}</span></label>`).join('') + '</div>';
      }).join('');
    const pkgRows = S.packages.filter((p) => p.active !== false).map((p) => `<label class="pick" data-name="${esc(p.name.toLowerCase())}">` +
      `<input type="checkbox" data-pkg="${p.id}" data-price="${p.price}"> <span><b>${esc(p.name)}</b></span>` +
      `<span class="muted small">${p.tests.length} test(s)</span><span class="num">${money(p.price)}</span></label>`).join('');
    const body = `<div class="order-form">` +
      `<div class="form-grid">` +
      `<label class="field full"><span>Patient *</span><select id="no-patient">${opts(S.patients.slice().sort((a, b) => b.id - a.id)
        .map((p) => [p.id, `${p.mrn} - ${patientName(p)} (${ageYears(p)}Y/${p.gender})`]), patientId, 'Choose a patient')}</select></label>` +
      ctl('doctorId', '', { label: 'Referred by', select: S.doctors.map((d) => [d.id, d.name]), blank: 'Self / walk-in' }) +
      ctl('centreId', 1, { label: 'Collection centre', select: S.centres.map((c) => [c.id, c.name]) }) +
      ctl('branchId', 1, { label: 'Branch', select: S.branches.map((b) => [b.id, b.name]) }) +
      ctl('priceListId', plist.id, { label: 'Price list', select: S.priceLists.map((p) => [p.id, p.name]) }) +
      ctl('priority', 'ROUTINE', { label: 'Priority', select: [['ROUTINE', 'Routine'], ['URGENT', 'Urgent'], ['STAT', 'STAT']] }) +
      ctl('slot', '', { label: 'Home collection slot (if collected at home)', blank: 'Not a home collection',
        select: ['07:00-09:00', '09:00-11:00', '11:00-13:00', '16:00-18:00'].map((x) => [x, x]) }) +
      ctl('collectAddress', '', { label: 'Collection address (blank = patient address)', full: false }) +
      ctl('clinicalHistory', '', { label: 'Clinical history', textarea: true, full: true, rows: 2 }) +
      `</div>` +
      `<div class="split-2 gap-top">` +
      `<div><div class="pick-head"><b>Investigations</b><input id="no-filter" class="search" placeholder="Filter tests..."></div>` +
      `<div class="pick-list" id="no-tests">${testRows()}</div></div>` +
      `<div><div class="pick-head"><b>Health packages</b></div><div class="pick-list" id="no-pkgs">${pkgRows || '<p class="muted">No packages.</p>'}</div>` +
      `<div class="totals card-body" id="no-totals"></div></div></div>` +
      `<div class="form-grid gap-top">` +
      ctl('discount', 0, { label: 'Discount', type: 'number', step: '0.01' }) +
      ctl('paid', 0, { label: 'Amount paid now', type: 'number', step: '0.01' }) +
      ctl('method', 'CASH', { label: 'Payment mode', select: PAY_METHODS }) +
      ctl('reference', '', { label: 'Reference' }) +
      `</div></div>`;
    const ctx = modal({
      title: 'New Order', width: 920, body, buttons: [
        { label: 'Cancel' },
        {
          label: 'Register order', primary: true, onClick: (c) => {
            const root = c.body;
            const val = (k) => (root.querySelector(`[data-k="${k}"]`) || {}).value;
            const testCodes = [...root.querySelectorAll('[data-test]:checked')].map((el) => el.dataset.test);
            const packageIds = [...root.querySelectorAll('[data-pkg]:checked')].map((el) => Number(el.dataset.pkg));
            const err = root.querySelector('.form-error');
            try {
              const order = svc.createOrder({
                patientId: Number(root.querySelector('#no-patient').value), doctorId: val('doctorId'), centreId: val('centreId'),
                branchId: val('branchId'), priceListId: val('priceListId'), priority: val('priority'),
                clinicalHistory: val('clinicalHistory'), slot: val('slot'), collectAddress: val('collectAddress'),
                testCodes, packageIds, discount: val('discount'),
                paid: val('paid'), method: val('method'), reference: val('reference'),
              });
              c.close();
              toast(`Order ${order.orderNo} created`, 'ok');
              PL.app.setSel('orders', order.id);
              PL.app.go('results', order.id);
            } catch (e) {
              if (!(e instanceof DomainError)) throw e;
              err.textContent = e.message; err.hidden = false;
            }
          },
        },
      ],
    });
    const recalc = () => {
      const root = ctx.body;
      const selected = [...root.querySelectorAll('[data-test]:checked, [data-pkg]:checked')];
      const gross = selected.reduce((a, el) => a + Number(el.dataset.price || 0), 0);
      const discount = Number(root.querySelector('[data-k="discount"]').value) || 0;
      const net = gross - discount;
      root.querySelector('#no-totals').innerHTML = `<table class="kv">` +
        `<tr><td>Items selected</td><td class="al-right">${selected.length}</td></tr>` +
        `<tr><td>Gross</td><td class="al-right">${money(gross)}</td></tr>` +
        `<tr><td>Net payable</td><td class="al-right"><b>${money(net)}</b></td></tr></table>`;
    };
    ctx.body.addEventListener('change', recalc);
    ctx.body.addEventListener('input', (e) => {
      if (e.target.id === 'no-filter') {
        const term = e.target.value.trim().toLowerCase();
        ctx.body.querySelectorAll('#no-tests .pick').forEach((p) => { p.hidden = term && !p.dataset.name.includes(term); });
        ctx.body.querySelectorAll('#no-tests .grp').forEach((g) => { g.hidden = !g.querySelector('.pick:not([hidden])'); });
      }
      if (e.target.matches('[data-k="discount"]')) recalc();
    });
    recalc();
  }

  function receivePayment(orderId) {
    const o = orderById(orderId);
    const t = orderTotals(o);
    form({
      title: `Receive Payment - ${o.orderNo}`, width: 460,
      note: `Balance due: ${money(t.balance)}`,
      fields: [
        { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true, value: t.balance.toFixed(2) },
        { name: 'method', label: 'Payment mode', type: 'select', value: 'CASH', options: PAY_METHODS },
        { name: 'reference', label: 'Reference (UPI id, cheque no., ...)', full: true },
      ],
      submit: 'Receive',
      onSubmit: (v) => {
        const p = svc.receivePayment(o.id, v.amount, v.method, v.reference);
        toast(`Received ${money(p.amount)} - ${p.receipt}`, 'ok');
        PL.app.refresh();
      },
    });
  }

  function notifyCritical(orderId, code) {
    const o = orderById(orderId);
    const def = testByCode(code);
    form({
      title: `Record critical notification - ${def.name}`, width: 480,
      note: `${o.orderNo}: ${o.results[code] ? o.results[code].value + ' ' + def.unit : ''}`,
      fields: [
        { name: 'to', label: 'Told (name of the doctor or patient)', required: true, full: true, value: (doctorById(o.doctorId) || {}).name || '' },
        { name: 'method', label: 'How', type: 'select', value: 'Phone', options: ['Phone', 'In person', 'E-mail', 'Message'].map((x) => [x, x]) },
        { name: 'note', label: 'Note', type: 'textarea', full: true, rows: 2 },
      ],
      submit: 'Record notification',
      onSubmit: (v) => { svc.notifyCritical(o.id, code, v); toast('Notification recorded', 'ok'); PL.app.refresh(); },
    });
  }

  function criticalAlert(order, names) {
    const codes = names.map((n) => (S.tests.find((t) => t.name === n) || {}).code).filter(Boolean);
    const body = `<p class="msg">Critical result${names.length > 1 ? 's' : ''} for <b>${esc(order.orderNo)}</b>: ${esc(names.join(', '))}.</p>` +
      `<p class="muted">Critical values must be communicated to the referring doctor or patient and recorded.</p>`;
    modal({ title: 'Critical result', width: 460, body, buttons: [
      { label: 'Later' },
      { label: 'Record notification', primary: true, onClick: (c) => { c.close(); if (codes[0]) notifyCritical(order.id, codes[0]); } },
    ] });
  }

  // ---- catalogue ---------------------------------------------------------------------
  function editTest(code) {
    const t = code ? testByCode(code) : null;
    const rangeRow = (r = {}) => `<tr class="rr">` +
      `<td><select data-f="g">${opts([['M', 'Male'], ['F', 'Female']], r.g || '', 'Any')}</select></td>` +
      `<td><input data-f="lo" type="number" step="any" value="${esc(r.lo ?? '')}"></td>` +
      `<td><input data-f="hi" type="number" step="any" value="${esc(r.hi ?? '')}"></td>` +
      `<td><input data-f="cl" type="number" step="any" value="${esc(r.cl ?? '')}"></td>` +
      `<td><input data-f="ch" type="number" step="any" value="${esc(r.ch ?? '')}"></td>` +
      `<td><input data-f="printed" value="${esc(r.printed || '')}"></td>` +
      `<td><button type="button" class="danger" data-del>×</button></td></tr>`;
    const defHtml = `<div class="form-grid">` +
      ctl('code', t ? t.code : '', { label: 'Code', required: true }) +
      ctl('name', t ? t.name : '', { label: 'Name', required: true }) +
      ctl('dept', t ? t.dept : DEPARTMENTS[0], { label: 'Department', select: DEPARTMENTS.map((d) => [d, d]) }) +
      ctl('kind', t ? t.kind : 'quant', { label: 'Result type', select: Object.entries(KINDS) }) +
      ctl('unit', t ? t.unit : '', { label: 'Unit' }) +
      ctl('specimen', t ? t.specimen : 'Serum', { label: 'Specimen', select: Object.keys(CONTAINER).map((s) => [s, s]) }) +
      ctl('price', t ? t.price : 0, { label: 'Price', type: 'number' }) +
      ctl('tat', t ? t.tat : 24, { label: 'Turnaround (hours)', type: 'number' }) +
      ctl('choices', t && t.choices ? t.choices.join(', ') : '', { label: 'Choices (comma separated, for qualitative / semi-quantitative)', full: true }) +
      ctl('normal', t ? t.normal : '', { label: 'Normal value (text or one of the choices)' }) +
      ctl('children', t && t.children ? t.children.join(', ') : '', { label: 'Panel tests (codes, comma separated)', full: true }) +
      check('active', t ? t.active : true, 'Active (can be ordered)') +
      `</div>`;
    const ranges = t && t.ranges.length ? t.ranges : [{}];
    const rangeHtml = `<p class="muted small">Used for quantitative tests only. Leave Low or High blank for one-sided ranges.</p>` +
      `<table class="grid"><thead><tr><th>Gender</th><th>Low</th><th>High</th><th>Critical low</th><th>Critical high</th><th>Printed as</th><th></th></tr></thead>` +
      `<tbody id="rr-body">${ranges.map((r) => rangeRow(r)).join('')}</tbody></table>` +
      `<p><button type="button" data-add-range>Add range</button></p>`;
    const ctx = tabbed({
      title: t ? 'Edit Test' : 'New Test', width: 680,
      tabs: [{ title: 'Definition', html: defHtml }, { title: 'Reference ranges', html: rangeHtml }],
      onSave: (v) => {
        const values = {
          code: v.code, name: v.name, dept: v.dept, kind: v.kind, unit: v.unit, specimen: v.specimen,
          price: v.price, tat: v.tat, active: v.active,
          choices: v.choices ? v.choices.split(',').map((s) => s.trim()).filter(Boolean) : null,
          normal: v.normal, children: v.children ? v.children.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null,
        };
        if (values.kind === 'panel') {
          values.children = (values.children || []).filter((c) => testByCode(c) && testByCode(c).kind !== 'panel');
        }
        values.ranges = [...document.querySelectorAll('#rr-body .rr')].map((tr) => {
          const g = (f) => tr.querySelector(`[data-f="${f}"]`).value;
          const num = (x) => (x === '' ? null : Number(x));
          return { g: g('g') || null, lo: num(g('lo')), hi: num(g('hi')), cl: num(g('cl')), ch: num(g('ch')), printed: g('printed') };
        });
        svc.saveTest(values, code);
        toast('Test saved', 'ok');
        PL.app.refresh();
      },
    });
    ctx.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-range]')) {
        ctx.body.querySelector('#rr-body').insertAdjacentHTML('beforeend', rangeRow({}));
      }
      const del = e.target.closest('[data-del]');
      if (del) del.closest('tr').remove();
    });
  }

  // ---- lab operations -----------------------------------------------------------------
  function sendOut() {
    const open = S.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REPORTED');
    if (!open.length) { alertBox('Send test out', 'There are no open orders.', 'warn'); return; }
    const testsFor = (order) => (order ? order.tests.map((c) => [c, testByCode(c).name]) : []);
    const ctx = modal({
      title: 'Send test out', width: 480,
      body: `<div class="form-grid">` +
        ctl('orderId', open[0].id, { label: 'Order', select: open.map((o) => [o.id, `${o.orderNo} - ${patientName(patientById(o.patientId))}`]), full: true }) +
        ctl('testCode', '', { label: 'Test', select: testsFor(open[0]), full: true }) +
        ctl('lab', '', { label: 'Partner laboratory', required: true, full: true }) +
        ctl('reference', '', { label: 'Their reference' }) +
        ctl('expected', '', { label: 'Expected back', type: 'date' }) +
        ctl('cost', 0, { label: 'Cost to us', type: 'number' }) +
        `</div><div class="form-error" hidden></div>`,
      buttons: [{ label: 'Cancel' }, {
        label: 'Send', primary: true, onClick: (c) => {
          const v = readAll(c.body);
          try {
            svc.sendOut({ ...v, orderId: Number(v.orderId) });
            c.close(); toast('Sent to partner laboratory', 'ok'); PL.app.refresh();
          } catch (e) {
            if (!(e instanceof DomainError)) throw e;
            const err = c.body.querySelector('.form-error'); err.textContent = e.message; err.hidden = false;
          }
        },
      }],
    });
    const orderSel = ctx.body.querySelector('[data-k="orderId"]');
    orderSel.addEventListener('change', () => {
      const o = orderById(Number(orderSel.value));
      ctx.body.querySelector('[data-k="testCode"]').innerHTML = opts(testsFor(o), '');
    });
  }

  function item(it) {
    form({
      title: it ? 'Edit Item' : 'New Inventory Item', width: 480,
      fields: [
        { name: 'code', label: 'Code', required: true, value: it ? it.code : '' },
        { name: 'name', label: 'Item', required: true, value: it ? it.name : '', full: true },
        { name: 'unit', label: 'Unit (e.g. test, vial, ml)', value: it ? it.unit : 'pcs' },
        { name: 'reorder', label: 'Reorder when at or below', type: 'number', value: it ? it.reorder : 10 },
      ],
      onSubmit: (v) => { svc.saveItem(v, it ? it.id : null); toast('Item saved', 'ok'); PL.app.refresh(); },
    });
  }
  function stockIn(it) {
    form({
      title: `Receive stock - ${it.name}`, width: 460,
      fields: [
        { name: 'lot', label: 'Lot number', required: true },
        { name: 'expiry', label: 'Expiry date', type: 'date', required: true },
        { name: 'qty', label: 'Quantity', type: 'number', required: true, value: 1 },
        { name: 'supplier', label: 'Supplier / invoice', full: true },
      ],
      submit: 'Receive',
      onSubmit: (v) => { svc.receiveStock(it.id, v); toast('Stock received', 'ok'); PL.app.refresh(); },
    });
  }
  function stockOut(it) {
    form({
      title: `Issue stock - ${it.name}`, width: 440,
      fields: [
        { name: 'qty', label: 'Quantity', type: 'number', required: true, value: 1 },
        { name: 'reason', label: 'Reason (sent to bench, wasted, ...)', full: true },
      ],
      submit: 'Issue',
      onSubmit: (v) => { svc.issueStock(it.id, v); toast('Stock issued', 'ok'); PL.app.refresh(); },
    });
  }
  function stockCount(it) {
    const onHand = it.lots.reduce((a, l) => a + l.qty, 0);
    form({
      title: `Correct count - ${it.name}`, width: 440,
      note: `Book count: ${onHand} ${it.unit}`,
      fields: [
        { name: 'counted', label: 'Counted quantity', type: 'number', required: true, value: onHand },
        { name: 'reason', label: 'Reason for the correction', required: true, full: true },
      ],
      submit: 'Save count',
      onSubmit: (v) => { svc.correctCount(it.id, v); toast('Count corrected', 'ok'); PL.app.refresh(); },
    });
  }
  function qcDialog() {
    const quant = S.tests.filter((t) => t.kind === 'quant');
    form({
      title: 'New QC Record', width: 520,
      note: 'z = (value - mean) / SD. Over 2 SD is flagged out of range; over 3 SD fails.',
      fields: [
        { name: 'test', label: 'Test', type: 'select', required: true, value: 'HB', options: quant.map((t) => [t.code, t.name]) },
        { name: 'level', label: 'Control level', type: 'select', value: 'Level 1', options: ['Level 1', 'Level 2', 'Level 3'].map((x) => [x, x]) },
        { name: 'value', label: 'Measured value', type: 'number', step: 'any', required: true },
        { name: 'mean', label: 'Target mean', type: 'number', step: 'any', required: true },
        { name: 'sd', label: 'Standard deviation', type: 'number', step: 'any', required: true },
        { name: 'date', label: 'Date', type: 'date', value: nowDate() },
        { name: 'note', label: 'Note', full: true },
      ],
      onSubmit: (v) => {
        const rec = svc.addQC(v);
        toast(`QC ${label(rec.status)} (z ${rec.z})`, rec.status === 'PASSED' ? 'ok' : 'warn');
        PL.app.refresh();
      },
    });
  }
  function equipmentDialog(e) {
    form({
      title: e ? 'Edit Equipment' : 'New Equipment', width: 540,
      fields: [
        { name: 'code', label: 'Code', required: true, value: e ? e.code : '' },
        { name: 'name', label: 'Name', required: true, value: e ? e.name : '' },
        { name: 'kind', label: 'Kind', value: e ? e.kind : 'Analyser' },
        { name: 'location', label: 'Location', value: e ? e.location : '' },
        { name: 'serial', label: 'Serial number', value: e ? e.serial : '' },
        { name: 'intervalDays', label: 'Calibration interval (days)', type: 'number', value: e ? e.intervalDays : 180 },
        { name: 'lastCal', label: 'Last calibrated', type: 'date', value: e ? e.lastCal : nowDate() },
        { name: 'active', label: 'Active', type: 'check', value: e ? e.active : true },
      ],
      onSubmit: (v) => { svc.saveEquipment(v, e ? e.id : null); toast('Equipment saved', 'ok'); PL.app.refresh(); },
    });
  }
  function equipmentLog(e) {
    form({
      title: `Log event - ${e.name}`, width: 460,
      fields: [
        { name: 'event', label: 'Event', type: 'select', required: true, value: 'Calibration', options: ['Calibration', 'Service', 'Repair', 'Verification', 'Maintenance', 'Other'].map((x) => [x, x]) },
        { name: 'date', label: 'Date', type: 'date', required: true, value: nowDate() },
        { name: 'note', label: 'Note', type: 'textarea', full: true, rows: 2 },
      ],
      onSubmit: (v) => { svc.logEquipment(e.id, v); toast('Event logged', 'ok'); PL.app.refresh(); },
    });
  }

  // ---- finance ------------------------------------------------------------------------
  function commissionRule() {
    const doc = S.doctors[0];
    form({
      title: 'Add / Change Commission Rule', width: 440,
      fields: [
        { name: 'doctorId', label: 'Doctor', type: 'select', required: true, value: doc ? doc.id : '', options: S.doctors.map((d) => [d.id, d.name]) },
        { name: 'pct', label: 'Commission on billed amount (%)', type: 'number', step: '0.1', required: true, value: doc ? doc.commission : 0 },
      ],
      onSubmit: (v) => { svc.setCommission(Number(v.doctorId), Number(v.pct)); toast('Rule saved', 'ok'); PL.app.refresh(); },
    });
  }
  function payout(doctorId) {
    const c = PL.store.commissionDue(doctorId, null, null);
    form({
      title: `Record Payout - ${doctorById(doctorId).name}`, width: 440,
      note: `Commission due: ${money(c.due)}`,
      fields: [
        { name: 'amount', label: 'Amount paid', type: 'number', step: '0.01', required: true, value: c.due.toFixed(2) },
        { name: 'date', label: 'Date', type: 'date', value: nowDate() },
        { name: 'note', label: 'Note', full: true },
      ],
      submit: 'Record payout',
      onSubmit: (v) => { svc.addPayout({ doctorId, ...v }); toast('Payout recorded', 'ok'); PL.app.refresh(); },
    });
  }
  function expense() {
    form({
      title: 'New Expense', width: 460,
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true, value: nowDate() },
        { name: 'category', label: 'Category', type: 'select', required: true, value: 'Reagents', options: EXPENSE_CATEGORIES.map((x) => [x, x]) },
        { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
        { name: 'note', label: 'Note', full: true },
      ],
      onSubmit: (v) => { svc.addExpense(v); toast('Expense saved', 'ok'); PL.app.refresh(); },
    });
  }

  // ---- printable documents --------------------------------------------------------------
  const lab = () => S.lab;
  function letterhead() {
    if (!S.report.letterhead) return '';
    return `<div class="rp-head"><div><div class="rp-lab">${esc(lab().name)}</div>` +
      `<div class="muted">${esc(lab().address)}</div><div class="muted">${esc(lab().phone)} &middot; ${esc(lab().email)}</div></div>` +
      `<div class="rp-title">Laboratory Report</div></div>`;
  }
  function reportHtml(rec) {
    const o = orderById(rec.orderId);
    const p = patientById(o.patientId);
    const doc = doctorById(o.doctorId);
    const provisional = rec.type === 'Provisional';
    const byDept = {};
    o.tests.forEach((c) => { const t = testByCode(c); (byDept[t.dept] = byDept[t.dept] || []).push(c); });
    const sections = Object.keys(byDept).sort((a, b) => DEPARTMENTS.indexOf(a) - DEPARTMENTS.indexOf(b)).map((dept) => {
      const rows = byDept[dept].map((c) => {
        const t = testByCode(c);
        const r = o.results[c];
        if (!r) return `<tr><td>${esc(t.name)}</td><td colspan="4" class="muted">Pending</td></tr>`;
        const flag = r.flag && r.flag !== 'NORMAL' && r.flag !== 'NOT_APPLICABLE' ? ` <b>${esc(PL.ui.FLAG_SYMBOL[r.flag] || '')}</b>` : '';
        const shown = t.kind === 'desc' || t.kind === 'text' ? esc(r.value).replace(/\n/g, '<br>') : esc(r.value) + flag;
        const prevLine = r.prev ? `<div class="muted small">Previous ${esc(r.prev.text)} (${esc(fdate(r.prev.at))})` +
          (r.delta != null ? `, change ${r.delta > 0 ? '+' : ''}${r.delta}%` : '') + '</div>' : '';
        return `<tr><td>${esc(t.name)}</td><td class="${isCritical(r.flag) ? 'crit' : ''}">${shown}${prevLine}</td>` +
          `<td>${esc(t.unit || '')}</td><td>${esc(rangeText(t, p))}</td><td>${esc(r.status === 'VERIFIED' ? 'Verified' : 'Entered')}</td></tr>`;
      }).join('');
      return `<h4>${esc(dept)}</h4><table class="rp-table"><thead><tr><th>Investigation</th><th>Result</th><th>Unit</th><th>Reference interval</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
    }).join('');
    const verifiedBy = o.tests.map((c) => o.results[c]).filter((r) => r && r.verifiedBy).map((r) => r.verifiedBy);
    const signer = verifiedBy.length ? [...new Set(verifiedBy)].join(', ') : '-';
    const sig = S.report.sections.signatures ? `<div class="rp-sign"><div><div class="rp-line"></div>Technician</div>` +
      `<div><div class="rp-line"></div>Verified by: ${esc(signer)}</div></div>` : '';
    const signedLine = rec.signature ? `<p class="small">Digital signature: <b class="mono">${esc(rec.signature)}</b>. ` +
      `Check it in PathoLab (Reports &gt; Verify signature).</p>` : '';
    return `<div class="rp-doc ${provisional ? 'provisional' : ''}">${provisional ? '<div class="rp-watermark">PROVISIONAL</div>' : ''}` +
      letterhead() +
      `<table class="rp-meta"><tr><td><b>Patient</b></td><td>${esc(patientName(p))}</td><td><b>MRN</b></td><td>${esc(p.mrn)}</td></tr>` +
      `<tr><td><b>Age / Sex</b></td><td>${esc(ageYears(p))} years / ${esc(p.gender)}</td><td><b>Order</b></td><td>${esc(o.orderNo)}</td></tr>` +
      (S.report.sections.referrer ? `<tr><td><b>Referred by</b></td><td>${esc(doc ? doc.name : 'Self')}</td>` : '<tr><td></td><td></td>') +
      `<td><b>Registered</b></td><td>${esc(fdt(o.registeredAt))}</td></tr>` +
      `<tr><td><b>Report type</b></td><td>${esc(rec.type)}</td><td><b>Reported</b></td><td>${esc(fdt(rec.at))}</td></tr></table>` +
      (S.report.sections.clinicalHistory && o.clinicalHistory ? `<p><b>Clinical history:</b> ${esc(o.clinicalHistory)}</p>` : '') +
      sections + sig + signedLine + `<p class="rp-foot">${esc(S.report.footer)}</p></div>`;
  }
  // GST: catalogue prices include GST. The invoice splits the net into taxable value and
  // equal CGST and SGST (intra-state). A rate of 0 turns the breakdown off.
  function gstBreakdown(net, rate) {
    const r2 = (n) => Math.round(n * 100) / 100;
    const taxable = rate > 0 ? r2(net / (1 + rate / 100)) : net;
    const tax = r2(net - taxable);
    const cgst = r2(tax / 2);
    return { taxable, tax, cgst, sgst: r2(tax - cgst), rate }; // SGST takes the remainder so the parts add up
  }
  function invoiceHtml(o) {
    const p = patientById(o.patientId);
    const t = orderTotals(o);
    const g = gstBreakdown(o.net, Number(S.lab.gstRate) || 0);
    const gstRows = g.rate > 0
      ? `<tr><td>Taxable value</td><td class="al-right">${money(g.taxable)}</td></tr>` +
        `<tr><td>CGST @ ${g.rate / 2}%</td><td class="al-right">${money(g.cgst)}</td></tr>` +
        `<tr><td>SGST @ ${g.rate / 2}%</td><td class="al-right">${money(g.sgst)}</td></tr>`
      : '';
    const gstHead = g.rate > 0
      ? `<tr><td><b>GSTIN</b></td><td>${esc(S.lab.gstin || '-')}</td><td><b>SAC</b></td><td>${esc(S.lab.sac || '-')}</td></tr>` : '';
    return `<div class="rp-doc">${letterhead()}<div class="rp-title">${g.rate > 0 ? 'Tax Invoice' : 'Invoice'}</div>` +
      `<table class="rp-meta"><tr><td><b>Invoice for</b></td><td>${esc(patientName(p))} (${esc(p.mrn)})</td><td><b>Invoice no.</b></td><td>INV-${esc(o.orderNo)}</td></tr>` +
      `<tr><td><b>Order</b></td><td>${esc(o.orderNo)}</td><td><b>Date</b></td><td>${esc(fdt(o.registeredAt))}</td></tr>` +
      `<tr><td><b>Status</b></td><td>${esc(label(t.payment))}</td><td></td><td></td></tr>${gstHead}</table>` +
      `<table class="rp-table"><thead><tr><th>Item</th><th class="al-right">Amount</th></tr></thead><tbody>` +
      o.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="al-right">${money(l.price)}</td></tr>`).join('') +
      `<tr><td>Gross</td><td class="al-right">${money(o.gross)}</td></tr>` +
      `<tr><td>Discount</td><td class="al-right">${money(-o.discount)}</td></tr>` +
      `<tr><td><b>Net payable${g.rate > 0 ? ' (incl. GST)' : ''}</b></td><td class="al-right"><b>${money(o.net)}</b></td></tr>` +
      gstRows +
      `<tr><td>Paid</td><td class="al-right">${money(t.paid)}</td></tr>` +
      `<tr><td><b>Balance</b></td><td class="al-right"><b>${money(t.balance)}</b></td></tr></tbody></table>` +
      `<p class="rp-foot">${esc(S.report.footer)}</p></div>`;
  }
  function receiptHtml(o, pay) {
    const p = patientById(o.patientId);
    const t = orderTotals(o);
    return `<div class="rp-doc">${letterhead()}<div class="rp-title">Payment Receipt</div>` +
      `<table class="rp-meta"><tr><td><b>Receipt</b></td><td>${esc(pay.receipt)}</td><td><b>Date</b></td><td>${esc(fdt(pay.at))}</td></tr>` +
      `<tr><td><b>Received from</b></td><td>${esc(patientName(p))}</td><td><b>Order</b></td><td>${esc(o.orderNo)}</td></tr>` +
      `<tr><td><b>Mode</b></td><td>${esc(label(pay.method))}</td><td><b>Reference</b></td><td>${esc(pay.ref || '-')}</td></tr></table>` +
      `<p class="big">Amount received: <b>${money(pay.amount)}</b></p>` +
      `<p>Balance on order: ${money(t.balance)}</p><p class="rp-foot">${esc(S.report.footer)}</p></div>`;
  }
  function reportPreview(rec) {
    modal({
      title: `${rec.type} report - ${rec.orderNo}`, width: 820,
      body: `<div class="paper-scroll"><div class="paper">${reportHtml(rec)}</div></div>`,
      buttons: [
        { label: 'Close' },
        { label: 'Print / Save as PDF', primary: true, onClick: () => printHtml(reportHtml(rec)) },
      ],
    });
  }

  // A flagged delta (change from the previous verified result beyond the limit) needs a comment before verification.
  function deltaComment(o, codes) {
    const rows = codes.map((code) => {
      const def = testByCode(code);
      const r = o.results[code];
      const prev = r.prev ? r.prev.text : '-';
      return `<div class="field full"><span>${esc(def.name)}: ${esc(prev)} &rarr; ${esc(r.value)} ` +
        `(${r.delta > 0 ? '+' : ''}${r.delta}%)</span>` +
        `<textarea data-cmt="${esc(code)}" rows="2" placeholder="Why did this change? e.g. repeat sample confirmed, clinical update"></textarea></div>`;
    }).join('');
    modal({
      title: 'Delta check - comment required', width: 560,
      body: `<p class="muted">These results differ from the patient's previous verified result by more than the allowed limit. ` +
        `Add a comment for each one, then verify.</p><div class="form-grid">${rows}</div><div class="form-error" hidden></div>`,
      buttons: [{ label: 'Cancel' }, {
        label: 'Save comments and verify', primary: true, onClick: (c) => {
          const err = c.body.querySelector('.form-error');
          const comments = {};
          c.body.querySelectorAll('[data-cmt]').forEach((el) => { comments[el.dataset.cmt] = el.value.trim(); });
          if (codes.some((code) => !comments[code])) { err.textContent = 'Enter a comment for every flagged result.'; err.hidden = false; return; }
          try {
            svc.saveResults(o.id, codes.map((code) => ({ code, value: o.results[code].value, comment: comments[code] })));
            const n = svc.verifyResults(o.id);
            c.close(); toast(`Verified ${n} result(s)`, 'ok'); PL.app.refresh();
          } catch (e) {
            if (!(e instanceof DomainError)) throw e;
            err.textContent = e.message; err.hidden = false;
          }
        },
      }],
    });
  }

  // ---- WhatsApp and cloud database (simulated in the demo) ------------------------------
  function whatsappDialog() {
    const w = S.whatsapp;
    const logHtml = () => table({ id: 'wa-log', empty: 'No messages yet.',
      cols: [{ h: 'When' }, { h: 'Order' }, { h: 'Template' }, { h: 'To' }, { h: 'Status' }, { h: 'Detail' }],
      rows: S.messages.slice().reverse().slice(0, 50).map((m) => ({ id: m.id, cells: [
        esc(fdt(m.at)), esc(m.orderNo || '-'), `<span class="muted mono">${esc(m.template)}</span>`, esc(m.to),
        m.status === 'SENT' ? badge('Sent', 'OK') : badge(label(m.status), 'muted'), `<span class="small">${esc(m.detail)}</span>`] })) });
    const ctx = tabbed({
      title: 'WhatsApp Messaging', width: 760,
      tabs: [
        { title: 'Connection', html: `<div class="form-grid">` +
          check('wa.enabled', w.enabled, 'Send WhatsApp messages (only to patients who agreed)') +
          ctl('wa.phoneNumberId', w.phoneNumberId, { label: 'Phone number ID (from Meta)' }) +
          ctl('wa.apiVersion', w.apiVersion, { label: 'Graph API version' }) +
          ctl('wa.countryCode', w.countryCode, { label: 'Default country code (without +)' }) +
          ctl('wa.language', w.language, { label: 'Template language' }) +
          `<p class="muted full small">The access token is kept in Windows Credential Manager on the desktop. It is never stored in settings or in the message log. This demo does not contact Meta.</p></div>` },
        { title: 'Templates', html: `<div class="form-grid">` +
          ctl('wa.templateReport', w.templateReport, { label: 'Report ready template', full: true }) +
          ctl('wa.templatePayment', w.templatePayment, { label: 'Payment reminder template', full: true }) +
          check('wa.sendReportPdf', w.sendReportPdf, 'Allow sending report PDFs (they contain results) to patients who agreed') +
          ctl('wa.templateDocument', w.templateDocument, { label: 'Report PDF template (document header)', full: true }) +
          `<p class="muted full small">Templates must be approved in Meta Business Manager. The report-ready message carries only the patient's first name, order number and lab name. A report PDF is sent only when the switch above is on, one report at a time, after confirmation.</p></div>` },
        { title: 'Test & log', html: `<div class="form-grid">` +
          ctl('test.phone', '', { label: 'Test phone number (saved settings are used)', full: true, placeholder: 'e.g. 98765 43210' }) +
          `</div><div class="toolbar-row"><button type="button" data-wa-test>Send test message</button></div>` +
          `<div class="wa-log" data-wa-log>${logHtml()}</div>` },
      ],
      onSave: (v) => { svc.saveWhatsapp(v.wa); toast('WhatsApp settings saved', 'ok'); },
    });
    ctx.body.addEventListener('click', (e) => {
      if (!e.target.closest('[data-wa-test]')) return;
      const err = ctx.body.querySelector('.form-error');
      try {
        const id = svc.testWhatsapp(ctx.body.querySelector('[data-k="test.phone"]').value);
        toast(`Test message sent (${id})`, 'ok');
        ctx.body.querySelector('[data-wa-log]').innerHTML = logHtml();
        err.hidden = true;
      } catch (ex) {
        if (!(ex instanceof DomainError)) throw ex;
        err.textContent = ex.message; err.hidden = false;
      }
    });
  }

  function cloudSyncDialog() {
    const cfg = S.sync;
    const ctx = tabbed({
      title: 'Cloud Database & Sync', width: 680,
      tabs: [
        { title: 'Server', html: `<div class="form-grid">` +
          ctl('sync.engine', cfg.engine, { label: 'Database engine', select: [['postgresql', 'PostgreSQL'], ['mysql', 'MySQL / MariaDB']] }) +
          check('sync.tls', cfg.tls, 'Require TLS (recommended for any server reached over the internet)') +
          ctl('sync.host', cfg.host, { label: 'Host name or IP address', full: true, placeholder: 'e.g. 192.168.1.20 or db.example.com' }) +
          ctl('sync.port', cfg.port, { label: 'Port', type: 'number', step: '1' }) +
          ctl('sync.database', cfg.database, { label: 'Database name' }) +
          ctl('sync.user', cfg.user, { label: 'User name', full: true }) +
          `<p class="muted full small">Every branch uses the same server and database. The password is stored in Windows Credential Manager on each computer, not in the settings file. This demo does not connect to any server.</p></div>` },
        { title: 'Status', html: `<div class="stack"><table class="kv">` +
          `<tr><td>Mode</td><td>Local SQLite database, kept in step with the cloud database</td></tr>` +
          `<tr><td>Schedule</td><td>At startup, then every hour while the app is open</td></tr>` +
          `<tr><td>Last sync</td><td>${cfg.lastSync ? esc(fdt(cfg.lastSync)) : 'Never'}</td></tr>` +
          `<tr><td>Last result</td><td>${esc(cfg.lastResult || '-')}</td></tr></table>` +
          `<div class="toolbar-row"><button type="button" data-sync-test>Test connection</button>` +
          `<button type="button" class="primary" data-sync-now>Sync now</button></div>` +
          `<p class="muted small" data-sync-out></p></div>` },
      ],
      onSave: (v) => { svc.saveSync(v.sync); toast('Cloud database settings saved', 'ok'); },
    });
    ctx.body.addEventListener('click', (e) => {
      const out = ctx.body.querySelector('[data-sync-out]');
      const run = (fn) => {
        try { out.textContent = fn(); } catch (ex) { if (!(ex instanceof DomainError)) throw ex; out.textContent = ex.message; }
      };
      if (e.target.closest('[data-sync-test]')) run(() => svc.testSync());
      if (e.target.closest('[data-sync-now]')) run(() => { const msg = svc.syncNow(); toast('Sync finished (demo)', 'ok'); return msg; });
    });
  }

  // ---- lab settings and menu windows ---------------------------------------------------
  function settings() {
    const ctx = tabbed({
      title: 'Settings', width: 640,
      tabs: [
        { title: 'Laboratory', html: `<div class="form-grid">` + ctl('lab.name', S.lab.name, { label: 'Laboratory name', full: true }) +
          ctl('lab.address', S.lab.address, { label: 'Address', full: true, textarea: true, rows: 2 }) +
          ctl('lab.phone', S.lab.phone, { label: 'Phone' }) + ctl('lab.email', S.lab.email, { label: 'E-mail' }) +
          ctl('lab.currency', S.lab.currency, { label: 'Currency', select: [['INR', 'Indian rupee (INR)'], ['USD', 'US dollar (USD)'], ['EUR', 'Euro (EUR)'], ['AED', 'UAE dirham (AED)']] }) +
          ctl('lab.gstin', S.lab.gstin || '', { label: 'GSTIN (shown on invoices)' }) +
          ctl('lab.gstRate', S.lab.gstRate ?? 18, { label: 'GST rate on tests (%, 0 = no GST)', type: 'number' }) +
          ctl('lab.sac', S.lab.sac || '9993', { label: 'SAC code' }) + `</div>` },
        { title: 'Reports', html: `<div class="form-grid">` + check('report.letterhead', S.report.letterhead, 'Print letterhead') +
          ctl('report.footer', S.report.footer, { label: 'Footer text', textarea: true, full: true, rows: 2 }) +
          check('report.sections.clinicalHistory', S.report.sections.clinicalHistory, 'Show clinical history') +
          check('report.sections.referrer', S.report.sections.referrer, 'Show referring doctor') +
          check('report.sections.signatures', S.report.sections.signatures, 'Show signature lines') + `</div>` },
        { title: 'Email Configuration', html: `<div class="form-grid">` + ctl('email.host', S.email.host, { label: 'SMTP host' }) +
          ctl('email.port', S.email.port, { label: 'Port', type: 'number' }) + ctl('email.from', S.email.from, { label: 'From address', full: true }) +
          ctl('email.user', S.email.user, { label: 'User name' }) + check('email.tls', S.email.tls, 'Use TLS') +
          `</div><p class="muted small">Demo: these values are stored but no e-mail is sent.</p>` },
        { title: 'Application', html: `<div class="form-grid">` + check('app.backupEnabled', S.app.backupEnabled, 'Automatic backup enabled') +
          ctl('app.backupTime', S.app.backupTime, { label: 'Backup time (HH:MM)' }) + ctl('app.backupKeep', S.app.backupKeep, { label: 'Backups to keep', type: 'number' }) +
          check('app.backupOnExit', S.app.backupOnExit, 'Back up when the window closes') + `</div>` },
      ],
      onSave: (v) => {
        Object.assign(S.lab, v.lab);
        S.lab.currency = v.lab.currency;
        S.lab.gstRate = Math.min(100, Math.max(0, Number(v.lab.gstRate) || 0));
        S.report = { ...S.report, letterhead: !!v.report.letterhead, footer: v.report.footer, sections: { ...S.report.sections, ...v.report.sections } };
        S.email = { ...S.email, ...v.email, port: Number(v.email.port) || 587, tls: !!v.email.tls };
        S.app = { ...S.app, backupEnabled: !!v.app.backupEnabled, backupTime: v.app.backupTime, backupKeep: Number(v.app.backupKeep) || 10, backupOnExit: !!v.app.backupOnExit };
        PL.store.save();
        PL.app.applyLab();
        toast('Settings saved', 'ok');
      },
    });
    return ctx;
  }

  function reportDesigner() {
    tabbed({
      title: 'Report Designer', width: 680,
      tabs: [
        { title: 'Letterhead', html: `<div class="form-grid">` + check('report.letterhead', S.report.letterhead, 'Print the laboratory letterhead at the top') +
          `<p class="muted full">The letterhead uses the laboratory name, address and contact details from Settings &gt; Laboratory.</p></div>` },
        { title: 'Sections', html: `<div class="form-grid">` + check('report.sections.clinicalHistory', S.report.sections.clinicalHistory, 'Clinical history') +
          check('report.sections.referrer', S.report.sections.referrer, 'Referring doctor') +
          check('report.sections.reference', S.report.sections.reference, 'Reference intervals') +
          check('report.sections.signatures', S.report.sections.signatures, 'Signature lines') +
          ctl('report.footer', S.report.footer, { label: 'Footer text', textarea: true, full: true, rows: 2 }) + `</div>` },
        { title: 'Preview', html: (() => {
          const o = S.orders.find((x) => x.status === 'REPORTED') || S.orders[0];
          if (!o) return '<p class="muted">No orders yet.</p>';
          return `<div class="paper-scroll"><div class="paper">${reportHtml({ orderId: o.id, type: 'Final', at: new Date().toISOString() })}</div></div>`;
        })() },
      ],
      onSave: (v) => {
        S.report = { ...S.report, letterhead: !!v.report.letterhead, footer: v.report.footer, sections: { ...S.report.sections, ...v.report.sections } };
        PL.store.save(); toast('Report layout saved', 'ok');
      },
    });
  }

  function packages() {
    listDialog({
      title: 'Health Packages', width: 680,
      load: () => S.packages,
      cols: [{ h: 'Package' }, { h: 'Tests', align: 'right' }, { h: 'Price', align: 'right' }],
      row: (p) => [`<b>${esc(p.name)}</b>`, `${p.tests.length}`, `<span class="num">${money(p.price)}</span>`],
      actions: [
        { label: () => 'Edit', onClick: (p, redraw) => packageForm(p, redraw) },
        { label: () => 'Delete', danger: true, onClick: async (p, redraw) => {
          if (!await confirmBox('Delete package', `Delete ${p.name}?`, { danger: true, ok: 'Delete' })) return;
          try { svc.deletePackage(p.id); redraw(); PL.app.refresh(); } catch (e) { alertBox('Delete package', e.message, 'warn'); }
        } },
      ],
      addLabel: 'New Package...', onAdd: (redraw) => packageForm(null, redraw),
    });
  }
  function packageForm(p, redraw) {
    const picks = S.tests.filter((t) => t.active && t.kind !== 'panel').concat(S.tests.filter((t) => t.kind === 'panel'))
      .map((t) => `<label class="pick"><input type="checkbox" data-pt="${t.code}" ${p && p.tests.includes(t.code) ? 'checked' : ''}> ${esc(t.name)} <span class="muted small">${esc(t.code)}</span></label>`).join('');
    const ctx = modal({
      title: p ? 'Edit Package' : 'New Package', width: 560,
      body: `<div class="form-grid">` + ctl('name', p ? p.name : '', { label: 'Package name', required: true, full: true }) +
        ctl('price', p ? p.price : 0, { label: 'Package price', type: 'number' }) + `</div>` +
        `<p class="gap-top"><b>Tests in this package</b></p><div class="pick-list">${picks}</div><div class="form-error" hidden></div>`,
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (c) => {
        const v = readAll(c.body);
        const tests = [...c.body.querySelectorAll('[data-pt]:checked')].map((el) => el.dataset.pt);
        try { svc.savePackage({ name: v.name, price: v.price, tests }, p ? p.id : null); c.close(); toast('Package saved', 'ok'); redraw(); PL.app.refresh(); } catch (e) {
          if (!(e instanceof DomainError)) throw e;
          const err = c.body.querySelector('.form-error'); err.textContent = e.message; err.hidden = false;
        }
      } }],
    });
    return ctx;
  }

  function masters() {
    const kinds = {
      doctors: { title: 'Doctors', cols: [{ h: 'Name' }, { h: 'Speciality' }, { h: 'Commission', align: 'right' }], row: (d) => [`<b>${esc(d.name)}</b>`, esc(d.speciality || '-'), `${d.commission}%`],
        fields: (d = {}) => [['name', 'Name', d.name], ['speciality', 'Speciality', d.speciality], ['phone', 'Phone', d.phone], ['commission', 'Commission (%)', d.commission ?? 0]] },
      centres: { title: 'Collection centres', cols: [{ h: 'Name' }, { h: 'Code' }], row: (c) => [`<b>${esc(c.name)}</b>`, esc(c.code || '-')],
        fields: (c = {}) => [['name', 'Name', c.name], ['code', 'Code', c.code]] },
      branches: { title: 'Branches', cols: [{ h: 'Name' }], row: (b) => [`<b>${esc(b.name)}</b>`], fields: (b = {}) => [['name', 'Name', b.name]] },
    };
    const ctx = tabbed({ title: 'Masters', width: 720, tabs: [{ title: 'Doctors', html: '' }, { title: 'Collection centres', html: '' }, { title: 'Branches', html: '' }, { title: 'Price lists', html: '' }], onSave: () => {}, saveLabel: 'Close' });
    const keys = ['doctors', 'centres', 'branches', 'priceLists'];
    const panes = ctx.body.querySelectorAll('[data-pane]');
    const draw = (i) => {
      const key = keys[i];
      const pane = panes[i];
      if (key === 'priceLists') {
        pane.innerHTML = `<div class="toolbar-row"><button class="primary" data-pl-new>New price list...</button></div>` +
          table({ id: 'pl', cols: [{ h: 'Price list' }, { h: 'Default' }, { h: 'Overrides', align: 'right' }, { h: '' }],
            rows: S.priceLists.map((p) => ({ id: p.id, cells: [`<b>${esc(p.name)}</b>`, p.isDefault ? badge('Default', 'OK') : `<button data-pl-default="${p.id}">Make default</button>`,
              `${Object.keys(p.overrides).length}`, `<button data-pl-edit="${p.id}">Edit prices...</button>`] })) });
        return;
      }
      const spec = kinds[key];
      pane.innerHTML = `<div class="toolbar-row"><button class="primary" data-m-new="${key}">New...</button></div>` +
        table({ id: 'm-' + key, cols: [...spec.cols, { h: '' }],
          rows: S[key].map((r) => ({ id: r.id, cells: [...spec.row(r), `<span class="row-actions"><button data-m-edit="${key}:${r.id}">Edit</button>` +
            `<button class="danger" data-m-del="${key}:${r.id}">Delete</button></span>`] })) });
    };
    const fieldForm = (key, rec) => {
      const spec = kinds[key];
      const fields = spec.fields(rec || {});
      const c2 = modal({
        title: `${rec ? 'Edit' : 'New'} ${spec.title.replace(/s$/, '').toLowerCase()}`, width: 460,
        body: `<div class="form-grid">` + fields.map(([n, l, v]) => ctl(n, v, { label: l, full: n === 'name', type: n === 'commission' ? 'number' : 'text' })).join('') + `</div><div class="form-error" hidden></div>`,
        buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (c) => {
          const v = readAll(c.body);
          try { svc.saveMaster(key, v, rec ? rec.id : null); c.close(); toast('Saved', 'ok'); draw(keys.indexOf(key)); PL.app.refresh(); } catch (e) {
            if (!(e instanceof DomainError)) throw e;
            const err = c.body.querySelector('.form-error'); err.textContent = e.message; err.hidden = false;
          }
        } }],
      });
      return c2;
    };
    const priceForm = (pl) => {
      const rows = S.tests.map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${money(t.price)}</td>` +
        `<td><input type="number" step="any" data-ov="${t.code}" value="${pl.overrides[t.code] != null ? pl.overrides[t.code] : ''}" placeholder="catalogue"></td></tr>`).join('');
      modal({ title: `Prices - ${pl.name}`, width: 620, body: `<p class="muted small">Leave a price blank to use the catalogue price.</p>` +
        `<div class="paper-scroll short"><table class="grid"><thead><tr><th>Test</th><th>Catalogue</th><th>List price</th></tr></thead><tbody>${rows}</tbody></table></div><div class="form-error" hidden></div>`,
        buttons: [{ label: 'Cancel' }, { label: 'Save prices', primary: true, onClick: (c) => {
          const overrides = {};
          c.body.querySelectorAll('[data-ov]').forEach((el) => { if (el.value !== '') overrides[el.dataset.ov] = Number(el.value); });
          try { svc.savePriceList({ name: pl.name, overrides }, pl.id); c.close(); toast('Price list saved', 'ok'); draw(3); PL.app.refresh(); } catch (e) {
            if (!(e instanceof DomainError)) throw e;
          }
        } }] });
    };
    ctx.body.addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset.mNew) fieldForm(t.dataset.mNew, null);
      if (t.dataset.mEdit) { const [k, id] = t.dataset.mEdit.split(':'); fieldForm(k, S[k].find((x) => String(x.id) === id)); }
      if (t.dataset.mDel) {
        const [k, id] = t.dataset.mDel.split(':');
        try { svc.deleteMaster(k, Number(id)); toast('Deleted', 'ok'); draw(keys.indexOf(k)); PL.app.refresh(); } catch (err) { alertBox('Delete', err.message, 'warn'); }
      }
      if ('plNew' in t.dataset) {
        form({ title: 'New price list', width: 420, fields: [{ name: 'name', label: 'Name', required: true, full: true }],
          onSubmit: (v) => { svc.savePriceList({ name: v.name, overrides: {} }, null); draw(3); PL.app.refresh(); } });
      }
      if (t.dataset.plDefault) { svc.setDefaultPriceList(Number(t.dataset.plDefault)); draw(3); }
      if (t.dataset.plEdit) { const pl = S.priceLists.find((x) => String(x.id) === t.dataset.plEdit); priceForm(pl); }
    });
    keys.forEach((_, i) => draw(i));
  }

  function users() {
    listDialog({
      title: 'Manage Users', width: 700,
      load: () => S.users,
      cols: [{ h: 'User name' }, { h: 'Full name' }, { h: 'Role' }, { h: 'Status' }, { h: 'Password set' }],
      row: (u) => [`<b>${esc(u.username)}</b>`, esc(u.fullName), esc(ROLES[u.role].label),
        isLocked(u) ? badge('Locked', 'bad') : u.active ? badge('Active', 'OK') : badge('Inactive', 'muted'),
        esc(fdate(u.passwordChangedAt))],
      actions: [
        { label: () => 'Edit', onClick: (u, redraw) => userForm(u, redraw) },
        { label: () => 'Unlock', onClick: (u, redraw) => {
          svc.unlockUser(u.id); redraw(); toast(`${u.username} unlocked`, 'ok');
        } },
        { label: (u) => (u.active ? 'Deactivate' : 'Activate'), onClick: (u, redraw) => {
          try { svc.toggleUser(u.id); redraw(); toast(`${u.username} ${u.active ? 'activated' : 'deactivated'}`, 'ok'); } catch (e) { alertBox('Users', e.message, 'warn'); }
        } },
      ],
      addLabel: 'New User...', onAdd: (redraw) => userForm(null, redraw),
    });
  }
  function userForm(u, redraw) {
    const ctx = modal({
      title: u ? 'Edit User' : 'New User', width: 460,
      body: `<div class="form-grid">` + ctl('username', u ? u.username : '', { label: 'User name', required: true }) +
        ctl('fullName', u ? u.fullName : '', { label: 'Full name', required: true }) +
        ctl('role', u ? u.role : 'TECHNICIAN', { label: 'Role', select: Object.entries(ROLES).map(([k, r]) => [k, r.label]) }) +
        ctl('password', '', { label: u ? 'New password (leave blank to keep)' : 'Password (min 6)', type: 'password' }) + `</div><div class="form-error" hidden></div>`,
      buttons: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (c) => {
        const v = readAll(c.body);
        try { svc.saveUser(v, u ? u.id : null); c.close(); toast('User saved', 'ok'); redraw(); } catch (e) {
          if (!(e instanceof DomainError)) throw e;
          const err = c.body.querySelector('.form-error'); err.textContent = e.message; err.hidden = false;
        }
      } }],
    });
    return ctx;
  }

  function roles() {
    const rows = Object.entries(ROLES).map(([k, r]) => ({ id: k, cells: [`<b>${esc(r.label)}</b>`, `<span class="muted">${esc(k)}</span>`,
      `${S.users.filter((u) => u.role === k).length}`, `${r.perms.length}`] }));
    const perms = PERM_GROUPS.map(([group, items]) => `<h4>${esc(group)}</h4><div class="chips">` +
      items.map(([key, text]) => `<span class="chip" title="${esc(key)}">${esc(text)}</span>`).join(' ') + '</div>').join('');
    modal({ title: 'Roles & Permissions', width: 760, body: table({ id: 'roles', cols: [{ h: 'Role' }, { h: 'Code' }, { h: 'Users', align: 'right' }, { h: 'Permissions', align: 'right' }], rows }) +
      `<h3 class="gap-top">What each role may do</h3>` + `<p class="muted small">Built-in roles are fixed in the web demo. The desktop app lets administrators create and edit roles.</p>` +
      `<div class="role-grid">${Object.entries(ROLES).map(([k, r]) => `<div class="card-body"><b>${esc(r.label)}</b>` +
        `<ul class="plain small">${r.perms.map((p) => `<li>${esc(PL.store.PERM_LABEL[p])}</li>`).join('')}</ul></div>`).join('')}</div>` + perms,
      buttons: [{ label: 'Close', primary: true }] });
  }

  function auditDialog() {
    const entries = S.audit.slice().reverse().slice(0, 200);
    const rows = entries.map((e) => ({ id: e.id, cells: [esc(fdt(e.at)), esc(e.user), `<b>${esc(e.action)}</b>`, esc(e.detail), `<span class="muted mono">${esc(e.hash)}</span>`] }));
    const ctx = modal({ title: 'Audit Log', width: 900, body: `<p class="muted small">${S.audit.length} entr(ies) recorded. Each entry is chained to the one before it.</p>` +
      table({ id: 'audit', cols: [{ h: 'When' }, { h: 'User' }, { h: 'Action' }, { h: 'Detail' }, { h: 'Hash' }], rows, empty: 'No activity yet.' }),
      buttons: [{ label: 'Export audit trail (CSV)...', onClick: () => exportAudit() }, { label: 'Verify audit trail', onClick: () => verifyAudit() }, { label: 'Close', primary: true }] });
    return ctx;
  }
  function exportAudit() {
    const lines = ['id,when,user,action,detail,hash'].concat(S.audit.map((e) => [e.id, e.at, e.user, e.action, `"${String(e.detail).replace(/"/g, '""')}"`, e.hash].join(',')));
    PL.ui.download('audit-trail.csv', lines.join('\n'), 'text/csv');
    toast('Audit trail exported', 'ok');
  }
  function verifyAudit() {
    const r = PL.store.verifyAudit();
    if (r.intact) alertBox('Audit trail', `The audit trail is intact. ${r.checked} entr(ies) verified.`, 'ok');
    else alertBox('Audit trail altered', `The audit trail does not verify. The first altered entry is #${r.firstBroken}. Preserve the data and investigate before relying on the audit log.`, 'bad');
  }

  function dataTools() {
    const ctx = tabbed({ title: 'Data & Backup', width: 620, saveLabel: 'Close', tabs: [
      { title: 'Export & import', html: `<div class="stack">` +
        `<p class="muted">Export the whole demo database as a JSON file, or restore one. Data stays in this browser unless you export it.</p>` +
        `<div class="toolbar-row"><button class="primary" data-d="backup">Back up now (download)</button><button data-d="export">Export JSON...</button></div>` +
        `<label class="field"><span>Restore from a backup file</span><input type="file" accept="application/json" data-d-file></label>` +
        `<div class="toolbar-row"><button class="danger" data-d="reset">Reset demo data</button></div></div>` },
      { title: 'Automatic backup', html: `<div class="stack"><p class="muted">In the desktop app, backups run automatically at the time set in Settings &gt; Application. ` +
        `This demo keeps its data in the browser, so downloading a backup is the equivalent.</p>` +
        `<table class="kv"><tr><td>Automatic backup</td><td>${S.app.backupEnabled ? 'Enabled' : 'Disabled'}</td></tr>` +
        `<tr><td>Time</td><td>${esc(S.app.backupTime)}</td></tr><tr><td>Keep</td><td>${S.app.backupKeep} copies</td></tr></table>` +
        `<div class="toolbar-row"><button data-d="integrity">Check database integrity</button></div></div>` },
    ], onSave: () => {} });
    ctx.body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      const act = b.dataset.d;
      if (act === 'backup' || act === 'export') PL.ui.download(`patholab-backup-${todayKey()}.json`, svc.exportJson());
      if (act === 'integrity') alertBox('Integrity check', 'The demo database passed the integrity check.', 'ok');
      if (act === 'reset') {
        if (!await confirmBox('Reset demo data', 'Replace all demo data with the built-in sample data? Anything you added will be lost.', { danger: true, ok: 'Reset' })) return;
        svc.reset(); PL.app.refresh(); toast('Demo data reset', 'ok'); ctx.close();
      }
    });
    ctx.body.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        if (!await confirmBox('Restore backup', `Replace all current data with ${f.name}?`, { danger: true, ok: 'Restore' })) return;
        try { svc.importJson(String(reader.result)); toast('Backup restored', 'ok'); ctx.close(); PL.app.restored(); } catch (err) { alertBox('Restore failed', err.message, 'bad'); }
      };
      reader.readAsText(f);
    });
  }

  function isLocked(u) {
    return !!u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();
  }

  // Shown at sign-in when the password is older than the policy allows. Cannot be dismissed
  // except by signing out.
  function forcedPassword(onDone, onCancel) {
    const u = PL.store.currentUser();
    modal({
      title: 'Password expired', width: 440, dismissable: false,
      body: `<p class="msg">The password for <b>${esc(u ? u.username : '')}</b> is more than ${PL.store.POLICY.passwordDays} days old. ` +
        `Choose a new one to continue.</p><div class="form-grid">` +
        ctl('newPw', '', { label: 'New password (min 6)', type: 'password' }) +
        ctl('confirm', '', { label: 'Confirm new password', type: 'password' }) +
        `</div><div class="form-error" hidden></div>`,
      buttons: [
        { label: 'Sign out', onClick: (c) => { c.close(); onCancel(); } },
        { label: 'Continue', primary: true, onClick: (c) => {
          const v = readAll(c.body);
          try {
            if (v.newPw !== v.confirm) throw new DomainError('The new passwords do not match.');
            svc.forcePassword(v.newPw);
            c.close();
            toast('Password changed', 'ok');
            onDone();
          } catch (e) {
            if (!(e instanceof DomainError)) throw e;
            const err = c.body.querySelector('.form-error'); err.textContent = e.message; err.hidden = false;
          }
        } },
      ],
    });
  }

  function changePassword() {
    const u = PL.store.currentUser();
    form({
      title: 'Change Password', width: 420,
      fields: [
        { name: 'oldPw', label: 'Current password', type: 'password', required: true },
        { name: 'newPw', label: 'New password (min 6)', type: 'password', required: true },
        { name: 'confirm', label: 'Confirm new password', type: 'password', required: true },
      ],
      note: `Signed in as ${u ? u.username : '-'}.`,
      onSubmit: (v) => {
        if (v.newPw !== v.confirm) throw new DomainError('The new passwords do not match.');
        svc.changePassword(v.oldPw, v.newPw);
        toast('Password changed', 'ok');
      },
    });
  }

  function license() {
    modal({ title: 'PathoLab - Licence', width: 560, body: `<div class="stack">` +
      `<p><b>Web demo edition</b> - no licence is needed. Every module is enabled so you can explore the whole product.</p>` +
      table({ id: 'lic', cols: [{ h: 'Item' }, { h: 'Value' }], rows: [
        { id: 1, cells: ['Edition', 'Demo (browser)'] }, { id: 2, cells: ['Status', badge('Demo', 'OK')] },
        { id: 3, cells: ['Data stored in', 'This browser only (localStorage)'] }, { id: 4, cells: ['Desktop licence activation', 'Not applicable in the demo'] },
      ] }) + `</div>`, buttons: [{ label: 'Close', primary: true }] });
  }
  function about() {
    modal({ title: 'About PathoLab', width: 420, body: `<div class="about"><div class="about-logo"><img src="assets/img/patholab.png" alt=""></div>` +
      `<h2>PathoLab</h2><p class="muted">Laboratory Management &middot; Version 1.0.0 (web demo)</p>` +
      `<p>A demonstration of the PathoLab desktop application: patients, orders, sample tracking, result entry with flags, reports, billing, lab operations, MIS and audit.</p>` +
      `<p class="muted small">Demo data is fictional. The web demo is not for clinical use.</p></div>`, buttons: [{ label: 'Close', primary: true }] });
  }

  PL.dialogs = {
    newPatient: () => patientForm(null),
    editPatient: (id) => { const p = patientById(id); if (p) patientForm(p); },
    newOrder, receivePayment, notifyCritical, criticalAlert, editTest, sendOut,
    item, stockIn, stockOut, stockCount, qc: qcDialog, equipment: equipmentDialog, equipmentLog,
    commissionRule, payout, expense,
    deltaComment, whatsapp: whatsappDialog, cloudSync: cloudSyncDialog,
    reportHtml, reportPreview, invoiceHtml, receiptHtml,
    settings, reportDesigner, packages, masters, users, roles, audit: auditDialog,
    dataTools, changePassword, license, about, forcedPassword,
  };
})(window.PL = window.PL || {});
