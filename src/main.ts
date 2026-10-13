import { fulfill } from "./native.ts";

for (const requested of [7, 15]) {
  const stock = 10;
  console.log({ stock, requested, fulfilled: fulfill(stock, requested) });
}
