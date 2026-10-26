import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "bun:test";
import {
  caskFromReceipts,
  validateReceipt,
} from "../scripts/homebrew-cask.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function artifactFixture({ architecture, notarized = true, payload }) {
  const directory = mkdtempSync(path.join(tmpdir(), "somedue-cask-"));
  const filename = `Somedue-0.1.1-${architecture}.dmg`;
  const dmg = path.join(directory, filename);
  writeFileSync(dmg, payload);
  const receipt = path.join(directory, "build-receipt.json");
  writeFileSync(
    receipt,
    JSON.stringify({
      architecture,
      target:
        architecture === "arm64"
          ? "aarch64-apple-darwin"
          : "x86_64-apple-darwin",
      bundleId: "io.somedue.desktop",
      notarized,
      savedCloudCredentials: false,
      cloudAccess: false,
      signing: notarized ? "Developer ID" : "ad-hoc local build",
      dmg: { path: dmg, sha256: sha256(payload) },
    }),
  );
  return { dmg, payload, receipt };
}

test("validates a real DMG against its package receipt", () => {
  const fixture = artifactFixture({
    architecture: "arm64",
    payload: "arm-dmg",
  });
  assert.deepEqual(validateReceipt(fixture.receipt), {
    architecture: "arm64",
    filename: "Somedue-0.1.1-arm64.dmg",
    notarized: true,
    savedCloudCredentials: false,
    cloudAccess: false,
    sha256: sha256("arm-dmg"),
    signing: "Developer ID",
    version: "0.1.1",
  });
});

test("generates a Cask only after each published artifact matches its receipt", async () => {
  const arm = artifactFixture({ architecture: "arm64", payload: "arm-dmg" });
  const intel = artifactFixture({
    architecture: "x86_64",
    payload: "intel-dmg",
  });
  const responses = new Map([
    ["https://downloads.example.test/Somedue-0.1.1-arm64.dmg", arm.payload],
    ["https://downloads.example.test/Somedue-0.1.1-x86_64.dmg", intel.payload],
  ]);
  const cask = await caskFromReceipts(
    {
      armReceipt: arm.receipt,
      armUrl: "https://downloads.example.test/Somedue-0.1.1-arm64.dmg",
      intelReceipt: intel.receipt,
      intelUrl: "https://downloads.example.test/Somedue-0.1.1-x86_64.dmg",
    },
    {
      fetchImpl: async (url) => new Response(responses.get(url)),
    },
  );

  assert.match(cask, /on_arm do[\s\S]*sha256 "[a-f0-9]{64}"/);
  assert.match(cask, /on_intel do[\s\S]*sha256 "[a-f0-9]{64}"/);
  assert.match(cask, /Homebrew keeps quarantine enabled/);
  assert.doesNotMatch(cask, /no-quarantine|xattr/);
});

test("refuses a changed artifact at an otherwise valid release URL", async () => {
  const arm = artifactFixture({ architecture: "arm64", payload: "arm-dmg" });
  const intel = artifactFixture({
    architecture: "x86_64",
    payload: "intel-dmg",
  });

  await assert.rejects(
    caskFromReceipts(
      {
        armReceipt: arm.receipt,
        armUrl: "https://downloads.example.test/Somedue-0.1.1-arm64.dmg",
        intelReceipt: intel.receipt,
        intelUrl: "https://downloads.example.test/Somedue-0.1.1-x86_64.dmg",
      },
      { fetchImpl: async () => new Response("changed-after-receipt") },
    ),
    /does not match the verified receipt/,
  );
});

test("allows ad-hoc local-only previews in a maintainer tap and rejects changed bytes", async () => {
  const arm = artifactFixture({
    architecture: "arm64",
    notarized: false,
    payload: "arm-dmg",
  });
  const intel = artifactFixture({
    architecture: "x86_64",
    payload: "intel-dmg",
  });
  const cask = await caskFromReceipts(
    {
      armReceipt: arm.receipt,
      armUrl: "https://downloads.example.test/Somedue-0.1.1-arm64.dmg",
      intelReceipt: intel.receipt,
      intelUrl: "https://downloads.example.test/Somedue-0.1.1-x86_64.dmg",
    },
    {
      fetchImpl: async (url) =>
        new Response(url.includes("arm64") ? arm.payload : intel.payload),
    },
  );
  assert.match(cask, /ad-hoc signed and not notarized/);

  const receipt = JSON.parse(readFileSync(intel.receipt, "utf8"));
  receipt.dmg.sha256 = sha256("wrong");
  writeFileSync(intel.receipt, JSON.stringify(receipt));
  assert.throws(
    () => validateReceipt(intel.receipt),
    /checksum does not match/,
  );
});

test("refuses Cloud-enabled receipts before downloading a Cask artifact", async () => {
  const arm = artifactFixture({ architecture: "arm64", payload: "arm-dmg" });
  const intel = artifactFixture({
    architecture: "x86_64",
    payload: "intel-dmg",
  });
  const receipt = JSON.parse(readFileSync(arm.receipt, "utf8"));
  receipt.cloudAccess = true;
  writeFileSync(arm.receipt, JSON.stringify(receipt));
  await assert.rejects(
    caskFromReceipts(
      {
        armReceipt: arm.receipt,
        armUrl: "https://downloads.example.test/Somedue-0.1.1-arm64.dmg",
        intelReceipt: intel.receipt,
        intelUrl: "https://downloads.example.test/Somedue-0.1.1-x86_64.dmg",
      },
      {
        fetchImpl: async () => {
          throw new Error("must not fetch");
        },
      },
    ),
    /not a verified local-only build/,
  );
});
