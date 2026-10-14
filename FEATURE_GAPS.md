# PathoLab - feature gap analysis

Compared against what laboratory information systems on the market typically offer
(hospital and reference-lab LIS products, cloud LIS products, and lab systems sold in
India), and checked against the desktop app's code (`patholab/`) and the web demo.

Status after this pass:

| # | Feature | Why labs ask for it | Desktop before | Demo before | Demo now |
|---|---------|---------------------|----------------|-------------|----------|
| 1 | Code 128 barcodes on sample labels | Scanned at receipt and at the analyser | Yes | Text only | Done |
| 2 | Overdue (turnaround) alerts on the worklist and dashboard | Missed turnaround is the main complaint | TAT in MIS only | No | Done |
| 3 | Patient result trend graph | Clinicians read trends, not single values | Previous value and % change only | No | Done |
| 4 | Reflex testing (add a follow-up test when a result meets a rule) | Avoids a second visit and a second sample | No | No | Done |
| 5 | GST tax invoices (GSTIN, GST rate, CGST / SGST split, SAC) | Required for Indian billing | No | No | Done |
| 6 | Home-collection route worklist (slots, areas, phlebotomist) | Phlebotomists work from a route | No | No | Done |
| 7 | Patient report portal (final reports and balances) | Patients expect to see reports online | No | No | Done (simulated) |
| 8 | Account lock-out and password expiry | Basic access control on shared lab PCs | No | No | Done |

Each row was checked against the code before it was added. For example, the desktop app has
Code 128 label output (`reports/label_pdf.py`), previous-value and % change for delta checks
(`services/result_service.py`), and no GST, route, portal or lock-out code.

## Still missing (not added)

- **Two-factor sign-in for administrators.** Needs a real one-time-code provider. A simulated
  code would give false assurance.
- **Worklist query to analysers (bidirectional orders).** Needs the instrument vendor's protocol
  and hardware to test against.
- **Live analyser connection (serial or network).** Same blocker. Files (CSV, ASTM, HL7) work.
- **Cloud database sync.** The demo shows the settings only. The desktop sync engine is separate
  work.
- **Drag-and-drop report designer.** The demo has toggles and footer text only.
- **Culture and sensitivity panel.** Entered as descriptive text in the demo.
- **Scheduled backups in the demo.** Backups are manual downloads.
- **Desktop parity for this pass.** Features 2 to 8 are in the demo only. The desktop app does
  not have them yet.

## Already present (not gaps)

Patients and orders, packages and price lists, sample tracking with the allowed transitions,
results with age and gender reference ranges and flags, critical-value notification, delta check
with comments, report signatures, provisional and final reports, billing and dues, doctor
commission and payouts, expenses and profit and loss, inventory with lots and expiry, quality
control with z-score rules, equipment and service log, outsourced tests, analyser import (CSV,
ASTM E1394, HL7 v2), audit log with tamper check, roles and permissions, MIS, WhatsApp messaging
(simulated in the demo), and sync settings.
