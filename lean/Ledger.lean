import Init

namespace Ledger

abbrev Balances := List Nat

structure Transfer where
  source : Nat
  destination : Nat
  amount : Nat
  deriving Repr, DecidableEq

inductive TransferError where
  | invalidAccount
  | sameAccount
  | insufficientFunds
  deriving Repr, DecidableEq

def transfer (balances : Balances) (payment : Transfer) : Except TransferError Balances :=
  if bounds : payment.source < balances.length ∧ payment.destination < balances.length then
    if payment.source = payment.destination then
      .error .sameAccount
    else if payment.amount ≤ balances[payment.source] then
      .ok ((balances.set payment.source (balances[payment.source] - payment.amount)).set
        payment.destination (balances[payment.destination] + payment.amount))
    else
      .error .insufficientFunds
  else
    .error .invalidAccount

theorem transfer_success (balances after : Balances) (payment : Transfer)
    (success : transfer balances payment = .ok after) :
    ∃ (sourceExists : payment.source < balances.length)
      (destinationExists : payment.destination < balances.length),
      payment.source ≠ payment.destination ∧
      payment.amount ≤ balances[payment.source] ∧
      after = (balances.set payment.source (balances[payment.source] - payment.amount)).set
        payment.destination (balances[payment.destination] + payment.amount) := by
  unfold transfer at success
  split at success
  next bounds =>
    split at success
    next same => contradiction
    next distinct =>
      split at success
      next funded => exact ⟨bounds.1, bounds.2, distinct, funded, (Except.ok.inj success).symm⟩
      next unfunded => contradiction
  next missing => contradiction

theorem sum_set (balances : Balances) (account value : Nat)
    (accountExists : account < balances.length) :
    (balances.set account value).sum + balances[account] = balances.sum + value := by
  induction balances generalizing account with
  | nil => simp at accountExists
  | cons balance rest inductionHypothesis =>
    cases account with
    | zero => simp [Nat.add_comm, Nat.add_left_comm]
    | succ account =>
      have tailExists : account < rest.length := by simpa using accountExists
      have tailSum := inductionHypothesis account tailExists
      simp only [List.set_cons_succ, List.sum_cons, List.getElem_cons_succ]
      omega

theorem transfer_conserves_money (balances after : Balances) (payment : Transfer)
    (success : transfer balances payment = .ok after) :
    after.sum = balances.sum := by
  obtain ⟨sourceExists, destinationExists, distinct, funded, rfl⟩ :=
    transfer_success balances after payment success
  have debit := sum_set balances payment.source
    (balances[payment.source] - payment.amount) sourceExists
  have credit := sum_set
    (balances.set payment.source (balances[payment.source] - payment.amount))
    payment.destination (balances[payment.destination] + payment.amount)
    (by simpa using destinationExists)
  rw [List.getElem_set_ne distinct] at credit
  omega

theorem transfer_preserves_accounts (balances after : Balances) (payment : Transfer)
    (success : transfer balances payment = .ok after) :
    after.length = balances.length := by
  obtain ⟨_, _, _, _, rfl⟩ := transfer_success balances after payment success
  simp

theorem transfer_changes_only_participants (balances after : Balances) (payment : Transfer)
    (success : transfer balances payment = .ok after) (account : Nat)
    (notSource : payment.source ≠ account) (notDestination : payment.destination ≠ account) :
    after[account]? = balances[account]? := by
  obtain ⟨_, _, _, _, rfl⟩ := transfer_success balances after payment success
  simp [List.getElem?_set_ne, notSource, notDestination]

theorem transfer_debits_exactly (balances after : Balances) (payment : Transfer)
    (success : transfer balances payment = .ok after) :
    after[payment.source]?.map (· + payment.amount) = balances[payment.source]? := by
  obtain ⟨sourceExists, _, distinct, funded, rfl⟩ :=
    transfer_success balances after payment success
  simp only [List.getElem?_set_ne (Ne.symm distinct), List.getElem?_set_self sourceExists,
    Option.map_some, List.getElem?_eq_getElem sourceExists]
  congr 1
  omega

theorem transfer_credits_exactly (balances after : Balances) (payment : Transfer)
    (success : transfer balances payment = .ok after) :
    after[payment.destination]? = balances[payment.destination]?.map (· + payment.amount) := by
  obtain ⟨sourceExists, destinationExists, _, _, rfl⟩ :=
    transfer_success balances after payment success
  have destinationStillExists : payment.destination <
      (balances.set payment.source (balances[payment.source] - payment.amount)).length := by
    simpa using destinationExists
  simp only [List.getElem?_set_self destinationStillExists,
    List.getElem?_eq_getElem destinationExists, Option.map_some]

