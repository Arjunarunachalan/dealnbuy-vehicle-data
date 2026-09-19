#!/usr/bin/env node
/**
 * build.js
 *
 * Reads data/normalized/ and generates dist/vehicle-data.json.
 *
 * Determinism guarantees:
 *   - Records are sorted by id
 *   - updatedAt is sourced from manifest.built_at (not local clock)
 *   - All fields are ordered consistently
 *
 * Running this script multiple times on unchanged data produces
 * identical output (bit-for-bit, modulo JSON.stringify formatting).
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
  console.log("\n🔨 Building dist/vehicle-data.json...\n");

  // Load source manifest for metadata
  if (!fs.existsSync(SRC_META)) {
    console.error("ERROR: Source manifest not found. Run import first.");
    process.exit(1);
  }
  const manifest = readJSON(SRC_META);

  // Ensure dist/ exists
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

  const bundle = {
    schemaVersion: 1,
    dataVersion:   manifest.version,
    // Use source dataset's built_at for determinism (not local clock)
    updatedAt:     manifest.built_at,
    source: {
      name:       "VehiclesDB",
      version:    manifest.version,
      repository: "https://github.com/vehiclesdb/vehiclesdb",
      license:    manifest.license,
      attribution: manifest.attribution.text,
      url:         manifest.attribution.url,
    },
  };

  let totalMakes = 0, totalModels = 0;

  for (const [kind, dir] of Object.entries(KIND_MAP)) {
    const makes  = readJSON(path.join(NORM_ROOT, dir, "makes.json"));
    const models = readJSON(path.join(NORM_ROOT, dir, "models.json"));

    const sortedMakes  = sortById(makes).map(projectMake);
    const sortedModels = sortById(models).map(projectModel);

    bundle[dir] = { makes: sortedMakes, models: sortedModels };
    totalMakes  += sortedMakes.length;
    totalModels += sortedModels.length;

    console.log(`   ${kind.padEnd(12)}: ${String(sortedMakes.length).padStart(4)} makes / ${String(sortedModels.length).padStart(5)} models`);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(bundle, null, 2) + "\n", "utf8");

  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`\n📦 dist/vehicle-data.json`);
  console.log(`   Schema version : ${bundle.schemaVersion}`);
  console.log(`   Data version   : ${bundle.dataVersion}`);
  console.log(`   Updated at     : ${bundle.updatedAt}  (source dataset timestamp — deterministic)`);
  console.log(`   Total makes    : ${totalMakes}`);
  console.log(`   Total models   : ${totalModels}`);
  console.log(`   File size      : ${kb} KB`);
  console.log(`\n✅ Build complete.\n`);
}

run();
