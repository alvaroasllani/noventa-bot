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
2. **Manual Filter Workflow:** Collapsible panel supporting filtering by Day, Status, Operation, Property Type, Zone, Active/Published status, Agent (`PJe5x`/`Lt6BS`), and Planificador group checkboxes (`UZGXo` 1-5).

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

Shape: `{"rows": [{"id": "...", "data": {...}}, ...]}`, ~1986 rows in sample, ~6.9MB.

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
34Af3  → active / published status ("si" | "no")                      [CONFIRMED]
vDBia  → long description text, contains hashtag with code (#ALQ809) [CONFIRMED]
a6X7r  → scheduled publish day ("Domingo", "Martes"...)              [CONFIRMED]
TieEY  → status ("Abierta" vs "Cerrada")                             [CONFIRMED]
UZGXo  → integer 1-5, Planificador filter group checkbox           [CONFIRMED]
PJe5x / Lt6BS → Agent / Supervisor name                              [CONFIRMED]
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

### 3. Reliable downloads
- Visible link pills (`Foto 1 (Portada)`, `Foto 2`, etc.) allow 100% reliable 1-tap downloads in mobile browsers without triggering pop-up blocker restrictions.

## File locations

- `c:\Users\ALVARO\Documents\Proyectos\NovaDownload\index.html` (and `novahaus-descargador.html`) — main tool entry point (single self-contained HTML file)
- `c:\Users\ALVARO\Documents\Proyectos\NovaDownload\data.json` — local dataset sample
- `c:\Users\ALVARO\Documents\Proyectos\NovaDownload\AGENT.md` — project context & documentation

## Conventions / working style

- User is non-technical, wants working tools, not code explanations by default.
- Keep responses short and direct.
- Maintain single-file self-contained `.html` tool for Chrome on Android.
