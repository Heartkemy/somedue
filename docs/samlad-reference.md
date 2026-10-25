# Samlad reference findings

Read-only source inspection on 2026-10-23. Reference: `/Users/notme/code/samlad-main`.
Applicable `AGENTS.md` was read. Its Samlad workspace administration applies only to
its closest registered ancestor; this implementation resides outside that root.
No reference files were changed.

## Design system

Source: `packages/ui/README.md` and `packages/ui/src/styles.css`.

| Token | Exact reference value |
| --- | --- |
| Background | `#191614` |
| Surface | `#262019` |
| Main ink | `#fff2df` |
| Inverse ink | `#241c14` |
| Muted / quiet | `#bab0a3` / `#958b7f` |
| Yellow / mint | `#ffc200` / `#00ffd0` |
| Orchid / orange | `#d400ff` / `#ff8000` |
| Danger ink | `#ff9d8b` |
| Separator | `#fff2df14` |
| Font UI | `'Space Grotesk', Arial, sans-serif` |
| Font display | `'Cormorant Garamond', Georgia, serif` |
| Font mono | `'JetBrains Mono', ui-monospace, monospace` |
| UI text | `calc(13.16px * var(--text-scale))` |
| Minimum text | `calc(12px * var(--text-scale))` |
| Leading / tracking | `1.5` / `-0.2px` |
| Radius small / regular / large | `7px` / `10px` / `20px` |
| Control height | `40px` |
| Focus ring | `0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-mint)` |
| Quick / settle motion | `130ms` / `260ms` |
| Motion curve | `cubic-bezier(.16,1,.3,1)` |

The desktop imports bundled Fontsource Space Grotesk 400/500/600/700,
Cormorant Garamond 400, and JetBrains Mono 400. Do not rely on remote font loading.
The UI catalog groups buttons, inputs, field layouts, settings groups, dialogs,
popovers, notifications and empty states into reusable components. Components
own semantics, keyboard behavior, base styling and reduced motion; pages own
application state and layout. Translate these patterns into Solid primitives,
not React components. Preserve Things' sidebar and inline expansion structure.

Buttons are borderless pills with 17px horizontal padding, 9px internal gap,
600 weight and 40px minimum height. Primary: cream background / inverse ink.
Secondary: `#fff2df07`, hover `#fff2df10`. Quiet: transparent with muted ink.
Inputs use `#1f1a15`, 10px radius, mint caret and visible focus. Dialogs use
surface fill and 20px radii, plus native focus containment and an accessible name.
SettingsGroup is the reference for related controls with a section heading.
Do not add framed cards or permanent detail sidebars in the name of this theme.

## Signing and Keychain

Inspected `scripts/macos-signing.mjs`, `scripts/keychain-helper.mjs`,
`scripts/native/keychain-helper.c`, `scripts/package-macos.mjs`,
`scripts/macos-signing.test.mjs`, and `docs/architecture.md` (Secret storage).

Samlad reads a certificate SHA-1 fingerprint from an environment override or
`~/Library/Application Support/Samlad/macos-signing-identity`. If no identity is
configured, it explicitly uses ad-hoc `-`. A configured unavailable fingerprint
fails rather than silently falling back. Certificates need not be globally
trusted to provide a local signing identity. Signing disables timestamping and
reports local signing separately from notarization.

Crucial: self-signed certificates do NOT stabilize modern Keychain partitions
across rebuilt executable bytes. Samlad therefore signs a tiny helper once,
caches the actual signed bytes by source hash + architecture + certificate,
and excludes that helper from subsequent re-signing. The helper validates its
parent's live code signature using the peer PID of an anonymous Unix socket
(`LOCAL_PEERPID`, parent PID, code identifier and pinned certificate). It never
returns key bytes through a terminal or shell pipe. It only creates or reads an
existing 32-byte vault key and never replaces it. The Rust engine uses that key
to encrypt secrets. Development/ad-hoc builds use native keyring APIs directly.

For this client the password itself is in Keychain, per the brief, under the
separate `io.somedue.desktop.things-cloud.v1` service. The production native
boundary follows Samlad's frozen helper model. The helper supports get/set/delete,
validates the caller identifier `io.somedue.desktop` and the pinned certificate,
and accepts values through stdin only. Responses travel through an anonymous Unix
socket whose peer must be its live signed parent. The caller verifies the helper's
pinned signature before handing over credentials. Failures expose only fixed
messages and OSStatus numbers. No shell, command argument, log, source or app
configuration contains user credentials. Development builds without a compile-time
signer use the native Security-framework API directly.

The package script reads the configured signing certificate fingerprint from
`~/Library/Application Support/Somedue/macos-signing-identity` or the
`SOMEDUE_CODESIGN_IDENTITY` override. `security find-identity -p codesigning`
lists available identities. The installed build uses a self-signed local
certificate, not Developer ID, and no notarization claim is made.

`bun scripts/keychain-test.mjs` builds synthetic callers and proves new/read/update/
restart behavior, a changed re-signed caller using the same frozen helper bytes,
rejection of direct shell invocation and wrong signed caller identity, and deletion.
It uses only a uniquely named disposable fixture; no real account is read or changed.
The helper cache is durable under `~/Library/Application Support/Somedue/keychain-helper`.
Do not delete it with build artifacts or re-sign the helper during outer bundle signing.
Production builds must run through `scripts/macos-package.mjs`, which pins the signer
at compile time; signing an arbitrary development build later does not retrofit the
helper mode. Final installed-app credential restart checks remain separate from the
boundary regression test.

