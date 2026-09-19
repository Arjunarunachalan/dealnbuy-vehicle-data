# vehicle-data

> **Vehicle data by [VehiclesDB](https://vehiclesdb.com)**

The canonical vehicle reference data repository for our application suite.
A self-contained, version-controlled snapshot derived from the
[VehiclesDB open dataset](https://github.com/vehiclesdb/vehiclesdb) (CC-BY 4.0).

Consumed as a **static JSON bundle** (`dist/vehicle-data.json`) by:
- The Next.js web application
- The Expo / React Native mobile application

No runtime API dependency. No database. No npm package.

---

## Dataset summary (v2026.09.1)

| Kind | Makes | Models |
|------|------:|-------:|
| Cars | 308 | 5,455 |
| Motorcycles | 262 | 6,015 |
| Mopeds | 311 | 1,370 |
| Vans | 128 | 720 |
| Trucks | 90 | 923 |
| Buses | 93 | 403 |
| **Total** | **1,192** | **14,886** |

Coverage: 14 countries — Argentina, Canada, Germany, Spain, Finland, Great Britain,
Ireland, Luxembourg, Malaysia, Netherlands, New Zealand, Thailand, Ukraine, United States.

---

## Repository structure

```
vehicle-data/
├── data/
│   ├── sources/
│   │   └── vehiclesdb/          ← verbatim VehiclesDB snapshot (do not modify)
│   │       ├── manifest.json
│   │       ├── import-meta.json
│   │       ├── ATTRIBUTION.md
│   │       ├── SCHEMA.md
│   │       ├── SOURCES.md
│   │       └── catalog/
│   │           ├── car/         makes.json + models.json
│   │           ├── motorcycle/  makes.json + models.json
│   │           ├── moped/       makes.json + models.json
│   │           ├── van/         makes.json + models.json
│   │           ├── truck/       makes.json + models.json
│   │           └── bus/         makes.json + models.json
│   │
│   └── normalized/              ← application-optimized representation
│       ├── cars/
│       ├── motorcycles/
│       ├── mopeds/
│       ├── vans/
│       ├── trucks/
│       └── buses/
│
├── dist/
│   └── vehicle-data.json        ← generated bundle (what apps consume)
│
├── scripts/
│   ├── import-vehiclesdb.js     ← download a specific VehiclesDB release
│   ├── normalize.js             ← source → normalized/
│   ├── validate.js              ← validate normalized data
│   ├── build.js                 ← normalized → dist/vehicle-data.json
│   └── diff.js                  ← report changes between versions
│
├── .github/workflows/
│   └── validate.yml
├── DATA-SOURCES.md
├── package.json
└── .gitignore
```

---

## Data schema

### Makes (`data/normalized/<kind>/makes.json`)

```json
{
  "id": "bmw",
  "slug": "bmw",
  "name": "BMW",
  "aliases": ["Bayerische Motoren Werke"],
  "countries": ["de", "gb", "us"]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✓ | Stable, lowercase kebab-case. Permanent — never changes. |
| `slug` | ✓ | ASCII-folded slug (e.g. `skoda` for Škoda) |
| `name` | ✓ | Display name |
| `aliases` | optional | Alternate names, nicknames, native scripts |
| `countries` | optional | ISO-3166 alpha-2 countries where evidenced |

### Models (`data/normalized/<kind>/models.json`)

```json
{
  "id": "bmw/3-series",
  "makeId": "bmw",
  "slug": "3-series",
  "name": "3 Series",
  "kind": "car",
  "body_types": ["sedan", "touring"],
  "regions": ["eu", "na"],
  "popularity": { "global_decile": 2 },
  "sources": ["de_kba", "uk_dft"]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✓ | `"<makeId>/<modelSlug>"` — stable, permanent |
| `makeId` | ✓ | References a make `id` in the same kind's makes.json |
| `slug` | ✓ | Bare model slug |
| `name` | ✓ | Display name |
| `kind` | ✓ | `car`, `motorcycle`, `moped`, `van`, `truck`, `bus` |
| `body_types` | optional | e.g. `["sedan", "suv"]` |
| `aliases` | optional | Alternate model names / market names |
| `regions` | optional | `eu`, `na`, `sa`, `as`, `oc`, `af` |
| `popularity` | optional | `{ global_decile: 1–10 }` (1=most popular) |
| `sources` | optional | VehiclesDB source registry IDs |

### Make vs Model

- **Make** = the manufacturer or brand (e.g. BMW, Honda, Royal Enfield)
- **Model** = a specific nameplate sold under a make (e.g. BMW 3 Series, Honda CB350)
- Every model has a `makeId` that references exactly one make within the same kind

### Stable ID rules

- IDs are **permanent** — once assigned, they never change
- IDs are lowercase kebab-case (e.g. `royal-enfield`, `bmw/3-series`)
- Model IDs use `make/model` format exactly as supplied by VehiclesDB
- Do not use display names as IDs; do not use sequential numbers

---

## Commands

```bash
# Validate normalized data
npm run validate

# Build the application bundle
npm run build

# Validate + build in one step
npm run check

# Import a new VehiclesDB release (specific version required)
npm run import:vehiclesdb -- 2026.09.1

# Normalize source → data/normalized/
npm run normalize

# Diff report (shows changes between versions)
npm run diff
```

---

## Update workflow

This is the intended workflow when a new VehiclesDB release is available:

```
1. VehiclesDB publishes a new release (e.g. 2026.10.1)
   ↓
2. npm run import:vehiclesdb -- 2026.10.1
   (downloads + stores verbatim source snapshot)
   ↓
3. npm run normalize
   (source → data/normalized/)
   ↓
4. npm run validate
   (validate counts, relationships, integrity)
   ↓
5. npm run diff -- --from 2026.09.1 --to 2026.10.1
   (review new/changed/removed records — HUMAN REVIEW REQUIRED)
   ↓
6. npm run build
   (generate dist/vehicle-data.json)
   ↓
7. git add -A && git commit -m "chore: update to VehiclesDB 2026.10.1"
```

**Destructive changes are never applied automatically.**
Removals are surfaced by `diff.js` and require explicit human review before commit.

---

## How downstream applications consume this data

Both consuming applications use `dist/vehicle-data.json` as a **static data file**.
There is no runtime API call. The file is bundled with or fetched once by the application.

### Next.js web application

```js
// app/lib/vehicleData.js
import vehicleData from '@/public/data/vehicle-data.json';

export function getCarMakes() {
  return vehicleData.cars.makes;
}

export function getModelsForMake(makeId, kind = 'cars') {
  return vehicleData[kind].models.filter(m => m.makeId === makeId);
}
```

### Expo / React Native

```js
// lib/vehicleData.js
const vehicleData = require('./assets/data/vehicle-data.json');

export function getMotorcycleMakes() {
  return vehicleData.motorcycles.makes;
}
```

The `dist/vehicle-data.json` file is copied into each application's static assets
folder. It is NOT fetched from a CDN or API at runtime.

---

## How to add a new manufacturer

1. This repository does **not** accept manual additions while VehiclesDB is the upstream source
2. If a manufacturer is missing, check if VehiclesDB covers it
3. If VehiclesDB does not cover it, wait for a future release or open an issue upstream
4. The exception: manufacturers from markets not yet covered by VehiclesDB (e.g. India-only brands)
   may be added manually in a future extension — see open issues

---

## How to add a new model

Same policy as makes — see above.

---

## Schema extensibility

The schema is designed to accommodate future additions without breaking changes:

| Future field | Notes |
|---|---|
| `year_start` / `year_end` | Nameplate lifespan — reserved |
| `generations` | Chassis/platform generations — reserved |
| `variants` | Submodels/trims — reserved |
| `country` | Manufacturer origin country |
| `fuel_types` | Electric, petrol, diesel, hybrid |
| `engine_capacity` | Two-wheelers keep displacement granularity in VehiclesDB |

Absent optional fields mean "not yet catalogued" — never a schema change.

---

## Data sources and attribution

**Required attribution (CC-BY 4.0):**

> Vehicle data by [VehiclesDB](https://vehiclesdb.com)

This attribution **must** appear in every application consuming this data.
See `DATA-SOURCES.md` for full details including upstream government register attributions.

This repository's data is **derived from VehiclesDB** — it is not independently authored.

---

## Known dataset gaps

- **Hero MotoCorp** and **TVS Motor Company** are absent because India is not yet a
  covered market in VehiclesDB v2026.09.1
- Royal Enfield and Bajaj are present (they appear in European/NZ/Thailand registries)
- Absence = not yet catalogued from a covered source, not that the brand doesn't exist

---

## Versioning

- `schemaVersion` — incremented when the normalized/dist schema shape changes (breaking)
- `dataVersion` — mirrors VehiclesDB release version (`YYYY.MM.revision`)
- `updatedAt` — the VehiclesDB dataset build timestamp (deterministic, not local build time)

---

## Category-specific bundles

Applications that only need one vehicle kind should prefer the **category-specific
bundles** over the full ~6 MB `dist/vehicle-data.json`.

```
dist/
├── vehicle-data.json          ~5.9 MB  (all kinds combined)
├── cars/
│   ├── makes.json             ~  50 KB
│   └── models.json            ~1.9 MB
├── motorcycles/
│   ├── makes.json             ~  36 KB
│   └── models.json            ~1.8 MB
├── mopeds/
│   ├── makes.json             ~  39 KB
│   └── models.json            ~  365 KB
├── vans/
│   ├── makes.json             ~  13 KB
│   └── models.json            ~  108 KB
├── trucks/
│   ├── makes.json             ~  12 KB
│   └── models.json            ~  245 KB
└── buses/
    ├── makes.json             ~  18 KB
    └── models.json            ~  198 KB
```

Each category file has the same metadata envelope as the combined bundle:

```json
{
  "schemaVersion": 1,
  "dataVersion": "2026.09.1",
  "source": {
    "name": "VehiclesDB",
    "version": "2026.09.1",
    "license": "CC-BY-4.0"
  },
  "makes": [ ... ],
  "models": [ ... ]
}
```

### Next.js — category-specific import

```js
// Load only what you need — motorcycles bundle is ~1.8 MB vs ~6 MB combined
import motoMakes  from '@/public/data/motorcycles/makes.json';
import motoModels from '@/public/data/motorcycles/models.json';

export function getModelsForMake(makeId) {
  return motoModels.models.filter(m => m.makeId === makeId);
}
```

### Expo / React Native — category-specific require

```js
// Only load the category the form needs
const carMakes  = require('./assets/data/cars/makes.json');
const carModels = require('./assets/data/cars/models.json');
```

> **Tip**: If your application shows vehicle dropdowns for multiple kinds,
> lazy-load each category bundle on demand rather than including the full
> combined bundle in your initial JS bundle.

