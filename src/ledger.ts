import { runBatchJson } from "./native.ts";

export type Transfer = {
  source: number;
  destination: number;
  amount: bigint;
};

export type FailureReason = "invalidAccount" | "sameAccount" | "insufficientFunds";

export type BatchResult =
  | { status: "committed"; balances: bigint[] }
  | { status: "rejected"; balances: bigint[]; failedAt: number; reason: FailureReason };

function isAccountIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function amountString(amount: bigint): string {
  if (typeof amount !== "bigint") throw new TypeError("Amounts must be bigint values.");
  if (amount < 0n) throw new RangeError("Amounts must be nonnegative.");
  return amount.toString();
}

function parseBalances(value: unknown): bigint[] {
  if (!Array.isArray(value)) throw new Error("Invalid balances from Lean.");
  return value.map((amount: unknown) => {
    if (typeof amount !== "string" || !/^(0|[1-9]\d*)$/.test(amount)) {
      throw new Error("Invalid amount from Lean.");
    }
    return BigInt(amount);
  });
}

function parseResult(json: string): BatchResult {
  const result: unknown = JSON.parse(json);
  if (typeof result !== "object" || result === null || !("status" in result)) {
    throw new Error("Invalid result from Lean.");
  }
  if (result.status === "invalid" && "message" in result && typeof result.message === "string") {
    throw new TypeError(result.message);
  }
  if (!("balances" in result)) throw new Error("Missing balances from Lean.");
  const balances = parseBalances(result.balances);
  if (result.status === "committed") return { status: "committed", balances };
  if (result.status === "rejected" && "failedAt" in result && isAccountIndex(result.failedAt) &&
      "reason" in result && (result.reason === "invalidAccount" ||
        result.reason === "sameAccount" || result.reason === "insufficientFunds")) {
    return { status: "rejected", balances, failedAt: result.failedAt, reason: result.reason };
  }
  throw new Error("Invalid result from Lean.");
}

export function applyBatch(balances: readonly bigint[], transfers: readonly Transfer[]): BatchResult {
  const input = JSON.stringify({
    balances: balances.map(amountString),
    transfers: transfers.map(({ source, destination, amount }) => {
      if (!isAccountIndex(source) || !isAccountIndex(destination)) {
        throw new RangeError("Account indices must be nonnegative safe integers.");
      }
      return { source, destination, amount: amountString(amount) };
    }),
  });
  return parseResult(runBatchJson(input));
}
