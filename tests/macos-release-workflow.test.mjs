import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";

const workflow = readFileSync(
  new URL("../.github/workflows/macos-release.yml", import.meta.url),
  "utf8",
);

test("macOS packaging is native, pinned, and retains artifacts only for version tags", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /- "v\*"/);
  assert.match(workflow, /- "rehearsal-\*"/);
  assert.match(
    workflow,
    /runner: macos-15\n[\s\S]*target: aarch64-apple-darwin/,
  );
  assert.match(
    workflow,
    /runner: macos-15-intel\n[\s\S]*target: x86_64-apple-darwin/,
  );
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /uses: actions\/checkout@[a-f0-9]{40}[\s\S]*persist-credentials: false/,
  );
  assert.match(workflow, /uses: oven-sh\/setup-bun@[a-f0-9]{40}/);
  assert.match(workflow, /uses: actions\/cache@[a-f0-9]{40}/);
  assert.match(workflow, /macos-lipo\.test\.mjs/);
  assert.match(workflow, /SOMEDUE_CODESIGN_IDENTITY=-/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.doesNotMatch(
    workflow,
    /^\s*-\s+(?:uses|run):.*(?:create-release|gh release|no-quarantine|xattr)/m,
  );
  assert.match(
    workflow,
    /if: startsWith\(github.ref, 'refs\/tags\/v'\)\n\s+uses: actions\/upload-artifact@[a-f0-9]{40}/,
  );
});
