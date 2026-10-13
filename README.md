# Lean + Node

TypeScript handles input and output, and an N-API addon calls native code compiled from `lean/Inventory.lean`.
`fulfill(stock, requested)` returns the smaller of two unsigned 32-bit quantities, so an order ships in full unless stock runs out.
Lean checks the inventory proofs at build time, not runtime, and the C bridge remains outside those proofs.
Use Node.js 24+, TypeScript 7, [elan](https://github.com/leanprover/elan), and a C toolchain on macOS or Linux.
Run `npm ci` to install dependencies, `npm test` to build and test, and `npm start` to run the `.ts` example.