## Icon model and current platform check

Samlad `scripts/app-icon.mjs` composites its mark into a 1024px SVG rounded brown
plate (`#262019`, radius 224) with mark bounds 128..896 (768px). Sharp generates a
PNG. Packaging emits 16, 32, 128, 256, 512-point 1x/2x PNGs and runs `iconutil`.
Its image tests verify transparent outer corners and background padding.

Somedue uses the refined `Carved-Check-Optimized.svg` supplied in Downloads,
copied unchanged to `assets/icon/carved-check.svg`, including its turquoise inlay.
Its viewBox already matches the actual 33..223 bounds, with no intrinsic margin;
the paths, mask, clipping and colors are preserved. `scripts/app-icon.mjs` places the tightly
cropped content at 192..832 (640px) on a brown 100..924 (824px) background with
185.4px corner radius, within a transparent 1024px canvas. These are explicit
design choices for the existing flattened macOS ICNS pipeline, not numeric
requirements imposed by Apple.

The generator writes `assets/icon/app.svg`, used by Settings and the README,
then every PNG, `Somedue.iconset` representation and ICNS from that composition.
The ICNS uses Apple's `iconutil`. Its 16/32px 1x ARGB entries need premultiplied RGB,
so the generator prepares those two inputs in a temporary iconset; the published
PNGs retain straight alpha. The test decodes all ten native entries and compares
their alpha and visible color, allowing at most 3/255 native ARGB rounding error.
Run `bun run icons` after editing the content. The icon test verifies tight
content bounds, background/foreground spacing, every generated representation,
and decoded ICNS pixels against the source.

Apple's [app icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons)
(checked 2026-10-25) recommends centered primary content, a simple background,
and consistent artwork. Its current layered workflow uses unmasked, full-bleed
layers and system-rounded corners; it specifies no fixed foreground inset.
This project retains its flattened legacy assets rather than claiming the
pre-rounded composition is an Icon Composer layer.

Apple's current [Icon Composer](https://developer.apple.com/icon-composer/)
workflow uses layered artwork and Default/Dark/Mono variants. Its
[creation documentation](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer?changes=l_2&language=objc)
explicitly describes macOS 26 versus 27 previews, updated highlights, and
refraction. These primary sources were checked on 2026-10-23. A flattened ICNS
is not evidence of adopting or testing the new layered material behavior.

This machine runs macOS **26.6.2**, and `xcode-select -p` points to CommandLineTools;
no Xcode or Icon Composer app was found in `/Applications`. Consequently macOS
27 appearance and Icon Composer effects cannot be validated here. No macOS 27
conformance claim is made.

## Reproduction

- `bun run icons` invokes `scripts/app-icon.mjs` (requires local `sharp`).
- `bun scripts/macos-package.mjs` builds and verifies a release `.app`.
- `bun scripts/macos-package.mjs --install` additionally installs it at
  `/Applications/Somedue.app`, after checking the distinct bundle ID.
- `--skip-build` signs/verifies an already-built app.
- Optional `SOMEDUE_CODESIGN_IDENTITY` must be a certificate fingerprint
  or `-`; unavailable configured identities fail closed.
- Existing Somedue installations are backed up. Original Things3 remains
  untouched. A JSON build receipt records signing and installation state.

These scripts do not claim credential persistence, application functionality,
Finder/Dock appearance, or native runtime validation by themselves. Those checks
must be performed against the actual installed build and recorded separately.

## Native verification commands and shared-volume build cache

The workspace is a VM shared mount. A first Cargo build there failed creating an
archive with `memory map must have a non-zero length`. Native compilation succeeds
with `CARGO_TARGET_DIR="$HOME/Library/Caches/Somedue/cargo-target"`; packaging
sets that local cache by default, with an explicit CARGO_TARGET_DIR override allowed.
The bundle output is therefore in that cache's `release/bundle/macos/` directory.

`cargo check --offline` passed against the full native application after this
change. `bun test scripts/app-icon.test.mjs` verifies installed PNG/ICNS shapes and
representations. The helper test runner uses cached Cargo dependencies (`--offline`)
after the normal dependency setup, so it does not refresh the registry for each
synthetic test run.

The installed executable has a narrowly scoped verification entry point:

```sh
'/Applications/Somedue.app/Contents/MacOS/somedue' --keychain-self-test create verification-UNIQUE-ID
'/Applications/Somedue.app/Contents/MacOS/somedue' --keychain-self-test read verification-UNIQUE-ID
'/Applications/Somedue.app/Contents/MacOS/somedue' --keychain-self-test update verification-UNIQUE-ID
'/Applications/Somedue.app/Contents/MacOS/somedue' --keychain-self-test read-updated verification-UNIQUE-ID
'/Applications/Somedue.app/Contents/MacOS/somedue' --keychain-self-test delete verification-UNIQUE-ID
```

These run the actual app executable and frozen helper in separate processes,
without opening the task database or cloud connection. The fixture is compiled
synthetic text, and only `verification-` account names are accepted. No real
password can be supplied through this command. Use a unique suffix per run and
always delete the fixture afterward. This validates the installed credential
boundary; it does not prove real Things Cloud authentication.
