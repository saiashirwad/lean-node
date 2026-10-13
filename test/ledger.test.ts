import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { applyBatch } from "../src/ledger.ts";
import type { BatchResult, Transfer } from "../src/ledger.ts";

const require = createRequire(import.meta.url);
const { runBatchJson } = require("../build/lean.node") as {
  runBatchJson(input: string): string;
};

test("later transfers can spend money received earlier in the batch", () => {
  assert.deepEqual(applyBatch([100n, 0n, 0n], [
    { source: 0, destination: 1, amount: 50n },
    { source: 1, destination: 2, amount: 30n },
  ]), { status: "committed", balances: [50n, 20n, 30n] });
});

test("an overdraft rolls back a successful prefix and identifies the failing transfer", () => {
  assert.deepEqual(applyBatch([100n, 0n, 0n], [
    { source: 0, destination: 1, amount: 50n },
    { source: 1, destination: 2, amount: 60n },
    { source: 0, destination: 2, amount: 1n },
  ]), {
    status: "rejected", balances: [100n, 0n, 0n], failedAt: 1, reason: "insufficientFunds",
  });
});

test("self-transfers are rejected even when the amount is zero", () => {
  for (const amount of [0n, 50n, 1000n]) {
    assert.deepEqual(applyBatch([100n, 0n], [{ source: 0, destination: 0, amount }]), {
      status: "rejected", balances: [100n, 0n], failedAt: 0, reason: "sameAccount",
    });
  }
});

test("missing accounts cannot silently discard or create money", () => {
  for (const payment of [
    { source: 2, destination: 0, amount: 1n },
    { source: 0, destination: 2, amount: 1n },
  ]) {
    assert.deepEqual(applyBatch([5n, 0n], [payment]), {
      status: "rejected", balances: [5n, 0n], failedAt: 0, reason: "invalidAccount",
    });
  }
  assert.deepEqual(applyBatch([], [{ source: 0, destination: 1, amount: 0n }]), {
    status: "rejected", balances: [], failedAt: 0, reason: "invalidAccount",
  });
});

test("an invalid account late in a batch also rolls back", () => {
  assert.deepEqual(applyBatch([10n, 0n], [
    { source: 0, destination: 1, amount: 5n },
    { source: 1, destination: 2, amount: 1n },
  ]), { status: "rejected", balances: [10n, 0n], failedAt: 1, reason: "invalidAccount" });
});

test("a rejected self-transfer rolls back earlier payments", () => {
  assert.deepEqual(applyBatch([10n, 0n], [
    { source: 0, destination: 1, amount: 5n },
    { source: 1, destination: 1, amount: 3n },
  ]), { status: "rejected", balances: [10n, 0n], failedAt: 1, reason: "sameAccount" });
});

test("empty batches and zero-value transfers preserve the ledger", () => {
  assert.deepEqual(applyBatch([], []), { status: "committed", balances: [] });
  assert.deepEqual(applyBatch([3n, 4n], []), { status: "committed", balances: [3n, 4n] });
  assert.deepEqual(applyBatch([0n, 4n], [{ source: 0, destination: 1, amount: 0n }]), {
    status: "committed", balances: [0n, 4n],
  });
});

test("debits and credits are exact and other accounts are unchanged", () => {
  assert.deepEqual(applyBatch([50n, 7n, 9n, 11n], [
    { source: 0, destination: 2, amount: 50n },
  ]), { status: "committed", balances: [0n, 7n, 59n, 11n] });
});

test("the entire native roundtrip preserves amounts beyond JavaScript and machine integer limits", () => {
  const large = 10n ** 80n + 123n;
  assert.deepEqual(applyBatch([large, 1n, 0n], [
    { source: 0, destination: 1, amount: large },
    { source: 1, destination: 2, amount: large + 1n },
  ]), { status: "committed", balances: [0n, 0n, large + 1n] });
});

