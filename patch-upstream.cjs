#!/usr/bin/env node
const fs = require("fs");

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
//    - Externalize @larksuiteoapi/node-sdk
const tsupPath = "packages/server/tsup.config.ts";
if (fs.existsSync(tsupPath)) {
  let src = fs.readFileSync(tsupPath, "utf8");
  src = src.replace(
    "export const SERVER_HTTP_EXTERNAL_DEPENDENCIES = [",
    'export const SERVER_HTTP_EXTERNAL_DEPENDENCIES = [\n  "@larksuiteoapi/node-sdk",',
  );
  const bannerLine =
    'import { fileURLToPath as __zcodeFileURLToPath } from "node:url"; import { dirname as __zcodeDirname } from "node:path"; const __filename = __zcodeFileURLToPath(import.meta.url); const __dirname = __zcodeDirname(__filename);';
  src = src.replace(
    /noExternal:\s*\[[\s\S]*?\],/,
    `splitting: false,\n  banner: {\n    js: ${JSON.stringify(bannerLine)},\n  },\n  noExternal: [/^@zcode\\//],`,
  );
  fs.writeFileSync(tsupPath, src);
}

// 3. Auto-discover and copy all bare module specifiers imported by server/entry-http.js into the packaged runtime
const assetsPath = "scripts/zcode-distribution/assets.mjs";
if (fs.existsSync(assetsPath)) {
  let src = fs.readFileSync(assetsPath, "utf8");
  const oldFn =
    'export async function copyRuntimeNodeModules(packageRoot) {\n  const requireFromServer = createRequire(resolve(root, "packages", "server", "package.json"));\n  const seen = new Set();\n  for (const packageName of runtimePackageNames) {';
  const newFn = `export async function copyRuntimeNodeModules(packageRoot) {
  const requireFromServer = createRequire(resolve(root, "packages", "server", "package.json"));
  const requireFromServices = createRequire(resolve(root, "packages", "services", "package.json"));
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
  for (const packageName of allPackages) {`;
  if (!src.includes(oldFn)) {
    throw new Error("Could not find copyRuntimeNodeModules header in assets.mjs");
  }
  src = src.replace(oldFn, newFn);
  src = src.replace(
    "requireFrom: requireFromServer,",
    'requireFrom: (() => { try { requireFromServer.resolve(packageName + "/package.json"); return requireFromServer; } catch { return requireFromServices; } })(),',
  );
  fs.writeFileSync(assetsPath, src);
}
console.log("[patch-upstream] Applied ZCode Web distribution patches successfully.");
