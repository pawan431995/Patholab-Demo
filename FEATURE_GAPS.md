# PathoLab - feature gap analysis

Compared against what laboratory information systems on the market typically offer
(hospital and reference-lab LIS products, cloud LIS products, and lab systems sold in
India), and checked against the desktop app's code (`patholab/`) and the web demo.

Status key: **Built** = in the desktop app and the demo. **Parity** = in the desktop app,
added to the demo. **Added** = not in either, added to the demo in this pass.
**Open** = not yet done.

| # | Feature | Why labs ask for it | Desktop before | Demo before | Status |
|---|---------|---------------------|----------------|-------------|--------|
| 1 | Code 128 barcodes on sample labels | Scanned at receipt and at the analyser | Yes | No (text only) | Parity |
| 2 | Overdue (turnaround) alerts on worklist and dashboard | Missed turnaround is the main complaint | No (TAT only in MIS) | No | Added |
| 3 | Patient result trend graph | Clinicians read trends, not single values | No (previous value and % change only) | No | Added |
| 4 | Reflex testing (add a follow-up test when a result meets a rule) | Avoids a second visit and a second sample | No | No | Added |
| 5 | GST-compliant invoices (GSTIN, GST rate, CGST / SGST split) | Required for Indian billing | No | No | Added |
| 6 | Home-collection route worklist | Phlebotomists work from a route, not a list | No | No | Added |
| 7 | Patient report portal | Patients expect to see reports online | No | No | Added |
| 8 | Account lockout and password expiry | Basic access control on shared lab PCs | No | No | Added |

## Missing, and not added in this pass

- **Two-factor sign-in for administrators.** Needs a real OTP or authenticator provider; a
  simulated code would give false assurance.
- **Worklist query to analysers (bidirectional orders).** Needs the instrument vendor's
  protocol and hardware to test against.
- **Live analyser connection (serial or network).** Same blocker; see the integration
  discussion. Files (CSV, ASTM, HL7) are supported.
- **Cloud database sync.** The demo shows the settings only; the desktop app's sync
  engine is separate work.
- **Drag-and-drop report designer.** The demo has toggles and footer text only.
- **Culture and sensitivity panel.** Entered as descriptive text in the demo.
- **Scheduled backups in the demo.** Backups are manual downloads.

## Already present (not gaps)

Patients and orders, packages and price lists, sample tracking with the allowed
transitions, results with age and gender reference ranges and flags, critical-value
notification, delta check with comments, report signatures, provisional and final
reports, billing and dues, doctor commission and payouts, expenses and profit and loss,
inventory with lots and expiry, quality control with z-score rules, equipment and service
log, outsourced tests, analyser import (CSV, ASTM E1394, HL7 v2), audit log with
tamper check, roles and permissions, MIS, WhatsApp messaging (simulated in the demo),
and sync settings.
