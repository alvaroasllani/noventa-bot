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
2. **Manual Filter Workflow (Hidden by default):** Collapsible panel supporting filtering by Day, Status, Operation, Property Type, Zone, Active/Published status, Agent (`PJe5x`/`Lt6BS`), and Planificador group checkboxes (`UZGXo` 1-5). Hidden in UI by default to focus on the pasted list workflow.

## How the source app works (reverse-engineered, not documented anywhere)

- The NOVAHAUS app is a Glide (glideapps.com) PWA. Backend is Firestore
  (`projects/glide-prod/...`), synced live over a WebChannel
  (`channel?VER=8&database=...`).
- Separately, Glide pre-bakes the **entire table** as a static JSON blob and
  hosts it on GCS with a **signed URL** (filename pattern: `<hash>.jzon?GoogleAccessId=...`).
  This is the file we actually use — full dataset, no need to intercept the
  WebChannel.
- The signed URL **expires** (unknown TTL — not measured). The only confirmed
  method to get a fresh copy:
  1. Open the app in desktop Chrome
  2. DevTools → Network → Fetch/XHR filter
  3. Navigate inside the app (forces a data reload)
  4. Find the multi-MB request ending in `.jzon`
  5. Right-click → Copy → Copy response → save as `data.json`

## Data schema (`data.json` / the `.jzon` file)

Shape: `{"rows": [{"id": "...", "data": {...}}, ...]}`, ~1994 rows in sample, ~9MB.

Obfuscated 5-character keys (Glide column IDs):

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
7fYNu, P0E5J, RiqQn → carousel photos (Glide creates separate fields [CONFIRMED]
         or comma-separated lists across columns)
34Af3  → published in app ("si" | "no"). THIS is the field that       [CONFIRMED]
         determines visibility in Glide. If 34Af3="si", the property
         appears in the app regardless of TieEY or agent status.
abzcW  → Facebook post text for the property                         [CONFIRMED]
vDBia  → long description / catalog text, has hashtag (#ALQ809)      [CONFIRMED]
a6X7r  → scheduled publish day ("Domingo", "Martes"...)              [CONFIRMED]
TieEY  → internal status ("Abierta" | "Cerrada" | undefined).        [CONFIRMED]
         ⚠️ NOT the same as 34Af3. A property can be 34Af3="si"
         (visible in app) AND TieEY="Cerrada" at the same time.
         The photo downloader uses TieEY for its own filters, but
         generar_sheet.js must NOT filter by TieEY.
UZGXo  → integer 1-5, Planificador filter group checkbox           [CONFIRMED]
PJe5x / Lt6BS → Agent / Supervisor name                              [CONFIRMED]
Pverj / bF4oQ → additional agent fields (3rd/4th agent)              [CONFIRMED]
2Smy9  → full Drive folder URL for the object (backup/unused)        [CONFIRMED]
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
- If a pasted code is missing from `data.json` (e.g. newly published property), it explicitly warns: `⚠️ No está en tu data.json: ALQ853`.

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
- `data.json` — local dataset (copy of Glide's `.jzon`)
- `generar_sheet.js` — generates `novahaus_sheet.xlsx` for Facebook publishing
- `novahaus_sheet.xlsx` — generated output, 6 tabs, all published properties
- `resumen.txt` — summary report from last sheet generation
- `AGENT.md` — project context & documentation

## Conventions / working style

- User is non-technical, wants working tools, not code explanations by default.
- Keep responses short and direct.
- Maintain single-file self-contained `.html` tool for Chrome on Android.
