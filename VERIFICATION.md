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

## Task-list and Settings rewrite — 2026-10-25

Samlad task #998 curates the complete UI input and its follow-up instructions as
one task. The implementation is on the Git Flow branch
`feature/ui-reference-rewrite`.

- Task rows and inline editors share their checkbox/title grid. The editor expands
  outside the list gutter; notes stay transparent and grow with their content.
- Shared round mint check controls, purple project progress, fine Someday-only
  dashes, tag pills and action-bar columns replace duplicated styles.
- Modifier/range/select-all selection supports batch scheduling, tags, moving,
  completion and trash. Context menus support keyboard navigation and submenus.
- Incoming remote to-dos have a dismissible count; task rows show the due-today
  dot, checklist icon and a right-aligned relative deadline.
- Settings is a page using the neighboring Samlad app's navigation and spacing
  pattern. Tag management uses compact editable pills and bare trash buttons.
- Routine success toasts are removed. Error boundaries provide retry/reload;
  unhandled errors provide a nonblocking recovery notice.
- Cloud I/O releases the workspace lock. Checkpoints retain concurrent edits;
  recovery refuses to discard edits that arrive during its download. Editor saves
  update changed fields so an incoming remote note is retained.

### Verification

- Production TypeScript/Vite build passed, including the native packaging build.
- TypeScript with `--noUnusedLocals` and Prettier checks passed.
- 31 Bun tests and 62 offline Rust tests passed. Rust coverage includes edits
  during delayed pulls and commits, durable concurrent drafts and recovery races.
- All 100 distinct Chromium/WebKit browser cases passed across the full run and
  targeted confirmations at 1120×780 and 760×540. The full run passed 90 cases;
  after fixing the shared focus/elevation rule and sync follow-up scheduling,
  all 14 affected/rechecked cases passed, including the 10 earlier failures.
- Rendered task, editor, menu, Settings and recovery states were inspected against
  the supplied references. Browser artifacts and logs are under
  `out/ui-rewrite/`. The manual design detector returned no findings.
- The certificate-signed app is installed at `/Applications/Somedue.app`. The
  installed executable matches `out/build-receipt.json`; strict signatures and
  synthetic installed Keychain create/read/update/delete checks passed. These
  checks opened no task database and contacted no Cloud account.

### Limits

Live Things Cloud traffic and physical native traffic-light placement were not
retested. The supported traffic-light position is configured and compiles. The
existing app process was preserved to avoid losing an open draft; quit and reopen
Somedue to load the update. Local certificate signing is not notarization.
