# DATA-SOURCES.md

## Primary vehicle data source

**Vehicle data by [VehiclesDB](https://vehiclesdb.com)**

This repository's vehicle dataset is derived from the **VehiclesDB open dataset**,
which is published under the Creative Commons Attribution 4.0 International license.

---

## Source details

| Field                | Value |
|----------------------|-------|
| Source name          | VehiclesDB |
| Source repository    | https://github.com/vehiclesdb/vehiclesdb |
| Source homepage      | https://vehiclesdb.com |
| Dataset version      | 2026.09.1 |
| Dataset built at     | 2026-09-12T13:58:20Z |
| License              | CC-BY 4.0 |
| Import date          | 2026-09-19 |
| Catalog schema ver.  | 3 |

---

## Coverage

VehiclesDB v2026.09.1 is reconciled from official vehicle registers of **14 countries
on 4 continents**: Argentina (ar), Canada (ca), Germany (de), Spain (es), Finland (fi),
Great Britain (gb), Ireland (ie), Luxembourg (lu), Malaysia (my), Netherlands (nl),
New Zealand (nz), Thailand (th), Ukraine (ua), United States (us).

### Known dataset gaps

- **India is not a covered market** in this release. As a result, India-only brands such
  as Hero MotoCorp and TVS Motor Company do not appear in the VehiclesDB dataset.
  Brands that export to covered markets (Royal Enfield, Bajaj) are present.
- Coverage reflects real-world vehicle registration evidence, not marketing presence.
- Absence of a brand or model means it has not yet been catalogued from a covered source —
  not that the brand does not exist.

---

## Files imported from VehiclesDB

| File | Purpose |
|------|---------|
| manifest.json | Version, counts, schema version |
| ATTRIBUTION.md | Required upstream attribution notices |
| SCHEMA.md | Schema reference |
| SOURCES.md | Per-source metadata and licenses |
| catalog/car/makes.json | Car makes (308 records) |
| catalog/car/models.json | Car models (5,455 records) |
| catalog/motorcycle/makes.json | Motorcycle makes (262 records) |
| catalog/motorcycle/models.json | Motorcycle models (6,015 records) |
| catalog/moped/makes.json | Moped makes (311 records) |
| catalog/moped/models.json | Moped models (1,370 records) |
| catalog/van/makes.json | Van makes (128 records) |
| catalog/van/models.json | Van models (720 records) |
| catalog/truck/makes.json | Truck makes (90 records) |
| catalog/truck/models.json | Truck models (923 records) |
| catalog/bus/makes.json | Bus makes (93 records) |
| catalog/bus/models.json | Bus models (403 records) |

All files are stored verbatim and unmodified under `data/sources/vehiclesdb/`.

---

## Transformations applied

The following transformations were applied when producing `data/normalized/`:

1. **Field rename**: `make_id` → `makeId` (camelCase for JavaScript consumers)
2. **Popularity projection**: only `popularity.global_decile` is retained in normalized
   files (full per-country popularity remains in source snapshot)
3. **Availability excluded**: per-country availability evidence arrays are excluded from
   normalized files (retained verbatim in source snapshot)
4. **xrefs excluded**: EU type-approval crosswalks excluded from normalized
   (retained in source snapshot)
5. **Sorting**: records are sorted by id for deterministic output
6. **No records invented, merged, renamed, or deleted** — all records are 1:1 from source

---

## Required attribution

### VehiclesDB attribution (mandatory — CC-BY 4.0 §3(a))

Every public use of this data **must** include visible credit:

> **Vehicle data by [VehiclesDB](https://vehiclesdb.com)**

- **Web application**: include a visible, followable link in the footer or credits screen
- **Mobile application**: include in the app description or about/credits screen
- **Datasets and papers**: cite the source repository and version used

### Downstream application requirement

Any Next.js web application or Expo/React Native mobile application consuming
`dist/vehicle-data.json` from this repository **must** include the VehiclesDB
attribution notice. This is a condition of the CC-BY 4.0 license.

---

## Upstream source attributions

The VehiclesDB dataset is reconciled from official government vehicle registers.
The following upstream attribution notices are required by VehiclesDB's own license
chain and apply to all consumers of this data regardless of the VehiclesDB license tier.

See `data/sources/vehiclesdb/ATTRIBUTION.md` for the complete, generated per-release
attribution notices. The key notices include:

- Argentine DNRPA registration data (CC-BY 4.0)
- Canadian NRCan fuel consumption ratings (Open Government Licence Canada)
- German KBA FZ10 registrations (Datenlizenz Deutschland – Namensnennung – Version 2.0)
- Spanish DGT microdata
- Finnish Traficom data
- British DfT vehicle data (OGL v3)
- Dutch RDW data
- New Zealand NZTA data
- Ukrainian MVS data
- Malaysian JPJ data
- Thai DLT data

---

## License

The normalized and dist data in this repository is derived from VehiclesDB (CC-BY 4.0).
Any redistribution must comply with CC-BY 4.0 terms, including visible attribution.

---

## Versioning

- Dataset versioning uses `dataVersion` in `dist/vehicle-data.json`
- Current: `2026.09.1` (YYYY.MM.revision format, from VehiclesDB)
- To update, see the import workflow in README.md