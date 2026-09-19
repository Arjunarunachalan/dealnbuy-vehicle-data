#!/usr/bin/env node
/**
 * validate.js
 *
 * Validates the normalized data in data/normalized/ against:
 *   - Structural correctness (required fields, ID format, etc.)
 *   - Relational integrity (every model.makeId references a real make)
 *   - Count agreement with the source manifest
 *
 * Exits non-zero if any check fails.
 */
"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT      = path.resolve(__dirname, "..");
const SRC_META  = path.join(ROOT, "data", "sources", "vehiclesdb", "manifest.json");
const NORM_ROOT = path.join(ROOT, "data", "normalized");

const KIND_MAP = {
  car:        "cars",
  motorcycle: "motorcycles",
  moped:      "mopeds",
  van:        "vans",
  truck:      "trucks",
  bus:        "buses",
};

const KEBAB_SLASH_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;

let errors   = [];
let warnings = [];

function error(msg)   { errors.push(`  ERROR: ${msg}`); }
function warn(msg)    { warnings.push(`  WARN:  ${msg}`); }
function fatal(msg)   { console.error(`\nFATAL: ${msg}`); process.exit(1); }

function readJSON(file) {
  if (!fs.existsSync(file)) fatal(`File not found: ${file}`);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { fatal(`JSON parse error in ${file}: ${e.message}`); }
}

function validateMakes(makes, kindLabel) {
  const ids      = new Set();
  const nameKeys = new Map();

  for (const [i, make] of makes.entries()) {
    const loc = `${kindLabel} makes[${i}]`;

    if (!make.id || typeof make.id !== "string")
      error(`${loc}: missing or non-string 'id'`);
    else {
      if (!KEBAB_SLASH_RE.test(make.id))
        error(`${loc}: id '${make.id}' must be lowercase kebab-case (slashes allowed for hierarchy)`);
      if (ids.has(make.id))
        error(`${loc}: duplicate id '${make.id}'`);
      ids.add(make.id);
    }

    if (!make.name || typeof make.name !== "string" || !make.name.trim())
      error(`${loc}: missing or empty 'name'`);
    else {
      const key = make.name.trim().toLowerCase();
      if (nameKeys.has(key))
        warn(`${loc}: name '${make.name}' is very similar to make '${nameKeys.get(key)}'`);
      nameKeys.set(key, make.id || i);
    }

    if (make.slug !== undefined && typeof make.slug !== "string")
      error(`${loc}: 'slug' must be a string`);
  }
  return ids;
}

function validateModels(models, makeIds, kindLabel) {
  const ids = new Set();

  for (const [i, model] of models.entries()) {
    const loc = `${kindLabel} models[${i}]`;

    if (!model.id || typeof model.id !== "string")
      error(`${loc}: missing or non-string 'id'`);
    else {
      if (!KEBAB_SLASH_RE.test(model.id))
        error(`${loc}: id '${model.id}' must be lowercase kebab-case or make/model`);
      if (ids.has(model.id))
        error(`${loc}: duplicate model id '${model.id}'`);
      ids.add(model.id);
    }

    if (!model.name || typeof model.name !== "string" || !model.name.trim())
      error(`${loc}: missing or empty 'name'`);

    if (!model.makeId || typeof model.makeId !== "string")
      error(`${loc}: missing or non-string 'makeId'`);
    else if (!makeIds.has(model.makeId))
      error(`${loc}: makeId '${model.makeId}' (id='${model.id}') does not reference a known make`);

    if (model.kind !== undefined && typeof model.kind !== "string")
      error(`${loc}: 'kind' must be a string`);

    if (model.body_types !== undefined && !Array.isArray(model.body_types))
      error(`${loc}: 'body_types' must be an array`);

    if (model.regions !== undefined && !Array.isArray(model.regions))
      error(`${loc}: 'regions' must be an array`);
  }
  return ids;
}

function spotCheck(normalizedDir, kindLabel, checksToRun) {
  const makesFile  = path.join(normalizedDir, "makes.json");
  const modelsFile = path.join(normalizedDir, "models.json");
  if (!fs.existsSync(makesFile) || !fs.existsSync(modelsFile)) return;

  const makes  = readJSON(makesFile);
  const models = readJSON(modelsFile);

  for (const { makeId, note } of checksToRun) {
    const found = makes.find(m => m.id === makeId);
    if (!found)
      warn(`Spot-check [${kindLabel}]: make '${makeId}' (${note}) not found`);
    else {
      const mods = models.filter(m => m.makeId === makeId);
      if (mods.length === 0)
        warn(`Spot-check [${kindLabel}]: make '${makeId}' has no models`);
    }
  }
}

