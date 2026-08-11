# AGENT.md — NOVAHAUS Photo Downloader

## Project overview

Client-side tool (single HTML file, no backend) that bulk-downloads real estate
listing photos from a Glide-based PWA ("NOVAHAUS", a real estate app for
Cochabamba, Bolivia) so the user doesn't have to open every listing and
long-press → save each image manually.

The source app is not ours — we do not control it, cannot modify it, and have
no API access. Everything here is built by reverse-engineering how the Glide
app loads its data client-side.

**Primary user:** Alvaro, non-developer, real estate supervisor, uses this
from an Android phone in Chrome. Prefers concise answers, dislikes
unsolicited code dumps before he's ready to implement.

## Current state: functional and fully validated

The tool works end-to-end for both:
1. **Pasted List Workflow (Primary):** User pastes text containing titles/codes copied from the app or WhatsApp. Regex extracts valid codes, matches them against `data.json`, and displays photo cards in exact order.
2. **Manual Filter Workflow (Reactivated & Enhanced):** Visible collapsible panel supporting multi-select for Día Planificador, multi-select for Planificador group (1-5), Oficina Broker dropdown (`ofiBroker`), Status, Operation, Property Type, Zone, Active/Published status, and Agent.
3. **Data Display:** Displays `Oficina Broker`, `Planificador / Día` and `Equipo Broker` (`equipoBroker`) as informative badges on property cards (note: `Equipo Broker` is displayed as data only, no filtering by team).
4. **Automated Synchronization:** GitHub Actions runs 15 times/day (`.github/workflows/sync-excel.yml`), downloading the latest spreadsheet from Google Drive (regardless of filename on Drive, e.g. `11082026.xlsx`) and updating `data.json`.

## How the source app works (reverse-engineered, not documented anywhere)

- The NOVAHAUS app is a Glide (glideapps.com) PWA. Backend is Firestore
  (`projects/glide-prod/...`), synced live over a WebChannel
  (`channel?VER=8&database=...`).
- Separately, Glide pre-bakes the **entire table** as a static JSON blob and
  hosts it on GCS with a **signed URL** (filename pattern: `<hash>.jzon?GoogleAccessId=...`).
- In addition, Excel files uploaded or exported from Google Drive containing columns like `Ofi BROKER`, `Planificador`, `Dia planificador`, `Cargo`, and `Eq Broker ` are parsed and normalized by `scripts/update-excel.js`.

## Data schema (`data.json` / the `.jzon` / Excel file)

Shape: `{"rows": [{"id": "...", "data": {...}}, ...]}`, ~2017 rows in sample.

Key mapping & column definitions:

```
mERYr  → operation type: ALQUILER | VENTA | PREVENTA | ANTICRETICO |
                          ENTREGA INMEDIATA | PROF / LOCAL          [CONFIRMED]
oHoAu  → property type: Departamento | Casa | Local comercial | Oficina |
                         Lote | Monoambiente | Habitación | Townhouse |
                         Penthouse | Galpón | Edificio | Depósito | Varios
                                                                     [CONFIRMED]
WIoeb  → zone (free text)                                           [CONFIRMED]
5kIsO  → listing title                                               [CONFIRMED]
GRkSW  → price (number)                                              [CONFIRMED]
UOFib  → currency ("Bs." / "$us.")                                   [CONFIRMED]
lak0f  → numeric code, combine with prefix derived from mERYr        [CONFIRMED]
         to form visible code (e.g. lak0f=809, mERYr=ALQUILER → "ALQ809")
0C9DE  → cover photo, Drive "view" URL (Photo #1)                    [CONFIRMED]
7fYNu  → carousel photos (comma-separated Drive URLs)               [CONFIRMED]
34Af3  → published/available in app ("si" | "no").
         Condition: DISPONIBLE == "si" AND Cargo != "EX".
vDBia  → long description / catalog text (#ALQ809)                   [CONFIRMED]
abzcW  → Facebook post text for the property                         [CONFIRMED]
ofiBroker → Oficina Broker ("Central", "Sharks", "One", "Tempo")    [CONFIRMED]
planificador / UZGXo → Planificador group integer 1-5               [CONFIRMED]
diaPlanificador / a6X7r → Planificador day ("Lunes" ... "Domingo")  [CONFIRMED]
equipoBroker → Equipo Broker ("Central", "Omega", "Eagles", etc.)   [CONFIRMED]
Cargo  → Agent cargo ("Asesor", "Ex", etc.)                         [CONFIRMED]
PJe5x  → Agent / Supervisor name                                    [CONFIRMED]
```

