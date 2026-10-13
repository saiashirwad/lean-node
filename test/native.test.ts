import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { Worker } from "node:worker_threads";

test("TypeScript entry points reject worker use before loading Lean", { timeout: 10_000 }, async () => {
  for (const path of ["../src/native.ts", "../src/ledger.ts"]) {
    const url = new URL(path, import.meta.url).href;
    const worker = new Worker(`
      const { parentPort } = require("node:worker_threads");
      import(${JSON.stringify(url)}).then(
        () => parentPort.postMessage("Unexpected success"),
        (error) => parentPort.postMessage(error.message),
      );
    `, { eval: true });
    try {
      const [message] = await once(worker, "message");
      assert.equal(message, "This example supports the Lean addon on the main thread only.");
    } finally {
      await worker.terminate();
    }
  }
});
