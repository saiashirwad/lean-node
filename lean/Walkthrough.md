# Proving an atomic transfer ledger

Start with `Ledger.lean`; it contains the rules and all their proofs.
`Native.lean` handles JSON, and `src/ledger.ts` exposes the result to Node.
The ledger has no hidden state: each call takes balances and payments, then returns a new result.

Run the example from the project root:

```sh
npm ci
npm test
npm run example:ledger
```

The first batch commits `[50n, 20n, 30n]`.
The second rejects its second payment and returns the original `[100n, 0n, 0n]`.
The last transfers an amount of `10^40` without losing a digit.

## Why this deserves a proof

A transfer looks like two assignments, but small mistakes can create or destroy money.

Suppose an account holds 10 units and tries to send 15.
Lean's natural-number subtraction gives `10 - 15 = 0`, not a negative value.
Without a funds check, the recipient still gains 15: five units appeared from nowhere.
Choosing a nonnegative number type did not prevent an overdraft.

Self-transfers cause a different bug.
If both updates use the original balance, debiting and then crediting the same account can overwrite the debit.
An account with 100 units that sends itself 50 can end with 150.
This example rejects self-transfers instead of giving them special arithmetic.

An invalid destination can also lose money: `List.set` leaves an out-of-range index unchanged.
A debit followed by a silently ignored credit destroys the payment.
Both accounts must exist before either update happens.

Finally, a batch can fail after several valid transfers.
Returning the partially updated ledger would break the all-or-nothing promise.
The public result must contain either the complete successful ledger or the original balances.

## Read the data types first

`Balances` is `List Nat`: position 0 is account 0, position 1 is account 1, and so on.
`Transfer` names the source, destination, and amount.
The model uses integer amounts in the smallest currency unit, such as cents, rather than floating-point money.

Lean `Nat` has arbitrary precision; TypeScript uses `bigint` for the same reason.
The native wire format represents amounts as decimal strings.
Account indices are ordinary nonnegative integers, not monetary amounts.

`Except TransferError Balances` has two cases: a new ledger or an error.
There is no success flag with an optional error that can disagree with it.
`BatchResult` similarly distinguishes `committed` from `rejected`.
The rejected case includes the original balances and the zero-based index of the first failing payment.

I chose a list over a vector indexed by `Fin`: a list keeps the account checks and update proofs visible without adding dependent types to the request parser.
There are no databases, locks, or mutable balance fields to keep in mind.

## Step 1: turn success into useful facts

Read `transfer`, then `transfer_success`.

`transfer` checks account bounds, distinct participants, and available funds, in that order.
The named proof `bounds` lets Lean accept expressions such as `balances[payment.source]`.
These reads are checked accesses, not default values or unchecked indexing.

`transfer_success` says that a successful return implies all those checks passed, and that the returned ledger is exactly the debit followed by the credit.
Its proof unfolds the function and splits its branches.
An error branch cannot equal `.ok after`, so `contradiction` closes it.
The successful branch supplies the facts directly.

This is the only proof that needs to work through the validation branches.
The other proofs use its result rather than repeating that analysis.
`transfer_succeeds` proves the converse direction: valid, distinct, funded transfers really do succeed.
The safety claims therefore do not depend on an implementation that rejects every payment.

## Step 2: account for one list update

`sum_set` is the main arithmetic lemma:

```text
sum(updated balances) + old balance = sum(original balances) + new balance
```

Adding the old balance to both sides avoids another natural-number subtraction.
This form works whether the replacement raises or lowers the balance.

The proof uses induction on the balance list.
An empty list cannot contain the account, so that case contradicts the bounds proof.
Replacing the head reduces to rearranging addition.
Replacing a later account leaves the head unchanged and uses the induction hypothesis on the tail.

`generalizing account` matters: moving to the tail changes the account index.
Without generalization, the induction hypothesis would be tied to the original index.

## Step 3: prove one transfer conserves money

Read `transfer_conserves_money` slowly.
The proof names the two applications of `sum_set` as `debit` and `credit`.

Let the original source and destination balances be `s` and `d`, and the amount be `a`.
Those two facts describe:

```text
sum(after debit) + s = sum(before) + (s - a)
sum(after credit) + d = sum(after debit) + (d + a)
```

