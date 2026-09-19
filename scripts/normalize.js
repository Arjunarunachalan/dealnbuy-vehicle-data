#!/usr/bin/env node
/**
 * normalize.js
 *
 * Reads the verbatim VehiclesDB source snapshot from data/sources/vehiclesdb/
 * and writes application-optimized normalized data to data/normalized/.
 *
 * Transformations:
 *   - make_id  -> makeId  (camelCase for JS consumers)
 *   - Keeps: id, slug, name, makeId, kind, body_types, regions,
 *            popularity.global_decile, sources, aliases
 *   - Drops from normalized (retained in source): availability detail, xrefs
 *
 * Kind directory mapping (VehiclesDB singular -> our plural):
 *   car -> cars,  motorcycle -> motorcycles,  moped -> mopeds
 *   van -> vans,  truck -> trucks,            bus -> buses
 *
 * Source IDs are preserved exactly as supplied (e.g. model id "bmw/3-series").
 */
"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT   = path.resolve(__dirname, "..");
const SRC    = path.join(ROOT, "data", "sources", "vehiclesdb");
const DEST   = path.join(ROOT, "data", "normalized");

const KIND_MAP = {
  car:        "cars",
  motorcycle: "motorcycles",
  moped:      "mopeds",
  van:        "vans",
  truck:      "trucks",
  bus:        "buses",
};

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`ERROR reading ${file}: ${e.message}`);
    process.exit(1);
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalizeMake(raw) {
  // Preserve: id, slug, name, aliases, countries, kinds
  const out = { id: raw.id, slug: raw.slug, name: raw.name };
  if (raw.aliases && raw.aliases.length)   out.aliases   = raw.aliases;
  if (raw.countries && raw.countries.length) out.countries = raw.countries;
  return out;
}

function normalizeModel(raw) {
  // Core identity
  const out = {
    id:     raw.id,
    makeId: raw.make_id,   // snake_case -> camelCase
    slug:   raw.slug,
    name:   raw.name,
    kind:   raw.kind,
  };

  // Optional but useful for application features
  if (raw.body_types && raw.body_types.length) out.body_types = raw.body_types;
  if (raw.aliases    && raw.aliases.length)    out.aliases    = raw.aliases;
  if (raw.regions    && raw.regions.length)    out.regions    = raw.regions;

  // Popularity: keep only the global decile (lightweight signal for sorting/filtering)
  if (raw.popularity && raw.popularity.global_decile !== undefined) {
    out.popularity = { global_decile: raw.popularity.global_decile };
  }

  // Source provenance ids (small string array — keep for traceability)
  if (raw.sources && raw.sources.length) out.sources = raw.sources;

  // NOTE: availability (per-country evidence array) and xrefs are intentionally
  // excluded from normalized. They remain in data/sources/vehiclesdb/ as the
  // authoritative reference. Normalized files are optimized for app use.

  return out;
}

function run() {
  console.log("\n🔄 Normalizing VehiclesDB source snapshot...\n");

  // Verify source snapshot exists
  const manifestPath = path.join(SRC, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("ERROR: Source snapshot not found. Run import first:");
    console.error("  npm run import:vehiclesdb -- <version>");
    process.exit(1);
  }

  const manifest = readJSON(manifestPath);
  console.log(`   Source version: ${manifest.version}`);
  console.log(`   Source built  : ${manifest.built_at}`);
  console.log();

  const totals = { makes: 0, models: 0 };

  for (const [kind, dir] of Object.entries(KIND_MAP)) {
    const srcMakes  = path.join(SRC, "catalog", kind, "makes.json");
    const srcModels = path.join(SRC, "catalog", kind, "models.json");
    const dstMakes  = path.join(DEST, dir, "makes.json");
    const dstModels = path.join(DEST, dir, "models.json");

    if (!fs.existsSync(srcMakes) || !fs.existsSync(srcModels)) {
      console.error(`ERROR: Source files missing for kind '${kind}'`);
      process.exit(1);
    }

    const rawMakes  = readJSON(srcMakes);
    const rawModels = readJSON(srcModels);

    const normMakes  = rawMakes.map(normalizeMake);
    const normModels = rawModels.map(normalizeModel);

    writeJSON(dstMakes,  normMakes);
    writeJSON(dstModels, normModels);

    totals.makes  += normMakes.length;
    totals.models += normModels.length;

    const expectedMakes  = manifest.kinds[kind].makes;
    const expectedModels = manifest.kinds[kind].models;
    const makesOk  = normMakes.length  === expectedMakes  ? "✓" : "⚠";
    const modelsOk = normModels.length === expectedModels ? "✓" : "⚠";

    console.log(`   ${kind.padEnd(12)} ${makesOk} ${String(normMakes.length).padStart(4)} makes  ${modelsOk} ${String(normModels.length).padStart(5)} models`
      + (normMakes.length !== expectedMakes ? `   [expected ${expectedMakes} makes]` : "")
      + (normModels.length !== expectedModels ? `  [expected ${expectedModels} models]` : ""));
  }

  console.log();
  console.log(`   Total: ${totals.makes} makes / ${totals.models} models`);
  console.log(`\n✅ Normalization complete → data/normalized/\n`);
}

run();
