import assert from "node:assert/strict";
import { test } from "node:test";
import { fulfill } from "../src/native.ts";

test("fulfills available stock without overselling", () => {
  assert.equal(fulfill(10, 7), 7);
  assert.equal(fulfill(10, 15), 10);
  assert.equal(fulfill(10, 10), 10);
  assert.equal(fulfill(0, 7), 0);
  assert.equal(fulfill(10, 0), 0);
});

test("preserves the full UInt32 range", () => {
  const max = 0xffff_ffff;
  assert.equal(fulfill(max, max), max);
  assert.equal(fulfill(max, max - 1), max - 1);
  assert.equal(fulfill(max - 1, max), max - 1);
});

test("rejects numbers outside the Lean input domain", () => {
  for (const invalid of [-1, 0.5, NaN, Infinity, -Infinity, 2 ** 32]) {
    assert.throws(() => fulfill(invalid, 1), RangeError);
    assert.throws(() => fulfill(1, invalid), RangeError);
  }
});

test("rejects non-numeric JavaScript inputs without coercion", () => {
  for (const invalid of ["1", 1n, null, undefined, true, {}, [], Symbol("quantity")]) {
    assert.throws(() => Reflect.apply(fulfill, undefined, [invalid, 1]), TypeError);
    assert.throws(() => Reflect.apply(fulfill, undefined, [1, invalid]), TypeError);
  }
});

test("requires exactly two arguments", () => {
  for (const args of [[], [1], [1, 2, 3], [1, 2, 3, 4]]) {
    assert.throws(() => Reflect.apply(fulfill, undefined, args), TypeError);
  }
});

test("matches the specification across a small input grid", () => {
  for (let stock = 0; stock <= 100; stock++) {
    for (let requested = 0; requested <= 100; requested++) {
      const fulfilled = fulfill(stock, requested);
      assert.equal(fulfilled, Math.min(stock, requested));
      assert.ok(fulfilled <= stock);
      assert.ok(fulfilled <= requested);
    }
  }
});
