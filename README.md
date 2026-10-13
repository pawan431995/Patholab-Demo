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
- **Result Entry**: numeric, qualitative, semi-quantitative, text and narrative results.
  Reference ranges by gender and age, automatic L / H / LL / HH flags, critical-value
  alerts and notification, verify, provisional and final reports.
- **Sample Tracking**: collect, receive, process, store, move, reject, recollection,
  dispose, history and label printing, with the same allowed transitions as the desktop app.
- **Lab Operations**: critical values, outsourced tests, inventory with lots and expiry
  (FEFO issue), quality control with z-score rules, equipment and service log, analyser CSV import.
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
- Only CSV analyser import is available; ASTM and HL7 are shown as desktop-only.
- Culture and sensitivity is entered as descriptive text.
- The report designer offers toggles and footer text, not drag-and-drop layout.
- Backups are manual downloads; there is no scheduled backup.
- Licence activation is not applicable, and roles are read-only.
- Passwords are stored in plain text in the browser. This is a demo, not a secure system.

## Notice

The demo data is fictional. This is not for clinical use.
