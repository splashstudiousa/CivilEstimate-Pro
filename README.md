# CivilEstimate Pro

A full-stack civil engineering cost estimation, drawing quantity takeoff, rate analysis, BOQ, resource scheduling, and interactive CPM Gantt project planning platform.

## Core Modules

- **Home Dashboard**: Real-time KPIs, cost breakdown donut, category bar chart, planned vs actual S-curve, manpower histogram, diagnostic alerts, and project template launcher.
- **Project Setup & Templates**: Configure project parameters, currencies (`USD`, `INR`, `PKR`, `EUR`, `GBP`, `AED`), rate schedules (`SOR-2026`, `MRS-Market`, `CPWD-DSR`), markups/taxes/contingency, approval workflow, and templates (*2-Storey Villa*, *5-Marla House*, *1 km Asphalt Road*, *200m Boundary Wall*).
- **Drawing Upload & Takeoff**: Upload PDF, PNG/JPG, or CAD `.dxf` drawings; calibrate scale with two points; measure length, polyline, perimeter, area, volume, and count linked to BOQ items; optional Gemini Vision AI extraction with user confirmation.
- **Manual Measurement Sheet**: Excel-style ledger with deductions, math formulas, Excel/CSV paste, and built-in Concrete Mix, Steel BBS (`D²/162`), Brick Masonry, Plaster/Paint, and Sloped Excavation calculators.
- **Rate Analysis & Rate Library**: Material, labor, equipment, wastage, location factor, and escalation analysis per BOQ item plus Excel/CSV resource import.
- **Abstract of Quantities & Abstract of Cost (BOQ)**: Auto-grouped quantities with drill-down traceability, grand total in words, and side-by-side revision comparisons.
- **Material, Labor & Equipment Schedules**: Automated procurement quantities, rebar breakdown by bar diameter, trade man-days, machinery hours, and editable crew productivity constants.
- **Time Planning & CPM Gantt**: Interactive drag-to-shift/resize Gantt chart, FS/SS dependencies, Critical Path Method (CPM) float calculation, baseline overlay, calendar rules, cash flow & S-curve.
- **Reports & Export**: Multi-sheet `.xlsx`, `.csv`, and branded `.pdf` reports with cover page, signatures, and page numbers.

## Local Setup

```bash
npm install
npm run dev
```

Set `GEMINI_API_KEY` in your environment secrets to enable server-side AI drawing extraction (`/api/analyze-drawing`).

## Build for Production

```bash
npm run build
npm start
```
