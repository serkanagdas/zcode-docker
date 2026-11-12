#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

// 1. Disable Electron postinstall rebuild inside @zcode/desktop since we only build the Web/CLI distribution
const desktopPkgPath = "packages/desktop/package.json";
if (fs.existsSync(desktopPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(desktopPkgPath, "utf8"));
  if (pkg.scripts && pkg.scripts.postinstall) {
    delete pkg.scripts.postinstall;
    fs.writeFileSync(desktopPkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }
}

// 2. Fix packages/server/tsup.config.ts:
//    - Add banner defining __filename / __dirname for ESM
//    - Inline all @zcode/* workspace packages
const tsupPath = "packages/server/tsup.config.ts";
if (fs.existsSync(tsupPath)) {
  let src = fs.readFileSync(tsupPath, "utf8");
  const bannerLine =
    'import { fileURLToPath as __zcodeFileURLToPath } from "node:url"; import { dirname as __zcodeDirname } from "node:path"; const __filename = __zcodeFileURLToPath(import.meta.url); const __dirname = __zcodeDirname(__filename);';
  src = src.replace(
    /noExternal:\s*\[[\s\S]*?\],/,
    `splitting: false,\n  banner: {\n    js: ${JSON.stringify(bannerLine)},\n  },\n  noExternal: [/^@zcode\\//],`,
  );
  fs.writeFileSync(tsupPath, src);
}

// 3. Auto-discover and copy all bare module specifiers imported by server/entry-http.js into the packaged runtime
//    Look up packages from root node_modules, server node_modules, or services node_modules
const assetsPath = "scripts/zcode-distribution/assets.mjs";
if (fs.existsSync(assetsPath)) {
  let src = fs.readFileSync(assetsPath, "utf8");
  const oldFn =
    'export async function copyRuntimeNodeModules(packageRoot) {\n  const requireFromServer = createRequire(resolve(root, "packages", "server", "package.json"));\n  const seen = new Set();\n  for (const packageName of runtimePackageNames) {\n    await copyRuntimePackageTree({\n      packageName,\n      packageRoot,\n      requireFrom: requireFromServer,\n      seen,\n    });\n  }';
  const newFn = `export async function copyRuntimeNodeModules(packageRoot) {
  const requireCandidates = [
    createRequire(resolve(root, "package.json")),
    createRequire(resolve(root, "packages", "server", "package.json")),
    createRequire(resolve(root, "packages", "services", "package.json")),
    createRequire(resolve(root, "packages", "shared", "package.json")),
  ];
  const seen = new Set();
  const entryHttpCode = await readFile(resolve(root, "packages", "server", "dist", "entry-http.js"), "utf8");
  const { builtinModules } = await import("node:module");
  const builtins = new Set(builtinModules);
  const specRe = /(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*|\\bimport\\s+)["']([^"'\\n]+)["']/g;
  const allPackages = new Set(runtimePackageNames);
  let m;
  while ((m = specRe.exec(entryHttpCode)) !== null) {
    const s = m[1];
    if (!s || s.startsWith(".") || s.startsWith("/") || s.startsWith("node:")) continue;
    const segs = s.split("/");
    const pkg = s.startsWith("@") ? segs.slice(0, 2).join("/") : segs[0];
    if (!pkg || builtins.has(pkg) || pkg.startsWith("@zcode/")) continue;
    allPackages.add(pkg);
  }
  console.log("[zcode] Discovered runtime packages:", [...allPackages]);
  for (const packageName of allPackages) {
    let chosenRequire = requireCandidates[0];
    for (const req of requireCandidates) {
      try {
        req.resolve(packageName);
        chosenRequire = req;
        break;
      } catch {}
    }
    try {
      await copyRuntimePackageTree({
        packageName,
        packageRoot,
        requireFrom: chosenRequire,
        seen,
      });
    } catch (err) {
      console.warn("[zcode] Skipping unresolved runtime package:", packageName, err.message);
    }
  }`;
  if (!src.includes(oldFn)) {
    throw new Error("Could not find copyRuntimeNodeModules block in assets.mjs");
  }
  src = src.replace(oldFn, newFn);
  fs.writeFileSync(assetsPath, src);
}
console.log("[patch-upstream] Applied ZCode Web distribution patches successfully.");
