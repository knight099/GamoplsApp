#!/usr/bin/env node
/**
 * check-architecture-rules.mjs
 *
 * Automated backstop for the CLAUDE.md rule:
 *   "Never import a concrete Asset Type Plugin into a module service."
 *
 * services/map, services/chat, services/board, services/hub (and any future
 * Node module service under services/*) must only depend on
 * packages/asset-contracts + packages/event-schemas, and must never import
 * from plugins/* directly, and must never branch on asset type.
 *
 * This script performs three checks:
 *
 *   1. Dependency check (hard fail)
 *      Scans every services/*\/package.json that exists (this naturally
 *      excludes services/core-ingestion (Go) and services/ai-engine
 *      (Python) — they have no package.json) and fails if any of them
 *      lists a plugins/* package name as a dependency, devDependency, or
 *      peerDependency. Plugin package names are read dynamically from
 *      plugins/*\/package.json rather than hardcoded, so this generalizes
 *      to future plugins (drone, vessel, etc.) automatically.
 *
 *   2. Source-level import check (hard fail)
 *      Belt-and-suspenders beyond #1: someone could deep-import via a
 *      relative path (e.g. `../../plugins/asset-vehicle/src/index`) or a
 *      `require()` call without ever touching package.json. Scans
 *      services/*\/src/**\/*.{ts,tsx} for import/require statements that
 *      reference a `plugins/` path segment or a known plugin package name.
 *
 *   3. Asset-type branching check (best-effort, WARN only)
 *      Greps for patterns like `asset.type === 'vehicle'` — the classic
 *      way LSP/OCP gets violated even without importing a plugin. This is
 *      a heuristic (it can't see whether `asset` is actually an Asset
 *      instance, so a false positive is possible, e.g. an unrelated local
 *      variable also named `asset`, or a plugin's own source doing this
 *      legitimately). Because false positives are plausible and this repo
 *      is under active parallel development, this check WARNS instead of
 *      failing the build — it's a signal for code review, not an
 *      auto-blocking gate. Escalate to a hard fail once the false-positive
 *      rate has been observed to be low in practice.
 *
 * Dependency-light by design: only Node built-ins (fs, path, url).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const ASSET_TYPE_BRANCH_PATTERNS = [
  /\basset\.type\s*===/,
  /\.type\s*===\s*['"]vehicle['"]/,
  /\.type\s*===\s*['"]drone['"]/,
  /\.type\s*===\s*['"]vessel['"]/,
];

/**
 * Read a JSON file, returning null if it doesn't exist.
 */
