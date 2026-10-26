# macOS release rehearsal and Cask preparation

## Current boundary

The repository can build architecture-specific ad-hoc preview DMGs, but those
artifacts are not a public release channel. They are not notarized and cannot
save Things Cloud credentials. Do not publish them, add them to a tap, or claim
that they install without a Gatekeeper warning.

Homebrew applies macOS quarantine attributes to Cask downloads so Gatekeeper can
assess them; it does not remove quarantine for users. Homebrew requires
Gatekeeper-assessable Cask artifacts to pass without disabling or bypassing
Gatekeeper or System Integrity Protection. See [Homebrew Security and Supply
Chain](https://docs.brew.sh/Homebrew-Security-and-Supply-Chain#casks-have-a-different-trust-model)
and [Acceptable Casks](https://docs.brew.sh/Acceptable-Casks#platform-compatibility-and-macos-security-protections).

This repository deliberately contains no `xattr` removal, `--no-quarantine`,
Gatekeeper bypass, artifact-upload, release, or tap-publishing automation.

## Native release runners

The workflow uses named standard GitHub-hosted runners rather than
`macos-latest`:

| Artifact      | Runner           | Rust target            |
| ------------- | ---------------- | ---------------------- |
| Apple Silicon | `macos-15`       | `aarch64-apple-darwin` |
| Intel         | `macos-15-intel` | `x86_64-apple-darwin`  |

GitHub currently documents those labels as the arm64 and Intel standard macOS
runners for public and private repositories. See the [GitHub-hosted runner
reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

`.github/workflows/macos-release.yml` only runs on a maintainer's manual
dispatch or a tag. `rehearsal-*` tags exist solely to run the hosted dress
rehearsal before the workflow reaches the default branch; `v*` tags use the
same nonpublishing checks. It has read-only contents permission, pins every
action to a full commit SHA, isolates caches by runner architecture and
lockfile hashes, has a 30-minute job cap, and never uploads binaries or writes
to GitHub.

## Local-first checklist

Run this before any hosted rehearsal:

```sh
bun install --frozen-lockfile
bun run build
bun test tests/macos-package.test.mjs tests/macos-lipo.test.mjs tests/homebrew-cask.test.mjs tests/macos-release-workflow.test.mjs
bun run package:macos
bun scripts/homebrew-cask.mjs \
  --check-receipt out/macos/ad-hoc/arm64/build-receipt.json \
  --check-receipt out/macos/ad-hoc/x86_64/build-receipt.json
```

The last command recomputes each local DMG SHA-256 and compares it with its
receipt. It does not create a Cask and does not alter quarantine attributes.

For the hosted dress rehearsal, manually dispatch the workflow after the local
checks pass. Before the workflow is on the default branch, push one uniquely
named `rehearsal-*` tag instead; do not use a release-looking `v*` tag. Inspect
both native job logs and confirm that no artifact, release, or Cloud-enabled
binary was published. A tag follows the same nonpublishing path; publishing
remains a separately authorized release decision.

## Cask generation after an eligible release

Do not use an ad-hoc receipt to generate a future Cask: a later CI build may
have different bytes. After a separately authorized, Developer ID-signed,
notarized, Cloud-credential-disabled release has immutable public URLs, generate
the Cask from the exact uploaded bytes:

```sh
bun scripts/homebrew-cask.mjs \
  --arm-receipt out/macos/release/arm64/build-receipt.json \
  --arm-url https://github.com/Heartkemy/somedue/releases/download/v0.1.1/Somedue-0.1.1-arm64.dmg \
  --intel-receipt out/macos/release/x86_64/build-receipt.json \
  --intel-url https://github.com/Heartkemy/somedue/releases/download/v0.1.1/Somedue-0.1.1-x86_64.dmg \
  --output out/macos/cask/Casks/somedue.rb
```

The generator first verifies the local receipt and DMG, then downloads each
HTTPS URL and requires its SHA-256 to match before writing the architecture-aware
Cask. It refuses non-notarized or Cloud-credential-enabled artifacts. This
prevents placeholder checksums and prevents a Cask from silently referring to
different bytes.

Only after that gate, test the Cask in a local checkout of a maintainer-owned
tap (not `homebrew/cask`): run `brew audit --cask --strict`, install it normally
with `brew install --cask OWNER/tap/somedue`, and verify the upgrade path with
`brew upgrade --cask OWNER/tap/somedue`. Test on clean supported Intel and Apple
Silicon Macs, including the normal Gatekeeper assessment. Official Homebrew Cask
submission is a later review decision, not an automated consequence of this
preparation.
