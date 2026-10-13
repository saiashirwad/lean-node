import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const original = readFileSync(new URL("../lean/Ledger.lean", import.meta.url), "utf8");
const toolchain = readFileSync(new URL("../lean/lean-toolchain", import.meta.url), "utf8").trim();
const temporary = mkdtempSync(fileURLToPath(new URL("../build/proof-check-", import.meta.url)));

after(() => rmSync(temporary, { recursive: true, force: true }));

function checkProofs(source: string) {
  writeFileSync(`${temporary}/Ledger.lean`, source);
  const result = spawnSync("lean", ["-DwarningAsError=true", "Ledger.lean"], {
    cwd: temporary,
    env: { ...process.env, ELAN_TOOLCHAIN: toolchain },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

test("the unmodified ledger proofs are accepted by Lean", () => {
  const result = checkProofs(`${original}\n
#print axioms Ledger.transfer_conserves_money
#print axioms Ledger.batch_conserves_money
#print axioms Ledger.rejected_batch_is_unchanged
`);
  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /sorryAx/);
});

const mutations = [
  ["creating money", "payment.destination (balances[payment.destination] + payment.amount))",
    "payment.destination (balances[payment.destination] + payment.amount + 1))"],
  ["allowing overdrafts", "else if payment.amount ≤ balances[payment.source] then", "else if True then"],
  ["allowing aliased accounts", "if payment.source = payment.destination then", "if False then"],
  ["changing balances on rejection", ".error failure => .rejected balances failure",
    ".error failure => .rejected (balances.map (· + 1)) failure"],
];

for (const [name, before, after] of mutations) {
  test(`Lean refuses the proofs after ${name}`, () => {
    const changed = original.replace(before, after);
    assert.notEqual(changed, original, "The mutation must change the implementation.");
    const result = checkProofs(changed);
    assert.notEqual(result.status, 0, "The corrupted ledger must fail proof checking.");
    assert.match(result.output, /unsolved goals|Type mismatch|Application type mismatch/);
  });
}
