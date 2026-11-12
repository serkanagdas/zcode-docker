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

// 2. Patch packages/server/src/entry-http.ts to initialize headless server credential secret file
//    before createServerHostServices() calls createServerCredentialCipher()
const entryHttpPath = "packages/server/src/entry-http.ts";
if (fs.existsSync(entryHttpPath)) {
  let src = fs.readFileSync(entryHttpPath, "utf8");
  if (!src.includes("prepareServerCredentialStorage")) {
    src =
      'import { mkdir as __zcodeMkdir } from "node:fs/promises";\n' +
      'import { join as __zcodeJoin } from "node:path";\n' +
      'import { prepareServerCredentialStorage as __zcodePrepareServerCredentialStorage } from "@zcode/shared/credential-security";\n' +
      src.replace(
        "async function main(): Promise<void> {",
        `async function main(): Promise<void> {\n  await __zcodeMkdir(getAppConfigDir(), { recursive: true });\n  await __zcodePrepareServerCredentialStorage({ filePath: __zcodeJoin(getAppConfigDir(), "credentials.json") });`,
      );
    fs.writeFileSync(entryHttpPath, src);
  }
}

// 3. Fix packages/server/tsup.config.ts:
//    - Add banner defining require, __filename, and __dirname for ESM so bundled CJS deps work
//    - Inline all @zcode/* workspace packages
const tsupPath = "packages/server/tsup.config.ts";
if (fs.existsSync(tsupPath)) {
  let src = fs.readFileSync(tsupPath, "utf8");
  const bannerLine =
    'import { createRequire as __zcodeCreateRequire } from "node:module"; import { fileURLToPath as __zcodeFileURLToPath } from "node:url"; import { dirname as __zcodeDirname } from "node:path"; const require = __zcodeCreateRequire(import.meta.url); const __filename = __zcodeFileURLToPath(import.meta.url); const __dirname = __zcodeDirname(__filename);';
  src = src.replace(
    /noExternal:\s*\[[\s\S]*?\],/,
    `splitting: false,\n  banner: {\n    js: ${JSON.stringify(bannerLine)},\n  },\n  noExternal: [/^@zcode\\//],`,
  );
  fs.writeFileSync(tsupPath, src);
}

// 4. Auto-discover and copy full production + optional dependency closure for server/entry-http.js
//    using realpath traversal across pnpm workspace packages
const assetsPath = "scripts/zcode-distribution/assets.mjs";
if (fs.existsSync(assetsPath)) {
  let src = fs.readFileSync(assetsPath, "utf8");
  const oldFn =
    'export async function copyRuntimeNodeModules(packageRoot) {\n  const requireFromServer = createRequire(resolve(root, "packages", "server", "package.json"));\n  const seen = new Set();\n  for (const packageName of runtimePackageNames) {\n    await copyRuntimePackageTree({\n      packageName,\n      packageRoot,\n      requireFrom: requireFromServer,\n      seen,\n    });\n  }';
  const newFn = `export async function copyRuntimeNodeModules(packageRoot) {
  const { realpath } = await import("node:fs/promises");
  const { builtinModules } = await import("node:module");
  const builtins = new Set(builtinModules);
  const entryHttpCode = await readFile(resolve(root, "packages", "server", "dist", "entry-http.js"), "utf8");
  const specRe = /(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire\\s*\\(\\s*|\\bimport\\s+)["']([^"'\\n]+)["']/g;
  const entryPackages = new Set([...runtimePackageNames, "@napi-rs/keyring"]);
  let m;
  while ((m = specRe.exec(entryHttpCode)) !== null) {
    const s = m[1];
    if (!s || s.startsWith(".") || s.startsWith("/") || s.startsWith("node:")) continue;
    const segs = s.split("/");
    const pkg = s.startsWith("@") ? segs.slice(0, 2).join("/") : segs[0];
    if (!pkg || builtins.has(pkg) || pkg.startsWith("@zcode/")) continue;
    entryPackages.add(pkg);
  }
  const searchRoots = [
    resolve(root, "packages", "server"),
    resolve(root, "packages", "services"),
    resolve(root, "packages", "shared"),
    resolve(root, "packages", "provider-node"),
    resolve(root, "packages", "provider"),
    resolve(root, "packages", "rpc"),
    resolve(root, "packages", "client"),
    root,
  ];
  async function findDepDir(fromDir, name) {
    let cur = resolve(fromDir);
    for (;;) {
      const candidate = resolve(cur, "node_modules", ...name.split("/"));
      if (await pathExists(resolve(candidate, "package.json"))) {
        return await realpath(candidate);
      }
      const parent = dirname(cur);
      if (parent === cur) return null;
      cur = parent;
    }
  }
  const closure = new Map();
  const queue = [];
  for (const name of entryPackages) {
    queue.push({ name, fromDirs: searchRoots, optional: true });
  }
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || closure.has(item.name)) continue;
    let pkgDir = null;
    for (const fd of item.fromDirs) {
      pkgDir = await findDepDir(fd, item.name);
      if (pkgDir) break;
    }
    if (!pkgDir) {
      if (!item.optional) {
        console.warn("[zcode] Missing runtime dependency:", item.name);
      }
      continue;
    }
    closure.set(item.name, pkgDir);
    const pkgJson = await readJson(resolve(pkgDir, "package.json"));
    const deps = pkgJson.dependencies ?? {};
    const optDeps = pkgJson.optionalDependencies ?? {};
    for (const depName of Object.keys(deps)) {
      queue.push({ name: depName, fromDirs: [pkgDir, ...searchRoots], optional: Object.hasOwn(optDeps, depName) });
    }
    for (const depName of Object.keys(optDeps)) {
      queue.push({ name: depName, fromDirs: [pkgDir, ...searchRoots], optional: true });
    }
  }
  console.log("[zcode] Copying runtime packages (" + closure.size + "):", [...closure.keys()]);
  for (const [packageName, packageDirectory] of closure) {
    const destination = resolve(packageRoot, "node_modules", ...packageName.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await cp(packageDirectory, destination, {
      dereference: true,
      force: true,
      recursive: true,
      filter: (source) => shouldCopyPackagePath(packageDirectory, source),
    });
  }`;
  if (!src.includes(oldFn)) {
    throw new Error("Could not find copyRuntimeNodeModules block in assets.mjs");
  }
  src = src.replace(oldFn, newFn);
  fs.writeFileSync(assetsPath, src);
}
console.log("[patch-upstream] Applied ZCode Web distribution patches successfully.");
