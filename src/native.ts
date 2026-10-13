import { createRequire } from "node:module";
import { isMainThread } from "node:worker_threads";

if (!isMainThread) {
  throw new Error("This example supports the Lean addon on the main thread only.");
}

const require = createRequire(import.meta.url);

export const { fulfill, runBatchJson } = require("../build/lean.node") as {
  fulfill(stock: number, requested: number): number;
  runBatchJson(input: string): string;
};
