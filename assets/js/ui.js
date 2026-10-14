/*
 * PathoLab demo - small UI toolkit: tables, cards, modals, forms, toasts, print.
 * Markup classes follow the desktop stylesheet names (Card, Primary, Danger...).
 */
(function (PL) {
  'use strict';

  const SYMBOL = { INR: '₹', USD: '$', EUR: '€', AED: 'AED ' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function money(n) {
    const cur = PL.store.S.lab.currency || 'INR';
    const v = Number(n) || 0;
    const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${v < 0 ? '-' : ''}${SYMBOL[cur] || ''}${s}`;
  }
  function fdate(v) {
    if (!v) return '-';
    const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v;
    const d = new Date(s);
    if (isNaN(d)) return '-';
    return `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]}-${d.getFullYear()}`;
  }
  function fdt(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d)) return '-';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${fdate(v)} ${hh}:${mm}`;
  }
  const fdtShort = (v) => {
    if (!v) return '-';
    const d = new Date(v);
    return `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const TONE = {
    REGISTERED: 'info', COLLECTED: 'info', IN_PROGRESS: 'warn', COMPLETED: 'ok', REPORTED: 'ok', CANCELLED: 'muted',
    PENDING: 'muted', RECEIVED: 'info', PROCESSING: 'warn', STORED: 'ok', REJECTED: 'bad', DISPOSED: 'muted',
    PAID: 'ok', PARTIAL: 'warn', UNPAID: 'bad', URGENT: 'warn', STAT: 'bad', ROUTINE: 'muted',
    PASSED: 'ok', FAILED: 'bad', OUT_OF_RANGE: 'warn', OK: 'ok', Overdue: 'bad', 'Due soon': 'warn',
    Reorder: 'bad', Expiring: 'warn', 'Never calibrated': 'bad', SENT: 'info', RECEIVED_OUT: 'ok',
  };
  const colourOf = (key) => TONE[key] || 'muted';
  const badge = (text, key) => `<span class="badge tone-${colourOf(key || text)}">${esc(text)}</span>`;

  const FLAG_SYMBOL = { LOW: 'L', HIGH: 'H', CRITICAL_LOW: 'LL', CRITICAL_HIGH: 'HH', ABNORMAL: '*', NORMAL: '', NOT_APPLICABLE: '' };
  const FLAG_TEXT = { LOW: 'Low', HIGH: 'High', CRITICAL_LOW: 'Critical low', CRITICAL_HIGH: 'Critical high', ABNORMAL: 'Abnormal', NORMAL: 'Normal', NOT_APPLICABLE: '' };

  // ---- layout pieces ----------------------------------------------------------
  function card(title, body, opts = {}) {
    return `<section class="card ${opts.cls || ''}">${title ? `<h3 class="card-title">${esc(title)}${opts.right || ''}</h3>` : ''}<div class="card-body">${body}</div></section>`;
  }
  function stat(label, value, hint, accent) {
    return `<div class="card stat"><div class="stat-label">${esc(label)}</div>` +
      `<div class="stat-value ${accent ? 'accent' : ''}">${value}</div>` +
      `${hint ? `<div class="stat-hint">${esc(hint)}</div>` : ''}</div>`;
  }
  function field(label, control, full) {
    return `<label class="field ${full ? 'full' : ''}"><span>${esc(label)}</span>${control}</label>`;
  }
  function empty(text) {
    return `<div class="empty">${esc(text)}</div>`;
  }

  // Table with click-to-select rows. `rows` = [{id, cells:[html], cls}].
  function table({ id, cols, rows, empty: emptyText = 'Nothing to show yet.', selected, cls = '' }) {
    const head = cols.map((c) => `<th class="${c.align ? 'al-' + c.align : ''}">${esc(c.h)}</th>`).join('');
    const body = rows.length
      ? rows.map((r) => `<tr data-id="${esc(r.id)}" class="${selected != null && String(selected) === String(r.id) ? 'sel' : ''} ${r.cls || ''}">` +
        r.cells.map((cell, i) => `<td class="${cols[i] && cols[i].align ? 'al-' + cols[i].align : ''}">${cell}</td>`).join('') + '</tr>').join('')
      : `<tr class="no-hover"><td colspan="${cols.length}" class="empty-cell">${esc(emptyText)}</td></tr>`;
    return `<div class="grid-wrap ${cls}"><table class="grid" data-table="${esc(id)}" data-sel="${selected != null ? esc(selected) : ''}">` +
      `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  // ---- toasts -----------------------------------------------------------------
  function toast(message, tone = 'info') {
    let host = document.getElementById('toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast tone-${tone}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  // ---- modals -----------------------------------------------------------------
  function modal({ title, body, width = 560, buttons = [], onOpen, dismissable = true }) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="dialog" style="width:min(${width}px,calc(100vw - 32px))" role="dialog" aria-modal="true">` +
      `<div class="dialog-head"><span>${esc(title)}</span><button class="icon-btn" data-x aria-label="Close">×</button></div>` +
      `<div class="dialog-body">${body}</div>` +
      `<div class="dialog-foot"></div></div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const foot = overlay.querySelector('.dialog-foot');
    const ctx = { el: overlay, close, body: overlay.querySelector('.dialog-body') };
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      btn.className = b.primary ? 'primary' : b.danger ? 'danger' : '';
      if (b.disabled) btn.disabled = true;
      btn.addEventListener('click', () => { if (b.onClick) b.onClick(ctx); else close(); });
      foot.appendChild(btn);
    });
    overlay.querySelector('[data-x]').addEventListener('click', close);
    if (dismissable) overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
    document.addEventListener('keydown', onKey);
    if (onOpen) onOpen(ctx);
    const first = overlay.querySelector('input, select, textarea, button.primary');
    if (first) setTimeout(() => first.focus(), 0);
    return ctx;
  }

  function alertBox(title, message, tone) {
    const body = `<p class="msg ${tone ? 'tone-' + tone : ''}">${esc(message)}</p>`;
    modal({ title, body, width: 440, buttons: [{ label: 'OK', primary: true }] });
  }

  function confirmBox(title, message, { danger = false, ok = 'OK' } = {}) {
    return new Promise((resolve) => {
      modal({
        title, width: 440,
        body: `<p class="msg">${esc(message)}</p>`,
        buttons: [
          { label: 'Cancel', onClick: (c) => { c.close(); resolve(false); } },
          { label: ok, primary: !danger, danger, onClick: (c) => { c.close(); resolve(true); } },
        ],
      });
    });
  }

  // Form dialog. fields: {name,label,type,options,value,required,full,placeholder,rows,min,step,html}
  function form({ title, width = 520, fields, submit = 'Save', onSubmit, note }) {
    const controls = fields.map((f) => {
      if (f.html) return `<div class="field full">${f.html}</div>`;
      const v = f.value == null ? '' : f.value;
      let control;
      if (f.type === 'select') {
        control = `<select name="${f.name}">${f.options.map(([val, text]) =>
          `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
      } else if (f.type === 'textarea') {
        control = `<textarea name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
      } else if (f.type === 'check') {
        return `<label class="check full"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
      } else {
        const t = f.type || 'text';
        control = `<input type="${t}" name="${f.name}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"` +
          `${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}` +
          `${f.required ? ' data-required="1"' : ''} autocomplete="off">`;
      }
      return field(f.label + (f.required ? ' *' : ''), control, f.full);
    }).join('');
    const body = `${note ? `<p class="muted small">${esc(note)}</p>` : ''}<form class="form-grid" novalidate>${controls}</form>` +
      `<div class="form-error" hidden></div>`;
    modal({
      title, width, body,
      buttons: [
        { label: 'Cancel' },
        {
          label: submit, primary: true,
          onClick: (ctx) => {
            const form = ctx.body.querySelector('form');
            const values = {};
            fields.forEach((f) => {
              if (f.html) return;
              const el = form.elements[f.name];
              if (!el) return;
              values[f.name] = f.type === 'check' ? el.checked : el.value;
            });
            const missing = fields.find((f) => f.required && !f.html && String(values[f.name] || '').trim() === '');
            const err = ctx.body.querySelector('.form-error');
            if (missing) {
              err.textContent = `${missing.label} is required.`;
              err.hidden = false;
              return;
            }
            try {
              onSubmit(values, ctx, form);
              ctx.close();
            } catch (e) {
              if (!(e instanceof PL.store.DomainError)) throw e;
              err.textContent = e.message;
              err.hidden = false;
            }
          },
        },
      ],
    });
  }

  // ---- misc -------------------------------------------------------------------
  function download(name, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  // Renders HTML into the print sheet and asks the browser to print it (Save as PDF works).
  function printHtml(html) {
    const sheet = document.getElementById('print-area');
    sheet.innerHTML = html;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); sheet.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }

  // Keeps focus and caret inside a text input across a full re-render of a screen body.
  function keepFocus(fn) {
    const a = document.activeElement;
    const id = a && a.id;
    const pos = a && a.selectionStart;
    fn();
    if (id) {
      const el = document.getElementById(id);
      if (el) {
        el.focus();
        if (pos != null && el.setSelectionRange) el.setSelectionRange(pos, pos);
      }
    }
  }

  const sel = (tableId) => {
    const el = document.querySelector(`[data-table="${tableId}"]`);
    return el && el.dataset.sel ? el.dataset.sel : null;
  };

  // ---- Code 128 (subset B) barcodes, drawn as SVG -------------------------------
  // Bar widths per symbol value 0-106 (module counts, bar first). Taken from the
  // reference table the desktop label printer uses (reportlab's Code 128).
  const C128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212",
    "223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323",
    "131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123",
    "113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113",
    "312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142",
    "121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341",
    "131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232"];
  const C128_STOP = '2331112';
  const START_B = 104;

  function code128Svg(text, { module = 2, height = 54 } = {}) {
    const value = String(text == null ? '' : text).replace(/[^\x20-\x7e]/g, '');
    const symbols = [START_B];
    for (const ch of value) symbols.push(ch.charCodeAt(0) - 32);
    let check = symbols[0];
    for (let i = 1; i < symbols.length; i++) check += symbols[i] * i;
    symbols.push(check % 103);
    const pieces = symbols.map((v) => C128[v]).concat([C128_STOP]);
    const bars = [];
    let x = 10; // quiet zone of 10 modules on the left
    let dark = true;
    for (const piece of pieces) {
      for (const d of piece) {
        const w = Number(d);
        if (dark) bars.push(`<rect x="${x * module}" y="0" width="${w * module}" height="${height}"/>`);
        x += w;
        dark = !dark;
      }
    }
    const width = (x + 10) * module;
    return `<svg class="barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 16}" ` +
      `width="${width}" height="${height + 16}" role="img" aria-label="Barcode ${esc(value)}">` +
      `<g fill="#000">${bars.join('')}</g>` +
      `<text x="${width / 2}" y="${height + 13}" text-anchor="middle" font-family="Arial" font-size="13">${esc(value)}</text></svg>`;
  }

  PL.ui = {
    esc, money, fdate, fdt, fdtShort, badge, colourOf, FLAG_SYMBOL, FLAG_TEXT,
    card, stat, field, empty, table, toast, modal, alertBox, confirmBox, form,
    download, printHtml, keepFocus, sel, code128Svg,
  };
})(window.PL = window.PL || {});
