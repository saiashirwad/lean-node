# Lean + Node

A small inventory example where TypeScript handles I/O and an N-API addon calls Lean 4 compiled to native code.
`fulfill(stock, requested)` returns the number of items shipped, with both inputs restricted to unsigned 32-bit integers.
Lean proves that this exported function never oversells, never exceeds the request, and fills the whole request when stock is sufficient; proofs are checked at build time, while the native bridge remains trusted.
Use Node.js 24+, TypeScript 7, [elan](https://github.com/leanprover/elan), and a C toolchain on macOS or Linux, with Lean sources in `lean/`.
Run `npm ci`, `npm test`, then `npm start` to build, check the proofs and types, test the native boundary, and run the example directly from `.ts` files.
