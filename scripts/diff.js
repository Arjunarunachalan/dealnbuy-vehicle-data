#!/usr/bin/env node
/**
 * diff.js
 *
 * Compares two VehiclesDB snapshots (or two normalized datasets) and reports:
 *   - New makes
 *   - Removed makes
 *   - Renamed makes (id same, name changed)
 *   - New models
 *   - Removed models
 *   - Changed models (name or body_types changed)
 *
 * Usage:
 *   node scripts/diff.js [--kind <kind>] [--source] [--normalized]
 *
 * By default, compares the current normalized data against a previous snapshot
 * stored in data/sources/vehiclesdb/snapshots/<prev-version>/.
 *
 * For now (first import — no previous version), it simply reports the current
 * dataset as "all new" and exits 0.
 *
 * Future usage after a second import:
 *   node scripts/diff.js --from 2026.09.1 --to 2026.10.1
 *
 * IMPORTANT: diff.js never modifies any data. It is purely a reporting tool.
 * Destructive changes (removals) are surfaced for human review — they are
 * never applied automatically.
 */
"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT      = path.resolve(__dirname, "..");
const NORM_ROOT = path.join(ROOT, "data", "normalized");
const SRC_ROOT  = path.join(ROOT, "data", "sources", "vehiclesdb");

const KIND_MAP = {
  car:        "cars",
  motorcycle: "motorcycles",
  moped:      "mopeds",
  van:        "vans",
  truck:      "trucks",
  bus:        "buses",
};

const args   = process.argv.slice(2);
const fromVer = argValue(args, "--from");
const toVer   = argValue(args, "--to");

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function readJSON(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { return null; }
}

function indexById(arr) {
  const map = new Map();
  for (const item of arr) map.set(item.id, item);
  return map;
}

function diffCollection(oldItems, newItems, label) {
  const oldMap = indexById(oldItems || []);
  const newMap = indexById(newItems || []);

  const added   = [];
  const removed = [];
  const changed = [];

  for (const [id, item] of newMap) {
    if (!oldMap.has(id)) {
      added.push(item);
    } else {
      const old = oldMap.get(id);
      const changes = [];
      if (old.name !== item.name) changes.push(`name: "${old.name}" → "${item.name}"`);
      if (JSON.stringify(old.body_types) !== JSON.stringify(item.body_types))
        changes.push(`body_types changed`);
      if (changes.length) changed.push({ id, changes });
    }
  }

  for (const [id, item] of oldMap) {
    if (!newMap.has(id)) {
      removed.push(item);
    }
  }

  const hasChanges = added.length || removed.length || changed.length;

  console.log(`\n  ${label}:`);
  if (!hasChanges) {
    console.log(`    No changes.`);
    return;
  }

  if (added.length) {
    console.log(`    + Added   (${added.length}):`);
    for (const m of added.slice(0, 20)) console.log(`        ${m.id}  "${m.name}"`);
    if (added.length > 20) console.log(`        ... and ${added.length - 20} more`);
  }
  if (removed.length) {
    console.log(`    - Removed (${removed.length}) [REVIEW BEFORE DELETING]:`);
    for (const m of removed.slice(0, 20)) console.log(`        ${m.id}  "${m.name}"`);
    if (removed.length > 20) console.log(`        ... and ${removed.length - 20} more`);
  }
  if (changed.length) {
    console.log(`    ~ Changed (${changed.length}):`);
    for (const c of changed.slice(0, 20)) {
      console.log(`        ${c.id}: ${c.changes.join("; ")}`);
    }
  }
}

function run() {
  console.log("\n📊 VehiclesDB diff report\n");

  const manifest = readJSON(path.join(SRC_ROOT, "manifest.json"));
  const currentVersion = manifest ? manifest.version : "(unknown)";

  // If no --from specified, check for a previous snapshot
  if (!fromVer) {
    const snapshotsDir = path.join(SRC_ROOT, "snapshots");
    if (!fs.existsSync(snapshotsDir) || fs.readdirSync(snapshotsDir).length === 0) {
      console.log(`   Current version : ${currentVersion}`);
      console.log(`   Previous version: none (this is the initial import)`);
      console.log(`\n   No previous snapshot to diff against.`);
      console.log(`   After a future import, run:`);
      console.log(`   node scripts/diff.js --from ${currentVersion} --to <new-version>`);
      console.log();

      // Print current dataset summary as baseline
      console.log("   Current dataset summary:");
      for (const [kind, dir] of Object.entries(KIND_MAP)) {
        const makes  = readJSON(path.join(NORM_ROOT, dir, "makes.json"))  || [];
        const models = readJSON(path.join(NORM_ROOT, dir, "models.json")) || [];
        console.log(`     ${kind.padEnd(12)}: ${String(makes.length).padStart(4)} makes / ${String(models.length).padStart(5)} models`);
      }
      console.log();
      process.exit(0);
    }
  }

  // Future: compare two specific snapshots
  if (fromVer && toVer) {
    console.log(`   Comparing: ${fromVer}  →  ${toVer}`);
    for (const [kind, dir] of Object.entries(KIND_MAP)) {
      const fromMakes  = readJSON(path.join(SRC_ROOT, "snapshots", fromVer, "normalized", dir, "makes.json"))  || [];
      const fromModels = readJSON(path.join(SRC_ROOT, "snapshots", fromVer, "normalized", dir, "models.json")) || [];
      const toMakes    = readJSON(path.join(NORM_ROOT, dir, "makes.json"))  || [];
      const toModels   = readJSON(path.join(NORM_ROOT, dir, "models.json")) || [];

      console.log(`\n── ${kind.toUpperCase()} ──`);
      diffCollection(fromMakes,  toMakes,  "Makes");
      diffCollection(fromModels, toModels, "Models");
    }

    console.log(`\n⚠️  Removed records must be reviewed manually before deletion.`);
    console.log(`   This script never deletes data automatically.\n`);
    return;
  }

  console.log(`   No --from version specified. Run with --from <version> --to <version>.`);
  console.log(`   Example: node scripts/diff.js --from 2026.09.1 --to 2026.10.1\n`);
}

run();