theorem transfer_succeeds (balances : Balances) (payment : Transfer)
    (sourceExists : payment.source < balances.length)
    (destinationExists : payment.destination < balances.length)
    (distinct : payment.source ≠ payment.destination)
    (funded : payment.amount ≤ balances[payment.source]) :
    transfer balances payment = .ok
      ((balances.set payment.source (balances[payment.source] - payment.amount)).set
        payment.destination (balances[payment.destination] + payment.amount)) := by
  simp [transfer, sourceExists, destinationExists, distinct, funded]

structure Failure where
  index : Nat
  reason : TransferError
  deriving Repr, DecidableEq

def execute (balances : Balances) (payments : List Transfer) (index : Nat) :
    Except Failure Balances :=
  match payments with
  | [] => .ok balances
  | payment :: rest =>
    match transfer balances payment with
    | .error reason => .error ⟨index, reason⟩
    | .ok after => execute after rest (index + 1)

theorem execute_conserves_money (balances after : Balances) (payments : List Transfer)
    (index : Nat) (success : execute balances payments index = .ok after) :
    after.sum = balances.sum := by
  induction payments generalizing balances index with
  | nil =>
    cases Except.ok.inj success
    rfl
  | cons payment rest inductionHypothesis =>
    simp only [execute] at success
    cases first : transfer balances payment with
    | error reason => simp [first] at success
    | ok intermediate =>
      rw [first] at success
      exact (inductionHypothesis intermediate (index + 1) success).trans
        (transfer_conserves_money balances intermediate payment first)

theorem execute_preserves_accounts (balances after : Balances) (payments : List Transfer)
    (index : Nat) (success : execute balances payments index = .ok after) :
    after.length = balances.length := by
  induction payments generalizing balances index with
  | nil =>
    cases Except.ok.inj success
    rfl
  | cons payment rest inductionHypothesis =>
    simp only [execute] at success
    cases first : transfer balances payment with
    | error reason => simp [first] at success
    | ok intermediate =>
      rw [first] at success
      exact (inductionHypothesis intermediate (index + 1) success).trans
        (transfer_preserves_accounts balances intermediate payment first)

inductive BatchResult where
  | committed (balances : Balances)
  | rejected (balances : Balances) (failure : Failure)
  deriving Repr, DecidableEq

def BatchResult.balances : BatchResult → Balances
  | .committed balances => balances
  | .rejected balances _ => balances

def applyBatch (balances : Balances) (payments : List Transfer) : BatchResult :=
  match execute balances payments 0 with
  | .ok after => .committed after
  | .error failure => .rejected balances failure

theorem batch_conserves_money (balances : Balances) (payments : List Transfer) :
    (applyBatch balances payments).balances.sum = balances.sum := by
  unfold applyBatch
  cases outcome : execute balances payments 0 with
  | error failure => rfl
  | ok after => exact execute_conserves_money balances after payments 0 outcome

theorem batch_preserves_accounts (balances : Balances) (payments : List Transfer) :
    (applyBatch balances payments).balances.length = balances.length := by
  unfold applyBatch
  cases outcome : execute balances payments 0 with
  | error failure => rfl
  | ok after => exact execute_preserves_accounts balances after payments 0 outcome

theorem rejected_batch_is_unchanged (balances returned : Balances) (payments : List Transfer)
    (failure : Failure) (rejected : applyBatch balances payments = .rejected returned failure) :
    returned = balances := by
  unfold applyBatch at rejected
  split at rejected
  next success => contradiction
  next failed => exact (BatchResult.rejected.inj rejected).1.symm

example : applyBatch [100, 0, 0] [⟨0, 1, 50⟩, ⟨1, 2, 30⟩] = .committed [50, 20, 30] := by
  decide

example : applyBatch [100, 0, 0] [⟨0, 1, 50⟩, ⟨1, 2, 60⟩] =
    .rejected [100, 0, 0] ⟨1, .insufficientFunds⟩ := by
  decide

example : applyBatch [100, 0] [⟨0, 0, 50⟩] = .rejected [100, 0] ⟨0, .sameAccount⟩ := by
  decide

end Ledger
