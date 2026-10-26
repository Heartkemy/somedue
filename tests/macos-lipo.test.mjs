import assert from "node:assert/strict";
import { test } from "bun:test";
import { verifyArchitectureArgs } from "../scripts/macos-lipo.mjs";

test("lipo receives its input before the verification command", () => {
  assert.deepEqual(verifyArchitectureArgs("/tmp/Somedue", "arm64"), [
    "/tmp/Somedue",
    "-verify_arch",
    "arm64",
  ]);
});
