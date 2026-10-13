import { applyBatch } from "./ledger.ts";

const balances = [100n, 0n, 0n];

console.log("Committed:", applyBatch(balances, [
  { source: 0, destination: 1, amount: 50n },
  { source: 1, destination: 2, amount: 30n },
]));

console.log("Rolled back:", applyBatch(balances, [
  { source: 0, destination: 1, amount: 50n },
  { source: 1, destination: 2, amount: 60n },
]));

const large = 10n ** 40n;
console.log("Exact large amounts:", applyBatch([large, 1n], [
  { source: 0, destination: 1, amount: large },
]));