function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err.message}`);
  }
}

/**
 * List immediate subdirectories of a directory. Returns [] if the
 * directory doesn't exist.
 */
function listSubdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Discover plugin package names dynamically from plugins/*\/package.json.
 * Returns a Map<packageName, pluginDirName>.
 */
export function getPluginPackageNames(rootDir) {
  const pluginsDir = path.join(rootDir, "plugins");
  const names = new Map();
  for (const dirName of listSubdirs(pluginsDir)) {
    const pkg = readJsonIfExists(path.join(pluginsDir, dirName, "package.json"));
    if (pkg && pkg.name) {
      names.set(pkg.name, dirName);
    }
  }
  return names;
}

/**
 * Discover Node module services: any services/* directory that has a
 * package.json. This naturally excludes Go (core-ingestion) and Python
 * (ai-engine) services without hardcoding their names.
 * Returns Map<serviceDirName, { pkgPath, pkg }>.
 */
export function getNodeServices(rootDir) {
  const servicesDir = path.join(rootDir, "services");
  const services = new Map();
  for (const dirName of listSubdirs(servicesDir)) {
    const pkgPath = path.join(servicesDir, dirName, "package.json");
    const pkg = readJsonIfExists(pkgPath);
    if (pkg) {
      services.set(dirName, { pkgPath, pkg, dir: path.join(servicesDir, dirName) });
    }
  }
  return services;
}

/**
 * Check 1: no services/*\/package.json may depend on a plugins/* package.
 */
export function checkDependencies(rootDir) {
  const pluginNames = getPluginPackageNames(rootDir);
  const services = getNodeServices(rootDir);
  const violations = [];

  for (const [serviceName, { pkg, pkgPath }] of services) {
    for (const field of DEP_FIELDS) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const depName of Object.keys(deps)) {
        if (pluginNames.has(depName)) {
          violations.push({
            service: serviceName,
            dependency: depName,
            field,
            file: path.relative(rootDir, pkgPath),
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Recursively walk a directory, yielding files matching the given
 * extensions. Skips node_modules and dist.
 */
function* walkSourceFiles(dir, extensions) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(fullPath, extensions);
    } else if (extensions.includes(path.extname(entry.name))) {
      yield fullPath;
    }
  }
}

const IMPORT_LIKE_RE = /\b(?:import|require)\s*\(?[^;\n]*?['"]([^'"]+)['"]/g;

/**
 * Check 2: no services/*\/src/**\/*.{ts,tsx} may import from a plugins/*
 * path or a plugin package name, via static import, dynamic import(), or
 * require().
 */
export function checkSourceImports(rootDir) {
  const pluginNames = getPluginPackageNames(rootDir);
  const services = getNodeServices(rootDir);
  const violations = [];

  for (const [serviceName, { dir }] of services) {
    const srcDir = path.join(dir, "src");
    for (const file of walkSourceFiles(srcDir, SOURCE_EXTENSIONS)) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        IMPORT_LIKE_RE.lastIndex = 0;
        let match;
        while ((match = IMPORT_LIKE_RE.exec(line)) !== null) {
          const specifier = match[1];
          const referencesPluginPath = /(^|\/)plugins\//.test(specifier);
          const referencesPluginPackage = pluginNames.has(specifier);
          if (referencesPluginPath || referencesPluginPackage) {
            violations.push({
              service: serviceName,
              file: path.relative(rootDir, file),
              line: i + 1,
              specifier,
              snippet: line.trim(),
            });
          }
        }
      }
    }
  }

  return violations;
}

/**
 * Check 3 (WARN only): best-effort detection of asset-type branching.
 */
export function checkAssetTypeBranching(rootDir) {
  const services = getNodeServices(rootDir);
  const warnings = [];

  for (const [serviceName, { dir }] of services) {
    const srcDir = path.join(dir, "src");
    for (const file of walkSourceFiles(srcDir, SOURCE_EXTENSIONS)) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (ASSET_TYPE_BRANCH_PATTERNS.some((re) => re.test(line))) {
          warnings.push({
            service: serviceName,
            file: path.relative(rootDir, file),
            line: i + 1,
            snippet: line.trim(),
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Run all checks against rootDir and return a structured report.
 */
export function runChecks(rootDir) {
  return {
    dependencyViolations: checkDependencies(rootDir),
    sourceImportViolations: checkSourceImports(rootDir),
    assetTypeWarnings: checkAssetTypeBranching(rootDir),
  };
}

function formatReport(report) {
  const lines = [];
  const { dependencyViolations, sourceImportViolations, assetTypeWarnings } = report;

  if (dependencyViolations.length > 0) {
    lines.push("FAIL: services depending directly on plugins/* packages:");
    for (const v of dependencyViolations) {
      lines.push(
        `  - services/${v.service}: "${v.dependency}" listed in ${v.field} (${v.file})`
      );
    }
  }

  if (sourceImportViolations.length > 0) {
    lines.push("FAIL: services with source-level imports of plugins/* code:");
    for (const v of sourceImportViolations) {
      lines.push(
        `  - services/${v.service}: ${v.file}:${v.line} imports "${v.specifier}" -> ${v.snippet}`
      );
    }
  }

  if (assetTypeWarnings.length > 0) {
    lines.push(
      "WARN: possible asset-type branching found (heuristic, review manually):"
    );
    for (const w of assetTypeWarnings) {
      lines.push(`  - services/${w.service}: ${w.file}:${w.line} -> ${w.snippet}`);
    }
  }

  return lines.join("\n");
}

function main() {
  const rootDir = process.cwd();
  const report = runChecks(rootDir);
  const hasViolations =
    report.dependencyViolations.length > 0 || report.sourceImportViolations.length > 0;
  const hasWarnings = report.assetTypeWarnings.length > 0;

  if (!hasViolations && !hasWarnings) {
    console.log(
      "check:architecture — PASS. No services/* depend on plugins/*, no plugin imports found, no asset-type branching detected."
    );
    process.exit(0);
  }

  const output = formatReport(report);
  console.log(output);

  if (hasViolations) {
    console.error(
      `\ncheck:architecture — FAIL. ${report.dependencyViolations.length} dependency violation(s), ${report.sourceImportViolations.length} source import violation(s).`
    );
    process.exit(1);
  }

  console.log(
    `\ncheck:architecture — PASS with ${report.assetTypeWarnings.length} warning(s). Warnings do not fail the build; review manually.`
  );
  process.exit(0);
}

const isDirectlyExecuted =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectlyExecuted) {
  main();
}
