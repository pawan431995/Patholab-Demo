# PathoLab - feature gap analysis

Compared against what laboratory information systems on the market typically offer
(hospital and reference-lab LIS products, cloud LIS products, and lab systems sold in
India). Each gap was checked against the desktop application's code first. Missing features
were built in the desktop application, then mirrored in the web demo.

| # | Feature | Why labs ask for it | Desktop (before) | Desktop (now) | Demo |
|---|---------|---------------------|------------------|---------------|------|
| 1 | Code 128 barcodes on sample labels | Scanned at receipt and at the analyser | Present | Unchanged | Done |
| 2 | Overdue turnaround alerts on the worklist and dashboard | Missed turnaround is the main complaint | TAT only in MIS | Done (schema v7 not needed) | Done |
| 3 | Patient result trend graph | Clinicians read trends, not single values | Previous value and % change only | Done | Done |
| 4 | Reflex testing (add a follow-up test when a result meets a rule) | Avoids a second visit and a second sample | Missing | Done (schema v7) | Done |
| 5 | GST tax invoices (GSTIN, GST rate, CGST / SGST, SAC) | Required for Indian billing | Missing | Done (default off, rate 0%) | Done (sample rate 18%) |
| 6 | Home-collection route (slots, areas, phlebotomist) | Phlebotomists work from a route | Missing | Done (schema v7) | Done |
| 7 | Report access for patients | Patients expect their reports without a visit | Missing | Done at the counter (see note) | Done (online portal) |
| 8 | Account lock-out and password expiry | Basic access control on shared lab PCs | Missing | Done (schema v7) | Done |

## Desktop schema change

Schema version 7 adds: `users.failed_logins`, `users.locked_until`,
`users.password_changed_at`, `test_definitions.reflex_when`, `test_definitions.reflex_value`,
`test_definitions.reflex_add`, and `orders.collection_slot`, `orders.collect_address`,
`orders.phlebotomist`. Existing databases migrate when the app starts. Take a backup first.

## Where the desktop and demo differ, on purpose

- **GST** is off on the desktop until a laboratory enters its GSTIN and rate, so existing
  invoices do not change. The demo ships a sample laboratory with 18% so the feature is visible.
- **Reflex rules** have no defaults on the desktop; each test's rule is set in its editor. The demo
  ships two example rules (fasting glucose above 125 adds HbA1c; an abnormal TSH adds free T4).
- **Patient access** on the desktop is a counter lookup: staff check the patient's ID and phone
  number, then see final reports and balances. A patient-facing online portal needs a hosted
  service, which is not part of the desktop app. The demo simulates that portal on the landing page.
- **Home visits** are orders with a collection address. Both apps use the same rule.

## Still missing

- **Two-factor sign-in for administrators.** Needs a real one-time-code provider.
- **Worklist query to analysers (bidirectional orders).** Needs the vendor's protocol and hardware.
- **Live analyser connection (serial or network).** Same blocker. Files (CSV, ASTM, HL7) work.
- **Hosted patient portal** (desktop). The demo simulates it; a real one needs a server.
- **Cloud database sync.** The demo shows the settings only.
- **Drag-and-drop report designer.** The demo has toggles and footer text only.
- **Culture and sensitivity panel.** Entered as descriptive text in the demo.
- **Scheduled backups in the demo.** Backups are manual downloads.

## Already present (not gaps)

Patients and orders, packages and price lists, sample tracking with the allowed transitions,
results with age and gender reference ranges and flags, critical-value notification, delta check
with comments, report signatures, provisional and final reports, billing and dues, doctor
commission and payouts, expenses and profit and loss, inventory with lots and expiry, quality
control with z-score rules, equipment and service log, outsourced tests, analyser import (CSV,
ASTM E1394, HL7 v2), audit log with tamper check, roles and permissions, MIS, WhatsApp messaging
(simulated in the demo), and sync settings.
