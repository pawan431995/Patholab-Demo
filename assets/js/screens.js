/*
 * PathoLab demo - the sidebar screens. Each screen has a toolbar (header
 * buttons), a body, and optional actions / inputs / dbl / sync hooks that the
 * app shell wires up.
 */
(function (PL) {
  'use strict';

  const { S, svc, q, ALL_PERMS } = {
    S: PL.store.S, svc: PL.store.svc, q: PL.store.q, ALL_PERMS: PL.store.ALL_PERMS,
  };
  const { esc, money, fdate, fdt, fdtShort, badge, FLAG_SYMBOL, FLAG_TEXT, card, stat, field, empty, table, toast, modal, alertBox, confirmBox, form, download, printHtml } = PL.ui;
  const { label, todayKey, monthStartKey, ageYears, orderTotals, pendingCount, patientName, testByCode, patientById, doctorById, orderById, sampleById, computeFlag, rangeText, isCritical, leaves, round2, sum, DEPARTMENTS, KINDS, SAMPLE_NEXT, ORDER_NEXT, CONTAINER } = PL.store;
  const hp = PL.store.hasPerm;
  const sel = (t) => PL.app.sel(t);
  const genderLabel = (g) => ({ M: 'Male', F: 'Female', O: 'Other' }[g] || '-');
  const ageSex = (p) => (p ? `${ageYears(p)}Y / ${p.gender}` : '-');

  // a toolbar button; `req` names the table whose selection enables it
  const btn = (text, act, o = {}) => `<button ${o.primary ? 'class="primary"' : o.danger ? 'class="danger"' : ''} data-act="${act}"` +
    `${o.req ? ` data-req="${o.req}" disabled` : ''}${o.hidden ? ' hidden' : ''}>${text}</button>`;
  const dateInput = (id, value, act) => `<input type="date" id="${id}" value="${value}" data-change="${act}">`;

  const periodFromState = (st) => ({ from: st.from, to: st.to });
  const ensurePeriod = (st) => {
    if (!st.from) st.from = monthStartKey();
    if (!st.to) st.to = todayKey();
    return st;
  };

  // ---- Dashboard ---------------------------------------------------------------
  const dashboard = {
    title: 'Dashboard',
    sub: 'Laboratory activity at a glance',
    toolbar: () => btn('New Order', 'newOrder', { primary: true }) + btn('Refresh', 'refresh'),
    body() {
      const d = q.dashboard();
      const work = q.worklist().map((o) => {
        const p = patientById(o.patientId);
        const ta = q.turnaround(o);
        const hoursLeft = Math.abs(Math.round(ta.left));
        const tat = ta.state === 'OVERDUE' ? badge(`Overdue ${hoursLeft}h`, 'bad')
          : ta.state === 'DUE_SOON' ? badge(`Due in ${hoursLeft}h`, 'warn')
          : ta.state === 'ON_TIME' ? badge(`Due in ${hoursLeft}h`, 'muted') : '-';
        return {
          id: o.id,
          cells: [
            `<b>${esc(o.orderNo)}</b>`, esc(patientName(p)), esc(ageSex(p)), esc(fdtShort(o.registeredAt)),
            badge(label(o.status), o.status), badge(label(o.priority), o.priority), tat,
          ],
          cls: ta.state === 'OVERDUE' || o.priority === 'STAT' ? 'row-alert' : '',
        };
      });
      const max = Math.max(1, ...d.days.map((x) => x.count));
      const bars = d.days.map((x) => `<div class="bar-row"><span>${esc(x.label)}</span>` +
        `<div class="bar"><i style="width:${(x.count / max) * 100}%"></i></div><b>${x.count}</b></div>`).join('');
      return `<div class="stats-7">` +
        stat('Orders registered today', d.ordersToday, `${d.patientsToday} new patient(s)`) +
        stat('Tests awaiting results', d.pendingResults) +
        stat('Orders awaiting verification', d.awaitingVerify) +
        stat('Overdue orders', d.overdue, `${d.dueSoon} due within 2 h`, d.overdue > 0) +
        stat('Reports issued today', d.reportedToday) +
        stat('Critical results today', d.criticalToday, '', true) +
        stat('Revenue today', money(d.revenueToday), `Month to date ${money(d.revenueMonth)}`) +
        `</div>` +
        `<div class="split-3-2">` +
        card(`Open worklist${d.overdue ? ` - ${d.overdue} overdue` : ''}`, table({
          id: 'worklist', selected: sel('worklist'), empty: 'No open orders.',
          cols: [{ h: 'Order' }, { h: 'Patient' }, { h: 'Age/Sex' }, { h: 'Registered' }, { h: 'Status' }, { h: 'Priority' }, { h: 'Turnaround' }],
          rows: work,
        })) +
        `<div class="stack">` +
        card('Most requested investigations', table({
          id: 'busy', empty: 'No orders yet.',
          cols: [{ h: 'Test' }, { h: 'Count', align: 'right' }],
          rows: d.busiest.map(([name, n]) => ({ id: name, cells: [esc(name), `${n}`] })),
        })) +
        card('Last seven days', `<div class="bars">${bars}</div>`) +
        card('Billing', `<table class="kv"><tr><td>Today</td><td><b>${money(d.revenueToday)}</b></td></tr>` +
          `<tr><td>This month</td><td><b>${money(d.revenueMonth)}</b></td></tr>` +
          `<tr><td>Outstanding</td><td class="warn-text"><b>${money(d.outstanding)}</b></td></tr></table>`) +
        `</div></div>`;
    },
    dbl(tableId, id) { if (tableId === 'worklist') PL.app.go('results', Number(id)); },
    actions: {},
  };

  // ---- Patients ----------------------------------------------------------------
  const patients = {
    title: 'Patients',
    sub: 'Register new patients and review their history',
    state: { term: '' },
    detailTables: ['patients'],
    toolbar: () => btn('Register Patient', 'newPatient', { primary: true }) +
      btn('Edit', 'editPatient', { req: 'patients' }) +
      btn('New Order', 'orderForPatient', { req: 'patients' }) +
      btn('Delete', 'deletePatient', { req: 'patients', danger: true }),
    body() {
      const list = q.patients(this.state.term);
      const rows = list.map((p) => ({
        id: p.id,
        cells: [`<b>${esc(p.mrn)}</b>`, esc(patientName(p)), esc(ageYears(p)), esc(genderLabel(p.gender)),
          esc(p.phone || '-'), esc(p.bloodGroup || '-'), esc(fdate(p.createdAt))],
      }));
      const pid = sel('patients');
      const history = pid ? q.ordersFor(Number(pid)).map((o) => ({
        id: o.id,
        cells: [`<b>${esc(o.orderNo)}</b>`, esc(fdtShort(o.registeredAt)), badge(label(o.status), o.status),
          esc(PL.store.orderSummary(o)), `<span class="num">${esc(money(o.net).replace(/^₹/, '₹ '))}</span>`],
      })) : [];
      let trendCard = '';
      if (pid) {
        const tests = q.trendTests(Number(pid));
        const code = tests.some((t) => t.code === this.state.trend) ? this.state.trend : (tests[0] ? tests[0].code : null);
        this.state.trend = code;
        const picker = tests.length ? `<select data-change="trendTest">${tests.map((t) =>
          `<option value="${esc(t.code)}" ${t.code === code ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : '';
        let chart = empty('No numeric results for this patient yet. The trend appears once results are saved.');
        if (code) {
          const tr = q.trend(Number(pid), code);
          const latest = tr.points[tr.points.length - 1];
          const prev = tr.points[tr.points.length - 2];
          const change = latest && prev && prev.v !== 0 ? ` &middot; change ${(((latest.v - prev.v) / Math.abs(prev.v)) * 100).toFixed(1)}% from the previous result` : '';
          chart = PL.ui.lineChartSvg({ points: tr.points, range: tr.range, unit: tr.unit }) +
            `<p class="muted small">${tr.points.length} result(s)${change}. Shaded band: reference interval. ` +
            `Red dots: critical. Orange dots: abnormal.</p>`;
        }
        trendCard = card('Trend', `<div class="toolbar-row">${picker}</div>${chart}`, { cls: 'grow' });
      }
      return `<div class="toolbar-row"><input id="pt-search" class="search" placeholder="Search by name, patient ID or phone number..." ` +
        `value="${esc(this.state.term)}" data-input="patientSearch" autocomplete="off"></div>` +
        `<div class="split-v">` +
        card(`Patients (${list.length})`, table({
          id: 'patients', selected: pid, empty: 'No patients match your search.',
          cols: [{ h: 'Patient ID' }, { h: 'Name' }, { h: 'Age', align: 'right' }, { h: 'Gender' }, { h: 'Phone' }, { h: 'Blood group' }, { h: 'Registered' }],
          rows,
        }), 'grow') +
        card('Order history', table({
          id: 'phist', empty: pid ? 'No orders for this patient yet.' : 'Select a patient to see their orders.',
          cols: [{ h: 'Order' }, { h: 'Registered' }, { h: 'Status' }, { h: 'Tests' }, { h: 'Net amount', align: 'right' }],
          rows: history,
        }), 'grow') +
        trendCard +
        `</div>`;
    },
    inputs: {
      patientSearch(el) { this.state.term = el.value; PL.app.refresh(true); },
      trendTest(el) { this.state.trend = el.value; PL.app.refresh(); },
    },
    dbl(tableId, id) {
      if (tableId === 'patients') PL.dialogs.editPatient(Number(id));
      if (tableId === 'phist') PL.app.go('results', Number(id));
    },
    actions: {
      newPatient: () => PL.dialogs.newPatient(),
      editPatient: () => PL.dialogs.editPatient(Number(sel('patients'))),
      orderForPatient: () => PL.dialogs.newOrder(Number(sel('patients'))),
      deletePatient: async () => {
        const p = patientById(Number(sel('patients')));
        if (!p) return;
        if (!await confirmBox('Delete patient', `Permanently delete ${p.mrn} - ${patientName(p)}?\n\nThis is only possible while the patient has no orders.`, { danger: true, ok: 'Delete' })) return;
        try {
          svc.deletePatient(p.id);
          PL.app.setSel('patients', null);
          toast('Patient deleted');
          PL.app.refresh();
        } catch (e) { PL.app.handle(e, 'Could not delete the patient'); }
      },
    },
    sync() {},
  };

  // ---- Orders ------------------------------------------------------------------
  const orders = {
    title: 'Orders',
    sub: 'Registration, sample workflow and billing',
    state: { term: '', status: '', from: '', to: '' },
    toolbar: () => btn('New Order', 'newOrder', { primary: true }) +
      btn('Enter Results', 'enterResults', { req: 'orders' }) +
      btn('Mark Collected', 'markCollected', { req: 'orders' }) +
      btn('Mark Received', 'markReceived', { req: 'orders' }) +
      btn('Cancel Order', 'cancelOrder', { req: 'orders', danger: true }),
    body() {
      const st = ensurePeriod(this.state);
      const list = q.orders({ term: st.term, status: st.status, from: st.from, to: st.to });
      const statusOpts = [['', 'All statuses'], ...Object.keys(ORDER_NEXT).map((k) => [k, label(k)])]
        .map(([v, t]) => `<option value="${v}" ${v === st.status ? 'selected' : ''}>${esc(t)}</option>`).join('');
      const rows = list.map((o) => {
        const p = patientById(o.patientId);
        const pending = pendingCount(o);
        const totals = orderTotals(o);
        return {
          id: o.id,
          cells: [`<b>${esc(o.orderNo)}</b>`, esc(patientName(p)), esc(ageSex(p)), esc(fdtShort(o.registeredAt)),
            esc(PL.store.orderSummary(o)), badge(label(o.status), o.status),
            `<span class="al-center">${pending ? `<b class="warn-text">${pending}</b>` : '-'}</span>`,
            `<span class="num">${esc(money(o.net))}</span>`, badge(label(totals.payment), totals.payment)],
          cls: o.status === 'CANCELLED' ? 'muted-row' : '',
        };
      });
      return `<div class="filter-row">` +
        `<input id="od-search" class="search grow" placeholder="Order number, patient name, patient ID or phone..." value="${esc(st.term)}" data-input="ordersFilter">` +
        `<select data-change="ordersFilter">${statusOpts}</select>` +
        `<span class="muted">From</span>${dateInput('od-from', st.from, 'ordersFilter')}` +
        `<span class="muted">To</span>${dateInput('od-to', st.to, 'ordersFilter')}` +
        `<button data-act="ordersToday">Today</button></div>` +
        card(`Orders (${list.length})`, table({
          id: 'orders', selected: sel('orders'), empty: 'No orders match these filters.',
          cols: [{ h: 'Order' }, { h: 'Patient' }, { h: 'Age/Sex' }, { h: 'Registered' }, { h: 'Investigations' },
            { h: 'Status' }, { h: 'Pending', align: 'center' }, { h: 'Net', align: 'right' }, { h: 'Payment' }],
          rows,
        }), 'grow');
    },
    inputs: {
      ordersFilter(el) {
        const map = { 'od-search': 'term', 'od-from': 'from', 'od-to': 'to' };
        if (el.id in map) this.state[map[el.id]] = el.value;
        else if (el.tagName === 'SELECT') this.state.status = el.value;
        PL.app.refresh(true);
      },
    },
    actions: {
      newOrder: () => PL.dialogs.newOrder(),
      ordersToday() { this.state.from = todayKey(); this.state.to = todayKey(); PL.app.refresh(); },
      enterResults: () => PL.app.go('results', Number(sel('orders'))),
      markCollected: () => runOrderStatus('COLLECTED', 'Marked collected'),
      markReceived: () => runOrderStatus('IN_PROGRESS', 'Marked received'),
      cancelOrder: async () => {
        const id = Number(sel('orders'));
        const o = orderById(id);
        if (!o) return;
        if (!await confirmBox('Cancel order', `Cancel ${o.orderNo}?\n\nCancelled orders cannot receive results or reports.`, { danger: true, ok: 'Cancel order' })) return;
        try { svc.cancelOrder(id, 'Cancelled from orders screen'); toast('Order cancelled'); PL.app.refresh(); } catch (e) { PL.app.handle(e, 'Could not cancel the order'); }
      },
    },
    sync() {
      const o = sel('orders') ? orderById(Number(sel('orders'))) : null;
      const set = (act, ok) => { const b = document.querySelector(`[data-act="${act}"]`); if (b) b.disabled = !ok; };
      set('enterResults', o && o.status !== 'CANCELLED');
      set('markCollected', o && o.status === 'REGISTERED');
      set('markReceived', o && o.status === 'COLLECTED');
      set('cancelOrder', o && !['REPORTED', 'CANCELLED'].includes(o.status));
    },
  };

  function runOrderStatus(target, message) {
    const id = Number(sel('orders'));
    try { svc.setOrderStatus(id, target); toast(message); PL.app.refresh(); } catch (e) { PL.app.handle(e, 'Status not changed'); }
  }

  // ---- Result entry -----------------------------------------------------------
  const results = {
    title: 'Result Entry',
    sub: 'Enter, verify and report results',
    state: { orderId: null },
    toolbar: () => btn('Save Results', 'saveResults', { primary: true, hidden: false }) +
      btn('Verify All', 'verifyAll') + btn('Generate Report', 'generateReport') + btn('Reload', 'refresh'),
    body() {
      const pending = q.openForResults();
      const rows = pending.map((o) => {
        const p = patientById(o.patientId);
        return { id: o.id, cells: [`<b>${esc(o.orderNo)}</b>`, esc(patientName(p)), badge(label(o.status), o.status)] };
      });
      const left = card(`Orders awaiting results (${pending.length})`, table({
        id: 'pending', selected: this.state.orderId, empty: 'Nothing waiting for results.',
        cols: [{ h: 'Order' }, { h: 'Patient' }, { h: 'Status' }], rows,
      }), { cls: 'grow-card' });
      const o = this.state.orderId ? orderById(this.state.orderId) : null;
      let right;
      if (!o) {
        right = card('Results', empty('Select an order on the left to enter its results.'), { cls: 'grow-card' });
      } else {
        const p = patientById(o.patientId);
        const doc = doctorById(o.doctorId);
        const banner = `<div class="order-banner">` +
          `<div><span class="muted">Order</span><b>${esc(o.orderNo)}</b></div>` +
          `<div><span class="muted">Patient</span><b>${esc(patientName(p))}</b> <span class="muted">${esc(p.mrn)}</span></div>` +
          `<div><span class="muted">Age / Sex</span>${esc(ageSex(p))}</div>` +
          `<div><span class="muted">Referred by</span>${esc(doc ? doc.name : 'Self / walk-in')}</div>` +
          `<div><span class="muted">Priority</span>${badge(label(o.priority), o.priority)}</div>` +
          `<div><span class="muted">Status</span>${badge(label(o.status), o.status)}</div>` +
          (o.clinicalHistory ? `<div class="wide"><span class="muted">Clinical history</span> ${esc(o.clinicalHistory)}</div>` : '') +
          `</div>`;
        const rowsHtml = o.tests.map((code) => {
          const def = testByCode(code);
          const r = o.results[code];
          const locked = r && r.status === 'VERIFIED';
          const value = r ? r.value : '';
          let input;
          if (def.kind === 'quant') {
            input = `<input type="number" step="any" data-res="${code}" value="${esc(value)}" ${locked ? 'disabled' : ''}>`;
          } else if (def.kind === 'choice' || def.kind === 'semi') {
            input = `<select data-res="${code}" ${locked ? 'disabled' : ''}><option value=""></option>` +
              def.choices.map((c) => `<option ${c === value ? 'selected' : ''}>${esc(c)}</option>`).join('') + '</select>';
          } else if (def.kind === 'calc') {
            // Read-only: filled in from the other results once their values are saved.
            input = value !== '' ? `<b>${esc(value)}</b> <span class="muted small">calculated</span>` : '<span class="muted small">Needs other results</span>';
          } else if (def.kind === 'culture') {
            input = `<button type="button" data-act="culture" data-code="${code}" ${locked ? 'disabled' : ''}>${r ? esc(value) : 'Enter culture'}</button>`;
          } else {
            input = `<textarea data-res="${code}" rows="2" ${locked ? 'disabled' : ''}>${esc(value)}</textarea>`;
          }
          const flag = r && r.flag && r.flag !== 'NORMAL' && r.flag !== 'NOT_APPLICABLE'
            ? `<span class="flag ${isCritical(r.flag) ? 'flag-crit' : ''}">${esc(FLAG_SYMBOL[r.flag] || '')}</span>` : '';
          const status = r ? badge(label(r.status), r.status === 'VERIFIED' ? 'OK' : r.status === 'ENTERED' ? 'Partial' : 'muted') : badge('Pending', 'PENDING');
          const notify = r && isCritical(r.flag) && !r.notified ? `<div class="crit-note">Notify doctor</div>` : '';
          const delta = r && r.deltaFlag && r.status !== 'VERIFIED' ? `<div class="crit-note">Delta check</div>` : '';
          const prev = r && r.prev
            ? `${esc(r.prev.text)}<div class="muted small">${esc(fdate(r.prev.at))}${r.delta != null ? ` &middot; ${r.delta > 0 ? '+' : ''}${r.delta}%` : ''}</div>`
            : '<span class="muted">-</span>';
          return `<tr><td><b>${esc(def.name)}</b><div class="muted small">${esc(def.dept)}</div></td>` +
            `<td class="res-input">${input}</td><td>${esc(def.unit || '')}</td>` +
            `<td>${esc(rangeText(def, p))}</td><td>${prev}</td><td class="al-center">${flag}${notify}${delta}</td><td>${status}</td></tr>`;
        }).join('');
        const verified = o.tests.every((c) => o.results[c] && o.results[c].status === 'VERIFIED');
        right = card(`Results - ${o.orderNo}`, banner +
          `<div class="grid-wrap"><table class="grid results-grid"><thead><tr>` +
          `<th>Investigation</th><th>Result</th><th>Unit</th><th>Reference interval</th><th>Previous</th><th class="al-center">Flag</th><th>Status</th>` +
          `</tr></thead><tbody>${rowsHtml}</tbody></table></div>` +
          `<p class="muted small">${verified ? 'All results verified. A final report can be generated.' : 'Enter values and press Save Results. Verify all results before a final report.'}` +
          ` Flags: L low, H high, LL / HH critical, * abnormal.</p>`, { cls: 'grow-card' });
      }
      return `<div class="split-results">${left}${right}</div>`;
    },
    onSelect(tableId, id) {
      if (tableId === 'pending') { this.state.orderId = Number(id); PL.app.refresh(); }
    },
    dbl() {},
    actions: {
      saveResults() {
        const o = this.state.orderId ? orderById(this.state.orderId) : null;
        if (!o) return;
        const entries = [...document.querySelectorAll('[data-res]')].map((el) => ({ code: el.dataset.res, value: el.value }));
        try {
          const { saved, criticals, reflexes } = svc.saveResults(o.id, entries);
          toast(`Saved ${saved} result(s)`, 'ok');
          reflexes.forEach((x) => toast(`Reflex: ${x.added.join(', ')} added to ${o.orderNo} (${x.from} = ${x.value})`, 'info'));
          if (criticals.length) PL.dialogs.criticalAlert(o, criticals);
          PL.app.refresh();
        } catch (e) { PL.app.handle(e, 'Results not saved'); }
      },
      culture(el) {
        const o = this.state.orderId ? orderById(this.state.orderId) : null;
        if (o) PL.dialogs.culture(o, el.dataset.code);
      },
      verifyAll() {
        const o = this.state.orderId ? orderById(this.state.orderId) : null;
        if (!o) return;
        try { const n = svc.verifyResults(o.id); toast(`Verified ${n} result(s)`, 'ok'); PL.app.refresh(); } catch (e) {
          if (e.deltaCodes) { PL.dialogs.deltaComment(o, e.deltaCodes); return; }
          PL.app.handle(e, 'Could not verify');
        }
      },
      async generateReport() {
        const o = this.state.orderId ? orderById(this.state.orderId) : null;
        if (!o) return;
        const verified = o.tests.every((c) => o.results[c] && o.results[c].status === 'VERIFIED');
        if (!verified) {
          if (!await confirmBox('Provisional report', 'Some results are not yet verified. Generate a PROVISIONAL report? It will be marked provisional and the order stays open.', { ok: 'Generate provisional' })) return;
          try { PL.dialogs.reportPreview(svc.generateReport(o.id, true)); PL.app.refresh(); } catch (e) { PL.app.handle(e, 'Report not generated'); }
          return;
        }
        try { PL.dialogs.reportPreview(svc.generateReport(o.id, false)); PL.app.refresh(); } catch (e) { PL.app.handle(e, 'Report not generated'); }
      },
    },
    sync() {},
  };

  // ---- Sample tracking -------------------------------------------------------
  const SAMPLE_ACTIONS = {
    sCollect: ['PENDING'], sReceive: ['COLLECTED'], sProcess: ['RECEIVED'], sStore: ['RECEIVED', 'PROCESSING'],
    sMove: Object.keys(SAMPLE_NEXT).filter((k) => k !== 'DISPOSED'), sReject: ['PENDING', 'COLLECTED', 'RECEIVED', 'PROCESSING'],
    sRecollect: ['REJECTED'], sDispose: ['STORED'],
  };
  const samples = {
    title: 'Sample Tracking',
    sub: 'Collection, receipt, processing, storage and disposal of specimens',
    state: { term: '', status: '', tab: 'samples' },
    toolbar() {
      if (this.state.tab === 'route') return btn('Mark collected...', 'routeCollect', { primary: true, req: 'route' });
      return btn('Collect', 'sCollect', { req: 'samples' }) + btn('Receive', 'sReceive', { req: 'samples' }) +
      btn('Start Processing', 'sProcess', { req: 'samples' }) + btn('Store...', 'sStore', { req: 'samples' }) +
      btn('Move...', 'sMove', { req: 'samples' }) + btn('Reject...', 'sReject', { req: 'samples', danger: true }) +
      btn('Request Recollection', 'sRecollect', { req: 'samples' }) + btn('Dispose', 'sDispose', { req: 'samples' }) +
      btn('History', 'sHistory', { req: 'samples' }) + btn('Print Label', 'sLabel', { req: 'samples' });
    },
    body() {
      if (this.state.tab === 'route') return sampleTabs(this) + routeHtml();
      const list = q.samples({ term: this.state.term, status: this.state.status });
      const statusOpts = [['', 'All statuses'], ...Object.keys(SAMPLE_NEXT).map((k) => [k, label(k)])]
        .map(([v, t]) => `<option value="${v}" ${v === this.state.status ? 'selected' : ''}>${esc(t)}</option>`).join('');
      const rows = list.map((s) => {
        const o = S.orders.find((x) => x.id === s.orderId);
        const p = o ? patientById(o.patientId) : null;
        return {
          id: s.id,
          cells: [`<b>${esc(s.sampleNo)}</b>`, esc(o ? o.orderNo : '-'), esc(patientName(p)), esc(s.specimen),
            esc(s.container), esc(s.tests.map((c) => c).join(', ')), badge(label(s.status), s.status),
            esc(s.location || '-'), esc(fdtShort(s.collectedAt)), esc(fdtShort(s.receivedAt))],
        };
      });
      return sampleTabs(this) + `<div class="filter-row">` +
        `<input id="sm-search" class="search grow" placeholder="Scan or type a sample number, order, MRN or patient name, then Enter" value="${esc(this.state.term)}" data-input="sampleSearch" data-enter="sScan">` +
        `<select data-change="sampleStatus">${statusOpts}</select></div>` +
        card(null, table({
          id: 'samples', selected: sel('samples'), empty: 'No samples match.',
          cols: [{ h: 'Sample' }, { h: 'Order' }, { h: 'Patient' }, { h: 'Specimen' }, { h: 'Container' }, { h: 'Tests' },
            { h: 'Status' }, { h: 'Location' }, { h: 'Collected' }, { h: 'Received' }],
          rows,
        }), 'grow') +
        `<p class="muted">${list.length} sample(s) shown. Awaiting receipt: ${S.samples.filter((s) => s.status === 'COLLECTED').length}.</p>`;
    },
    inputs: {
      sampleSearch(el) { this.state.term = el.value; PL.app.refresh(true); },
      // (tabs are buttons; see sampleTab below)
      sampleStatus(el) { this.state.status = el.value; PL.app.refresh(); },
    },
    actions: {
      sampleTab(el) { this.state.tab = el.dataset.tab; PL.app.refresh(); },
      routeCollect() {
        const id = Number(sel('route'));
        const o = S.orders.find((x) => x.id === id);
        if (!o) return;
        const people = S.users.filter((u) => u.active && u.role === 'TECHNICIAN');
        form({
          title: `Mark collected - ${o.orderNo}`, width: 460,
          note: `${o.slot || 'No slot'} - ${o.collectAddress || 'No address'}`,
          fields: [{ name: 'who', label: 'Collected by (phlebotomist)', type: 'select', required: true, full: true,
            options: people.map((u) => [u.fullName, u.fullName]) }],
          submit: 'Mark collected',
          onSubmit: (v) => { svc.collectHome(o.id, v.who); toast(`${o.orderNo} collected by ${v.who}`, 'ok'); PL.app.refresh(); },
        });
      },
      sCollect: () => moveSample('COLLECTED', 'Collected'),
      sReceive: () => moveSample('RECEIVED', 'Received'),
      sProcess: () => moveSample('PROCESSING', 'Processing started'),
      sDispose: () => moveSample('DISPOSED', 'Disposed'),
      async sRecollect() {
        const s = selectedSample();
        if (!s) return;
        if (!await confirmBox('Request recollection', `Ask for ${s.sampleNo} to be collected again?`, { ok: 'Request' })) return;
        moveSample('PENDING', 'Recollection requested');
      },
      sStore() {
        const s = selectedSample();
        if (!s) return;
        form({
          title: 'Store sample', width: 420,
          fields: [{ name: 'location', label: 'Storage location (e.g. Fridge 2, shelf B)', required: true, full: true }],
          submit: 'Store',
          onSubmit: (v) => { svc.moveSample(s.id, 'STORED', { location: v.location.trim() }); toast('Stored', 'ok'); PL.app.refresh(); },
        });
      },
      sMove() {
        const s = selectedSample();
        if (!s) return;
        form({
          title: 'Move sample', width: 420,
          fields: [{ name: 'location', label: 'New location', required: true, value: s.location, full: true }],
          submit: 'Move',
          onSubmit: (v) => { svc.setSampleLocation(s.id, v.location.trim()); toast('Moved', 'ok'); PL.app.refresh(); },
        });
      },
      sReject() {
        const s = selectedSample();
        if (!s) return;
        form({
          title: 'Reject sample', width: 440,
          fields: [{ name: 'reason', label: 'Reason (e.g. haemolysed, clotted, wrong container)', required: true, full: true }],
          submit: 'Reject',
          onSubmit: (v) => { svc.moveSample(s.id, 'REJECTED', { reason: v.reason.trim() }); toast('Rejected'); PL.app.refresh(); },
        });
      },
      sHistory() {
        const s = selectedSample();
        if (!s) return;
        modal({
          title: `History - ${s.sampleNo}`, width: 560,
          body: table({
            id: 'shist', cols: [{ h: 'When' }, { h: 'Event' }],
            rows: s.history.map((h, i) => ({ id: i, cells: [esc(fdt(h.at)), esc(h.event)] })),
          }),
          buttons: [{ label: 'Close', primary: true }],
        });
      },
      sLabel() {
        const s = selectedSample();
        if (!s) return;
        const o = S.orders.find((x) => x.id === s.orderId);
        const p = o ? patientById(o.patientId) : null;
        printHtml(`<div class="label-sheet"><div class="label-title">${esc(s.sampleNo)}</div>` +
          PL.ui.code128Svg(s.sampleNo, { module: 1.6, height: 40 }) +
          `<div>${esc(patientName(p))} &middot; ${esc(p ? p.mrn : '')}</div>` +
          `<div>${esc(o ? o.orderNo : '')} &middot; ${esc(s.specimen)}</div>` +
          `<div>Tests: ${esc(s.tests.join(', '))}</div>` +
          `<div>Container: ${esc(s.container)} &middot; Collected ${esc(fdt(s.collectedAt))}</div></div>`);
      },
      sScan(el) {
        const term = el.value.trim().toLowerCase();
        const matches = q.samples({ term, status: '' });
        if (matches.length === 1) { PL.app.setSel('samples', matches[0].id); PL.app.refresh(); }
      },
    },
    sync() {
      const s = selectedSample();
      Object.entries(SAMPLE_ACTIONS).forEach(([act, states]) => {
        const b = document.querySelector(`[data-act="${act}"]`);
        if (b) b.disabled = !(s && states.includes(s.status));
      });
      const hist = document.querySelector('[data-act="sHistory"]');
      if (hist) hist.disabled = !s;
      const lab = document.querySelector('[data-act="sLabel"]');
      if (lab) lab.disabled = !s;
    },
  };
  // Samples screen tabs: the lab's sample list and the home-collection route.
  function sampleTabs(scr) {
    return `<div class="tabs">${[['samples', 'Samples'], ['route', 'Home collection route']].map(([k, t]) =>
      `<button class="tab ${scr.state.tab === k ? 'on' : ''}" data-act="sampleTab" data-tab="${k}">${t}</button>`).join('')}</div>`;
  }
  function routeHtml() {
    const list = q.homeRoute();
    const rows = list.map((o) => {
      const p = patientById(o.patientId);
      return { id: o.id, cells: [esc(o.slot || '-'), `<b>${esc(o.orderNo)}</b>`, esc(patientName(p)), esc(o.collectAddress || '-'),
        esc(p && p.phone ? p.phone : '-'), `<span class="num">${o.tests.length}</span>`, badge(label(o.status), o.status)] };
    });
    return card(`Home collections to visit (${list.length})`, table({
      id: 'route', selected: sel('route'), empty: 'No home collections waiting. Orders for the Home Collection centre appear here.',
      cols: [{ h: 'Slot' }, { h: 'Order' }, { h: 'Patient' }, { h: 'Address' }, { h: 'Phone' }, { h: 'Tests', align: 'right' }, { h: 'Status' }],
      rows,
    })) + `<p class="muted small">Sorted by time slot, then by area. Select a visit and press Mark collected to record who collected it.</p>`;
  }
  function selectedSample() {
    const id = sel('samples');
    return id ? sampleById(Number(id)) : null;
  }
  function moveSample(target, message) {
    const s = selectedSample();
    if (!s) return;
    try { svc.moveSample(s.id, target); toast(message, 'ok'); PL.app.refresh(); } catch (e) { PL.app.handle(e, 'Not changed'); }
  }

  // ---- Lab operations -----------------------------------------------------------
  const OPS_TABS = [
    ['crit', 'Critical values', 'critical.notify'],
    ['out', 'Outsourced tests', 'outsource.manage'],
    ['inv', 'Inventory', 'inventory.manage'],
    ['qc', 'Quality control', 'qc.manage'],
    ['eq', 'Equipment', 'equipment.manage'],
    ['an', 'Analyser import', 'analyser.import'],
  ];
  const SAMPLE_CSV = 'sample,code,value';
  const labOps = {
    title: 'Lab Operations',
    sub: 'Critical values, outsourced tests, inventory, quality control, equipment and analysers',
    state: { tab: null, analyser: '' },
    detailTables: ['inv', 'eq'],
    tabs() { return OPS_TABS.filter(([, , perm]) => hp(perm)); },
    toolbar: () => '',
    body() {
      const tabs = this.tabs();
      if (!tabs.length) return empty('Your role has no laboratory operations.');
      if (!tabs.find(([k]) => k === this.state.tab)) this.state.tab = tabs[0][0];
      const bar = `<div class="tabs">${tabs.map(([k, t]) =>
        `<button class="tab ${k === this.state.tab ? 'on' : ''}" data-act="opsTab" data-tab="${k}">${esc(t)}</button>`).join('')}</div>`;
      const body = { crit: critTab, out: outTab, inv: invTab, qc: qcTab, eq: eqTab, an: anTab }[this.state.tab]();
      return bar + `<div class="ops-body">${body}</div>`;
    },
    actions: {
      opsTab(el) { this.state.tab = el.dataset.tab; PL.app.refresh(); },
      opsNotify() {
        const id = sel('crit');
        if (!id) return;
        const [orderId, code] = id.split('|');
        PL.dialogs.notifyCritical(Number(orderId), code);
      },
      outSend: () => PL.dialogs.sendOut(),
      outReceive() {
        const rec = S.outsource.find((x) => x.id === Number(sel('out')));
        if (!rec) return;
        form({
          title: 'Record result from partner lab', width: 480,
          fields: [{ name: 'result', label: 'Result received', type: 'textarea', rows: 3, required: true, full: true }],
          submit: 'Save result',
          onSubmit: (v) => { svc.receiveOut(rec.id, v.result.trim()); toast('Result recorded', 'ok'); PL.app.refresh(); },
        });
      },
      invNew: () => PL.dialogs.item(null),
      invEdit: () => { const it = S.inventory.find((x) => x.id === Number(sel('inv'))); if (it) PL.dialogs.item(it); },
      invReceive: () => { const it = selItem(); if (it) PL.dialogs.stockIn(it); },
      invIssue: () => { const it = selItem(); if (it) PL.dialogs.stockOut(it); },
      invCount: () => { const it = selItem(); if (it) PL.dialogs.stockCount(it); },
      qcNew: () => PL.dialogs.qc(),
      eqNew: () => PL.dialogs.equipment(null),
      eqEdit: () => { const e = S.equipment.find((x) => x.id === Number(sel('eq'))); if (e) PL.dialogs.equipment(e); },
      eqLog: () => { const e = S.equipment.find((x) => x.id === Number(sel('eq'))); if (e) PL.dialogs.equipmentLog(e); },
      anPreview() { previewAnalyser(document.getElementById('an-text').value, analyserFormat()); },
      anLoad() { this.state.analyser = sampleAnalyser(analyserFormat()); PL.app.refresh(); },
      anImport() {
        const text = document.getElementById('an-text').value;
        this.state.analyser = text;
        try {
          const { applied, skipped } = svc.importAnalyser(text, analyserFormat());
          const msg = `${applied} value(s) applied.` + (skipped.length ? `\n\nSkipped:\n${skipped.slice(0, 8).join('\n')}` : '');
          alertBox('Import complete', msg, applied ? 'ok' : 'warn');
          PL.app.refresh();
        } catch (e) { PL.app.handle(e, 'Import failed'); }
      },
    },
    inputs: { anText(el) { this.state.analyser = el.value; } },
    sync() {},
  };
  function selItem() {
    const it = S.inventory.find((x) => x.id === Number(sel('inv')));
    if (!it) toast('Select an inventory item first.', 'warn');
    return it || null;
  }
  function critTab() {
    const rows = [];
    q.openForResults().forEach((o) => {
      const p = patientById(o.patientId);
      Object.entries(o.results).forEach(([code, r]) => {
        if (!isCritical(r.flag)) return;
        rows.push({
          id: `${o.id}|${code}`,
          cells: [`<b>${esc(o.orderNo)}</b>`, esc(patientName(p)), esc(testByCode(code).name), `<b>${esc(r.value)} ${esc(testByCode(code).unit)}</b>`,
            badge(FLAG_TEXT[r.flag], 'bad'), esc(fdtShort(r.at)),
            r.notified ? `${esc(r.notified.to)} <span class="muted">(${esc(r.notified.method)})</span>` : badge('Not notified', 'bad')],
        });
      });
    });
    return card(null, `<div class="toolbar-row">${btn('Record notification...', 'opsNotify', { primary: true, req: 'crit' })}</div>` +
      table({
        id: 'crit', selected: sel('crit'), empty: 'No critical values are waiting for notification.',
        cols: [{ h: 'Order' }, { h: 'Patient' }, { h: 'Test' }, { h: 'Value' }, { h: 'Flag' }, { h: 'Entered' }, { h: 'Told' }],
        rows,
      })) ;
  }
  function outTab() {
    const rows = S.outsource.map((r) => {
      const o = S.orders.find((x) => x.id === r.orderId);
      return {
        id: r.id,
        cells: [esc(fdt(r.sentAt)), esc(o ? o.orderNo : '-'), esc(testByCode(r.testCode) ? testByCode(r.testCode).name : r.testCode),
          esc(r.lab), esc(r.reference || '-'), esc(fdate(r.expected)), money(r.cost), badge(r.status === 'SENT' ? 'Sent' : 'Received', r.status === 'SENT' ? 'SENT' : 'OK')],
      };
    });
    return card(null, `<div class="toolbar-row">${btn('Send test out...', 'outSend', { primary: true })}` +
      `${btn('Record result...', 'outReceive', { req: 'out' })}</div>` +
      table({ id: 'out', selected: sel('out'), empty: 'Nothing has been sent to a partner laboratory.',
        cols: [{ h: 'Sent' }, { h: 'Order' }, { h: 'Test' }, { h: 'Partner laboratory' }, { h: 'Their reference' }, { h: 'Expected back' }, { h: 'Cost', align: 'right' }, { h: 'Status' }],
        rows }));
  }
  function invTab() {
    const rows = S.inventory.map((it) => {
      const qty = sum(it.lots.map((l) => l.qty));
      const st = PL.store.inventoryStatus(it);
      return { id: it.id, cells: [esc(it.code), esc(it.name), esc(it.unit), `<span class="num">${qty}</span>`, esc(it.reorder), badge(st, st)] };
    });
    const it = S.inventory.find((x) => x.id === Number(sel('inv')));
    const lots = it ? it.lots.slice().sort((a, b) => a.expiry.localeCompare(b.expiry)).map((l) => ({
      id: l.lot, cells: [esc(l.lot), esc(fdate(l.expiry)), `${Math.round((new Date(l.expiry) - Date.now()) / 864e5)}`, `<span class="num">${l.qty}</span>`],
    })) : [];
    const moves = it ? it.movements.slice().reverse().slice(0, 12).map((m, i) => ({
      id: i, cells: [esc(fdt(m.at)), esc(m.type), `<span class="num">${m.qty > 0 ? '+' : ''}${m.qty}</span>`, esc(m.note), esc(m.by)],
    })) : [];
    return card(null, `<div class="toolbar-row">${btn('New item...', 'invNew')}${btn('Edit item...', 'invEdit', { req: 'inv' })}` +
      `${btn('Receive stock...', 'invReceive', { primary: true, req: 'inv' })}${btn('Issue stock...', 'invIssue', { req: 'inv' })}` +
      `${btn('Correct count...', 'invCount', { req: 'inv' })}</div>` +
      table({ id: 'inv', selected: sel('inv'), empty: 'No inventory items yet.',
        cols: [{ h: 'Code' }, { h: 'Item' }, { h: 'Unit' }, { h: 'On hand', align: 'right' }, { h: 'Reorder at', align: 'right' }, { h: 'Status' }], rows }) +
      `<div class="split-2 gap-top">` +
      card(it ? `Lots - ${it.name}` : 'Lots', table({ id: 'lots', empty: 'Select an item to see its lots.',
        cols: [{ h: 'Lot' }, { h: 'Expiry' }, { h: 'Days left', align: 'right' }, { h: 'Quantity', align: 'right' }], rows: lots })) +
      card('Movements', table({ id: 'moves', empty: 'No movements yet.',
        cols: [{ h: 'When' }, { h: 'Type' }, { h: 'Qty', align: 'right' }, { h: 'Note' }, { h: 'By' }], rows: moves })) + `</div>`);
  }
  function qcTab() {
    const rows = S.qc.slice().reverse().map((r) => ({
      id: r.id, cells: [esc(fdate(r.date)), esc(r.test), esc(r.level), `<span class="num">${r.value}</span>`, esc(r.mean), esc(r.sd),
        `<span class="num">${r.z > 0 ? '+' : ''}${r.z}</span>`, badge(label(r.status), r.status), esc(r.by)],
    }));
    return card(null, `<div class="toolbar-row">${btn('New QC record...', 'qcNew', { primary: true })}</div>` +
      table({ id: 'qc', empty: 'No QC records yet.',
        cols: [{ h: 'Date' }, { h: 'Test' }, { h: 'Level' }, { h: 'Value', align: 'right' }, { h: 'Mean', align: 'right' }, { h: 'SD', align: 'right' }, { h: 'z', align: 'right' }, { h: 'Status' }, { h: 'By' }],
        rows }) +
      `<p class="muted small">Rules: |z| above 2 is flagged out of range (1-2s); above 3 fails (1-3s).</p>`);
  }
  function eqTab() {
    const rows = S.equipment.map((e) => {
      const st = PL.store.equipmentStatus(e);
      const next = e.lastCal ? fdate(new Date(new Date(e.lastCal).getTime() + e.intervalDays * 864e5).toISOString()) : '-';
      return { id: e.id, cells: [esc(e.code), esc(e.name), esc(e.kind), esc(e.location), esc(fdate(e.lastCal)), esc(next), badge(st, st)] };
    });
    const e = S.equipment.find((x) => x.id === Number(sel('eq')));
    const hist = e ? e.log.slice().reverse().map((l, i) => ({ id: i, cells: [esc(fdate(l.date)), esc(l.event), esc(l.note), esc(l.by)] })) : [];
    return card(null, `<div class="toolbar-row">${btn('New...', 'eqNew')}${btn('Edit...', 'eqEdit', { req: 'eq' })}` +
      `${btn('Log event...', 'eqLog', { primary: true, req: 'eq' })}</div>` +
      table({ id: 'eq', selected: sel('eq'), empty: 'No equipment registered.',
        cols: [{ h: 'Code' }, { h: 'Name' }, { h: 'Kind' }, { h: 'Location' }, { h: 'Last calibrated' }, { h: 'Next due' }, { h: 'Status' }], rows }) +
      `<div class="gap-top">` + card(e ? `Service history - ${e.name}` : 'Service history',
        table({ id: 'eqh', empty: 'Select equipment to see its history.',
          cols: [{ h: 'Date' }, { h: 'Event' }, { h: 'Note' }, { h: 'By' }], rows: hist })) + `</div>`);
  }
  const analyserFormat = () => (document.getElementById('an-format') || {}).value || 'CSV';
  // An example file in the chosen format, built from samples that are awaiting results.
  function sampleAnalyser(format) {
    const open = S.samples.filter((s) => s.status === 'RECEIVED' || s.status === 'PROCESSING' || s.status === 'COLLECTED').slice(0, 2);
    const rows = [];
    open.forEach((s) => s.tests.slice(0, 2).forEach((c) => {
      const def = testByCode(c);
      rows.push({ sampleNo: s.sampleNo, code: c, value: def.kind === 'quant' ? computeSample(def) : (def.normal || def.choices[0]) });
    }));
    const samples = [...new Set(rows.map((r) => r.sampleNo))];
    if (format === 'ASTM') {
      const lines = ['H|\\^&|||PathoLab demo analyser', 'P|1'];
      samples.forEach((no, i) => {
        lines.push(`O|${i + 1}|${no}||^^^ALL`);
        rows.filter((r) => r.sampleNo === no).forEach((r, j) => lines.push(`R|${j + 1}|^^^${r.code}|${r.value}`));
      });
      return lines.concat(['L|1|N']).join('\r');
    }
    if (format === 'HL7') {
      const lines = ['MSH|^~\\&|ANALYSER|DEMO|PATHOLAB|LAB|20260101000000||ORU^R01|1|P|2.5'];
      samples.forEach((no, i) => {
        lines.push(`OBR|${i + 1}||${no}|^^^ALL`);
        rows.filter((r) => r.sampleNo === no).forEach((r, j) => lines.push(`OBX|${j + 1}|NM|${r.code}^${testByCode(r.code).name}||${r.value}|||||F`));
      });
      return lines.join('\r');
    }
    return [SAMPLE_CSV].concat(rows.map((r) => `${r.sampleNo},${r.code},${r.value}`)).join('\n');
  }
  function computeSample(def) {
    const r = def.ranges[0];
    if (!r) return '1';
    return String(Math.round(((r.lo != null ? r.lo : 1) + (r.hi != null ? r.hi : 2)) * 50) / 100);
  }
  function anTab() {
    const text = labOps.state.analyser || '';
    return card('Analyser import',
      `<div class="split-2"><div class="stack">` +
      `<label class="field"><span>Format</span><select id="an-format">` +
      `<option value="CSV">CSV (sample, test code, value)</option>` +
      `<option value="ASTM">ASTM E1394 (O and R records)</option>` +
      `<option value="HL7">HL7 v2 ORU (OBR and OBX segments)</option></select></label>` +
      `<label class="field"><span>File contents</span><textarea id="an-text" data-input="anText" rows="10" placeholder="sample,code,value">${esc(text)}</textarea></label>` +
      `<div class="toolbar-row"><button data-act="anLoad">Load example</button><button data-act="anPreview">Preview</button>` +
      `<button class="primary" data-act="anImport">Import results</button></div></div>` +
      `<div class="muted small"><p>Each result names a sample number, the test code requested on that sample, and the measured value. ` +
      `Values are validated and flagged exactly as if typed into Result Entry.</p>` +
      `<p>The web demo reads all three formats in the browser. The desktop app also reads them from a serial or network connection to the analyser, which the demo cannot do.</p>` +
      `<p>Load the example, then pick the format it matches.</p></div></div>`);
  }
  function previewAnalyser(text, format) {
    const rows = svc.previewAnalyser(text, format).map((r, i) => ({ id: i, cells: [
      esc(r.sampleNo), esc(r.code), esc(r.value), r.status === 'OK' ? badge('OK', 'OK') : badge(r.status, 'bad')] }));
    modal({ title: `Import preview (${format})`, width: 620,
      body: table({ id: 'anp', cols: [{ h: 'Sample' }, { h: 'Code' }, { h: 'Value' }, { h: 'Check' }], rows, empty: 'No results found in this text.' }),
      buttons: [{ label: 'Close', primary: true }] });
  }

  // ---- Test catalogue ---------------------------------------------------------
  const catalog = {
    title: 'Test Catalog',
    sub: 'Investigations, reference ranges and prices',
    state: { term: '' },
    detailTables: ['tests'],
    toolbar: () => (hp('catalog.manage') ? btn('New Test', 'catNew', { primary: true }) : '') +
      btn('Edit Test', 'catEdit', { req: 'tests' }),
    body() {
      const t = this.state.term.trim().toLowerCase();
      const list = S.tests.filter((x) => !t || `${x.code} ${x.name} ${x.dept}`.toLowerCase().includes(t));
      const rows = list.map((x) => ({
        id: x.code,
        cells: [`<b>${esc(x.code)}</b>`, esc(x.name), esc(x.dept), esc(KINDS[x.kind]), esc(x.unit || '-'),
          esc(x.specimen || '-'), `<span class="num">${money(x.price)}</span>`, x.active ? badge('Active', 'OK') : badge('Inactive', 'muted')],
      }));
      const cur = sel('tests') ? testByCode(sel('tests')) : null;
      let detail = empty('Select a test to see its reference ranges.');
      if (cur) {
        if (cur.kind === 'panel') {
          detail = `<p>Panel of ${cur.children.length} test(s):</p><ul class="plain">` +
            cur.children.map((c) => `<li>${esc(testByCode(c) ? testByCode(c).name : c)}</li>`).join('') + '</ul>';
        } else if (cur.kind === 'quant') {
          detail = table({ id: 'ranges', cols: [{ h: 'Gender' }, { h: 'Age band' }, { h: 'Low', align: 'right' }, { h: 'High', align: 'right' }, { h: 'Critical', align: 'right' }, { h: 'Printed as' }],
            rows: cur.ranges.map((r, i) => ({ id: i, cells: [r.g ? genderLabel(r.g) : 'Any', 'All ages', esc(r.lo ?? '-'), esc(r.hi ?? '-'),
              esc([r.cl, r.ch].filter((v) => v != null).join(' / ') || '-'), esc(r.printed || '-')] })) });
        } else {
          detail = `<p>Choices: ${cur.choices.map((c) => `<span class="chip ${c === cur.normal ? 'chip-ok' : ''}">${esc(c)}</span>`).join(' ')}</p>` +
            (cur.normal ? `<p class="muted">Normal: ${esc(cur.normal)}</p>` : '');
        }
      }
      return `<div class="filter-row"><input class="search grow" placeholder="Search by code, name or department..." value="${esc(this.state.term)}" data-input="catSearch"></div>` +
        `<div class="split-v">` + card(`Catalog (${list.length})`, table({ id: 'tests', selected: sel('tests'),
          cols: [{ h: 'Code' }, { h: 'Name' }, { h: 'Department' }, { h: 'Type' }, { h: 'Unit' }, { h: 'Specimen' }, { h: 'Price', align: 'right' }, { h: 'Active' }],
          rows }), 'grow') + card(cur ? `${cur.name} (${cur.code})` : 'Details', detail, { cls: 'grow' }) + `</div>`;
    },
    inputs: { catSearch(el) { this.state.term = el.value; PL.app.refresh(true); } },
    dbl(tableId, id) { if (tableId === 'tests') PL.dialogs.editTest(id); },
    actions: {
      catNew: () => PL.dialogs.editTest(null),
      catEdit: () => PL.dialogs.editTest(sel('tests')),
    },
    sync() {},
  };

  // ---- Reports ----------------------------------------------------------------
  const reports = {
    title: 'Reports',
    sub: 'Previously generated laboratory reports',
    detailTables: ['reports'],
    toolbar: () => btn('Open PDF', 'repOpen', { primary: true, req: 'reports' }) + btn('Regenerate', 'repRegen', { req: 'reports' }) +
      btn('Verify Signature', 'repVerify', { req: 'reports' }) + btn('Send on WhatsApp', 'repWhatsapp', { req: 'reports' }) +
      btn('Send Email', 'repEmail', { req: 'reports' }) + btn('Open Folder', 'repFolder') + btn('Refresh', 'refresh'),
    body() {
      const list = S.reports.slice().reverse();
      const rows = list.map((r) => ({ id: r.id, cells: [esc(fdtShort(r.at)), `<b>${esc(r.orderNo)}</b>`, esc(r.patient), badge(r.type, r.type === 'Final' ? 'OK' : 'WARN'), esc(r.by), `<span class="muted">${esc(r.file)}</span>`] }));
      const cur = sel('reports') ? S.reports.find((r) => r.id === Number(sel('reports'))) : null;
      const preview = cur ? PL.dialogs.reportHtml(cur) : empty('Select a report to preview it. Reports are drawn from the order\'s current results.');
      return card(`Report history (${list.length})`, table({ id: 'reports', selected: sel('reports'), empty: 'No reports have been generated yet. Generate one from Result Entry.',
        cols: [{ h: 'Generated' }, { h: 'Order' }, { h: 'Patient' }, { h: 'Type' }, { h: 'By' }, { h: 'File' }], rows })) +
        card('Preview', `<div class="paper-scroll">${cur ? `<div class="paper">${preview}</div>` : preview}</div>`, { cls: 'grow' });
    },
    dbl(tableId, id) { if (tableId === 'reports') this.actions.repOpen(); },
    actions: {
      repOpen() { const r = currentReport(); if (r) printHtml(PL.dialogs.reportHtml(r)); },
      repRegen() {
        const r = currentReport();
        if (!r) return;
        try { svc.generateReport(r.orderId, r.type === 'Provisional'); toast('Report regenerated', 'ok'); PL.app.refresh(); } catch (e) { PL.app.handle(e, 'Could not regenerate the report'); }
      },
      async repWhatsapp() {
        const r = currentReport();
        if (!r) return;
        if (r.type !== 'Final') { alertBox('Send on WhatsApp', 'Only final reports can be sent on WhatsApp.', 'warn'); return; }
        if (!PL.store.S.whatsapp.sendReportPdf) {
          alertBox('Send on WhatsApp', 'Sending report PDFs on WhatsApp is switched off. Turn it on under Tools > WhatsApp Messaging.', 'warn');
          return;
        }
        if (!await confirmBox('Send on WhatsApp', `Send the report for ${r.orderNo} to the patient on WhatsApp? The report contains test results. Check the number before sending.`, { ok: 'Send' })) return;
        try {
          const res = svc.sendReportWhatsapp(r.id);
          if (res.status === 'SENT') toast(`Report sent on WhatsApp for ${r.orderNo} (simulated)`, 'ok');
          else alertBox('Report not sent', res.detail, 'warn');
          PL.app.refresh();
        } catch (e) { PL.app.handle(e, 'Report not sent'); }
      },
      repVerify() {
        const r = currentReport();
        if (!r) return;
        try {
          const res = svc.verifySignature(r.id);
          alertBox('Verify signature', res.detail, res.valid ? 'ok' : 'bad');
        } catch (e) { PL.app.handle(e, 'Could not verify the signature'); }
      },
      repEmail() {
        const r = currentReport();
        if (!r) return;
        const o = orderById(r.orderId);
        const p = patientById(o.patientId);
        form({
          title: 'Send report via e-mail', width: 480,
          fields: [
            { name: 'to', label: 'To', required: true, value: p && p.email ? p.email : '', full: true, placeholder: 'patient@example.com' },
            { name: 'note', label: 'Message', type: 'textarea', rows: 3, full: true, value: `Dear ${p ? p.firstName : 'patient'}, please find your report ${r.orderNo} attached.` },
          ],
          note: 'Demo mode: the e-mail is not actually sent. The desktop app uses the SMTP settings under Tools > Settings > Email Configuration.',
          submit: 'Send (simulated)',
          onSubmit: (v) => toast(`Simulated: ${r.file} would be sent to ${v.to}`, 'info'),
        });
      },
      repFolder() { toast('Demo: reports are created on demand and are not stored on disk.', 'info'); },
    },
    sync() {},
  };
  function currentReport() {
    const id = sel('reports');
    const r = id ? S.reports.find((x) => x.id === Number(id)) : null;
    if (!r) toast('Select a report first.', 'warn');
    return r || null;
  }

  // ---- Billing and finance ----------------------------------------------------
  const finance = {
    title: 'Billing & Finance',
    sub: 'Collections, dues, doctor commission and expenses for a period',
    state: { tab: 'billing', from: '', to: '' },
    toolbar() {
      const st = ensurePeriod(this.state);
      return `<span class="muted">From</span>${dateInput('fin-from', st.from, 'finPeriod')}` +
        `<span class="muted">To</span>${dateInput('fin-to', st.to, 'finPeriod')}` +
        `<button data-act="finMonth">This month</button>` +
        `<button data-act="finExport">Export Statement (CSV)...</button>`;
    },
    body() {
      const st = ensurePeriod(this.state);
      const f = q.finance(st.from, st.to);
      const tabs = [['billing', 'Billing'], ['commission', 'Doctor Commission'], ['expenses', 'Expenses & P&L']];
      const cards = `<div class="stats-5">` + stat('Billed revenue', money(f.billed), 'net of discounts') +
        stat('Cash collected', money(f.collected), 'excludes adjustments') + stat('Expenses', money(f.expenses)) +
        stat('Doctor commission', money(f.commission), 'earned on billed') +
        stat('Net profit', money(f.profit), 'billed - expenses - commission', true) + `</div>`;
      const body = { billing: billingTab, commission: commissionTab, expenses: expensesTab }[this.state.tab](st, f);
      return cards + `<div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${k === this.state.tab ? 'on' : ''}" data-act="finTab" data-tab="${k}">${t}</button>`).join('')}</div>` +
        `<div class="ops-body">${body}</div>`;
    },
    inputs: {
      finPeriod(el) { if (el.id === 'fin-from') this.state.from = el.value; else this.state.to = el.value; PL.app.refresh(true); },
    },
    actions: {
      finTab(el) { this.state.tab = el.dataset.tab; PL.app.refresh(); },
      finMonth() { this.state.from = monthStartKey(); this.state.to = todayKey(); PL.app.refresh(); },
      finExport() { exportStatement(ensurePeriod(this.state)); },
      finReceive() {
        const o = orderById(Number(sel('dues')));
        if (o) PL.dialogs.receivePayment(o.id);
      },
      finInvoice() { const o = orderById(Number(sel('dues'))); if (o) printHtml(PL.dialogs.invoiceHtml(o)); },
      finReminder() {
        const o = orderById(Number(sel('dues')));
        if (!o) return;
        try {
          const res = svc.sendPaymentReminder(o.id);
          if (res.status === 'SENT') toast(`WhatsApp reminder sent for ${o.orderNo}`, 'ok');
          else alertBox('WhatsApp reminder not sent', res.detail, 'warn');
          PL.app.refresh();
        } catch (e) { PL.app.handle(e, 'Reminder not sent'); }
      },
      finReceipt() {
        const o = orderById(Number(sel('dues')));
        if (!o) return;
        if (!o.payments.length) { toast('No payments on this order yet.', 'warn'); return; }
        printHtml(PL.dialogs.receiptHtml(o, o.payments[o.payments.length - 1]));
      },
      finRule: () => PL.dialogs.commissionRule(),
      finRuleRemove: async () => {
        const id = Number(sel('rules'));
        const d = doctorById(id);
        if (!d) return;
        if (!await confirmBox('Remove rule', `Remove the commission for ${d.name}? (Sets it to 0%.)`, { danger: true, ok: 'Remove' })) return;
        try { svc.setCommission(id, 0); toast('Rule removed'); PL.app.refresh(); } catch (e) { PL.app.handle(e, 'Could not remove the rule'); }
      },
      finPayout: () => { const d = doctorById(Number(sel('rules'))); if (d) PL.dialogs.payout(d.id); },
      finExpense: () => PL.dialogs.expense(),
      finExpenseDelete: async () => {
        const id = Number(sel('exp'));
        if (!id) return;
        if (!await confirmBox('Delete expense', 'Delete this expense?', { danger: true, ok: 'Delete' })) return;
        svc.deleteExpense(id); toast('Expense deleted'); PL.app.refresh();
      },
    },
    sync() {
      const set = (act, ok) => { const b = document.querySelector(`[data-act="${act}"]`); if (b) b.disabled = !ok; };
      const hasDue = !!sel('dues');
      ['finReceive', 'finInvoice', 'finReceipt', 'finReminder'].forEach((a) => set(a, hasDue));
      set('finRuleRemove', !!sel('rules'));
      set('finPayout', !!sel('rules'));
      set('finExpenseDelete', !!sel('exp'));
    },
  };
  function billingTab(st) {
    const dues = q.orders({ term: '', status: '', from: st.from, to: st.to }).filter((o) => o.status !== 'CANCELLED' && orderTotals(o).balance > 0.005);
    const duesRows = dues.map((o) => {
      const p = patientById(o.patientId);
      const t = orderTotals(o);
      return { id: o.id, cells: [`<b>${esc(o.orderNo)}</b>`, esc(patientName(p)), `<span class="num">${money(o.net)}</span>`,
        `<span class="num">${money(t.paid)}</span>`, `<span class="num warn-text">${money(t.balance)}</span>`, badge(label(t.payment), t.payment)] };
    });
    const payments = S.orders.flatMap((o) => o.payments.map((p) => ({ ...p, order: o }))).filter((p) => PL.store.inRange(p.at, st.from, st.to))
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    const payRows = payments.map((p) => ({ id: p.id, cells: [esc(p.receipt), esc(fdt(p.at)), esc(p.order.orderNo), `<span class="num">${money(p.amount)}</span>`, esc(label(p.method)), esc(p.ref || '-')] }));
    return card('Outstanding dues', `<div class="toolbar-row">` +
      (hp('billing.collect') ? btn('Receive Payment...', 'finReceive', { primary: true, req: 'dues' }) : '') +
      `${btn('Print Invoice', 'finInvoice', { req: 'dues' })}${btn('Print Receipt', 'finReceipt', { req: 'dues' })}` +
      `${hp('billing.collect') ? btn('Send WhatsApp Reminder', 'finReminder', { req: 'dues' }) : ''}</div>` +
      table({ id: 'dues', selected: sel('dues'), empty: 'No outstanding dues in this period.',
        cols: [{ h: 'Order' }, { h: 'Patient' }, { h: 'Net', align: 'right' }, { h: 'Paid', align: 'right' }, { h: 'Balance', align: 'right' }, { h: 'Payment' }], rows: duesRows })) +
      card('Payments received', table({ id: 'pays', empty: 'No payments in this period.',
        cols: [{ h: 'Receipt' }, { h: 'When' }, { h: 'Order' }, { h: 'Amount', align: 'right' }, { h: 'Mode' }, { h: 'Reference' }], rows: payRows }), { cls: 'gap-top' });
  }
  function commissionTab(st) {
    const rows = S.doctors.map((d) => {
      const c = PL.store.commissionDue(d.id, st.from, st.to);
      return { id: d.id, cells: [esc(d.name), `${c.pct}%`, `<span class="num">${money(c.earned)}</span>`, `<span class="num">${money(c.paid)}</span>`, `<span class="num">${money(c.due)}</span>`] };
    });
    const canEdit = hp('finance.manage');
    return card('Commission by doctor', `<div class="toolbar-row">` +
      (canEdit ? `${btn('Add / Change Rule...', 'finRule', { primary: true })}${btn('Remove Rule', 'finRuleRemove', { req: 'rules' })}` +
        `${btn('Record Payout...', 'finPayout', { req: 'rules' })}` : '<span class="muted">Commission rules need the finance permission.</span>') + `</div>` +
      table({ id: 'rules', selected: sel('rules'), empty: 'No referring doctors yet.',
        cols: [{ h: 'Applies to' }, { h: 'Commission', align: 'right' }, { h: 'Earned', align: 'right' }, { h: 'Paid out', align: 'right' }, { h: 'Due', align: 'right' }], rows }));
  }
  function expensesTab(st, f) {
    const list = S.expenses.filter((e) => (!st.from || e.date >= st.from) && (!st.to || e.date <= st.to)).sort((a, b) => (a.date < b.date ? 1 : -1));
    const rows = list.map((e) => ({ id: e.id, cells: [esc(fdate(e.date)), esc(e.category), `<span class="num">${money(e.amount)}</span>`, esc(e.note || '-')] }));
    const cats = {};
    list.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
    const catRows = Object.entries(cats).map(([c, a]) => ({ id: c, cells: [esc(c), `<span class="num">${money(a)}</span>`] }));
    const pnl = `<table class="kv"><tr><td>Billed revenue</td><td class="al-right">${money(f.billed)}</td></tr>` +
      `<tr><td>Less expenses</td><td class="al-right">${money(-f.expenses)}</td></tr>` +
      `<tr><td>Less doctor commission</td><td class="al-right">${money(-f.commission)}</td></tr>` +
      `<tr class="total"><td><b>Net profit</b></td><td class="al-right"><b>${money(f.profit)}</b></td></tr></table>`;
    return `<div class="toolbar-row">` +
      (hp('finance.manage') ? `${btn('New Expense...', 'finExpense', { primary: true })}${btn('Delete Expense', 'finExpenseDelete', { req: 'exp' })}` : '') + `</div>` +
      `<div class="split-2">` +
      card('Expenses', table({ id: 'exp', selected: sel('exp'), empty: 'No expenses in this period.',
        cols: [{ h: 'Date' }, { h: 'Category' }, { h: 'Amount', align: 'right' }, { h: 'Note' }], rows })) +
      `<div class="stack">` + card('Profit and loss', pnl) +
      card('By category', table({ id: 'cats', cols: [{ h: 'Category' }, { h: 'Amount', align: 'right' }], rows: catRows, empty: 'No expenses.' })) + `</div></div>`;
  }
  function exportStatement(st) {
    const orders = q.orders({ term: '', status: '', from: st.from, to: st.to }).filter((o) => o.status !== 'CANCELLED');
    const esc2 = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Order', 'Registered', 'Patient', 'Net', 'Paid', 'Balance'].join(',')];
    orders.forEach((o) => {
      const t = orderTotals(o);
      lines.push([o.orderNo, fdt(o.registeredAt), patientName(patientById(o.patientId)), o.net, t.paid, t.balance].map(esc2).join(','));
    });
    download(`statement-${st.from}-to-${st.to}.csv`, lines.join('\n'), 'text/csv');
    toast(`Exported ${orders.length} order(s)`, 'ok');
  }

  // ---- MIS --------------------------------------------------------------------
  const mis = {
    title: 'MIS Reports',
    sub: 'Volume, revenue, turnaround, referrers and staff output for a period',
    state: { from: '', to: '' },
    toolbar() {
      const st = ensurePeriod(this.state);
      return `<span class="muted">From</span>${dateInput('mis-from', st.from, 'misPeriod')}` +
        `<span class="muted">To</span>${dateInput('mis-to', st.to, 'misPeriod')}` +
        `<button data-act="misMonth">This month</button>`;
    },
    body() {
      const st = ensurePeriod(this.state);
      const m = q.mis(st.from, st.to);
      const tiles = [
        ['Orders registered', m.orders], ['Net revenue', money(m.revenue)], ['Cash collected', money(m.collected)],
        ['Owed today', money(m.outstanding), true], ['Reports issued', m.reported], ['Average turnaround', `${m.tat.toFixed(1)} h`],
        ['Reported within TAT', `${m.compliance.toFixed(0)}%`], ['Critical values', m.critical, true], ['Packages sold', m.packages],
        ['Samples rejected', m.rejected], ['Samples awaiting receipt', m.awaiting], ['Abnormal values', m.abnormal],
      ];
      const bars = (entries, fmt) => {
        const max = Math.max(1, ...entries.map((e) => e[1]));
        return entries.length ? `<div class="bars">${entries.map(([k, v]) => `<div class="bar-row"><span class="trunc">${esc(k)}</span>` +
          `<div class="bar"><i style="width:${(v / max) * 100}%"></i></div><b>${esc(fmt(v))}</b></div>`).join('')}</div>` : empty('No data in this period.');
      };
      const dayEntries = Object.entries(m.days).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-14).map(([k, v]) => [k.slice(5), v]);
      const deptEntries = Object.entries(m.depts).sort((a, b) => b[1] - a[1]);
      const refEntries = Object.entries(m.refs).sort((a, b) => b[1].net - a[1].net).map(([k, v]) => [k, v.net]);
      return `<div class="stats-4">${tiles.map(([c, v, a]) => stat(c, v, '', a)).join('')}</div>` +
        `<div class="split-3">` +
        card('Orders per day', bars(dayEntries, (v) => v)) +
        card('Gross billed by department', bars(deptEntries, (v) => money(v))) +
        card('Net revenue by referrer', bars(refEntries, (v) => money(v))) + `</div>` +
        `<div class="split-3 gap-top">` +
        card('Top referrers', table({ id: 'mref', cols: [{ h: 'Referrer' }, { h: 'Orders', align: 'right' }, { h: 'Net revenue', align: 'right' }],
          rows: Object.entries(m.refs).sort((a, b) => b[1].net - a[1].net).map(([k, v]) => ({ id: k, cells: [esc(k), v.orders, money(v.net)] })), empty: 'No referrals.' })) +
        card('Top tests', table({ id: 'mtest', cols: [{ h: 'Test' }, { h: 'Count', align: 'right' }, { h: 'Gross billed', align: 'right' }],
          rows: m.tests.map((t, i) => ({ id: i, cells: [esc(t.name), t.count, money(t.gross)] })), empty: 'No tests.' })) +
        card('Staff output', table({ id: 'mstaff', cols: [{ h: 'Staff' }, { h: 'Results entered', align: 'right' }, { h: 'Results verified', align: 'right' }],
          rows: m.staff.map((s) => {
            const u = S.users.find((x) => x.username === s.user);
            return { id: s.user, cells: [esc(u ? u.fullName : s.user), s.entered, s.verified] };
          }), empty: 'No staff activity in this period.' })) + `</div>`;
    },
    inputs: { misPeriod(el) { if (el.id === 'mis-from') this.state.from = el.value; else this.state.to = el.value; PL.app.refresh(true); } },
    actions: { misMonth() { this.state.from = monthStartKey(); this.state.to = todayKey(); PL.app.refresh(); } },
    sync() {},
  };

  PL.screens = { dashboard, patients, orders, results, samples, operations: labOps, catalog, reports, finance, mis };
})(window.PL = window.PL || {});