test("calls do not mutate inputs or retain a hidden ledger", () => {
  const balances = Object.freeze([100n, 0n]);
  const payments = Object.freeze([Object.freeze({ source: 0, destination: 1, amount: 50n })]);
  const expected = { status: "committed", balances: [50n, 50n] };
  assert.deepEqual(applyBatch(balances, payments), expected);
  assert.deepEqual(applyBatch(balances, payments), expected);
  assert.deepEqual(balances, [100n, 0n]);
});

test("the TypeScript boundary rejects invalid numeric domains", () => {
  assert.throws(() => applyBatch([-1n, 0n], []), RangeError);
  assert.throws(() => applyBatch([1n, 0n], [{ source: 0, destination: 1, amount: -1n }]), RangeError);
  for (const invalid of [1, "1", null, undefined]) {
    assert.throws(() => Reflect.apply(applyBatch, undefined, [[invalid], []]), TypeError);
    assert.throws(() => Reflect.apply(applyBatch, undefined, [
      [1n, 0n], [{ source: 0, destination: 1, amount: invalid }],
    ]), TypeError);
  }
  for (const invalid of [-1, 0.5, NaN, Infinity, 2 ** 53, "0", 0n]) {
    assert.throws(() => Reflect.apply(applyBatch, undefined, [
      [1n, 0n], [{ source: invalid, destination: 1, amount: 1n }],
    ]), RangeError);
    assert.throws(() => Reflect.apply(applyBatch, undefined, [
      [1n, 0n], [{ source: 0, destination: invalid, amount: 1n }],
    ]), RangeError);
  }
});

test("Lean rejects malformed requests even when the TypeScript wrapper is bypassed", () => {
  const requests = ["{", "null", "[]", "{}", '{"balances": ["1"]}'];
  for (const amount of ["", "-1", "+1", "1.5", "1e3", " 1", "𝟙", 1, null]) {
    requests.push(JSON.stringify({ balances: [amount], transfers: [] }));
    requests.push(JSON.stringify({
      balances: ["1", "0"], transfers: [{ source: 0, destination: 1, amount }],
    }));
  }
  for (const source of [-1, 0.5, "0", null]) {
    requests.push(JSON.stringify({
      balances: ["1", "0"], transfers: [{ source, destination: 1, amount: "1" }],
    }));
  }
  requests.push('{"balances":[],"transfers":[]}\0ignored');
  for (const request of requests) {
    assert.equal(JSON.parse(runBatchJson(request)).status, "invalid", request);
  }
});

test("the C boundary requires exactly one string without coercion", () => {
  for (const args of [[], [1], [null], [undefined], [{}], ["{}", "{}"]]) {
    assert.throws(() => Reflect.apply(runBatchJson, undefined, args), TypeError);
  }
});

function referenceBatch(initial: bigint[], payments: Transfer[]): BatchResult {
  const balances = [...initial];
  for (const [index, payment] of payments.entries()) {
    const { source, destination, amount } = payment;
    const reject = (reason: "invalidAccount" | "sameAccount" | "insufficientFunds"): BatchResult =>
      ({ status: "rejected", balances: initial, failedAt: index, reason });
    if (source >= balances.length || destination >= balances.length) return reject("invalidAccount");
    if (source === destination) return reject("sameAccount");
    if (balances[source] < amount) return reject("insufficientFunds");
    balances[source] -= amount;
    balances[destination] += amount;
  }
  return { status: "committed", balances };
}

test("6,561 small batches match an independent model and preserve their total", () => {
  const payments: Transfer[] = [];
  for (let source = 0; source <= 2; source++) {
    for (let destination = 0; destination <= 2; destination++) {
      for (let amount = 0n; amount <= 2n; amount++) payments.push({ source, destination, amount });
    }
  }
  for (let first = 0n; first <= 2n; first++) {
    for (let second = 0n; second <= 2n; second++) {
      const initial = [first, second];
      for (const one of payments) {
        for (const two of payments) {
          const batch = [one, two];
          const result = applyBatch(initial, batch);
          assert.deepEqual(result, referenceBatch(initial, batch));
          assert.equal(result.balances.reduce((total, balance) => total + balance, 0n), first + second);
          assert.equal(result.balances.length, initial.length);
        }
      }
    }
  }
});
