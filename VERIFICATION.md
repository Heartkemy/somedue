# Somedue verification — 2026-10-25

Somedue installs at `/Applications/Somedue.app`, runs as `somedue`, and uses
`io.somedue.desktop` for its bundle and task-storage identity. The credential
service is `io.somedue.desktop.things-cloud.v1`; its signed helper uses
`io.somedue.keychain`. There are no legacy app identity aliases or migration paths.

## Verified

- Frontend TypeScript check and production build passed.
- All 28 Bun model, motion and editor-save tests passed.
- All 60 offline Rust tests passed.
- The icon test passed: generated artwork matches the supplied SVG, PNG dimensions
  match the bundle requirements, and the ICNS file has the correct format.
- The checked-in SVG is byte-identical to the supplied artwork. The installed ICNS
  matches the generated asset.
- Native release packaging and strict bundle/helper signature verification passed.
- Installed Keychain create/read/update/read-updated/delete checks passed in separate
  processes with synthetic data; they did not open the task database or access Cloud.
- The installed app was launched and its window, menu, Settings copy and About screen
  show Somedue. The About screen displays the new icon.
- GitHub is `Heartkemy/somedue`, origin uses the renamed URL, and the local
  workspace and registered project use `/Users/rafaelhorvat/__code__/Somedue`.

Local build and installed-Keychain receipts are under ignored `out/`.

## Limits

This rename did not repeat the complete browser interaction suite or live Cloud
account tests. The new identity starts with a fresh local workspace and requires
reconnecting Things Cloud. The build is locally signed and is not notarized.

The synthetic Keychain boundary suite also passed: a re-signed caller can use the
same helper, direct shell/pipe invocation is denied, and a wrong caller identity
is denied. No real credentials were used.
