import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const { fulfill } = require("../build/inventory.node") as {
  fulfill(stock: number, requested: number): number;
};
