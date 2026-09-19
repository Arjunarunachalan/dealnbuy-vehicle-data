#!/usr/bin/env node
/**
 * build.js
 *
 * Reads data/normalized/ and generates:
 *   - dist/vehicle-data.json          — full combined bundle (all kinds)
 *   - dist/{kind}/makes.json          — category-specific makes
 *   - dist/{kind}/models.json         — category-specific models
 *
 * Determinism guarantees:
 *   - Records are sorted by id
 *   - updatedAt is sourced from manifest.built_at (not local clock)
 *   - All fields are ordered consistently
 *
 * Running this script multiple times on unchanged data produces
 * identical output (bit-for-bit, modulo JSON.stringify formatting).
 *
 * Category-specific bundles have the same metadata envelope and allow
 * applications that only need one vehicle kind to avoid loading the full
 * 6 MB combined bundle.
 */
"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT      = path.resolve(__dirname, "..");
const NORM_ROOT = path.join(ROOT, "data", "normalized");
const DIST_DIR  = path.join(ROOT, "dist");
const OUT_FILE  = path.join(DIST_DIR, "vehicle-data.json");
const SRC_META  = path.join(ROOT, "data", "sources", "vehiclesdb", "manifest.json");

const KIND_MAP = {
  car:        "cars",
  motorcycle: "motorcycles",
  moped:      "mopeds",
  van:        "vans",
  truck:      "trucks",
  bus:        "buses",
};

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error(`ERROR reading ${file}: ${e.message}`); process.exit(1); }
}

function sortById(arr) {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "base" }));
}

// Lightweight makes projection for the bundle:
// id, slug, name, aliases, countries — omit internal VehiclesDB kinds array
function projectMake(m) {
  const out = { id: m.id, slug: m.slug, name: m.name };
  if (m.aliases   && m.aliases.length)   out.aliases   = m.aliases;
  if (m.countries && m.countries.length) out.countries = m.countries;
  return out;
}

// Lightweight models projection for the bundle:
// Keeps all normalized fields (availability/xrefs already excluded at normalize step)
function projectModel(m) {
  const out = { id: m.id, makeId: m.makeId, slug: m.slug, name: m.name, kind: m.kind };
  if (m.body_types && m.body_types.length) out.body_types = m.body_types;
  if (m.aliases    && m.aliases.length)    out.aliases    = m.aliases;
  if (m.regions    && m.regions.length)    out.regions    = m.regions;
  if (m.popularity)                        out.popularity = m.popularity;
  if (m.sources    && m.sources.length)    out.sources    = m.sources;
  return out;
}

function run() {
  console.log("\n🔨 Building vehicle-data bundles...\n");

  // Load source manifest for metadata
  if (!fs.existsSync(SRC_META)) {
    console.error("ERROR: Source manifest not found. Run import first.");
    process.exit(1);
  }
  const manifest = readJSON(SRC_META);

  // Ensure dist/ exists
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

  // Shared source metadata block — identical in every generated file
  const sourceMeta = {
    name:        "VehiclesDB",
    version:     manifest.version,
    repository:  "https://github.com/vehiclesdb/vehiclesdb",
    license:     manifest.license,
    attribution: manifest.attribution.text,
    url:         manifest.attribution.url,
  };

  // ── Pass 1: read + sort all kinds ──────────────────────────────────────────
  // We do this once so both the combined bundle and category files share the
  // same sorted, projected arrays without re-reading or re-sorting.
  const kindData = {};
  let totalMakes = 0, totalModels = 0;

  console.log("   [1/2] Reading normalized data:");
  for (const [kind, dir] of Object.entries(KIND_MAP)) {
    const makes  = readJSON(path.join(NORM_ROOT, dir, "makes.json"));
    const models = readJSON(path.join(NORM_ROOT, dir, "models.json"));

    const sortedMakes  = sortById(makes).map(projectMake);
    const sortedModels = sortById(models).map(projectModel);

    kindData[dir] = { sortedMakes, sortedModels };
    totalMakes  += sortedMakes.length;
    totalModels += sortedModels.length;

    console.log(`        ${kind.padEnd(12)}: ${String(sortedMakes.length).padStart(4)} makes / ${String(sortedModels.length).padStart(5)} models`);
  }

  // ── Pass 2a: write combined bundle ─────────────────────────────────────────
  console.log("\n   [2/2] Writing output files:");

  const bundle = {
    schemaVersion: 1,
    dataVersion:   manifest.version,
    updatedAt:     manifest.built_at,   // deterministic — source timestamp
    source:        sourceMeta,
  };
  for (const [, dir] of Object.entries(KIND_MAP)) {
    bundle[dir] = { makes: kindData[dir].sortedMakes, models: kindData[dir].sortedModels };
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(bundle, null, 2) + "\n", "utf8");
  const mainKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`        dist/vehicle-data.json          ${String(mainKb).padStart(8)} KB  (combined, all kinds)`);

  // ── Pass 2b: write per-category bundles ────────────────────────────────────
  const categoryMeta = {
    schemaVersion: 1,
    dataVersion:   manifest.version,
    updatedAt:     manifest.built_at,   // deterministic — source timestamp
    source: {
      name:    sourceMeta.name,
      version: sourceMeta.version,
      license: sourceMeta.license,
    },
  };

  for (const [kind, dir] of Object.entries(KIND_MAP)) {
    const categoryDir = path.join(DIST_DIR, dir);
    fs.mkdirSync(categoryDir, { recursive: true });

    const { sortedMakes, sortedModels } = kindData[dir];

    // makes bundle
    const makesBundle = { ...categoryMeta, makes: sortedMakes };
    const makesFile   = path.join(categoryDir, "makes.json");
    fs.writeFileSync(makesFile, JSON.stringify(makesBundle, null, 2) + "\n", "utf8");
    const makesKb = (fs.statSync(makesFile).size / 1024).toFixed(1);

    // models bundle
    const modelsBundle = { ...categoryMeta, models: sortedModels };
    const modelsFile   = path.join(categoryDir, "models.json");
    fs.writeFileSync(modelsFile, JSON.stringify(modelsBundle, null, 2) + "\n", "utf8");
    const modelsKb = (fs.statSync(modelsFile).size / 1024).toFixed(1);

    console.log(`        dist/${dir.padEnd(14)}makes.json  ${String(makesKb).padStart(8)} KB`);
    console.log(`        dist/${dir.padEnd(14)}models.json ${String(modelsKb).padStart(8)} KB`);
  }

  console.log(`\n📦 Summary`);
  console.log(`   Schema version : ${bundle.schemaVersion}`);
  console.log(`   Data version   : ${bundle.dataVersion}`);
  console.log(`   Updated at     : ${bundle.updatedAt}  (deterministic — source dataset timestamp)`);
  console.log(`   Total makes    : ${totalMakes}`);
  console.log(`   Total models   : ${totalModels}`);
  console.log(`   Combined bundle: ${mainKb} KB`);
  console.log(`\n✅ Build complete.\n`);
}

run();
