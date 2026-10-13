import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const lean = fileURLToPath(new URL("../lean/", import.meta.url));

if (process.platform !== "darwin" && process.platform !== "linux") {
  throw new Error("The native build supports macOS and Linux.");
}

mkdirSync(new URL("../build/", import.meta.url), { recursive: true });

const leanPrefix = execFileSync("lean", ["--print-prefix"], {
  cwd: lean,
  encoding: "utf8",
}).trim();

const modules = ["Inventory", "Ledger", "Native"];
const env = { ...process.env, LEAN_PATH: `${root}build` };

for (const module of modules) {
  execFileSync("lean", [
    "-DwarningAsError=true",
    "-o", `../build/${module}.olean`,
    "-c", `../build/${module}.c`,
    `${module}.lean`,
  ], { cwd: lean, env, stdio: "inherit" });
}

execFileSync("leanc", [
  "-shared",
  "-fPIC",
  "-O2",
  "-o", `${root}build/lean.node`,
  `${root}native/addon.c`,
  ...modules.map((module) => `${root}build/${module}.c`),
  "-I", `${root}node_modules/node-api-headers/include`,
  "-L", `${leanPrefix}/lib/lean`,
  "-lleanshared",
  `-Wl,-rpath,${leanPrefix}/lib/lean`,
  ...(process.platform === "darwin"
    ? ["-mmacosx-version-min=12.0", "-Wl,-undefined,dynamic_lookup"]
    : []),
], { cwd: lean, stdio: "inherit" });
