# macOS previews and the maintainer tap

Alpha 1 is a local-only preview, signed ad-hoc and not notarized. It cannot
connect to Things Cloud or save its credentials. Source development builds keep
the experimental Cloud integration; certificate-signed source builds retain the
existing Keychain boundary.

## Build and verify locally

```sh
bun install --frozen-lockfile
bun run build
bun test tests
bun run test:native
bun run package:macos
bun scripts/homebrew-cask.mjs \
  --check-receipt out/macos/ad-hoc/arm64/build-receipt.json \
  --check-receipt out/macos/ad-hoc/x86_64/build-receipt.json
```

Each architecture gets a thin app, a DMG, bundled third-party notices, and a
receipt under `out/macos/ad-hoc/`. Packaging verifies signatures, architecture,
notices and mounted-image contents. On the native host it also runs synthetic
checks proving that both Keychain storage and Cloud access are refused. Receipts
record source commits and checksums; DMG paths are relative so receipts travel
with their files. Cross-build inspection is not native Intel or oldest-OS testing.

## Hosted packages

The macOS workflow builds on `macos-15` (Apple Silicon) and `macos-15-intel`
(Intel), with architecture-specific caches and pinned tools. Manual and
`rehearsal-*` runs validate without uploading. Version tags also retain per-arch
DMGs, receipts and notices as Actions artifacts for seven days. Those artifacts
are separate builds and may have different bytes from locally built packages.

Publish a prerelease only after the final source and exact intended files are
verified. Create it as a draft, upload both DMGs, notices and `SHA256SUMS`, verify
the asset set, then publish. Keep versioned assets immutable. The Alpha 1 tag is
`v0.1.1-alpha.1`; the app and Cask version is `0.1.1-alpha.1`.

## Maintainer-owned Homebrew Cask

After the exact released files have public URLs, generate a Cask from matching
receipts. The generator rechecks local and downloaded SHA-256 values and refuses
artifacts that can access Cloud or save credentials.

```sh
bun scripts/homebrew-cask.mjs \
  --arm-receipt out/macos/ad-hoc/arm64/build-receipt.json \
  --arm-url https://github.com/Heartkemy/somedue/releases/download/v0.1.1-alpha.1/Somedue-0.1.1-alpha.1-arm64.dmg \
  --intel-receipt out/macos/ad-hoc/x86_64/build-receipt.json \
  --intel-url https://github.com/Heartkemy/somedue/releases/download/v0.1.1-alpha.1/Somedue-0.1.1-alpha.1-x86_64.dmg \
  --output out/macos/cask/Casks/somedue.rb
```

The Cask belongs to `Heartkemy/homebrew-somedue`, installed with
`brew install --cask heartkemy/somedue/somedue`. Verify normal downloaded
installation and the upgrade transaction in a temporary app directory before
publishing the tap. Retain quarantine and report the tested architectures and
OS versions accurately.

An ad-hoc preview is not eligible for the official `homebrew/cask` repository.
A personal tap does not make it notarized or warning-free: Homebrew keeps
quarantine enabled and macOS may block opening it. See [Homebrew's security
documentation](https://docs.brew.sh/Homebrew-Security-and-Supply-Chain) and
[Apple's guidance](https://support.apple.com/en-us/102445). This project does not
remove quarantine, disable Gatekeeper, or buy signing services automatically.
