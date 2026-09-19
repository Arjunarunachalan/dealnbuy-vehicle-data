#!/usr/bin/env node
/**
 * import-vehiclesdb.js
 *
 * Downloads a specific VehiclesDB release and stores it verbatim under
 * data/sources/vehiclesdb/.
 *
 * Usage:
 *   node scripts/import-vehiclesdb.js <version>        # e.g. 2026.09.1
 *   node scripts/import-vehiclesdb.js 2026.09.1 --force  # overwrite existing
 *
 * The script:
 *   1. Tries the git-tag URL first  (raw.githubusercontent.com/<ver>/...)
 *   2. Falls back to `main` only if the tag 404s
 *   3. Verifies the manifest version matches the requested version EXACTLY
 *   4. Fails loudly if there is any mismatch
 *   5. Never overwrites an existing snapshot without --force
 */
"use strict";

const https  = require("https");
const http   = require("http");
const fs     = require("fs");
const path   = require("path");

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2).filter(a => !a.startsWith("--"));
const flags   = process.argv.slice(2).filter(a =>  a.startsWith("--"));
const force   = flags.includes("--force");
const version = args[0];

if (!version) {
  console.error(`
ERROR: No version specified.

Usage:
  npm run import:vehiclesdb -- <version>
  npm run import:vehiclesdb -- 2026.09.1

To list available versions, visit:
  https://github.com/vehiclesdb/vehiclesdb/tags

Do NOT omit the version. We never blindly import 'latest'.
`);
  process.exit(1);
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT      = path.resolve(__dirname, "..");
const DEST_ROOT = path.join(ROOT, "data", "sources", "vehiclesdb");

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "vehicle-data-importer/1.0" } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode === 404) {
        return reject(Object.assign(new Error(`HTTP 404: ${url}`), { status: 404 }));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end",  () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

function writeFile(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, "utf8");
}

// ─── URL strategy ─────────────────────────────────────────────────────────────

async function resolveBaseUrl(requestedVersion) {
  const tagUrl  = `https://raw.githubusercontent.com/vehiclesdb/vehiclesdb/${requestedVersion}`;
  const mainUrl = `https://raw.githubusercontent.com/vehiclesdb/vehiclesdb/main`;

  // Try tag-specific URL first (preferred — pinned, immutable)
  console.log(`   Trying tag-specific URL: .../${requestedVersion}/manifest.json`);
  try {
    const text = await fetchText(`${tagUrl}/manifest.json`);
    const manifest = JSON.parse(text);
    if (manifest.version !== requestedVersion) {
      console.error(`\nERROR: Version mismatch!`);
      console.error(`  Requested : ${requestedVersion}`);
      console.error(`  Downloaded: ${manifest.version}`);
      console.error(`  URL       : ${tagUrl}/manifest.json`);
      process.exit(1);
    }
    console.log(`   Tag URL resolved — version verified: ${manifest.version}`);
    return { baseUrl: tagUrl, manifest, manifestText: text };
  } catch (e) {
    if (e.status !== 404) throw e;
    console.log(`   Tag not found (404). Falling back to main branch...`);
  }

  // Fallback: main branch — but MUST verify version exactly
  console.log(`   Trying main branch...`);
  const text     = await fetchText(`${mainUrl}/manifest.json`);
  const manifest = JSON.parse(text);

  if (manifest.version !== requestedVersion) {
    console.error(`\nERROR: Version mismatch!`);
    console.error(`  Requested  : ${requestedVersion}`);
    console.error(`  main branch: ${manifest.version}`);
    console.error(``);
    console.error(`  The requested version is not available as a git tag, and the`);
    console.error(`  main branch contains a different version.`);
    console.error(`  Available tags: https://github.com/vehiclesdb/vehiclesdb/tags`);
    process.exit(1);
  }
  console.log(`   main branch version matches requested: ${manifest.version}`);
  return { baseUrl: mainUrl, manifest, manifestText: text };
}

// ─── Files to download ────────────────────────────────────────────────────────

const KINDS = ["car", "motorcycle", "moped", "van", "truck", "bus"];

const DOCS = [
  "ATTRIBUTION.md",
  "SCHEMA.md",
  "SOURCES.md",
];

function buildFileList() {
  const files = [];
  // Catalog files
  for (const kind of KINDS) {
    files.push({ remote: `catalog/${kind}/makes.json`,  local: `catalog/${kind}/makes.json`  });
    files.push({ remote: `catalog/${kind}/models.json`, local: `catalog/${kind}/models.json` });
  }
  // Docs
  for (const doc of DOCS) {
    files.push({ remote: doc, local: doc });
  }
  return files;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n📥 VehiclesDB Importer`);
  console.log(`   Requested version : ${version}`);
  console.log(`   Destination       : ${DEST_ROOT}`);
  console.log(`   Force overwrite   : ${force}`);
  console.log();

  // Guard: don't overwrite without --force
  const manifestDest = path.join(DEST_ROOT, "manifest.json");
  if (fs.existsSync(manifestDest) && !force) {
    const existing = JSON.parse(fs.readFileSync(manifestDest, "utf8"));
    if (existing.version === version) {
      console.log(`✅ Version ${version} already imported. Use --force to re-download.\n`);
      process.exit(0);
    }
    console.error(`\nERROR: A different version (${existing.version}) is already imported.`);
    console.error(`  Use --force to replace it, or import to a different path.`);
    process.exit(1);
  }

  // Resolve base URL and verify version
  console.log("🔍 Resolving source URL and verifying version...");
  const { baseUrl, manifest, manifestText } = await resolveBaseUrl(version);
  console.log();

  // Print manifest summary
  console.log("📊 Manifest summary:");
  for (const [kind, counts] of Object.entries(manifest.kinds)) {
    console.log(`   ${kind.padEnd(12)}: ${counts.makes} makes / ${counts.models} models`);
  }
  console.log();

  // Download all files
  const files = buildFileList();
  console.log(`⬇️  Downloading ${files.length + 1} files...\n`);

  // Write manifest first
  writeFile(manifestDest, manifestText);
  console.log(`   ✓ manifest.json`);

  for (const { remote, local } of files) {
    const url  = `${baseUrl}/${remote}`;
    const dest = path.join(DEST_ROOT, local);
    try {
      const text = await fetchText(url);
      writeFile(dest, text);
      const kb = (Buffer.byteLength(text, "utf8") / 1024).toFixed(1);
      console.log(`   ✓ ${local.padEnd(42)} ${kb.padStart(7)} KB`);
    } catch (err) {
      console.error(`\n   ✗ FAILED: ${remote}`);
      console.error(`     ${err.message}`);
      process.exit(1);
    }
  }

  // Write import metadata
  const importMeta = {
    importedAt:        new Date().toISOString(),
    requestedVersion:  version,
    confirmedVersion:  manifest.version,
    sourceRepository:  "https://github.com/vehiclesdb/vehiclesdb",
    baseUrl,
    license:           manifest.license,
    attribution:       manifest.attribution,
    kinds:             manifest.kinds,
  };
  writeFile(
    path.join(DEST_ROOT, "import-meta.json"),
    JSON.stringify(importMeta, null, 2) + "\n"
  );
  console.log(`   ✓ import-meta.json`);

  console.log(`\n✅ Import complete — version ${version} stored in data/sources/vehiclesdb/\n`);
}

run().catch(err => {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
});