`List.getElem_set_ne distinct` establishes that debiting the source did not change the destination's old balance.
This is exactly where distinct participants matter.
The fact `funded` establishes `a ≤ s`, so subtracting `a` cannot truncate the debit.

Only then does `omega` finish the arithmetic.
`omega` handles integer and natural-number arithmetic and constructs a proof that Lean's kernel checks.
It is not testing sample balances or being asked to infer the whole program's behavior.

The `rfl` pattern in `obtain` replaces the name `after` with the actual update expression.
It saves a separate rewrite without hiding a new assumption.

## Step 4: prove more than the total

Conservation alone is too weak: swapping unrelated accounts could preserve the total and still be wrong.

The other single-transfer theorems establish:

- `transfer_debits_exactly`: the new source balance plus the amount equals the old source balance.
- `transfer_credits_exactly`: the destination gains exactly the amount.
- `transfer_changes_only_participants`: every other account is unchanged.
- `transfer_preserves_accounts`: the number of accounts is unchanged.

The notation `balances[account]?` returns an `Option Nat`.
It is `some balance` for an existing account and `none` otherwise.
Mapping addition over that option states the debit and credit equalities without requiring a separate bounds argument from every theorem's caller.

Nonnegative balances follow from `Nat` itself.
The stronger debit equality rules out silently clamping an overdraft to zero.

## Step 5: lift the proof to any batch length

`execute` processes payments in order.
A later payment can spend funds received earlier in the same batch.
The first failure stops execution and records its index.

`execute_conserves_money` uses induction on the payment list.
The empty batch changes nothing.
An error in the first payment contradicts the assumption that the whole execution succeeded.
In the successful case, the proof joins two equalities:

```text
sum(final) = sum(intermediate)   by the induction hypothesis
sum(intermediate) = sum(initial)   by the single-transfer theorem
```

`.trans` joins them.
`generalizing balances index` lets the induction hypothesis apply to the new ledger and the next payment index.
The theorem covers every finite batch, not just the batches in the tests.

`execute_preserves_accounts` uses the same argument for account count.

## Step 6: make rejection atomic by construction

`applyBatch` is the public boundary.
If execution succeeds, it returns the final ledger.
If execution fails, it returns the original input balances, not an intermediate ledger.

`rejected_batch_is_unchanged` proves this exact equality, not just equality of totals.
There is no imperative undo routine to verify because the function never changes the input state.
`batch_conserves_money` and `batch_preserves_accounts` cover both public outcomes.

The three `example` declarations at the bottom show a commit, a late rejection, and a self-transfer rejection.
`by decide` checks these concrete statements during compilation.
They help you understand the rules, but the general theorems above them provide the guarantees.

## Check that the proofs reject broken code

`test/proofs.test.ts` makes temporary copies of `Ledger.lean` with four intentional defects:

- Create an extra unit during the credit.
- Allow an unfunded debit.
- Allow the source and destination to alias.
- Change balances when rejecting a batch.

Each copy must fail proof checking.
The original must compile first, so a missing toolchain cannot make these tests pass by accident.
The test removes its copies afterward and never edits the real source.

`test/ledger.test.ts` also runs 6,561 two-payment batches against a separate TypeScript model through the actual native addon.
Those tests exercise parsing, serialization, and the C bridge, including amounts larger than machine integers.
Tests check that integration; they do not turn the bridge into a formally verified component.

## What is outside the proof

These are proofs about the pure Lean ledger, not a complete banking system.
They do not establish authorization, currency conversion, crash recovery, idempotency, or safe concurrent database writes.
Two callers could still start from the same stale snapshot unless a persistence layer prevents that.
The parser, decimal-string conversion, C bridge, compiler, and runtime remain part of the trusted path.
`src/native.ts` restricts the supported TypeScript entry points to Node's main thread before loading the addon.
Lean's generated module initialization uses shared mutable flags; this example does not establish safe initialization from Worker Threads.
Loading the `.node` file directly from a worker is unsupported.
Arbitrary precision prevents numeric overflow, not exhaustion of memory or execution time.

## Two exercises

First, prove that `applyBatch balances [] = .committed balances`.
The definitions contain everything you need.

Then prove that a payment to an invalid destination returns `.error .invalidAccount`, regardless of its amount.
Pay attention to the order of validation rather than adding more arithmetic tactics.
