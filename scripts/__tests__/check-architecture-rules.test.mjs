import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getPluginPackageNames,
  getNodeServices,
  checkDependencies,
  checkSourceImports,
  checkAssetTypeBranching,
  runChecks,
} from "../check-architecture-rules.mjs";

/**
 * These tests build a throwaway fixture repo under a temp dir with the
 * same services/* + plugins/* shape as the real monorepo, then point the
 * checker at it. This proves the checker actually flags violations (not
 * just "runs without crashing"), and that it stays quiet on clean input.
 */

let tmpRoot;

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function scaffoldCleanRepo(root) {
  writeJson(path.join(root, "plugins/asset-vehicle/package.json"), {
    name: "@gamopls/asset-vehicle",
    dependencies: {},
  });

  writeJson(path.join(root, "services/map/package.json"), {
    name: "@gamopls/map",
    dependencies: {
      "@gamopls/asset-contracts": "workspace:*",
      "@gamopls/event-schemas": "workspace:*",
    },
    devDependencies: {},
  });
  writeFile(
    path.join(root, "services/map/src/index.ts"),
    `import { Asset } from "@gamopls/asset-contracts";\nexport function render(asset: Asset) { return asset.getMapIcon(); }\n`
  );

  // Non-Node service (Go): no package.json, should be ignored entirely.
  writeFile(path.join(root, "services/core-ingestion/cmd/main.go"), `package main\n`);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arch-check-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("getPluginPackageNames", () => {
  it("reads plugin package names dynamically from plugins/*/package.json", () => {
    scaffoldCleanRepo(tmpRoot);
    const names = getPluginPackageNames(tmpRoot);
    expect(Array.from(names.keys())).toEqual(["@gamopls/asset-vehicle"]);
  });
});

describe("getNodeServices", () => {
  it("only includes services/* dirs that have a package.json (excludes Go/Python services)", () => {
    scaffoldCleanRepo(tmpRoot);
    const services = getNodeServices(tmpRoot);
    expect(Array.from(services.keys())).toEqual(["map"]);
    expect(services.has("core-ingestion")).toBe(false);
  });
});

describe("checkDependencies", () => {
  it("passes on clean input (no plugin deps anywhere)", () => {
    scaffoldCleanRepo(tmpRoot);
    const violations = checkDependencies(tmpRoot);
    expect(violations).toEqual([]);
  });

  it("flags a service that lists a plugins/* package as a dependency", () => {
    scaffoldCleanRepo(tmpRoot);
    writeJson(path.join(tmpRoot, "services/board/package.json"), {
      name: "@gamopls/board",
      dependencies: {
        "@gamopls/asset-vehicle": "workspace:*",
      },
    });
    const violations = checkDependencies(tmpRoot);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      service: "board",
      dependency: "@gamopls/asset-vehicle",
      field: "dependencies",
    });
  });

  it("flags a plugin dep listed under devDependencies or peerDependencies too", () => {
    scaffoldCleanRepo(tmpRoot);
    writeJson(path.join(tmpRoot, "services/chat/package.json"), {
      name: "@gamopls/chat",
      devDependencies: { "@gamopls/asset-vehicle": "workspace:*" },
      peerDependencies: { "@gamopls/asset-vehicle": "workspace:*" },
    });
    const violations = checkDependencies(tmpRoot);
    const fields = violations.map((v) => v.field).sort();
    expect(fields).toEqual(["devDependencies", "peerDependencies"]);
  });
});

describe("checkSourceImports", () => {
  it("passes on clean input", () => {
    scaffoldCleanRepo(tmpRoot);
    const violations = checkSourceImports(tmpRoot);
    expect(violations).toEqual([]);
  });

  it("flags a relative deep-import into plugins/", () => {
    scaffoldCleanRepo(tmpRoot);
    writeJson(path.join(tmpRoot, "services/hub/package.json"), { name: "@gamopls/hub" });
    writeFile(
      path.join(tmpRoot, "services/hub/src/index.ts"),
      `import { VehicleDetails } from "../../plugins/asset-vehicle/src/index";\n`
    );
    const violations = checkSourceImports(tmpRoot);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ service: "hub", line: 1 });
  });

  it("flags a require() of a plugin package name", () => {
    scaffoldCleanRepo(tmpRoot);
    writeJson(path.join(tmpRoot, "services/board/package.json"), { name: "@gamopls/board" });
    writeFile(
      path.join(tmpRoot, "services/board/src/legacy.ts"),
      `const vehicle = require("@gamopls/asset-vehicle");\n`
    );
    const violations = checkSourceImports(tmpRoot);
    expect(violations).toHaveLength(1);
    expect(violations[0].specifier).toBe("@gamopls/asset-vehicle");
  });
});

describe("checkAssetTypeBranching", () => {
  it("does not warn on clean input using polymorphic dispatch", () => {
    scaffoldCleanRepo(tmpRoot);
    const warnings = checkAssetTypeBranching(tmpRoot);
    expect(warnings).toEqual([]);
  });

  it("warns on asset.type === 'vehicle' style branching", () => {
    scaffoldCleanRepo(tmpRoot);
    writeJson(path.join(tmpRoot, "services/map/package.json"), { name: "@gamopls/map" });
    writeFile(
      path.join(tmpRoot, "services/map/src/icon.ts"),
      `function icon(asset) {\n  if (asset.type === 'vehicle') return 'car.svg';\n  return 'default.svg';\n}\n`
    );
    const warnings = checkAssetTypeBranching(tmpRoot);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatchObject({ service: "map", line: 2 });
  });
});

describe("runChecks", () => {
  it("returns an all-clear report for a clean fixture repo", () => {
    scaffoldCleanRepo(tmpRoot);
    const report = runChecks(tmpRoot);
    expect(report.dependencyViolations).toEqual([]);
    expect(report.sourceImportViolations).toEqual([]);
    expect(report.assetTypeWarnings).toEqual([]);
  });

  it("catches a combined violation scenario end-to-end", () => {
    scaffoldCleanRepo(tmpRoot);
    writeJson(path.join(tmpRoot, "services/board/package.json"), {
      name: "@gamopls/board",
      dependencies: { "@gamopls/asset-vehicle": "workspace:*" },
    });
    writeFile(
      path.join(tmpRoot, "services/board/src/index.ts"),
      `import { VehicleDetails } from "@gamopls/asset-vehicle";\n`
    );
    const report = runChecks(tmpRoot);
    expect(report.dependencyViolations.length).toBe(1);
    expect(report.sourceImportViolations.length).toBe(1);
  });
});