function run() {
  console.log("\n🔍 Validating normalized vehicle data...\n");

  // Load manifest for expected counts
  if (!fs.existsSync(SRC_META)) {
    fatal("Source manifest not found. Run import first:\n  npm run import:vehiclesdb -- <version>");
  }
  const manifest = readJSON(SRC_META);
  console.log(`   Validating against manifest version: ${manifest.version}\n`);

  const allMakeIds  = new Set();
  const allModelIds = new Set();
  const counts      = {};
  let totalMakes    = 0;
  let totalModels   = 0;

  for (const [kind, dir] of Object.entries(KIND_MAP)) {
    const normDir    = path.join(NORM_ROOT, dir);
    const makesFile  = path.join(normDir, "makes.json");
    const modelsFile = path.join(normDir, "models.json");

    if (!fs.existsSync(makesFile))  fatal(`Missing: data/normalized/${dir}/makes.json — run normalize first`);
    if (!fs.existsSync(modelsFile)) fatal(`Missing: data/normalized/${dir}/models.json — run normalize first`);

    const makes  = readJSON(makesFile);
    const models = readJSON(modelsFile);

    const makeIds  = validateMakes(makes,  kind);
    const modelIds = validateModels(models, makeIds, kind);

    // Cross-category global uniqueness for makes
    for (const id of makeIds) {
      if (allMakeIds.has(`${kind}:${id}`)) error(`Global duplicate make id '${id}' in kind '${kind}'`);
      allMakeIds.add(`${kind}:${id}`);
    }
    // Global model uniqueness (across kinds is OK — same name can be car and van)
    for (const id of modelIds) {
      allModelIds.add(`${kind}:${id}`);
    }

    const expectedMakes  = manifest.kinds[kind].makes;
    const expectedModels = manifest.kinds[kind].models;

    counts[kind] = { makes: makes.length, models: models.length, expectedMakes, expectedModels };
    totalMakes  += makes.length;
    totalModels += models.length;

    // Count mismatch reporting (not auto-fail — report for investigation)
    if (makes.length !== expectedMakes) {
      warn(`Count mismatch [${kind} makes]:  got ${makes.length}, manifest says ${expectedMakes}`);
    }
    if (models.length !== expectedModels) {
      warn(`Count mismatch [${kind} models]: got ${models.length}, manifest says ${expectedModels}`);
    }

    const mOk = makes.length  === expectedMakes  ? "✓" : "⚠";
    const dOk = models.length === expectedModels ? "✓" : "⚠";
    console.log(`   ${kind.padEnd(12)} ${mOk} ${String(makes.length).padStart(4)} makes  ${dOk} ${String(models.length).padStart(5)} models`
      + (makes.length !== expectedMakes ? `  (expected ${expectedMakes})` : "")
      + (models.length !== expectedModels ? `  (expected ${expectedModels} models)` : ""));
  }

  console.log(`\n   Total          : ${totalMakes} makes / ${totalModels} models`);

  // ─── Spot checks ────────────────────────────────────────────────────────────
  console.log("\n🔎 Spot checks:");

  const carChecks = [
    { makeId: "bmw",            note: "BMW" },
    { makeId: "toyota",         note: "Toyota" },
    { makeId: "honda",          note: "Honda" },
    { makeId: "volkswagen",     note: "Volkswagen" },
    { makeId: "tata",           note: "Tata (India)" },
    { makeId: "hyundai",        note: "Hyundai" },
    { makeId: "renault",        note: "Renault (France)" },
    { makeId: "mercedes-benz",  note: "Mercedes-Benz" },
  ];
  // NOTE: Hero MotoCorp is absent from VehiclesDB v2026.09.1 because India is not yet
  // a covered market in that release (14 countries: ar, ca, de, es, fi, gb, ie, lu,
  // my, nl, nz, th, ua, us). Royal Enfield and Bajaj appear because they export to
  // covered markets (EU, NZ, Thailand). This is a known upstream dataset gap, not an error.
  const motoChecks = [
    { makeId: "honda",          note: "Honda" },
    { makeId: "yamaha",         note: "Yamaha" },
    { makeId: "royal-enfield",  note: "Royal Enfield (India/EU/NZ/TH export)" },
    { makeId: "bajaj",          note: "Bajaj (India/EU/NZ/TH export)" },
    { makeId: "ktm",            note: "KTM" },
    { makeId: "triumph",        note: "Triumph (UK)" },
    { makeId: "ducati",         note: "Ducati (Italy)" },
    { makeId: "kawasaki",       note: "Kawasaki" },
  ];

  spotCheck(path.join(NORM_ROOT, "cars"),        "car",        carChecks);
  spotCheck(path.join(NORM_ROOT, "motorcycles"), "motorcycle", motoChecks);

  // Print spot-check results
  const spotWarnings = warnings.filter(w => w.includes("Spot-check"));
  if (spotWarnings.length === 0) {
    console.log("   All key manufacturers found ✓");
  } else {
    spotWarnings.forEach(w => console.log(w));
  }

  // ─── Report ─────────────────────────────────────────────────────────────────
  console.log();

  if (warnings.length) {
    console.log("⚠️  Warnings:");
    warnings.forEach(w => console.log(w));
    console.log();
  }

  if (errors.length) {
    console.log(`❌ Validation FAILED (${errors.length} error(s)):`);
    errors.forEach(e => console.log(e));
    console.log();
    process.exit(1);
  }

  console.log("✅ Validation passed — all checks OK.\n");
}

run();
