/*
 * PathoLab demo - data and domain layer.
 *
 * Mirrors the desktop application's rules (order and sample workflows, result
 * flags, billing, commission, audit hash-chain). All data lives in this
 * browser's localStorage. Nothing is sent anywhere.
 */
(function (PL) {
  'use strict';

  const KEY = 'patholab-demo-v1';
  const DAY = 864e5;
  // Sign-in policy: lock after repeated wrong passwords; passwords expire after a set number of days.
  const POLICY = { maxFailed: 5, lockMinutes: 15, passwordDays: 90 };

  class DomainError extends Error {}
  const fail = (message) => { throw new DomainError(message); };

  const pad = (n, w) => String(n).padStart(w, '0');
  const nowIso = () => new Date().toISOString();
  const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString();
  const dayKey = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
  };
  const todayKey = () => dayKey(nowIso());
  const monthStartKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-01`;
  };
  const inRange = (iso, from, to) => {
    if (!iso) return false;
    const k = dayKey(iso);
    return (!from || k >= from) && (!to || k <= to);
  };
  const label = (v) => (v ? String(v).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '-');
  const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

  const ageYears = (p) => {
    if (p.dob) return Math.floor((Date.now() - new Date(p.dob).getTime()) / (365.25 * DAY));
    return Number(p.age) || 0;
  };

  // ---- state machines (same as desktop domain/enums.py) -------------------
  const ORDER_NEXT = {
    REGISTERED: ['COLLECTED', 'CANCELLED'],
    COLLECTED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: ['REPORTED', 'IN_PROGRESS'],
    REPORTED: ['IN_PROGRESS'],
    CANCELLED: [],
  };
  const SAMPLE_NEXT = {
    PENDING: ['COLLECTED', 'REJECTED'],
    COLLECTED: ['RECEIVED', 'REJECTED'],
    RECEIVED: ['PROCESSING', 'STORED', 'REJECTED'],
    PROCESSING: ['STORED', 'REJECTED'],
    STORED: ['DISPOSED'],
    REJECTED: ['PENDING'],
    DISPOSED: [],
  };
  const CRITICAL = ['CRITICAL_LOW', 'CRITICAL_HIGH'];

  // ---- permissions and roles ---------------------------------------------
  const PERM_GROUPS = [
    ['Front desk', [
      ['patients.manage', 'Register and edit patients'],
      ['orders.register', 'Register orders'],
      ['billing.collect', 'Take payments and print receipts']]],
    ['Laboratory', [
      ['samples.manage', 'Track samples (collect, receive, store)'],
      ['results.enter', 'Enter results'],
      ['results.verify', 'Verify results (sign-off)'],
      ['critical.notify', 'Record notification of critical results'],
      ['reports.generate', 'Generate, sign and print reports'],
      ['qc.manage', 'Record quality control and limits'],
      ['analyser.import', 'Import results from analysers']]],
    ['Operations', [
      ['inventory.manage', 'Manage inventory, lots and expiry'],
      ['equipment.manage', 'Maintain equipment and its service log'],
      ['outsource.manage', 'Send and receive outsourced tests']]],
    ['Setup', [
      ['catalog.manage', 'Edit the test catalog'],
      ['packages.manage', 'Manage health packages'],
      ['masters.manage', 'Doctors, collection centres, branches and price lists'],
      ['settings.manage', 'Change settings and report layouts']]],
    ['Finance and management', [
      ['finance.manage', 'Expenses, commission rules and payouts'],
      ['mis.view', 'View MIS reports']]],
    ['Administration', [
      ['users.manage', 'Manage users and roles'],
      ['audit.view', 'View and verify the audit trail'],
      ['backup.manage', 'Back up and restore the database'],
      ['data.transfer', 'Export and import data']]],
  ];
  const PERM_LABEL = {};
  PERM_GROUPS.forEach(([, items]) => items.forEach(([k, l]) => { PERM_LABEL[k] = l; }));
  const ALL_PERMS = Object.keys(PERM_LABEL);

  const ROLES = {
    ADMIN: { label: 'Administrator', perms: ALL_PERMS },
    PATHOLOGIST: {
      label: 'Pathologist',
      perms: ['patients.manage', 'orders.register', 'results.enter', 'results.verify', 'reports.generate',
        'critical.notify', 'qc.manage', 'mis.view'],
    },
    TECHNICIAN: {
      label: 'Lab Technician',
      perms: ['samples.manage', 'results.enter', 'critical.notify', 'outsource.manage', 'inventory.manage',
        'equipment.manage', 'qc.manage', 'analyser.import'],
    },
    RECEPTIONIST: {
      label: 'Receptionist',
      perms: ['patients.manage', 'orders.register', 'billing.collect'],
    },
  };

  // ---- built-in test catalogue (subset of the desktop seed) ---------------
  const CONTAINER = {
    'Whole blood (EDTA)': 'Lavender top (EDTA)',
    'Serum': 'Red / gold top (SST)',
    'Plasma (NaF)': 'Grey top (NaF)',
    'Urine (random)': 'Urine container',
    'Urine (midstream)': 'Sterile urine container',
    'Cervical smear': 'Glass slide',
    'Tissue (formalin)': 'Formalin jar',
    'Swab (nasopharyngeal)': 'Transport swab',
  };
  const DEPARTMENTS = ['Hematology', 'Biochemistry', 'Immunoassay', 'Serology', 'Clinical pathology',
    'Microbiology', 'Cytology', 'Histopathology', 'Molecular'];
  const KINDS = {
    quant: 'Quantitative', choice: 'Qualitative', semi: 'Semi-quantitative', calc: 'Calculated',
    culture: 'Culture & sensitivity', text: 'Short text', desc: 'Descriptive', panel: 'Panel',
  };
  // Culture and sensitivity (the same lists as the desktop app's culture dialog).
  const GROWTH = [
    'No growth', 'No growth after 48 hours of aerobic incubation', 'Significant growth',
    'Insignificant growth', 'Mixed growth of more than two organisms - suggest repeat sample',
    'Normal commensal flora',
  ];
  const INTERP = [['S', 'Sensitive'], ['I', 'Intermediate'], ['R', 'Resistant']];
  const COMMON_ORGANISMS = [
    'Escherichia coli', 'Klebsiella pneumoniae', 'Pseudomonas aeruginosa', 'Proteus mirabilis',
    'Enterococcus faecalis', 'Staphylococcus aureus', 'Methicillin-resistant Staphylococcus aureus (MRSA)',
    'Coagulase-negative Staphylococcus', 'Streptococcus pyogenes', 'Streptococcus pneumoniae',
    'Acinetobacter baumannii', 'Salmonella typhi', 'Candida albicans', 'Citrobacter freundii', 'Enterobacter cloacae',
  ];
  const URINE_ANTIBIOTICS = [
    'Amoxicillin-Clavulanate', 'Nitrofurantoin', 'Cotrimoxazole', 'Ciprofloxacin',
    'Norfloxacin', 'Cefixime', 'Ceftriaxone', 'Gentamicin', 'Amikacin',
    'Piperacillin-Tazobactam', 'Meropenem', 'Fosfomycin',
  ];
  // A culture with no significant growth has no organism, so no sensitivity panel.
  const hasGrowth = (text) => !/no growth|normal/i.test(String(text || ''));

  const t = (code, name, dept, kind, unit, specimen, price, o = {}) => ({
    code, name, dept, kind, unit: unit || '', specimen: specimen || '', price, tat: 24,
    ranges: [], choices: null, normal: '', children: null, active: true, delta: null,
    formula: '', decimals: 2, ...o,
  });
  const RG = (g, lo, hi, cl, ch, printed) => ({ g, lo, hi, cl, ch, printed: printed || '' });
  const H = 'Hematology', B = 'Biochemistry', I = 'Immunoassay', SE = 'Serology',
    CP = 'Clinical pathology', MB = 'Microbiology', CY = 'Cytology', HP = 'Histopathology', MO = 'Molecular';
  const EDTA = 'Whole blood (EDTA)', SER = 'Serum', FL = 'Plasma (NaF)', UR = 'Urine (random)';
  const RS = ['Non-reactive', 'Reactive'];

  const CATALOG = [
    t('HB', 'Haemoglobin', H, 'quant', 'g/dL', EDTA, 80, { ranges: [RG('M', 13, 17, 7, 20), RG('F', 12, 15.5, 7, 20)] }),
    t('TLC', 'Total leucocyte count (TLC)', H, 'quant', '10^3/ÂµL', EDTA, 80, { ranges: [RG(null, 4, 11, 2, 30)] }),
    t('PLT', 'Platelet count', H, 'quant', '10^3/ÂµL', EDTA, 100, { ranges: [RG(null, 150, 410, 20, 1000)] }),
    t('HCT', 'Haematocrit (PCV)', H, 'quant', '%', EDTA, 60, { ranges: [RG('M', 40, 50), RG('F', 36, 46)] }),
    t('MCV', 'Mean corpuscular volume', H, 'quant', 'fL', EDTA, 60, { ranges: [RG(null, 80, 100)] }),
    t('ESR', 'Erythrocyte sedimentation rate', H, 'quant', 'mm/hr', EDTA, 60, { ranges: [RG('M', 0, 15), RG('F', 0, 20)] }),
    t('BGRP', 'Blood group and Rh type', H, 'choice', '', EDTA, 120, {
      choices: ['A Positive', 'A Negative', 'B Positive', 'B Negative', 'AB Positive', 'AB Negative', 'O Positive', 'O Negative'],
    }),
    t('CBC', 'Complete blood count', H, 'panel', '', '', 250, { children: ['HB', 'TLC', 'PLT', 'HCT', 'MCV'] }),
    t('FBS', 'Glucose - fasting', B, 'quant', 'mg/dL', FL, 60, { ranges: [RG(null, 70, 100, 40, 400)] }),
    t('RBS', 'Glucose - random', B, 'quant', 'mg/dL', FL, 60, { ranges: [RG(null, 70, 140, 40, 400)] }),
    t('HBA1C', 'HbA1c', B, 'quant', '%', EDTA, 450, { ranges: [RG(null, 4, 5.6)] }),
    t('CREA', 'Serum creatinine', B, 'quant', 'mg/dL', SER, 90, { ranges: [RG('M', 0.7, 1.3, null, 10), RG('F', 0.6, 1.1, null, 10)] }),
    t('UREA', 'Blood urea', B, 'quant', 'mg/dL', SER, 80, { ranges: [RG(null, 15, 45)] }),
    t('SGPT', 'ALT (SGPT)', B, 'quant', 'U/L', SER, 80, { ranges: [RG(null, 7, 56)] }),
    t('SGOT', 'AST (SGOT)', B, 'quant', 'U/L', SER, 80, { ranges: [RG(null, 5, 40)] }),
    t('ALP', 'Alkaline phosphatase', B, 'quant', 'U/L', SER, 80, { ranges: [RG(null, 44, 147)] }),
    t('BILT', 'Bilirubin - total', B, 'quant', 'mg/dL', SER, 80, { ranges: [RG(null, 0.1, 1.2)] }),
    t('LFT', 'Liver function panel', B, 'panel', '', '', 450, { children: ['SGPT', 'SGOT', 'ALP', 'BILT'] }),
    t('CHOL', 'Total cholesterol', B, 'quant', 'mg/dL', SER, 70, { ranges: [RG(null, 0, 200, null, null, '< 200 desirable')] }),
    t('TG', 'Triglycerides', B, 'quant', 'mg/dL', SER, 70, { ranges: [RG(null, 0, 150)] }),
    t('HDL', 'HDL cholesterol', B, 'quant', 'mg/dL', SER, 80, { ranges: [RG('M', 40, null), RG('F', 50, null)] }),
    // Calculated analytes: filled in from the other results on the order (ranges as in the desktop app).
    t('LDL', 'LDL cholesterol (Friedewald)', B, 'calc', 'mg/dL', SER, 0, {
      formula: 'CHOL - HDL - (TG / 5)', decimals: 0, ranges: [RG(null, null, 100, null, null, '< 100 (Optimal)')],
    }),
    t('VLDL', 'VLDL cholesterol', B, 'calc', 'mg/dL', SER, 0, { formula: 'TG / 5', decimals: 0, ranges: [RG(null, 6, 38)] }),
    t('CHOLHDL', 'Total cholesterol / HDL ratio', B, 'calc', '', SER, 0, {
      formula: 'CHOL / HDL', decimals: 2, ranges: [RG(null, null, 4.5, null, null, '< 4.5')],
    }),
    t('LIPID', 'Lipid profile', B, 'panel', '', '', 400, { children: ['CHOL', 'TG', 'HDL', 'LDL', 'VLDL', 'CHOLHDL'] }),
    t('NA', 'Sodium', B, 'quant', 'mmol/L', SER, 70, { ranges: [RG(null, 135, 145, 120, 160)] }),
    t('K', 'Potassium', B, 'quant', 'mmol/L', SER, 70, { ranges: [RG(null, 3.5, 5.1, 2.5, 6.5)] }),
    t('TSH', 'Thyroid stimulating hormone (TSH)', I, 'quant', 'ÂµIU/mL', SER, 350, { ranges: [RG(null, 0.4, 4.0)] }),
    t('FT4', 'Free T4', I, 'quant', 'ng/dL', SER, 350, { ranges: [RG(null, 0.8, 1.8)] }),
    t('VITD', '25-OH Vitamin D', I, 'quant', 'ng/mL', SER, 900, { ranges: [RG(null, 30, 100)] }),
    t('TFT', 'Thyroid profile', I, 'panel', '', '', 600, { children: ['TSH', 'FT4'] }),
    t('HIV', 'HIV I & II antibodies', SE, 'choice', '', SER, 300, { choices: RS, normal: 'Non-reactive' }),
    t('HBSAG', 'HBsAg', SE, 'choice', '', SER, 250, { choices: RS, normal: 'Non-reactive' }),
    t('HCV', 'Anti-HCV antibody', SE, 'choice', '', SER, 300, { choices: RS, normal: 'Non-reactive' }),
    t('MAL', 'Malaria antigen (rapid)', SE, 'choice', '', EDTA, 300, { choices: ['Negative', 'Positive'], normal: 'Negative' }),
    t('URCOL', 'Urine - colour', CP, 'choice', '', UR, 40, { choices: ['Pale yellow', 'Yellow', 'Dark yellow', 'Red', 'Brown'], normal: 'Yellow' }),
    t('URGLU', 'Urine - glucose', CP, 'semi', '', UR, 40, { choices: ['Nil', 'Trace', '1+', '2+', '3+', '4+'], normal: 'Nil' }),
    t('URPRO', 'Urine - protein', CP, 'semi', '', UR, 40, { choices: ['Nil', 'Trace', '1+', '2+', '3+'], normal: 'Nil' }),
    t('URPUS', 'Urine - pus cells', CP, 'text', '/hpf', UR, 40, { normal: '0-5' }),
    t('URINE', 'Urine routine', CP, 'panel', '', '', 180, { children: ['URCOL', 'URGLU', 'URPRO', 'URPUS'] }),
    t('CULT', 'Urine culture and sensitivity', MB, 'culture', '', 'Urine (midstream)', 700, { tat: 72 }),
    t('PAP', 'Pap smear (cytology)', CY, 'desc', '', 'Cervical smear', 600, { tat: 72 }),
    t('BIOPSY', 'Histopathology - biopsy', HP, 'desc', '', 'Tissue (formalin)', 1200, { tat: 96 }),
    t('COVID', 'SARS-CoV-2 RT-PCR', MO, 'choice', '', 'Swab (nasopharyngeal)', 800, {
      choices: ['Not detected', 'Detected'], normal: 'Not detected',
    }),
  ];
  CATALOG.forEach((x) => { if (x.kind === 'desc') x.tat = x.tat || 72; });

  // Delta checks: a change from the patient's previous verified value larger than this
  // percentage needs a comment before the result can be verified (as in the desktop app).
  const DELTA_LIMITS = { HB: 15, CREA: 25, WBC: 30, TSH: 40 };
  CATALOG.forEach((x) => { if (DELTA_LIMITS[x.code] != null) x.delta = DELTA_LIMITS[x.code]; });

  // Reflex rules: when a saved result meets the rule, the listed tests are added to the same order.
  //   ABOVE / BELOW a number, or FLAG (any abnormal or critical flag).
  const REFLEX = {
    FBS: { when: 'ABOVE', value: 125, add: ['HBA1C'] },
    TSH: { when: 'FLAG', add: ['FT4'] },
  };
  CATALOG.forEach((x) => { if (REFLEX[x.code]) x.reflex = REFLEX[x.code]; });

  const PACKAGES = [
    { name: 'Basic Health Check', price: 999, tests: ['CBC', 'FBS', 'CREA', 'LFT', 'LIPID'] },
    { name: 'Thyroid Screen', price: 599, tests: ['TFT'] },
    { name: 'Diabetes Screen', price: 499, tests: ['FBS', 'RBS', 'HBA1C'] },
  ];

  // ---- state ----------------------------------------------------------------
  const S = {};
  let seeding = false;

  // WhatsApp and cloud-database settings. The demo never sends a message or connects to a
  // server; these values are stored so the screens behave as the desktop app's do.
  const whatsappDefaults = () => ({
    enabled: false, phoneNumberId: '', apiVersion: 'v21.0', countryCode: '91', language: 'en',
    templateReport: 'patholab_report_ready', templatePayment: 'patholab_payment_reminder',
    templateDocument: 'patholab_report_document', sendReportPdf: false,
  });
  const syncDefaults = () => ({
    engine: 'postgresql', host: '', port: 5432, database: 'patholab', user: '', tls: true,
    lastSync: '', lastResult: '',
  });
  function ensureDefaults() {
    S.whatsapp = { ...whatsappDefaults(), ...(S.whatsapp || {}) };
    S.sync = { ...syncDefaults(), ...(S.sync || {}) };
    S.messages = S.messages || [];
    // Rules added after a browser's data was first saved: fill them in without touching anything else.
    S.tests.forEach((t) => {
      if (REFLEX[t.code] && !t.reflex) t.reflex = REFLEX[t.code];
      if (DELTA_LIMITS[t.code] != null && t.delta == null) t.delta = DELTA_LIMITS[t.code];
      if (t.code === 'CULT' && t.kind === 'desc') t.kind = 'culture';
    });
    // Calculated lipid analytes: added once, and added to the lipid panel at the same time.
    const newCalc = CATALOG.filter((c) => ['LDL', 'VLDL', 'CHOLHDL'].includes(c.code) && !S.tests.some((t) => t.code === c.code));
    if (newCalc.length) {
      newCalc.forEach((c) => S.tests.push(JSON.parse(JSON.stringify(c))));
      const lipid = S.tests.find((t) => t.code === 'LIPID');
      if (lipid && lipid.children) newCalc.forEach((c) => { if (!lipid.children.includes(c.code)) lipid.children.push(c.code); });
      S.orders.forEach((o) => deriveCalculated(o, patientById(o.patientId)));
    }
    // Existing accounts start with a fresh password date, so nobody is forced to change it on upgrade.
    S.users.forEach((u) => {
      if (u.failedLogins == null) { u.failedLogins = 0; u.lockedUntil = null; }
      if (!u.passwordChangedAt) u.passwordChangedAt = nowIso();
    });
    S.lab = { gstin: '27ABCDE1234F1Z5', gstRate: 18, sac: '9993', ...S.lab };
  }

  function skeleton() {
    return {
      seq: { mrn: 0, order: 0, sample: 0, receipt: 0 },
      lab: { name: 'Demo Pathology Laboratory', address: '12 Sample Street, Demo City', phone: '+91 00000 00000', email: 'lab@example.com', currency: 'INR', gstin: '27ABCDE1234F1Z5', gstRate: 18, sac: '9993' },
      report: { letterhead: true, footer: 'Demo report - generated by the PathoLab web demo. Not for clinical use.', sections: { clinicalHistory: true, referrer: true, reference: true, signatures: true } },
      email: { host: 'smtp.example.com', port: 587, from: 'reports@example.com', user: '', tls: true },
      app: { backupOnExit: true, backupKeep: 10, backupEnabled: true, backupTime: '23:30' },
      users: [], patients: [], doctors: [], centres: [], branches: [], priceLists: [], tests: [], packages: [],
      orders: [], samples: [], inventory: [], qc: [], outsource: [], equipment: [], expenses: [], payouts: [],
      audit: [], reports: [], messages: [],
      whatsapp: whatsappDefaults(), sync: syncDefaults(),
    };
  }
  function replaceState(obj) {
    Object.keys(S).forEach((k) => delete S[k]);
    Object.assign(S, obj);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked: keep in memory */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { replaceState(JSON.parse(raw)); ensureDefaults(); return; }
    } catch (e) { /* fall through to a fresh seed */ }
    seed();
  }
  function nextId(table) {
    S.seq[table] = (S.seq[table] || 0) + 1;
    return S.seq[table];
  }

  // ---- session --------------------------------------------------------------
  let sessionUserId = null;
  const currentUser = () => S.users.find((u) => u.id === sessionUserId) || null;
  const actor = () => (seeding ? 'system' : (currentUser() ? currentUser().username : 'system'));
  function setSession(id) {
    sessionUserId = id;
    try { sessionStorage.setItem('patholab-demo-session', id ? String(id) : ''); } catch (e) { /* ignore */ }
  }
  function restoreSession() {
    try {
      const id = Number(sessionStorage.getItem('patholab-demo-session'));
      sessionUserId = id || null;
    } catch (e) { sessionUserId = null; }
  }
  const hasPerm = (perm) => {
    const u = currentUser();
    if (!u) return false;
    return ROLES[u.role] ? ROLES[u.role].perms.includes(perm) : false;
  };

  // ---- audit chain ----------------------------------------------------------
  function chainHash(prev, text) {
    let h = 5381;
    const s = prev + '|' + text;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0');
  }
  const auditText = (e) => [e.at, e.user, e.action, e.detail].join('|');
  function persist(action, detail) {
    const prev = S.audit.length ? S.audit[S.audit.length - 1].hash : 'GENESIS';
    const e = { id: nextId('audit'), at: nowIso(), user: actor(), action, detail: detail || '', hash: '' };
    e.hash = chainHash(prev, auditText(e));
    S.audit.push(e);
  }
  function verifyAudit() {
    let prev = 'GENESIS';
    for (const e of S.audit) {
      if (chainHash(prev, auditText(e)) !== e.hash) return { intact: false, firstBroken: e.id, checked: S.audit.length };
      prev = e.hash;
    }
    return { intact: true, checked: S.audit.length };
  }

  // ---- lookups ----------------------------------------------------------------
  const testByCode = (code) => S.tests.find((x) => x.code === code) || null;
  const testIndex = (code) => S.tests.findIndex((x) => x.code === code);
  const patientById = (id) => S.patients.find((p) => p.id === Number(id)) || null;
  const orderById = (id) => {
    const o = S.orders.find((x) => x.id === Number(id));
    if (!o) fail('That order no longer exists.');
    return o;
  };
  const sampleById = (id) => {
    const s = S.samples.find((x) => x.id === Number(id));
    if (!s) fail('That sample no longer exists.');
    return s;
  };
  const patientName = (p) => (p ? `${p.firstName} ${p.lastName}`.trim() : '-');
  const doctorById = (id) => S.doctors.find((d) => d.id === Number(id)) || null;
  const defaultPriceList = () => S.priceLists.find((x) => x.isDefault) || S.priceLists[0];
  const priceOf = (test, plist) => {
    if (plist && plist.overrides && plist.overrides[test.code] != null) return Number(plist.overrides[test.code]);
    return Number(test.price) || 0;
  };
  function leaves(codes) {
    const out = [];
    const walk = (code) => {
      const def = testByCode(code);
      if (!def || !def.active) return;
      if (def.kind === 'panel') def.children.forEach(walk);
      else if (!out.includes(code)) out.push(code);
    };
    codes.forEach(walk);
    return out.sort((a, b) => testIndex(a) - testIndex(b));
  }

  function rangeFor(test, patient) {
    const age = ageYears(patient);
    return test.ranges.find((r) => (!r.g || r.g === patient.gender)
      && (r.ageMin == null || age >= r.ageMin) && (r.ageMax == null || age <= r.ageMax))
      || test.ranges[0] || null;
  }
  function computeFlag(test, value, patient) {
    if (test.kind === 'quant' || test.kind === 'calc') {
      const n = Number(value);
      const r = rangeFor(test, patient);
      if (!r) return 'NORMAL';
      if (r.cl != null && n < r.cl) return 'CRITICAL_LOW';
      if (r.ch != null && n > r.ch) return 'CRITICAL_HIGH';
      if (r.lo != null && n < r.lo) return 'LOW';
      if (r.hi != null && n > r.hi) return 'HIGH';
      return 'NORMAL';
    }
    if (test.kind === 'choice' || test.kind === 'semi') {
      return test.normal && value !== test.normal ? 'ABNORMAL' : 'NORMAL';
    }
    return 'NOT_APPLICABLE';
  }
  function rangeText(test, patient) {
    if (test.kind !== 'quant' && test.kind !== 'calc') return test.normal ? `Normal: ${test.normal}` : '';
    const r = rangeFor(test, patient);
    if (!r) return '';
    if (r.printed) return r.printed;
    if (r.lo != null && r.hi != null) return `${r.lo} - ${r.hi}`;
    if (r.lo != null) return `>= ${r.lo}`;
    if (r.hi != null) return `<= ${r.hi}`;
    return '';
  }

  // ---- calculated tests: a small formula evaluator (no eval) --------------------
  // Accepts numbers, test codes, + - * / ^, parentheses, and abs, min, max, sqrt.
  const FORMULA_FUNCS = { abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt };
  function parseFormula(src) {
    const toks = String(src || '').match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|[-+*/^(),]|\S/g) || [];
    let i = 0;
    const peek = () => toks[i];
    const take = (want) => {
      const tok = toks[i++];
      if (want && tok !== want) throw new Error(`Formula: expected "${want}".`);
      return tok;
    };
    const primary = () => {
      const tok = take();
      if (tok === undefined) throw new Error('Formula: the expression is unfinished.');
      if (/^\d/.test(tok)) return { n: Number(tok) };
      if (tok === '(') { const inner = expr(); take(')'); return inner; }
      if (/^[A-Za-z_]/.test(tok)) {
        if (peek() !== '(') return { v: tok };
        const fn = tok.toLowerCase();
        if (!FORMULA_FUNCS[fn]) throw new Error(`Formula: unknown function ${tok}.`);
        take('(');
        const args = [expr()];
        while (peek() === ',') { take(','); args.push(expr()); }
        take(')');
        return { f: fn, args };
      }
      throw new Error(`Formula: unexpected "${tok}".`);
    };
    const unary = () => ((peek() === '-' || peek() === '+') ? { u: take(), a: unary() } : primary());
    const power = () => {
      const a = unary();
      if (peek() !== '^') return a;
      take();
      return { op: '^', a, b: power() };
    };
    const term = () => {
      let a = power();
      while (peek() === '*' || peek() === '/') { const op = take(); a = { op, a, b: power() }; }
      return a;
    };
    const expr = () => {
      let a = term();
      while (peek() === '+' || peek() === '-') { const op = take(); a = { op, a, b: term() }; }
      return a;
    };
    const tree = expr();
    if (i < toks.length) throw new Error(`Formula: unexpected "${toks[i]}".`);
    return tree;
  }
  // Test codes a formula reads (function names are not codes).
  function formulaCodes(src) {
    const found = new Set();
    const walk = (n) => {
      if (!n) return;
      if (n.v) found.add(n.v);
      if (n.args) n.args.forEach(walk);
      walk(n.a);
      walk(n.b);
    };
    walk(parseFormula(src));
    return [...found];
  }
  // Value of a formula, or null while an input is missing or the result is not a finite number.
  function evalNode(n, vars) {
    if (n.n !== undefined) return n.n;
    if (n.v !== undefined) return vars[n.v] == null ? null : vars[n.v];
    if (n.f) {
      const xs = n.args.map((a) => evalNode(a, vars));
      return xs.some((x) => x === null) ? null : FORMULA_FUNCS[n.f](...xs);
    }
    const x = evalNode(n.a, vars);
    if (n.u) return x === null ? null : (n.u === '-' ? -x : x);
    const y = evalNode(n.b, vars);
    if (x === null || y === null) return null;
    const r = { '+': x + y, '-': x - y, '*': x * y, '/': x / y, '^': x ** y }[n.op];
    return Number.isFinite(r) ? r : null;
  }
  const evalFormula = (src, vars) => evalNode(parseFormula(src), vars);

  // One entered result, with its flag, previous verified value and delta check.
  function buildResult(o, def, raw, patient, cur, comment) {
    const flag = computeFlag(def, raw, patient);
    const prev = previousVerified(o, def.code);
    const numeric = (def.kind === 'quant' || def.kind === 'calc') && isFinite(Number(raw));
    const pct = numeric && prev && prev.value ? round1((Number(raw) - prev.value) / Math.abs(prev.value) * 100) : null;
    return {
      value: raw, flag, status: 'ENTERED', by: actor(), at: nowIso(), verifiedBy: '', verifiedAt: '', notified: null,
      comment: comment != null ? String(comment).trim() : ((cur && cur.comment) || ''),
      prev: prev ? { text: prev.text, value: prev.value, at: prev.at } : null,
      delta: pct,
      deltaFlag: pct != null && def.delta != null && Math.abs(pct) > def.delta,
    };
  }

  // Calculated tests take their value from the order's other results, as in the desktop app.
  // They are never typed in, and they clear again when an input is removed.
  function deriveCalculated(o, patient) {
    const calcs = o.tests.map(testByCode).filter((d) => d && d.kind === 'calc');
    if (!calcs.length) return;
    const inputs = {};
    o.tests.forEach((c) => {
      const d = testByCode(c);
      const r = o.results[c];
      if (d && d.kind === 'quant' && r && r.value !== '' && isFinite(Number(r.value))) inputs[c] = Number(r.value);
    });
    const safe = (src, vars) => { try { return evalFormula(src, vars); } catch (e) { return null; } };
    // A formula may read another calculated test, so repeat until the values settle.
    let vars = { ...inputs };
    for (let pass = 0; pass <= calcs.length; pass++) {
      const next = { ...inputs };
      calcs.forEach((d) => { const v = safe(d.formula, vars); if (v !== null) next[d.code] = v; });
      const settled = JSON.stringify(next) === JSON.stringify(vars);
      vars = next;
      if (settled) break;
    }
    calcs.forEach((d) => {
      const cur = o.results[d.code];
      if (cur && cur.status === 'VERIFIED') return;
      if (vars[d.code] === undefined) { if (cur) delete o.results[d.code]; return; }
      const raw = String(Number(vars[d.code].toFixed(Number(d.decimals) || 0)));
      o.results[d.code] = buildResult(o, d, raw, patient, cur, undefined);
    });
  }

  const isCritical = (flag) => CRITICAL.includes(flag);

  // Turnaround: due = registration + the longest turnaround among the order's tests.
  // An order is overdue once that time passes while it is still open (not reported).
  function turnaround(o) {
    const hours = Math.max(1, ...o.tests.map((c) => (testByCode(c) ? Number(testByCode(c).tat) || 24 : 24)));
    const due = new Date(new Date(o.registeredAt).getTime() + hours * 36e5);
    const left = (due.getTime() - Date.now()) / 36e5;
    const open = o.status !== 'REPORTED' && o.status !== 'CANCELLED';
    let state = 'DONE';
    if (open) state = left < 0 ? 'OVERDUE' : left <= 2 ? 'DUE_SOON' : 'ON_TIME';
    return { due: due.toISOString(), hours, left, state };
  }

  function orderTotals(o) {
    const paid = round2(sum(o.payments.map((p) => p.amount)));
    const balance = round2(o.net - paid);
    const payment = paid >= o.net - 0.005 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    return { gross: o.gross, net: o.net, paid, balance, payment };
  }
  function pendingCount(o) {
    return o.tests.filter((c) => !o.results[c] || o.results[c].status === 'PENDING').length;
  }
  function orderSummary(o) {
    const names = o.lines.map((l) => (l.kind === 'package' ? l.name.replace('Package: ', '') : testByCode(l.code) ? testByCode(l.code).name : l.name));
    const head = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${head} +${names.length - 3} more` : head;
  }

  // ---- seed data ------------------------------------------------------------
  function seed() {
    replaceState(skeleton());
    seeding = true;
    try {
      S.users = [
        { id: 1, username: 'admin', password: 'admin123', fullName: 'Lab Administrator', role: 'ADMIN', active: true },
        { id: 2, username: 'pathologist', password: 'demo123', fullName: 'Dr. Meera Iyer', role: 'PATHOLOGIST', active: true },
        { id: 3, username: 'technician', password: 'demo123', fullName: 'Suresh Kumar', role: 'TECHNICIAN', active: true },
        { id: 4, username: 'reception', password: 'demo123', fullName: 'Anita Rao', role: 'RECEPTIONIST', active: true },
      ];
      S.seq.users = 4;
      S.users.forEach((u) => { u.passwordChangedAt = nowIso(); u.failedLogins = 0; u.lockedUntil = null; });
      S.tests = CATALOG.map((x) => JSON.parse(JSON.stringify(x)));
      S.priceLists = [
        { id: 1, name: 'Standard (catalogue)', isDefault: true, overrides: {} },
        { id: 2, name: 'Corporate (negotiated)', isDefault: false, overrides: { FBS: 40, RBS: 40, HBA1C: 300, CBC: 200, LFT: 350, LIPID: 300 } },
      ];
      S.seq.priceLists = 2;
      [['Dr. Arjun Mehta', 'General Physician', '+91 98000 11111', 10],
        ['Dr. Kavya Nair', 'Endocrinologist', '+91 98000 22222', 8],
        ['Dr. Sanjay Gupta', 'Gynaecologist', '', 0]].forEach(([name, speciality, phone, commission]) =>
        svc.saveMaster('doctors', { name, speciality, phone, commission }));
      [['Main Collection Desk', 'MAIN'], ['Sector 5 Clinic', 'S5'], ['Home Collection', 'HOME']]
        .forEach(([name, code]) => svc.saveMaster('centres', { name, code }));
      ['Main Lab', 'North Branch'].forEach((name) => svc.saveMaster('branches', { name }));
      PACKAGES.forEach((p) => svc.savePackage(p));

      [
        { code: 'GLU-R1', name: 'Glucose reagent (GOD-POD)', unit: 'kit', reorder: 5, lots: [{ lot: 'GL-2407', expiry: '2027-02-28', qty: 12 }] },
        { code: 'EDTA-3', name: 'EDTA vacutainer 3 mL', unit: 'pcs', reorder: 200, lots: [{ lot: 'ED-1190', expiry: '2027-08-31', qty: 340 }] },
        { code: 'URI-10', name: 'Urine dipstick (10-parameter)', unit: 'pcs', reorder: 100, lots: [{ lot: 'UR-0412', expiry: '2026-11-30', qty: 60 }] },
        { code: 'HIV-RDT', name: 'HIV rapid test kit', unit: 'test', reorder: 20, lots: [{ lot: 'HV-22A', expiry: '2026-10-20', qty: 4 }] },
      ].forEach((item) => {
        const rec = { ...item, id: nextId('inventory'), movements: [] };
        S.inventory.push(rec);
      });

      S.equipment = [
        { id: nextId('equipment'), code: 'CBC-01', name: 'Haematology analyser', kind: 'Analyser', location: 'Hematology bench', serial: 'HX-20931', intervalDays: 180, lastCal: '2026-06-01', active: true, log: [{ date: '2026-06-01', event: 'Calibration', note: 'Passed', by: 'system' }] },
        { id: nextId('equipment'), code: 'CHEM-02', name: 'Biochemistry analyser', kind: 'Analyser', location: 'Chemistry bench', serial: 'CH-88310', intervalDays: 180, lastCal: '2026-09-15', active: true, log: [] },
        { id: nextId('equipment'), code: 'MIC-01', name: 'Binocular microscope', kind: 'Microscope', location: 'Cytology room', serial: 'MS-1174', intervalDays: 180, lastCal: '2025-11-01', active: true, log: [] },
      ];

      const people = [
        ['Ramesh', 'Patil', 'M', 58, '+91 98450 10101', 'O Positive'],
        ['Sunita', 'Deshmukh', 'F', 46, '+91 98450 10102', 'B Positive'],
        ['Arvind', 'Shah', 'M', 34, '+91 98450 10103', 'A Negative'],
        ['Priya', 'Menon', 'F', 29, '+91 98450 10104', 'AB Positive'],
        ['Farhan', 'Ali', 'M', 67, '+91 98450 10105', ''],
        ['Lakshmi', 'Iyer', 'F', 52, '+91 98450 10106', 'O Negative'],
        ['Vikram', 'Singh', 'M', 41, '+91 98450 10107', 'B Negative'],
        ['Neha', 'Kapoor', 'F', 33, '+91 98450 10108', 'A Positive'],
        ['Ajay', 'Joshi', 'M', 23, '+91 98450 10109', 'O Positive'],
        ['Meena', 'Pillai', 'F', 62, '+91 98450 10110', ''],
      ];
      const pts = people.map(([firstName, lastName, gender, age, phone, bloodGroup]) =>
        svc.savePatient({ firstName, lastName, gender, age, phone, bloodGroup, email: '', address: '', notes: '' }));

      const make = (pi, doctorId, codes, priority, hours, paidFrac, extra = {}) => {
        const o = svc.createOrder({
          patientId: pts[pi].id, doctorId, centreId: 1, branchId: 1, priceListId: 1,
          priority, clinicalHistory: extra.history || '', testCodes: codes.filter((c) => !c.startsWith('PKG:')),
          packageIds: codes.filter((c) => c.startsWith('PKG:')).map((c) => S.packages.find((p) => p.name === c.slice(4)).id),
          discount: 0, paid: 0, method: 'CASH',
        });
        o.registeredAt = hoursAgo(hours);
        if (paidFrac > 0) {
          const amount = round2(o.net * paidFrac);
          o.payments.push({ id: nextId('payments'), receipt: 'RCP' + pad(++S.seq.receipt, 6), amount, method: 'UPI', ref: 'UPI' + pad(hours * 7, 6), at: hoursAgo(hours), note: '' });
        }
        return o;
      };
      const fillAll = (o, reviewer) => {
        const patient = patientById(o.patientId);
        const typed = o.tests.filter((c) => !['calc', 'culture'].includes(testByCode(c).kind));
        o.tests.filter((c) => testByCode(c).kind === 'culture').forEach((c) => svc.saveCulture(o.id, c, { growth: 'No growth' }));
        if (typed.length) svc.saveResults(o.id, typed.map((c) => ({ code: c, value: sampleValue(testByCode(c), patient, o.tests.indexOf(c)) })));
        if (reviewer) svc.verifyResults(o.id);
      };

      const o1 = make(0, 1, ['CBC', 'FBS'], 'ROUTINE', 2, 0);
      const o2 = make(1, 2, ['TFT'], 'URGENT', 3, 1);
      const o3 = make(2, 1, ['LFT', 'URINE'], 'ROUTINE', 5, 0.5, { history: 'Jaundice for 3 days' });
      const o4 = make(3, 0, ['BGRP', 'HIV'], 'ROUTINE', 20, 1);
      const o5 = make(4, 2, ['LIPID', 'FBS'], 'ROUTINE', 26, 1);
      const o6 = make(5, 3, ['PAP'], 'ROUTINE', 30, 0);
      const o7 = make(6, 1, ['CBC', 'CREA'], 'STAT', 8, 0);
      const o8 = make(7, 0, ['COVID'], 'URGENT', 50, 1);
      make(8, 0, ['PKG:Diabetes Screen'], 'ROUTINE', 1, 0);
      const o10 = make(9, 2, ['BIOPSY'], 'ROUTINE', 90, 0, { history: 'Lump in left breast' });
      const o11 = make(0, 0, ['MAL'], 'ROUTINE', 0.5, 0);
      make(3, 1, ['HBSAG', 'VITD'], 'ROUTINE', 10, 0);
      make(5, 2, ['CULT'], 'ROUTINE', 80, 0); // culture is due in 72 h: already overdue
      // Home collections waiting on the route (centre code HOME).
      [[4, '07:00-09:00', 'B-14 Lake View Road, Sector 9'], [6, '09:00-11:00', 'Flat 302, Green Park Society, Sector 5']]
        .forEach(([pi, slot, address]) => {
          const ho = svc.createOrder({ patientId: pts[pi].id, doctorId: 2, centreId: 3, branchId: 1, priceListId: 1, priority: 'ROUTINE',
            testCodes: ['CBC', 'RBS'], packageIds: [], discount: 0, paid: 0, slot, collectAddress: address });
          ho.registeredAt = hoursAgo(1.5);
        });

      // Results entry moves an order REGISTERED -> COLLECTED -> IN_PROGRESS on its own.
      fillAll(o4, true); svc.generateReport(o4.id, false);
      fillAll(o5, true); svc.generateReport(o5.id, false);
      fillAll(o8, true); svc.generateReport(o8.id, false);
      fillAll(o6, true);
      fillAll(o7, false);
      svc.saveResults(o3.id, o3.tests.slice(0, 3).map((c) => ({ code: c, value: sampleValue(testByCode(c), patientById(o3.patientId), 0) })));
      svc.setOrderStatus(o10.id, 'COLLECTED');
      svc.setOrderStatus(o10.id, 'IN_PROGRESS');
      svc.cancelOrder(o11.id, 'Duplicate entry');
      svc.setOrderStatus(o1.id, 'COLLECTED');
      svc.setOrderStatus(o2.id, 'COLLECTED');

      const sampleFor = (o, specimen) => S.samples.find((s) => s.orderId === o.id && s.specimen === specimen);
      const s4 = sampleFor(o4, 'Serum') || S.samples.find((s) => s.orderId === o4.id);
      if (s4) { s4.status = 'STORED'; s4.location = 'Fridge 2, shelf B'; }

      S.outsource.push({
        id: nextId('outsource'), orderId: o2.id, testCode: 'TFT', lab: 'Metro Reference Lab',
        reference: 'MRL-40215', sentAt: hoursAgo(3), expected: new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10),
        cost: 350, status: 'SENT', result: '',
      });
      S.qc.push(
        ...[[9.9, 10.0, 0.3, '2026-10-12'], [10.1, 10.0, 0.3, '2026-10-12'], [11.2, 10.0, 0.3, '2026-10-13'], [10.0, 10.0, 0.3, '2026-10-13']]
          .map(([v, m, sd, date], i) => svc.addQC({ test: 'HB', level: i < 2 ? 'Level 1' : 'Level 2', value: v, mean: m, sd, date, note: '' })),
        svc.addQC({ test: 'FBS', level: 'Level 1', value: 102, mean: 100, sd: 3, date: '2026-10-13', note: '' }),
      );
      S.expenses.push(
        { id: nextId('expenses'), date: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10), category: 'Reagents', amount: 2400, note: 'Glucose and lipid reagents' },
        { id: nextId('expenses'), date: new Date(Date.now() - 4 * DAY).toISOString().slice(0, 10), category: 'Consumables', amount: 850, note: 'Vacutainers and gloves' },
        { id: nextId('expenses'), date: new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10), category: 'Courier / transport', amount: 450, note: 'Sample courier' },
      );
      S.payouts.push({ id: nextId('payouts'), doctorId: 1, amount: 150, date: new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10), note: 'Part payment' });
    } finally {
      seeding = false;
    }
    save();
  }

  function sampleValue(test, patient, i) {
    if (test.kind === 'quant') {
      const r = rangeFor(test, patient);
      if (!r) return '1';
      const lo = r.lo != null ? r.lo : (r.hi || 10) * 0.5;
      const hi = r.hi != null ? r.hi : lo * 2;
      const v = (lo + hi) / 2 * (i % 5 === 3 ? 1.5 : 1);
      return String(Math.round(v * 100) / 100);
    }
    if (test.kind === 'choice' || test.kind === 'semi') return test.normal || test.choices[0];
    if (test.kind === 'text') return test.normal || '0-5';
    return 'No significant abnormality detected. Correlate clinically.';
  }

  // ---- services (writes) ----------------------------------------------------
  // ---- previous results, digital signature, WhatsApp (demo) ---------------------
  // Most recent verified value of the same test for the same patient, on an earlier order.
  function reflexFires(def, r) {
    const rx = def.reflex;
    const n = Number(r.value);
    if (rx.when === 'ABOVE') return def.kind === 'quant' && n > rx.value;
    if (rx.when === 'BELOW') return def.kind === 'quant' && n < rx.value;
    if (rx.when === 'FLAG') return r.flag !== 'NORMAL' && r.flag !== 'NOT_APPLICABLE';
    return false;
  }

  // Adds tests (panels expand) to an existing order: billed, given a sample, pending results.
  function addTestsToOrder(o, codes, reason) {
    const plist = S.priceLists.find((x) => x.id === o.priceListId) || defaultPriceList();
    const added = [];
    leaves(codes).forEach((c) => {
      if (o.tests.includes(c)) return;
      const def = testByCode(c);
      const price = priceOf(def, plist);
      o.tests.push(c);
      o.lines.push({ kind: 'test', code: c, name: def.name, price, reflex: reason });
      o.gross = round2(o.gross + price);
      o.net = round2(o.net + price);
      const sample = S.samples.find((x) => x.orderId === o.id && x.specimen === def.specimen);
      if (sample) sample.tests.push(c);
      else {
        S.samples.push({
          id: nextId('samples'), sampleNo: 'SMP' + pad(++S.seq.sample, 6), orderId: o.id, specimen: def.specimen,
          container: CONTAINER[def.specimen] || 'Sterile container', tests: [c], status: 'PENDING',
          location: '', collectedAt: null, receivedAt: null, rejectReason: '',
          history: [{ at: nowIso(), event: `Created by ${reason}` }],
        });
      }
      added.push(def.name);
    });
    return added;
  }

  function previousVerified(o, code) {
    const def = testByCode(code);
    const earlier = S.orders
      .filter((x) => x.patientId === o.patientId && x.id !== o.id)
      .sort((a, b) => b.id - a.id);
    for (const x of earlier) {
      const r = x.results[code];
      if (r && r.status === 'VERIFIED') {
        return { value: def.kind === 'quant' ? Number(r.value) : null, text: r.value, at: r.verifiedAt || r.at };
      }
    }
    return null;
  }
  // Digest of the order's results as they stand. Changing any verified result changes it.
  function contentDigest(o) {
    const text = JSON.stringify({
      order: o.orderNo,
      results: o.tests.map((c) => {
        const r = o.results[c] || {};
        return [c, r.value || '', r.flag || '', r.status || '', r.verifiedBy || '', r.verifiedAt || ''];
      }),
    });
    let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).toUpperCase();
  }
  const signatureCode = (o) => { const d = contentDigest(o); return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 12)}`; };

  // Same rules as the desktop app: international digits only, 10-digit numbers get the country code.
  function normalisePhone(raw, countryCode) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 10 && countryCode) digits = countryCode + digits;
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  const maskNumber = (n) => (n ? '*'.repeat(Math.max(0, n.length - 4)) + n.slice(-4) : '');

  // Simulated send: the demo only records what the desktop app would have sent.
  function waSend(o, template, params, once, detail = 'Simulated in the demo') {
    const w = S.whatsapp;
    const p = patientById(o.patientId);
    if (!w.enabled) return { status: 'SKIPPED', detail: 'WhatsApp messaging is switched off.' };
    if (!p.whatsappConsent) return { status: 'SKIPPED', detail: 'The patient has not agreed to WhatsApp messages.' };
    const to = normalisePhone(p.phone, w.countryCode);
    if (!to) return { status: 'SKIPPED', detail: 'The patient has no valid phone number.' };
    if (once && S.messages.some((m) => m.orderId === o.id && m.template === template && m.status === 'SENT')) {
      return { status: 'SKIPPED', detail: 'This message was already sent for this order.' };
    }
    const providerId = 'SIM-' + pad(S.messages.length + 1, 5);
    S.messages.push({ id: S.messages.length + 1, at: nowIso(), orderId: o.id, orderNo: o.orderNo, template,
      to: maskNumber(to), params, status: 'SENT', detail, providerId, by: actor() });
    persist('whatsapp.send', `${o.orderNo} ${template}`);
    return { status: 'SENT', detail: 'Sent (simulated).', providerId };
  }

  // ---- analyser file parsers (CSV, ASTM E1394, HL7 v2 ORU) ----------------------------
  // Each parser returns { rows: [{ where, sampleNo, code, value }], errors: [message] }.
  // Sample numbers come from the order record (ASTM O-2, HL7 OBR-3); codes from the
  // result record (ASTM R-2, HL7 OBX-3). Only the fields the lab needs are read.
  const splitRecords = (text) => String(text || '').split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  function parseCsv(text) {
    const rows = []; const errors = [];
    splitRecords(text).forEach((line, idx) => {
      const where = `Line ${idx + 1}`;
      const cols = line.split(',').map((c) => c.trim());
      if (idx === 0 && /sample/i.test(cols[0]) && /value/i.test(line)) return;
      if (cols.length < 3) { errors.push(`${where}: expected sample, test code, value`); return; }
      rows.push({ where, sampleNo: cols[0], code: cols[1], value: cols[2] });
    });
    return { rows, errors };
  }
  function parseAstm(text) {
    const rows = []; const errors = [];
    let sampleNo = null;
    splitRecords(text).forEach((line, idx) => {
      const where = `Line ${idx + 1}`;
      const f = line.split('|');
      if (f[0] === 'O') sampleNo = (f[2] || '').trim();
      if (f[0] === 'R') {
        if (!sampleNo) { errors.push(`${where}: result before any order (O) record`); return; }
        const parts = (f[2] || '').split('^');
        rows.push({ where, sampleNo, code: (parts[3] || parts[0] || '').trim(), value: (f[3] || '').trim() });
      }
    });
    return { rows, errors };
  }
  function parseHl7(text) {
    const rows = []; const errors = [];
    let sampleNo = null;
    splitRecords(text).forEach((line, idx) => {
      const where = `Line ${idx + 1}`;
      const f = line.split('|');
      if (f[0] === 'OBR') sampleNo = (f[3] || '').split('^')[0].trim();
      if (f[0] === 'OBX') {
        if (!sampleNo) { errors.push(`${where}: observation before any OBR segment`); return; }
        rows.push({ where, sampleNo, code: (f[3] || '').split('^')[0].trim(), value: (f[5] || '').split('^')[0].trim() });
      }
    });
    return { rows, errors };
  }
  function parseAnalyser(text, format) {
    const parsed = format === 'ASTM' ? parseAstm(text) : format === 'HL7' ? parseHl7(text) : parseCsv(text);
    if (!parsed.rows.length && !parsed.errors.length) parsed.errors.push('No results found. Check that the format matches the file.');
    return parsed;
  }

  const svc = {
    // patients
    savePatient(d, id) {
      const firstName = (d.firstName || '').trim();
      const lastName = (d.lastName || '').trim();
      if (!firstName) fail('First name is required.');
      if (!['M', 'F', 'O'].includes(d.gender)) fail('Choose a gender.');
      if (!d.dob && !(Number(d.age) >= 0 && Number(d.age) <= 120)) fail('Enter an age between 0 and 120, or a date of birth.');
      if (d.phone && !/^[+\d\s()-]{6,}$/.test(d.phone)) fail('The phone number looks invalid.');
      if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) fail('The e-mail address looks invalid.');
      let p = id ? patientById(id) : null;
      if (id && !p) fail('That patient no longer exists.');
      const rec = {
        firstName, lastName, gender: d.gender, dob: d.dob || '',
        age: d.dob ? Math.floor((Date.now() - new Date(d.dob).getTime()) / (365.25 * DAY)) : Number(d.age),
        phone: d.phone || '', email: d.email || '', bloodGroup: d.bloodGroup || '',
        address: d.address || '', notes: d.notes || '',
      };
      // Consent is recorded with the time it was given; the time moves only when the choice changes.
      const consent = d.whatsappConsent === '1' || d.whatsappConsent === true;
      const wasConsenting = !!(p && p.whatsappConsent);
      rec.whatsappConsent = consent;
      rec.whatsappConsentAt = consent ? (wasConsenting && p.whatsappConsentAt ? p.whatsappConsentAt : nowIso()) : '';
      if (p) {
        Object.assign(p, rec);
        persist('patient.update', p.mrn);
      } else {
        p = { id: nextId('patients'), mrn: 'P' + pad(++S.seq.mrn, 6), ...rec, createdAt: nowIso() };
        S.patients.push(p);
        persist('patient.create', p.mrn);
      }
      save();
      return p;
    },
    deletePatient(id) {
      const p = patientById(id);
      if (!p) fail('That patient no longer exists.');
      if (S.orders.some((o) => o.patientId === p.id)) fail('This patient has orders and cannot be deleted.');
      S.patients = S.patients.filter((x) => x.id !== p.id);
      persist('patient.delete', p.mrn);
      save();
    },

    // orders
    createOrder(d) {
      const patient = patientById(d.patientId);
      if (!patient) fail('Choose a patient first.');
      const plist = S.priceLists.find((x) => x.id === Number(d.priceListId)) || defaultPriceList();
      const lines = [];
      (d.testCodes || []).forEach((code) => {
        const def = testByCode(code);
        if (!def || !def.active) return;
        lines.push({ kind: 'test', code, name: def.name, price: priceOf(def, plist) });
      });
      (d.packageIds || []).forEach((pid) => {
        const pk = S.packages.find((x) => x.id === Number(pid));
        if (pk) lines.push({ kind: 'package', packageId: pk.id, name: 'Package: ' + pk.name, price: pk.price, codes: pk.tests });
      });
      if (!lines.length) fail('Select at least one investigation or health package.');
      const tests = leaves(lines.flatMap((l) => (l.kind === 'test' ? [l.code] : l.codes)));
      if (!tests.length) fail('The selected items contain no active tests.');
      const gross = round2(sum(lines.map((l) => l.price)));
      const discount = round2(Number(d.discount) || 0);
      if (discount < 0 || discount > gross) fail('Discount must be between 0 and the gross amount.');
      const net = round2(gross - discount);
      const paid = round2(Number(d.paid) || 0);
      if (paid < 0 || paid > net + 0.001) fail('The amount paid cannot exceed the net payable.');
      if ((d.collectAddress || '').trim() && !(d.slot || '').trim()) fail('Choose a time slot for the home visit.');

      const order = {
        id: nextId('orders'), orderNo: 'ORD' + pad(++S.seq.order, 6), patientId: patient.id,
        doctorId: Number(d.doctorId) || null, centreId: Number(d.centreId) || null, branchId: Number(d.branchId) || null,
        priceListId: plist.id, priority: d.priority || 'ROUTINE', clinicalHistory: d.clinicalHistory || '',
        lines, tests, discount, gross, net, payments: [], status: 'REGISTERED',
        registeredAt: nowIso(), results: {}, reportedAt: null, cancelReason: '',
        // Home collection: time slot, address to visit, and who collected (set on the route).
        // An order with a collection address is a home visit (desktop: order.collect_address).
        slot: (d.slot || '').trim(), collectAddress: (d.collectAddress || '').trim(),
        phlebotomist: '', collectedAt: null,
      };
      S.orders.push(order);
      [...new Set(tests.map((c) => testByCode(c).specimen))].forEach((specimen) => {
        S.samples.push({
          id: nextId('samples'), sampleNo: 'SMP' + pad(++S.seq.sample, 6), orderId: order.id, specimen,
          container: CONTAINER[specimen] || 'Sterile container',
          tests: tests.filter((c) => testByCode(c).specimen === specimen),
          status: 'PENDING', location: '', collectedAt: null, receivedAt: null, rejectReason: '',
          history: [{ at: nowIso(), event: 'Created with order' }],
        });
      });
      if (paid > 0) this._pay(order, paid, d.method || 'CASH', d.reference || '', 'Paid at registration');
      persist('order.create', `${order.orderNo} for ${patient.mrn}`);
      save();
      return order;
    },
    _pay(order, amount, method, ref, note) {
      order.payments.push({ id: nextId('payments'), receipt: 'RCP' + pad(++S.seq.receipt, 6), amount: round2(amount), method, ref, at: nowIso(), note: note || '' });
    },
    receivePayment(orderId, amount, method, ref) {
      const o = orderById(orderId);
      if (o.status === 'CANCELLED') fail('Cancelled orders cannot take payments.');
      const bal = orderTotals(o).balance;
      const amt = round2(Number(amount));
      if (!(amt > 0) || amt > bal + 0.001) fail(`Enter an amount between 0 and the balance due (${bal.toFixed(2)}).`);
      this._pay(o, amt, method || 'CASH', ref || '', 'Payment received');
      persist('payment.receive', `${o.orderNo} ${amt.toFixed(2)} ${method || 'CASH'}`);
      save();
      return S.orders.find((x) => x.id === o.id).payments.slice(-1)[0];
    },
    setOrderStatus(id, target) {
      const o = orderById(id);
      if (!ORDER_NEXT[o.status].includes(target)) fail(`An order that is ${label(o.status)} cannot be moved to ${label(target)}.`);
      o.status = target;
      persist('order.status', `${o.orderNo} -> ${target}`);
      save();
    },
    cancelOrder(id, reason) {
      const o = orderById(id);
      if (!ORDER_NEXT[o.status].includes('CANCELLED')) fail(`A ${label(o.status).toLowerCase()} order cannot be cancelled.`);
      o.status = 'CANCELLED';
      o.cancelReason = reason || 'Cancelled';
      persist('order.cancel', `${o.orderNo}: ${o.cancelReason}`);
      save();
    },

    // samples
    // Home collection: the phlebotomist reaches the address and collects. Pending samples
    // on the order become collected in one step.
    collectHome(orderId, phlebotomist) {
      const o = orderById(orderId);
      const c = S.centres.find((x) => x.id === o.centreId);
      if (!o.collectAddress) fail('This order is not a home visit.');
      if (!phlebotomist) fail('Choose the phlebotomist who collected the sample.');
      if (o.status !== 'REGISTERED') fail('This order has already been collected.');
      o.status = 'COLLECTED';
      o.phlebotomist = phlebotomist;
      o.collectedAt = nowIso();
      S.samples.filter((s) => s.orderId === o.id && s.status === 'PENDING').forEach((s) => {
        s.status = 'COLLECTED';
        s.collectedAt = nowIso();
        s.history.push({ at: nowIso(), event: `Collected by ${phlebotomist} (home collection)` });
      });
      persist('order.collect_home', `${o.orderNo} by ${phlebotomist}`);
      save();
    },
    moveSample(id, target, extra = {}) {
      const s = sampleById(id);
      if (!(SAMPLE_NEXT[s.status] || []).includes(target)) fail(`A sample that is ${label(s.status).toLowerCase()} cannot be moved to ${label(target).toLowerCase()}.`);
      s.status = target;
      if (target === 'COLLECTED') s.collectedAt = nowIso();
      if (target === 'RECEIVED') s.receivedAt = nowIso();
      if (target === 'PENDING') { s.collectedAt = null; s.receivedAt = null; }
      if (target === 'STORED') s.location = extra.location || s.location;
      if (target === 'REJECTED') s.rejectReason = extra.reason || '';
      s.history.push({ at: nowIso(), event: `${label(target)}${extra.location ? ' - ' + extra.location : ''}${extra.reason ? ' - ' + extra.reason : ''}` });
      persist('sample.' + target.toLowerCase(), s.sampleNo);
      save();
    },
    setSampleLocation(id, location) {
      const s = sampleById(id);
      if (!location) fail('Enter a location.');
      s.location = location;
      s.history.push({ at: nowIso(), event: `Moved to ${location}` });
      persist('sample.move', `${s.sampleNo} -> ${location}`);
      save();
    },

    // results
    saveResults(orderId, entries) {
      const o = orderById(orderId);
      if (o.status === 'CANCELLED') fail('Cancelled orders cannot take results.');
      const patient = patientById(o.patientId);
      const criticals = [];
      let saved = 0;
      entries.forEach(({ code, value, comment }) => {
        if (!o.tests.includes(code)) return;
        const def = testByCode(code);
        if (def.kind === 'calc' || def.kind === 'culture') return; // filled in by the rules below
        const cur = o.results[code];
        if (cur && cur.status === 'VERIFIED') return;
        const raw = value == null ? '' : String(value).trim();
        if (raw === '') {
          if (cur) { delete o.results[code]; saved++; }
          return;
        }
        if (def.kind === 'quant' && !isFinite(Number(raw))) fail(`${def.name}: enter a number.`);
        if (def.kind === 'choice' || def.kind === 'semi') {
          if (!def.choices.includes(raw)) fail(`${def.name}: choose one of the listed values.`);
        }
        o.results[code] = buildResult(o, def, raw, patient, cur, comment);
        saved++;
        if (isCritical(o.results[code].flag)) criticals.push(def.name);
      });
      if (!saved) fail('Enter at least one result before saving.');
      deriveCalculated(o, patient);
      // Reflex testing: a saved result that meets a rule adds its follow-up tests to this order.
      const reflexes = [];
      entries.forEach(({ code }) => {
        const def = testByCode(code);
        const r = o.results[code];
        if (!def || !def.reflex || !r || r.status !== 'ENTERED' || !reflexFires(def, r)) return;
        const added = addTestsToOrder(o, def.reflex.add, `reflex from ${def.name} = ${r.value}`);
        if (added.length) reflexes.push({ from: def.name, value: r.value, added });
      });
      if (o.status === 'REGISTERED') o.status = 'COLLECTED';
      if (o.status === 'COLLECTED') o.status = 'IN_PROGRESS';
      reflexes.forEach((x) => persist('results.reflex', `${o.orderNo}: ${x.added.join(', ')} after ${x.from}`));
      persist('results.save', `${o.orderNo}: ${saved} value(s)`);
      save();
      return { saved, criticals, reflexes };
    },
    // Culture and sensitivity (desktop: culture dialog). Growth, organism, colony count, Gram stain,
    // the S / I / R panel and remarks. The order line shows the organism, or the growth if none.
    saveCulture(orderId, code, d) {
      const o = orderById(orderId);
      if (o.status === 'CANCELLED') fail('Cancelled orders cannot take results.');
      const def = testByCode(code);
      if (!def || def.kind !== 'culture' || !o.tests.includes(code)) fail('That is not a culture test on this order.');
      const cur = o.results[code];
      if (cur && cur.status === 'VERIFIED') fail(`${def.name} is already verified.`);
      const growth = String(d.growth || '').trim();
      if (!growth) fail('Select or type the growth observed.');
      const growing = hasGrowth(growth);
      const organism = growing ? String(d.organism || '').trim() : '';
      if (growing && !organism) fail('Significant growth was selected - name the organism isolated.');
      const colony = growing ? String(d.colony || '').trim() : '';
      const gram = growing ? String(d.gram || '').trim() : '';
      const sensitivities = [];
      if (growing) (d.sens || []).forEach((s) => {
        const antibiotic = String(s.antibiotic || '').trim();
        const zone = s.zone === '' || s.zone == null ? null : Number(s.zone);
        const mic = String(s.mic || '').trim();
        if (!antibiotic) return;
        // An antibiotic left without a result is not reported. A zone or MIC needs a result.
        if (!INTERP.some(([v]) => v === s.interpretation)) {
          if (zone != null || mic) fail(`Choose S, I or R for ${antibiotic}.`);
          return;
        }
        sensitivities.push({ antibiotic, interpretation: s.interpretation, zone, mic });
      });
      o.results[code] = {
        value: growing ? `${organism}${colony ? ` (${colony})` : ''}` : growth,
        flag: 'NOT_APPLICABLE', status: 'ENTERED', by: actor(), at: nowIso(), verifiedBy: '', verifiedAt: '',
        notified: null, comment: (cur && cur.comment) || '', prev: null, delta: null, deltaFlag: false,
        culture: { growth, organism, colony, gram, remarks: String(d.remarks || '').trim(), sensitivities },
      };
      if (o.status === 'REGISTERED') o.status = 'COLLECTED';
      if (o.status === 'COLLECTED') o.status = 'IN_PROGRESS';
      persist('results.culture', `${o.orderNo}: ${def.name}`);
      save();
      return o.results[code];
    },
    verifyResults(orderId) {
      const o = orderById(orderId);
      if (o.status === 'CANCELLED') fail('Cancelled orders cannot be verified.');
      const missing = pendingCount(o);
      if (missing) fail(`${missing} result(s) still need to be entered before verification.`);
      const blocked = o.tests.filter((c) => {
        const r = o.results[c];
        return r && r.status === 'ENTERED' && r.deltaFlag && !(r.comment || '').trim();
      });
      if (blocked.length) {
        const err = new DomainError(`Delta check failed for ${blocked.map((c) => testByCode(c).name).join(', ')}. Add a comment explaining the change, then verify.`);
        err.deltaCodes = blocked;
        throw err;
      }
      let count = 0;
      o.tests.forEach((c) => {
        const r = o.results[c];
        if (r && r.status === 'ENTERED') {
          r.status = 'VERIFIED';
          r.verifiedBy = actor();
          r.verifiedAt = nowIso();
          count++;
        }
      });
      if (ORDER_NEXT[o.status].includes('COMPLETED')) o.status = 'COMPLETED';
      persist('results.verify', `${o.orderNo}: ${count} result(s)`);
      save();
      return count;
    },
    notifyCritical(orderId, code, d) {
      const o = orderById(orderId);
      const r = o.results[code];
      if (!r) fail('That result no longer exists.');
      if (!d.to) fail('Enter who was told.');
      r.notified = { to: d.to, method: d.method || 'In person', note: d.note || '', at: nowIso(), by: actor() };
      persist('critical.notify', `${o.orderNo} ${code} -> ${d.to}`);
      save();
    },
    generateReport(orderId, provisional) {
      const o = orderById(orderId);
      if (o.status === 'CANCELLED') fail('Cancelled orders cannot be reported.');
      if (!provisional && (pendingCount(o) || o.tests.some((c) => o.results[c].status !== 'VERIFIED'))) {
        fail('All results must be verified before a final report. Generate a provisional report, or verify the results first.');
      }
      const type = provisional ? 'Provisional' : 'Final';
      if (!provisional) {
        if (!ORDER_NEXT[o.status].includes('REPORTED')) fail(`An order that is ${label(o.status).toLowerCase()} cannot be reported yet.`);
        o.status = 'REPORTED';
        o.reportedAt = nowIso();
      }
      const rec = {
        id: nextId('reports'), orderId: o.id, orderNo: o.orderNo, patient: patientName(patientById(o.patientId)),
        type, by: actor(), at: nowIso(),
        file: `${o.orderNo}_${type.toLowerCase()}_${S.reports.length + 1}.pdf`,
      };
      if (!provisional) {
        rec.signature = signatureCode(o);
        rec.whatsapp = waSend(o, S.whatsapp.templateReport, [patientName(patientById(o.patientId)), o.orderNo, S.lab.name], true);
      }
      S.reports.push(rec);
      persist('report.generate', `${o.orderNo} (${type})`);
      save();
      return rec;
    },

    // catalogue and masters
    saveTest(d, code) {
      const name = (d.name || '').trim();
      if (!name) fail('Enter the test name.');
      const testCode = (d.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,16}$/.test(testCode)) fail('Code must be 2-16 letters, digits, - or _.');
      if (!code && testByCode(testCode)) fail('Another test already uses that code.');
      if (d.kind !== 'panel' && !DEPARTMENTS.includes(d.dept)) fail('Choose a department.');
      if (d.kind === 'panel') {
        if (!d.children || !d.children.length) fail('Choose at least one test for the panel.');
      }
      const price = Number(d.price);
      if (!(price >= 0)) fail('Price must be zero or more.');
      if ((d.kind === 'choice' || d.kind === 'semi') && (!d.choices || d.choices.length < 2)) fail('Enter at least two choices.');
      const formula = d.kind === 'calc' ? String(d.formula || '').trim() : '';
      if (d.kind === 'calc') {
        if (!formula) fail('A calculated test needs a formula.');
        let codes;
        try { codes = formulaCodes(formula); } catch (e) { fail(e.message); }
        if (codes.includes(testCode)) fail('A formula cannot use the test it belongs to.');
        const unknown = codes.filter((c) => !testByCode(c));
        if (unknown.length) fail(`The formula uses unknown test codes: ${unknown.join(', ')}.`);
      }
      const rec = {
        code: testCode, name, dept: d.dept || 'Other', kind: d.kind, unit: d.unit || '',
        specimen: d.kind === 'panel' ? '' : (d.specimen || 'Serum'), price, tat: Number(d.tat) || 24,
        ranges: (d.ranges || []).filter((r) => r.lo != null || r.hi != null),
        choices: d.choices || null, normal: d.normal || '', children: d.children || null, active: d.active !== false,
        formula, decimals: d.decimals === '' || d.decimals == null ? 2 : Math.min(4, Math.max(0, Math.round(Number(d.decimals)) || 0)),
      };
      if (code) {
        const old = testByCode(code);
        if (!old) fail('That test no longer exists.');
        const oldCode = old.code;
        Object.assign(old, rec, { code: oldCode });
        persist('catalog.update', oldCode);
      } else {
        S.tests.push(rec);
        persist('catalog.create', testCode);
      }
      S.orders.forEach((o) => deriveCalculated(o, patientById(o.patientId)));
      save();
    },
    savePackage(d, id) {
      const name = (d.name || '').trim();
      if (!name) fail('Enter the package name.');
      if (!(Number(d.price) >= 0)) fail('Enter a price.');
      if (!d.tests || !d.tests.length) fail('Choose at least one test.');
      if (id) {
        const pk = S.packages.find((x) => x.id === id);
        if (!pk) fail('That package no longer exists.');
        Object.assign(pk, { name, price: Number(d.price), tests: d.tests, active: d.active !== false });
      } else {
        S.packages.push({ id: nextId('packages'), name, price: Number(d.price), tests: d.tests, active: true });
      }
      persist('package.save', name);
      save();
    },
    deletePackage(id) {
      if (S.orders.some((o) => o.lines.some((l) => l.packageId === id))) fail('This package has been sold. Mark it inactive instead.');
      S.packages = S.packages.filter((p) => p.id !== id);
      persist('package.delete', String(id));
      save();
    },
    saveMaster(kind, d, id) {
      const list = S[kind];
      const name = (d.name || '').trim();
      if (!name) fail('Enter a name.');
      if (kind === 'doctors') {
        const c = Number(d.commission);
        if (!(c >= 0 && c <= 100)) fail('Commission must be between 0 and 100 percent.');
      }
      if (id) {
        const rec = list.find((x) => x.id === id);
        if (!rec) fail('That record no longer exists.');
        Object.assign(rec, { ...d, name, commission: kind === 'doctors' ? Number(d.commission) : undefined });
        persist(`master.${kind}.update`, name);
      } else {
        const rec = { ...d, id: nextId(kind), name, commission: kind === 'doctors' ? Number(d.commission) || 0 : undefined };
        list.push(rec);
        persist(`master.${kind}.create`, name);
      }
      save();
    },
    deleteMaster(kind, id) {
      const field = { doctors: 'doctorId', centres: 'centreId', branches: 'branchId' }[kind];
      if (S.orders.some((o) => o[field] === id)) fail('This record is used by orders and cannot be deleted.');
      S[kind] = S[kind].filter((x) => x.id !== id);
      persist(`master.${kind}.delete`, String(id));
      save();
    },
    savePriceList(d, id) {
      const name = (d.name || '').trim();
      if (!name) fail('Enter a name for the price list.');
      const overrides = d.overrides || {};
      if (id) {
        const pl = S.priceLists.find((x) => x.id === id);
        if (!pl) fail('That price list no longer exists.');
        Object.assign(pl, { name, overrides });
      } else {
        S.priceLists.push({ id: nextId('priceLists'), name, isDefault: false, overrides });
      }
      persist('pricelist.save', name);
      save();
    },
    setDefaultPriceList(id) {
      S.priceLists.forEach((x) => { x.isDefault = x.id === id; });
      persist('pricelist.default', String(id));
      save();
    },

    // inventory
    saveItem(d, id) {
      const name = (d.name || '').trim();
      const code = (d.code || '').trim();
      if (!code || !name) fail('Code and name are required.');
      if (!(Number(d.reorder) >= 0)) fail('Reorder level must be zero or more.');
      if (id) {
        const it = S.inventory.find((x) => x.id === id);
        if (!it) fail('That item no longer exists.');
        Object.assign(it, { code, name, unit: d.unit || 'pcs', reorder: Number(d.reorder) || 0 });
      } else {
        S.inventory.push({ id: nextId('inventory'), code, name, unit: d.unit || 'pcs', reorder: Number(d.reorder) || 0, lots: [], movements: [] });
      }
      persist('inventory.save', code);
      save();
    },
    receiveStock(id, d) {
      const it = S.inventory.find((x) => x.id === id);
      if (!it) fail('That item no longer exists.');
      if (!d.lot || !d.expiry) fail('Lot number and expiry date are required.');
      const qty = Number(d.qty);
      if (!(qty > 0)) fail('Quantity must be more than zero.');
      const existing = it.lots.find((l) => l.lot === d.lot);
      if (existing) { existing.qty += qty; existing.expiry = d.expiry; } else it.lots.push({ lot: d.lot, expiry: d.expiry, qty });
      it.movements.push({ at: nowIso(), type: 'Received', qty, note: `${d.lot}${d.supplier ? ' from ' + d.supplier : ''}`, by: actor() });
      persist('inventory.receive', `${it.code} +${qty}`);
      save();
    },
    issueStock(id, d) {
      const it = S.inventory.find((x) => x.id === id);
      if (!it) fail('That item no longer exists.');
      const qty = Number(d.qty);
      if (!(qty > 0)) fail('Quantity must be more than zero.');
      const available = sum(it.lots.map((l) => l.qty));
      if (qty > available) fail(`Only ${available} ${it.unit} in stock.`);
      let left = qty;
      [...it.lots].sort((a, b) => a.expiry.localeCompare(b.expiry)).forEach((l) => {
        const take = Math.min(left, l.qty);
        l.qty -= take;
        left -= take;
      });
      it.lots = it.lots.filter((l) => l.qty > 0);
      it.movements.push({ at: nowIso(), type: 'Issued', qty: -qty, note: d.reason || '', by: actor() });
      persist('inventory.issue', `${it.code} -${qty}`);
      save();
    },
    correctCount(id, d) {
      const it = S.inventory.find((x) => x.id === id);
      if (!it) fail('That item no longer exists.');
      const counted = Number(d.counted);
      if (!(counted >= 0)) fail('Enter the counted quantity.');
      if (!d.reason) fail('Give a reason for the correction.');
      const diff = counted - sum(it.lots.map((l) => l.qty));
      if (diff !== 0) {
        if (!it.lots.length) it.lots.push({ lot: 'ADJ', expiry: '2099-12-31', qty: 0 });
        it.lots[0].qty += diff;
        it.lots = it.lots.filter((l) => l.qty > 0);
      }
      it.movements.push({ at: nowIso(), type: 'Count corrected', qty: diff, note: d.reason, by: actor() });
      persist('inventory.count', `${it.code} ${diff >= 0 ? '+' : ''}${diff}`);
      save();
    },

    // quality control
    addQC(d) {
      const value = Number(d.value);
      const mean = Number(d.mean);
      const sd = Number(d.sd);
      if (!d.test) fail('Choose a test.');
      if (!isFinite(value) || !isFinite(mean)) fail('Value and mean must be numbers.');
      if (!(sd > 0)) fail('The standard deviation must be more than zero.');
      const z = (value - mean) / sd;
      const status = Math.abs(z) > 3 ? 'FAILED' : Math.abs(z) > 2 ? 'OUT_OF_RANGE' : 'PASSED';
      const rec = { id: nextId('qc'), test: d.test, level: d.level || 'Level 1', value, mean, sd, z: Math.round(z * 100) / 100, status, date: d.date || todayKey(), note: d.note || '', by: actor() };
      S.qc.push(rec);
      persist('qc.record', `${rec.test} ${rec.level} ${status}`);
      save();
      return rec;
    },

    // outsourcing
    sendOut(d) {
      const o = orderById(d.orderId);
      if (!o.tests.includes(d.testCode)) fail('That test is not part of this order.');
      if (!d.lab) fail('Enter the partner laboratory.');
      const rec = { id: nextId('outsource'), orderId: o.id, testCode: d.testCode, lab: d.lab, reference: d.reference || '', sentAt: nowIso(), expected: d.expected || '', cost: Number(d.cost) || 0, status: 'SENT', result: '' };
      S.outsource.push(rec);
      persist('outsource.send', `${o.orderNo} ${d.testCode} -> ${d.lab}`);
      save();
      return rec;
    },
    receiveOut(id, result) {
      const rec = S.outsource.find((x) => x.id === id);
      if (!rec) fail('That record no longer exists.');
      if (!result) fail('Enter the result received.');
      rec.status = 'RECEIVED';
      rec.result = result;
      rec.receivedAt = nowIso();
      persist('outsource.receive', rec.testCode);
      save();
    },

    // equipment
    saveEquipment(d, id) {
      if (!d.code || !d.name) fail('Code and name are required.');
      const rec = { code: d.code, name: d.name, kind: d.kind || '', location: d.location || '', serial: d.serial || '', intervalDays: Number(d.intervalDays) || 365, lastCal: d.lastCal || '', active: d.active !== false };
      if (id) {
        const e = S.equipment.find((x) => x.id === id);
        if (!e) fail('That equipment no longer exists.');
        Object.assign(e, rec);
      } else {
        S.equipment.push({ id: nextId('equipment'), ...rec, log: [] });
      }
      persist('equipment.save', d.code);
      save();
    },
    logEquipment(id, d) {
      const e = S.equipment.find((x) => x.id === id);
      if (!e) fail('That equipment no longer exists.');
      if (!d.event || !d.date) fail('Event and date are required.');
      e.log.push({ date: d.date, event: d.event, note: d.note || '', by: actor() });
      if (/calibrat/i.test(d.event)) e.lastCal = d.date;
      persist('equipment.log', `${e.code}: ${d.event}`);
      save();
    },

    // analysers
    previewAnalyser(text, format) {
      const { rows, errors } = parseAnalyser(text, format);
      const out = errors.map((msg) => ({ sampleNo: '-', code: '-', value: '-', status: msg }));
      rows.forEach((r) => {
        const s = S.samples.find((x) => x.sampleNo === r.sampleNo);
        let status = 'OK';
        if (!s) status = `${r.where}: unknown sample ${r.sampleNo}`;
        else if (!s.tests.includes(r.code)) status = `${r.where}: ${r.code} is not requested on ${r.sampleNo}`;
        else if (r.value === '') status = `${r.where}: no value`;
        out.push({ sampleNo: r.sampleNo, code: r.code, value: r.value, status });
      });
      return out;
    },
    importAnalyser(text, format) {
      const preview = svc.previewAnalyser(text, format);
      const byOrder = {};
      const skipped = [];
      let applied = 0;
      preview.forEach((r) => {
        if (r.status !== 'OK') { skipped.push(r.status); return; }
        const sample = S.samples.find((s) => s.sampleNo === r.sampleNo);
        (byOrder[sample.orderId] = byOrder[sample.orderId] || []).push({ code: r.code, value: r.value });
      });
      Object.keys(byOrder).forEach((oid) => {
        try { svc.saveResults(Number(oid), byOrder[oid]); applied += byOrder[oid].length; } catch (e) { skipped.push(e.message); }
      });
      persist('analyser.import', `${format || 'CSV'}: ${applied} value(s)`);
      save();
      return { applied, skipped };
    },

    // WhatsApp messaging (simulated in the demo)
    saveWhatsapp(d) {
      const enabled = !!d.enabled;
      const phoneNumberId = String(d.phoneNumberId || '').trim();
      if (enabled && !/^\d{6,20}$/.test(phoneNumberId)) fail('Enter the phone number ID from Meta (digits only).');
      if (!/^\d{1,3}$/.test(String(d.countryCode || '').trim())) fail('The default country code is 1 to 3 digits, without the +.');
      if (!String(d.templateReport || '').trim() || !String(d.templatePayment || '').trim()) fail('Enter both template names.');
      S.whatsapp = {
        ...S.whatsapp, enabled, phoneNumberId,
        apiVersion: String(d.apiVersion || 'v21.0').trim(), countryCode: String(d.countryCode).trim(),
        language: String(d.language || 'en').trim(), templateReport: String(d.templateReport).trim(),
        templatePayment: String(d.templatePayment).trim(),
        templateDocument: String(d.templateDocument || 'patholab_report_document').trim(),
        sendReportPdf: !!d.sendReportPdf,
      };
      persist('whatsapp.settings', enabled ? 'enabled' : 'disabled');
      save();
    },
    testWhatsapp(phone) {
      const to = normalisePhone(phone, S.whatsapp.countryCode);
      if (!to) fail('That is not a valid phone number.');
      if (!S.whatsapp.enabled) fail('Switch WhatsApp messaging on first.');
      const providerId = 'SIM-' + pad(S.messages.length + 1, 5);
      S.messages.push({ id: S.messages.length + 1, at: nowIso(), orderId: null, orderNo: '-', template: S.whatsapp.templateReport,
        to: maskNumber(to), params: ['Test', 'TEST-000', 'Demo lab'], status: 'SENT', detail: 'Simulated test message', providerId, by: actor() });
      persist('whatsapp.test', maskNumber(to));
      save();
      return providerId;
    },
    sendPaymentReminder(orderId) {
      const o = orderById(orderId);
      const t = orderTotals(o);
      if (t.balance <= 0.005) return { status: 'SKIPPED', detail: 'Nothing is owed on this order.' };
      const res = waSend(o, S.whatsapp.templatePayment,
        [patientName(patientById(o.patientId)), o.orderNo, t.balance.toFixed(2), S.lab.name], false);
      save();
      return res;
    },

    // Final report PDF sent to the patient. Off unless the lab allows it, because the PDF has results.
    sendReportWhatsapp(reportId) {
      const rec = S.reports.find((r) => r.id === Number(reportId));
      if (!rec) fail('That report no longer exists.');
      if (rec.type !== 'Final') fail('Only final reports can be sent on WhatsApp.');
      if (!S.whatsapp.sendReportPdf) {
        return { status: 'SKIPPED', detail: 'Sending report PDFs on WhatsApp is switched off in settings.' };
      }
      const o = orderById(rec.orderId);
      const res = waSend(o, S.whatsapp.templateDocument,
        [patientName(patientById(o.patientId)), o.orderNo, S.lab.name], false, 'Report PDF (simulated in the demo)');
      save();
      return res;
    },

    // cloud database and sync (simulated in the demo)
    saveSync(d) {
      const port = Number(d.port);
      if (!String(d.host || '').trim()) fail('Enter the server name or address.');
      if (!(port > 0 && port < 65536)) fail('Enter a port between 1 and 65535.');
      if (!String(d.database || '').trim()) fail('Enter the database name.');
      if (!String(d.user || '').trim()) fail('Enter the database user name.');
      S.sync = { ...S.sync, engine: d.engine === 'mysql' ? 'mysql' : 'postgresql', host: String(d.host).trim(), port,
        database: String(d.database).trim(), user: String(d.user).trim(), tls: !!d.tls };
      persist('sync.settings', `${S.sync.engine} ${S.sync.host}`);
      save();
    },
    testSync() {
      if (!S.sync.host) fail('Save the server settings first.');
      return `Demo: the ${S.sync.engine === 'mysql' ? 'MySQL' : 'PostgreSQL'} settings look valid. The desktop app makes the real connection.`;
    },
    syncNow() {
      if (!S.sync.host) fail('Save the server settings first.');
      S.sync.lastSync = nowIso();
      S.sync.lastResult = 'Demo: nothing is sent. The desktop app pushes its changes and pulls the other branches’ changes.';
      persist('sync.run', S.sync.host);
      save();
      return S.sync.lastResult;
    },

    // report signature check (recomputes the digest from the results as they stand)
    verifySignature(reportId) {
      const rec = S.reports.find((r) => r.id === Number(reportId));
      if (!rec) fail('That report no longer exists.');
      if (!rec.signature) return { valid: false, detail: 'Provisional reports are not signed.' };
      const o = orderById(rec.orderId);
      if (signatureCode(o) === rec.signature) return { valid: true, detail: `Signature ${rec.signature} matches the results as they stand.` };
      return { valid: false, detail: 'The results have changed since this report was signed.' };
    },

    // finance
    addExpense(d) {
      if (!d.date) fail('Choose a date.');
      if (!(Number(d.amount) > 0)) fail('Amount must be more than zero.');
      if (!d.category) fail('Choose or enter a category.');
      S.expenses.push({ id: nextId('expenses'), date: d.date, category: d.category, amount: round2(d.amount), note: d.note || '' });
      persist('expense.add', `${d.category} ${d.amount}`);
      save();
    },
    deleteExpense(id) {
      S.expenses = S.expenses.filter((x) => x.id !== id);
      persist('expense.delete', String(id));
      save();
    },
    setCommission(doctorId, pct) {
      const doc = doctorById(doctorId);
      if (!doc) fail('Choose a doctor.');
      if (!(pct >= 0 && pct <= 100)) fail('Commission must be between 0 and 100 percent.');
      doc.commission = Number(pct);
      persist('commission.set', `${doc.name} ${pct}%`);
      save();
    },
    addPayout(d) {
      const doc = doctorById(d.doctorId);
      if (!doc) fail('Choose a doctor.');
      const due = commissionDue(doc.id, null, null).due;
      const amt = round2(d.amount);
      if (!(amt > 0) || amt > due + 0.001) fail(`Enter an amount between 0 and the commission due (${due.toFixed(2)}).`);
      S.payouts.push({ id: nextId('payouts'), doctorId: doc.id, amount: amt, date: d.date || todayKey(), note: d.note || '' });
      persist('payout.add', `${doc.name} ${amt}`);
      save();
    },

    // users
    saveUser(d, id) {
      const username = (d.username || '').trim().toLowerCase();
      const fullName = (d.fullName || '').trim();
      if (!username || !fullName) fail('Username and full name are required.');
      if (!ROLES[d.role]) fail('Choose a role.');
      if (S.users.some((u) => u.username === username && u.id !== id)) fail('That username is already taken.');
      if (id) {
        const u = S.users.find((x) => x.id === id);
        if (!u) fail('That user no longer exists.');
        Object.assign(u, { username, fullName, role: d.role });
        if (d.password) { u.password = d.password; u.passwordChangedAt = nowIso(); }
        persist('user.update', username);
      } else {
        if (!d.password || d.password.length < 6) fail('Set a password of at least 6 characters.');
        S.users.push({ id: nextId('users'), username, password: d.password, fullName, role: d.role, active: true });
        persist('user.create', username);
      }
      save();
    },
    toggleUser(id) {
      const u = S.users.find((x) => x.id === id);
      if (!u) fail('That user no longer exists.');
      if (u.id === sessionUserId) fail('You cannot deactivate the account you are signed in with.');
      u.active = !u.active;
      persist('user.toggle', `${u.username} ${u.active ? 'activated' : 'deactivated'}`);
      save();
    },
    changePassword(oldPw, newPw) {
      const u = currentUser();
      if (!u || u.password !== oldPw) fail('The current password is not correct.');
      if (!newPw || newPw.length < 6) fail('The new password must be at least 6 characters.');
      if (newPw === oldPw) fail('Choose a password different from the current one.');
      u.password = newPw;
      u.passwordChangedAt = nowIso();
      persist('user.password', u.username);
      save();
    },
    // Sign-in with lock-out after repeated failures. A correct password signs the user in and
    // reports whether the password has expired (the app then asks for a new one).
    login(username, password) {
      const u = S.users.find((x) => x.username === String(username || '').trim().toLowerCase());
      const now = Date.now();
      if (u && u.lockedUntil && new Date(u.lockedUntil).getTime() > now) {
        const mins = Math.ceil((new Date(u.lockedUntil).getTime() - now) / 60000);
        return { ok: false, message: `This account is locked after too many failed sign-ins. Try again in ${mins} minute(s), or ask an administrator to unlock it.` };
      }
      if (!u || u.password !== password) {
        if (u) {
          u.failedLogins = (u.failedLogins || 0) + 1;
          if (u.failedLogins >= POLICY.maxFailed) {
            u.lockedUntil = new Date(now + POLICY.lockMinutes * 60000).toISOString();
            u.failedLogins = 0;
            persist('user.locked', u.username);
          }
          save();
        }
        return { ok: false, message: 'The user name or password is not correct.' };
      }
      if (!u.active) return { ok: false, message: 'This account is inactive. Ask an administrator to activate it.' };
      u.failedLogins = 0;
      u.lockedUntil = null;
      setSession(u.id);
      persist('user.login', u.username);
      save();
      return { ok: true, user: u, expired: passwordExpired(u) };
    },
    unlockUser(id) {
      const u = S.users.find((x) => x.id === id);
      if (!u) fail('That user no longer exists.');
      u.failedLogins = 0;
      u.lockedUntil = null;
      persist('user.unlock', u.username);
      save();
    },
    // Used after sign-in when the password has expired: the user must choose a new one.
    forcePassword(newPw) {
      const u = currentUser();
      if (!u) fail('Sign in first.');
      if (!newPw || newPw.length < 6) fail('The new password must be at least 6 characters.');
      u.password = newPw;
      u.passwordChangedAt = nowIso();
      persist('user.password_expired', u.username);
      save();
    },

    // data
    restoreCatalog() {
      let added = 0;
      CATALOG.forEach((c) => {
        if (!testByCode(c.code)) { S.tests.push(JSON.parse(JSON.stringify(c))); added++; }
      });
      persist('catalog.restore', `${added} test(s) added`);
      save();
      return added;
    },
    reset() { seed(); persist('data.reset', 'Demo data reset'); save(); },
    importJson(text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { fail('That file is not valid JSON.'); }
      const need = ['users', 'patients', 'orders', 'tests', 'samples'];
      if (!need.every((k) => Array.isArray(obj[k]))) fail('That file is not a PathoLab demo backup.');
      replaceState({ ...skeleton(), ...obj });
      ensureDefaults();
      sessionUserId = null;
      persist('data.import', 'Backup restored');
      save();
    },
    exportJson() { return JSON.stringify(S, null, 2); },
  };

  // ---- queries --------------------------------------------------------------
  const q = {
    patients(term) {
      const t = (term || '').trim().toLowerCase();
      return S.patients.filter((p) => !t || `${patientName(p)} ${p.mrn} ${p.phone}`.toLowerCase().includes(t))
        .sort((a, b) => b.id - a.id);
    },
    ordersFor(patientId) {
      return S.orders.filter((o) => o.patientId === patientId).sort((a, b) => b.id - a.id);
    },
    orders({ term, status, from, to }) {
      const t = (term || '').trim().toLowerCase();
      return S.orders.filter((o) => {
        const p = patientById(o.patientId);
        const hay = `${o.orderNo} ${patientName(p)} ${p ? p.mrn : ''} ${p ? p.phone : ''}`.toLowerCase();
        return (!t || hay.includes(t)) && (!status || o.status === status) && inRange(o.registeredAt, from, to);
      }).sort((a, b) => b.id - a.id);
    },
    openForResults() {
      return S.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REPORTED')
        .sort((a, b) => b.id - a.id);
    },
    samples({ term, status }) {
      const t = (term || '').trim().toLowerCase();
      return S.samples.filter((s) => {
        const o = S.orders.find((x) => x.id === s.orderId);
        const p = o ? patientById(o.patientId) : null;
        const hay = `${s.sampleNo} ${o ? o.orderNo : ''} ${patientName(p)} ${p ? p.mrn : ''}`.toLowerCase();
        return (!t || hay.includes(t)) && (!status || s.status === status);
      }).sort((a, b) => b.id - a.id);
    },
    turnaround,
    // Home collections still to visit, in slot order, then by area (last part of the address).
    homeRoute() {
      const isHome = (o) => !!o.collectAddress;
      const area = (o) => { const parts = (o.collectAddress || '').split(',').map((x) => x.trim()).filter(Boolean); return parts.length ? parts[parts.length - 1] : ''; };
      return S.orders.filter((o) => isHome(o) && o.status === 'REGISTERED')
        .sort((a, b) => (a.slot || '').localeCompare(b.slot || '') || area(a).localeCompare(area(b)) || a.id - b.id);
    },
    // Numeric tests this patient has results for (for the trend picker).
    trendTests(patientId) {
      const codes = new Set();
      S.orders.filter((o) => o.patientId === patientId).forEach((o) => Object.entries(o.results).forEach(([c, r]) => {
        const def = testByCode(c);
        if (def && (def.kind === 'quant' || def.kind === 'calc') && r.value !== '' && isFinite(Number(r.value))) codes.add(c);
      }));
      return [...codes].map((c) => ({ code: c, name: testByCode(c).name })).sort((a, b) => a.name.localeCompare(b.name));
    },
    // One test over time: every saved numeric result, oldest first, with its reference interval.
    trend(patientId, code) {
      const def = testByCode(code);
      const p = patientById(patientId);
      const points = [];
      S.orders.filter((o) => o.patientId === patientId && o.status !== 'CANCELLED').forEach((o) => {
        const r = o.results[code];
        if (!r || r.value === '' || !isFinite(Number(r.value))) return;
        points.push({ t: new Date(o.registeredAt).getTime(), v: Number(r.value), flag: r.flag, order: o.orderNo, verified: r.status === 'VERIFIED' });
      });
      points.sort((a, b) => a.t - b.t);
      return { name: def ? def.name : code, unit: def ? def.unit : '', points, range: def && p ? rangeFor(def, p) : null };
    },
    dashboard() {
      const today = todayKey();
      const month = monthStartKey();
      const active = S.orders.filter((o) => o.status !== 'CANCELLED');
      const payments = S.orders.flatMap((o) => o.payments);
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * DAY);
        const key = dayKey(d.toISOString());
        days.push({ key, label: d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' }), count: S.orders.filter((o) => dayKey(o.registeredAt) === key).length });
      }
      const counts = {};
      active.forEach((o) => o.tests.forEach((c) => { counts[c] = (counts[c] || 0) + 1; }));
      const busiest = Object.entries(counts).map(([c, n]) => [testByCode(c) ? testByCode(c).name : c, n])
        .sort((a, b) => b[1] - a[1]).slice(0, 6);
      return {
        ordersToday: S.orders.filter((o) => dayKey(o.registeredAt) === today).length,
        patientsToday: S.patients.filter((p) => dayKey(p.createdAt) === today).length,
        pendingResults: active.reduce((n, o) => n + pendingCount(o), 0),
        awaitingVerify: active.filter((o) => Object.values(o.results).some((r) => r.status === 'ENTERED')).length,
        reportedToday: S.reports.filter((r) => r.type === 'Final' && dayKey(r.at) === today).length,
        criticalToday: active.reduce((n, o) => n + Object.values(o.results).filter((r) => isCritical(r.flag) && dayKey(r.at) === today).length, 0),
        revenueToday: round2(sum(payments.filter((p) => dayKey(p.at) === today).map((p) => p.amount))),
        revenueMonth: round2(sum(payments.filter((p) => dayKey(p.at) >= month).map((p) => p.amount))),
        outstanding: round2(sum(active.map((o) => orderTotals(o).balance))),
        patientsTotal: S.patients.length,
        overdue: active.filter((o) => turnaround(o).state === 'OVERDUE').length,
        dueSoon: active.filter((o) => turnaround(o).state === 'DUE_SOON').length,
        days, busiest,
      };
    },
    worklist() {
      return S.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REPORTED').sort((a, b) => b.id - a.id).slice(0, 40);
    },
    finance(from, to) {
      const orders = S.orders.filter((o) => o.status !== 'CANCELLED' && inRange(o.registeredAt, from, to));
      const billed = round2(sum(orders.map((o) => o.net)));
      const collected = round2(sum(S.orders.flatMap((o) => o.payments).filter((p) => inRange(p.at, from, to)).map((p) => p.amount)));
      const expenses = round2(sum(S.expenses.filter((e) => (!from || e.date >= from) && (!to || e.date <= to)).map((e) => e.amount)));
      const commission = round2(sum(S.doctors.map((d) => commissionDue(d.id, from, to).earned)));
      return { billed, collected, expenses, commission, profit: round2(billed - expenses - commission), orders };
    },
    mis(from, to) {
      const orders = S.orders.filter((o) => inRange(o.registeredAt, from, to));
      const live = orders.filter((o) => o.status !== 'CANCELLED');
      const payments = S.orders.flatMap((o) => o.payments).filter((p) => inRange(p.at, from, to));
      const results = S.orders.flatMap((o) => Object.values(o.results).map((r) => ({ ...r, order: o })));
      const inP = results.filter((r) => inRange(r.at, from, to));
      const finals = S.reports.filter((r) => r.type === 'Final' && inRange(r.at, from, to));
      const tat = S.orders.filter((o) => o.reportedAt && inRange(o.registeredAt, from, to));
      const hours = tat.map((o) => (new Date(o.reportedAt) - new Date(o.registeredAt)) / 36e5);
      const within = tat.filter((o) => (new Date(o.reportedAt) - new Date(o.registeredAt)) / 36e5 <= Math.max(...o.tests.map((c) => testByCode(c) ? testByCode(c).tat : 24)));
      const days = {};
      live.forEach((o) => { const k = dayKey(o.registeredAt); days[k] = (days[k] || 0) + 1; });
      const depts = {};
      live.forEach((o) => o.lines.forEach((l) => {
        const dept = l.kind === 'test' && testByCode(l.code) ? testByCode(l.code).dept : 'Packages';
        depts[dept] = (depts[dept] || 0) + l.price;
      }));
      const refs = {};
      live.forEach((o) => {
        const d = doctorById(o.doctorId);
        const key = d ? d.name : 'Self / walk-in';
        refs[key] = refs[key] || { orders: 0, net: 0 };
        refs[key].orders++;
        refs[key].net += o.net;
      });
      const testCounts = {};
      live.forEach((o) => o.lines.forEach((l) => {
        const k = l.kind === 'test' ? l.code : l.name;
        const name = l.kind === 'test' ? (testByCode(l.code) ? testByCode(l.code).name : l.code) : l.name;
        testCounts[k] = testCounts[k] || { name, count: 0, gross: 0 };
        testCounts[k].count++;
        testCounts[k].gross += l.price;
      }));
      const staff = {};
      inP.forEach((r) => {
        if (r.by) { staff[r.by] = staff[r.by] || { entered: 0, verified: 0 }; staff[r.by].entered++; }
        if (r.verifiedBy) { staff[r.verifiedBy] = staff[r.verifiedBy] || { entered: 0, verified: 0 }; staff[r.verifiedBy].verified++; }
      });
      return {
        orders: live.length,
        revenue: round2(sum(live.map((o) => o.net))),
        collected: round2(sum(payments.map((p) => p.amount))),
        outstanding: round2(sum(S.orders.filter((o) => o.status !== 'CANCELLED').map((o) => orderTotals(o).balance))),
        reported: finals.length,
        tat: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0,
        compliance: tat.length ? (within.length / tat.length) * 100 : 0,
        critical: inP.filter((r) => isCritical(r.flag)).length,
        packages: live.reduce((n, o) => n + o.lines.filter((l) => l.kind === 'package').length, 0),
        rejected: S.samples.filter((s) => s.status === 'REJECTED' && inRange(s.history[0].at, from, to)).length,
        awaiting: S.samples.filter((s) => s.status === 'PENDING').length,
        abnormal: inP.filter((r) => r.flag !== 'NORMAL' && r.flag !== 'NOT_APPLICABLE').length,
        days, depts, refs,
        tests: Object.values(testCounts).sort((a, b) => b.count - a.count).slice(0, 8),
        staff: Object.entries(staff).map(([user, v]) => ({ user, ...v })),
      };
    },
    equipmentStatus(e) {
      if (!e.lastCal) return 'Never calibrated';
      const next = new Date(new Date(e.lastCal).getTime() + e.intervalDays * DAY);
      const days = Math.round((next - Date.now()) / DAY);
      return days < 0 ? 'Overdue' : days <= 30 ? 'Due soon' : 'OK';
    },
  };

  function commissionDue(doctorId, from, to) {
    const doc = doctorById(doctorId);
    const pct = doc ? Number(doc.commission) || 0 : 0;
    const billed = sum(S.orders.filter((o) => o.doctorId === doctorId && o.status !== 'CANCELLED' && inRange(o.registeredAt, from, to)).map((o) => o.net));
    const earned = round2(billed * pct / 100);
    const paid = round2(sum(S.payouts.filter((p) => p.doctorId === doctorId && (!from || p.date >= from) && (!to || p.date <= to)).map((p) => p.amount)));
    return { billed: round2(billed), pct, earned, paid, due: round2(earned - paid) };
  }

  const inventoryStatus = (it) => {
    const qty = sum(it.lots.map((l) => l.qty));
    const soon = it.lots.some((l) => new Date(l.expiry) - Date.now() < 30 * DAY);
    if (qty <= it.reorder) return 'Reorder';
    if (soon) return 'Expiring';
    return 'OK';
  };

  // Password expiry: a password older than the policy allows must be changed at sign-in.
  function passwordExpired(u) {
    return !!u.passwordChangedAt && Date.now() - new Date(u.passwordChangedAt).getTime() > POLICY.passwordDays * DAY;
  }

  PL.store = {
    KEY, DomainError, fail, pad, label, sum, round2, nowIso, todayKey, monthStartKey, dayKey, inRange,
    ageYears, hoursAgo, DAY,
    ORDER_NEXT, SAMPLE_NEXT, CONTAINER, DEPARTMENTS, KINDS, PERM_GROUPS, PERM_LABEL, ALL_PERMS, ROLES,
    CATALOG, PACKAGES, RANGE_HELP: null,
    S, load, save, reset: () => svc.reset(), svc, q,
    setSession, restoreSession, currentUser, hasPerm, POLICY, passwordExpired,
    testByCode, patientById, patientName, doctorById, orderById, sampleById, orderTotals, pendingCount,
    orderSummary, computeFlag, rangeText, isCritical, leaves, priceOf, defaultPriceList, verifyAudit,
    commissionDue, inventoryStatus, equipmentStatus: q.equipmentStatus,
    GROWTH, INTERP, COMMON_ORGANISMS, URINE_ANTIBIOTICS, hasGrowth,
  };
})(window.PL = window.PL || {});
