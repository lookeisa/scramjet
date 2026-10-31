import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = process.argv[2] ?? "--all";
if (mode !== "--all" && mode !== "--legacy") {
  console.error("Usage: node scripts/check-workspace-types.mjs [--all|--legacy]");
  process.exit(2);
}

const packagesRoot = join(root, "packages");
const packageNames = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => mode !== "--legacy" || !name.startsWith("refract-"));
const configs = [join(root, "tsconfig.json")];

for (const packageName of packageNames) {
  const packagePath = join(packagesRoot, packageName);
  for (const configName of ["tsconfig.json", "tsconfig.types.json"]) {
    const configPath = join(packagePath, configName);
    if (existsSync(configPath)) configs.push(configPath);
  }
}

let failures = 0;
for (const configPath of configs) {
  const label = relative(root, configPath);
  const result = spawnSync("pnpm", ["exec", "tsc", "--noEmit", "--project", resolve(configPath)], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    console.error(`${label}: could not run TypeScript`, result.error);
    failures += 1;
  } else if (result.status !== 0) {
    console.error(`${label}: FAILED (exit ${result.status})`);
    failures += 1;
  } else {
    console.log(`${label}: PASS`);
  }
}

if (failures > 0) {
  console.error(`TypeScript validation failed for ${failures} configuration(s).`);
  process.exitCode = 1;
} else {
  console.log(`TypeScript validation passed for ${configs.length} configuration(s).`);
}
