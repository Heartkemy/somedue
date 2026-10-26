import assert from "node:assert/strict";
import { test } from "bun:test";
import { packagePlan } from "../scripts/macos-package.mjs";

const options = {
  hostArchitecture: "arm64",
  cargoTarget: "/tmp/cargo-target",
  outputRoot: "/tmp/out/macos",
};

test("dual-DMG packaging isolates every architecture and build command", () => {
  const plan = packagePlan(["--all-targets", "--dmg"], options);
  assert.equal(plan.dmg, true);
  assert.deepEqual(
    plan.targets.map((target) => [
      target.triple,
      target.arch,
      target.app,
      target.artifactApp,
      target.receipt,
    ]),
    [
      [
        "aarch64-apple-darwin",
        "arm64",
        "/tmp/cargo-target/aarch64-apple-darwin/release/bundle/macos/Somedue.app",
        "/tmp/out/macos/ad-hoc/arm64/Somedue.app",
        "/tmp/out/macos/ad-hoc/arm64/build-receipt.json",
      ],
      [
        "x86_64-apple-darwin",
        "x86_64",
        "/tmp/cargo-target/x86_64-apple-darwin/release/bundle/macos/Somedue.app",
        "/tmp/out/macos/ad-hoc/x86_64/Somedue.app",
        "/tmp/out/macos/ad-hoc/x86_64/build-receipt.json",
      ],
    ],
  );
  for (const target of plan.targets) {
    assert.deepEqual(target.buildArgs, [
      "run",
      "tauri",
      "build",
      "--target",
      target.triple,
      "--bundles",
      "app",
      "--no-sign",
    ]);
  }
});

test("macOS package options reject unsafe or ambiguous targets before builds run", () => {
  for (const args of [
    ["--target"],
    ["--target", "universal-apple-darwin"],
    ["--all-targets", "--target", "aarch64-apple-darwin"],
    ["--install", "--all-targets"],
    ["--install", "--dmg"],
    ["--install", "--target", "x86_64-apple-darwin"],
    ["--unknown"],
  ]) {
    assert.throws(() => packagePlan(args, options));
  }
});
