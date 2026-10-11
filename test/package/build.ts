// @env node
import { build } from "tsdown";

/** Builds the package, so the tests check the files that would be published. */
export default async function setup(): Promise<void> {
  await build({ logLevel: "warn" });
}
