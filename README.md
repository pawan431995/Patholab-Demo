# PathoLab - Web Demo

A static, browser-only demo of the PathoLab desktop laboratory system. The window
layout, sidebar screens, menu bar, colours and dialogs follow the desktop app
(`patholab/ui`), and the main workflows are wired up with demo data.

## Open it

Either:

- double-click `index.html`, or
- serve the folder (recommended, so every browser feature works):
  `python -m http.server 8080` then open <http://localhost:8080>

No build step, no server, no dependencies. It runs fully offline.

## Accounts

| Role          | User name    | Password  | Screens you will see                                              |
|---------------|--------------|-----------|-------------------------------------------------------------------|
| Administrator | `admin`      | `admin123`| Everything, including Users, Roles, Audit, Backup, Settings       |
| Pathologist   | `pathologist`| `demo123` | Patients, Orders, Results (verify), Lab Operations, Reports, MIS  |
| Lab Technician| `technician` | `demo123` | Sample Tracking, Result Entry, Lab Operations (inventory, QC, equipment, analysers) |
| Receptionist  | `reception`  | `demo123` | Patients, Orders, Test Catalog, Reports, Billing & Finance        |

## What is in the demo

- **Dashboard**: stat tiles, open worklist, most requested tests, 7-day chart, billing summary.
- **Patients**: register, edit, search, order history, delete (when no orders).
- **Orders**: new order (investigations and health packages, price lists, discount,
  part payment), filters, status moves (collect, receive, cancel).
- **Result Entry**: numeric, qualitative, semi-quantitative, text and narrative results, plus
  calculated analytes and culture and sensitivity. Reference ranges by gender and age, automatic
  L / H / LL / HH flags, critical-value alerts and notification, verify, provisional and final reports.
- **Sample Tracking**: collect, receive, process, store, move, reject, recollection,
  dispose, history and label printing, with the same allowed transitions as the desktop app.
- **Lab Operations**: critical values, outsourced tests, inventory with lots and expiry
  (FEFO issue), quality control with z-score rules, equipment and service log, analyser import
  (CSV, ASTM E1394 and HL7 v2 ORU, with a preview before anything is saved).
- **Previous results and delta check**: result entry shows the patient's previous verified
  value and the percentage change. A change beyond the limit for that test (for example
  haemoglobin over 15%) needs a comment before the result can be verified.
- **Digital signatures**: final reports carry a signature code computed from the verified
  results. **Reports > Verify Signature** shows whether the results still match it, so an
  edit made after signing is detected.
- **WhatsApp messaging** (simulated): report-ready messages, payment reminders and, when the
  laboratory allows it, the final report PDF itself, sent only to patients who have agreed.
  Set up under **Tools > WhatsApp Messaging**. Sending a PDF is off by default and asks for
  confirmation each time (**Reports > Send on WhatsApp**). Nothing is sent to a real phone in
  the demo; the message log shows what would have gone out.
- **Cloud database and sync** (simulated): **Tools > Cloud Database & Sync** shows where the
  desktop app would connect (PostgreSQL or MySQL, on a server reachable over the network) and
  how it syncs. The demo does not connect to any server.
- **Test Catalog**: search, add and edit tests, reference ranges, panels, prices.
- **Reports**: history, preview, regenerate, print or save as PDF.
- **Billing & Finance**: dues, receipts, invoices, doctor commission and payouts,
  expenses, profit and loss, statement export (CSV).
- **MIS Reports**: volume, revenue, turnaround, compliance, referrers, tests and staff output.
- **Tools / File / Help menus**: settings, report designer, health packages, masters
  (doctors, centres, branches, price lists), data export and restore, users, roles,
  audit log with tamper check, backup, integrity check, licence and about.

Keyboard: `Ctrl+1` to `Ctrl+9` switch screens, `Ctrl+N` new order, `Ctrl+Shift+N`
new patient, `F5` refresh.

## How it stores data

Everything lives in this browser's `localStorage`. Nothing is sent anywhere.
Use **Tools > Data & Backup** to export a JSON copy, restore one, or reset the demo.
Signing in on another browser or device starts from the built-in sample data.

## Deliberate differences from the desktop app

- E-mail is simulated (the dialog confirms it; nothing is sent).
- PDFs come from the browser's print dialog (choose "Save as PDF").
- Analyser import reads files the user loads. The desktop app also receives ASTM and HL7 from
  a serial or network connection to the analyser, which a browser cannot do.
- WhatsApp messages and cloud sync are simulated. The desktop app sends real messages through
  the WhatsApp Business Cloud API and syncs with the lab's own PostgreSQL or MySQL server, with
  the local SQLite database kept as the working copy.
- Digital signatures here are a checksum of the results, not a cryptographic signature. The
  desktop app signs reports with an Ed25519 key.
- Culture and sensitivity uses the desktop's fields, but every culture offers the urine antibiotic
  panel; the desktop chooses the panel by specimen.
- The report designer offers toggles and footer text, not drag-and-drop layout.
- Backups are manual downloads; there is no scheduled backup.
- Licence activation is not applicable, and roles are read-only.
- Passwords are stored in plain text in the browser. This is a demo, not a secure system.

## Added in the latest pass

See [FEATURE_GAPS.md](FEATURE_GAPS.md) for the market comparison behind these.

- **Barcodes on sample labels**: Code 128, the same symbology the desktop label printer uses.
- **Overdue turnaround alerts**: each order is due when its longest test turnaround has passed.
  Overdue orders are highlighted on the dashboard worklist and counted in a tile.
- **Result trend graph**: on **Patients**, pick a patient and a numeric test to see every saved
  result over time, with the reference band and flags.
- **Reflex testing**: a saved result that meets a rule adds follow-up tests to the same order,
  billed and given a sample. Example: fasting glucose above 125 adds HbA1c; an abnormal TSH adds
  free T4.
- **GST tax invoices**: set the GSTIN, GST rate and SAC code under **Tools > Settings >
  Laboratory**. The invoice shows the taxable value and equal CGST and SGST. A rate of 0 turns it
  off. Catalogue prices are treated as GST-inclusive.
- **Home-collection route**: on **Sample Tracking**, the "Home collection route" tab lists home
  visits by time slot and area. Record who collected each visit, and its samples are collected in
  one step. Set a slot and address on new orders.
- **Calculated analytes**: LDL (Friedewald), VLDL and total cholesterol / HDL ratio are filled in from
  the order's cholesterol, triglyceride and HDL results. They are read-only on Result Entry and clear
  again if an input is removed. Define your own in **Test Catalog** with the result type set to
  Calculated and a formula such as `CHOL - HDL - (TG / 5)`.
- **Culture and sensitivity**: the urine culture opens a culture dialog with growth observed, organism,
  colony count, Gram stain and an S / I / R panel with zone and MIC. It prints on the report. Growth
  of "No growth" clears the organism and panel, as on the desktop.
- **Account lock-out and password expiry**: five wrong passwords lock an account for 15 minutes,
  and an administrator can unlock it under **Tools > Manage Users**. A password older than 90 days
  must be changed at sign-in.

## Notice

The demo data is fictional. This is not for clinical use.
