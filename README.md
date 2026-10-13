# Lean + Node

TypeScript handles input and output, and an N-API addon calls Lean 4 compiled to native code.
The examples cover inventory fulfillment and atomic money transfers, with the ledger explained in [lean/Walkthrough.md](lean/Walkthrough.md).
Lean checks the proofs at build time, not runtime, and the C bridge remains outside those proofs.
Use Node.js 24+, TypeScript 7, [elan](https://github.com/leanprover/elan), and a C toolchain on macOS or Linux.
Run `npm ci` and `npm test`, then `npm start` for inventory or `npm run example:ledger` for transfers.