Code prefix table (derived from `mERYr` + `lak0f`):

```
ALQUILER           → ALQ
VENTA              → VEN
PREVENTA           → PREV
ANTICRETICO        → ANT
ENTREGA INMEDIATA  → ENTR
PROF / LOCAL       → PROF
```

## Resolved problems

### 1. "Pasted List" & "Planificador" matching (RESOLVED)
- Text list parser regex: `/\b(ALQ|VEN|PREV|ANT|ENTR|PROF)\s*#?\s*(\d+)\b/gi` extracts official codes while ignoring Spanish words like "DE 4" or "DE 2".
- Row matching checks `codeFor(d)`, row strings, and raw `lak0f` numbers.
- Multi-select chips for Planificador groups (1-5) and Día Planificador (Lunes-Domingo) allow granular or multi-day filtering.

### 2. Photo extraction (RESOLVED)
- Glide stores photos in multiple columns (`0C9DE`, `7fYNu`, `P0E5J`, `RiqQn`, etc.).
- Function `getPhotoList(d)` scans all string properties of the row for Google Drive file URLs, prepending Portada (`0C9DE`) as Photo #1 and deduplicating.

### 3. Reliable downloads & iOS Photo Saving (RESOLVED)
- **Web Share API Support:** In iOS (Safari and Chrome on iPhone/iPad) and mobile browsers supporting `navigator.share({ files })`, clicking the primary photo button prepares all property images as `File` blobs and launches the native mobile share sheet. This allows iPhone users to tap **"Guardar 10 imágenes"** to save all property photos directly into their iPhone Photo Gallery/Camera Roll in 1 tap, or share them directly to WhatsApp.
- Visible link pills (`Foto 1 (Portada)`, `Foto 2`, etc.) allow 100% reliable 1-tap direct access to individual photo links without pop-up blocker restrictions.

### 4. Automatic Catalog Text Copying (RESOLVED)
- When clicking "Guardar en Fotos / Compartir" or "Descargar fotos (.jpg)", the full property description text from `vDBia` (the catalog text) is automatically copied to the clipboard via `copyToClipboard()`.
- An explicit "Copiar catálogo" button is also provided on each property card to copy the text manually at any time with visual feedback on the progress pill (`📋 Catálogo copiado`).

## Sheet generator (`generar_sheet.js`)

Node.js script that reads `data.json` and produces `novahaus_sheet.xlsx` with
one tab per operation type, for Facebook publishing workflow.

- **Filter:** Only `34Af3 === "si"` (published in Glide). Does NOT filter by
  `TieEY` or ex-agent — those filters are for the photo downloader only.
- **Tabs (fixed order):** Ventas, Alquiler, Anticrético, Entrega Inmediata,
  Preventa, Prof - Local.
- **Columns:** Código, Texto Facebook, URLs Imagenes, Publicado.
- **Run:** `node generar_sheet.js` — overwrites `novahaus_sheet.xlsx` and
  `resumen.txt`.
- **Depends on:** `xlsx` npm package.

## File locations

- `index.html` / `app.js` / `styles.css` — photo downloader tool (web app)
- `data.json` — local dataset (copy of Glide's `.jzon` / Drive Excel)
- `scripts/update-excel.js` — node script for Google Drive sync & Excel parsing
- `.github/workflows/sync-excel.yml` — 15x/day automated sync workflow
- `tests/filters.test.js` — TDD test suite for filter rules and column extraction
- `generar_sheet.js` — generates `novahaus_sheet.xlsx` for Facebook publishing
- `novahaus_sheet.xlsx` — generated output, 6 tabs, all published properties
- `resumen.txt` — summary report from last sheet generation
- `AGENT.md` — project context & documentation

## Conventions / working style

- User is non-technical, wants working tools, not code explanations by default.
- Keep responses short and direct.
- Maintain single-file self-contained `.html` tool for Chrome on Android.
