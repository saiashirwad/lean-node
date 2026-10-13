import Inventory
import Ledger
import Lean

namespace Ledger.Native

open Lean

def parseAmount (json : Json) : Except String Nat := do
  let text ← json.getStr?
  match text.toNat? with
  | some amount => return amount
  | none => throw "Amounts must be decimal strings representing nonnegative integers."

def parseTransfer (json : Json) : Except String Transfer := do
  let source ← (← json.getObjVal? "source").getNat?
  let destination ← (← json.getObjVal? "destination").getNat?
  let amount ← parseAmount (← json.getObjVal? "amount")
  return ⟨source, destination, amount⟩

def parseRequest (input : String) : Except String (Balances × List Transfer) := do
  let json ← Json.parse input
  let balances ← (← (← json.getObjVal? "balances").getArr?).toList.mapM parseAmount
  let payments ← (← (← json.getObjVal? "transfers").getArr?).toList.mapM parseTransfer
  return (balances, payments)

def errorName : TransferError → String
  | .invalidAccount => "invalidAccount"
  | .sameAccount => "sameAccount"
  | .insufficientFunds => "insufficientFunds"

def balancesJson (balances : Balances) : Json :=
  toJson (balances.map toString)

def resultJson : BatchResult → Json
  | .committed balances => Json.mkObj [
      ("status", toJson "committed"),
      ("balances", balancesJson balances)]
  | .rejected balances failure => Json.mkObj [
      ("status", toJson "rejected"),
      ("balances", balancesJson balances),
      ("failedAt", toJson failure.index),
      ("reason", toJson (errorName failure.reason))]

@[export lean_run_batch_json]
def runBatchJson (input : String) : String :=
  match parseRequest input with
  | .error message =>
    (Json.mkObj [("status", toJson "invalid"), ("message", toJson message)]).compress
  | .ok (balances, payments) =>
    (resultJson (applyBatch balances payments)).compress

end Ledger.Native
