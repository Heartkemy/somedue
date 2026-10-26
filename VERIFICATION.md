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

## Dependency triage — 2026-10-26

- Sharp is pinned at 0.35.5. The three current GitHub advisories name 0.35.0,
  0.35.4, and 0.35.5 as their first patched releases:
  [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj),
  [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c),
  and [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- `cargo tree` resolves no path to `glib 0.18.5` or `proc-macro-error 1.0.4`
  for either `aarch64-apple-darwin` or `x86_64-apple-darwin`; the all-target
  paths run through GTK/WebKit dependencies instead. The `glib` advisory
  ([RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html),
  last modified 2025-10-28) affects 0.15.0 through before 0.20.0. The
  `proc-macro-error` entry
  ([RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html),
  last modified 2026-06-07) is an unmaintained notice with no patched release.
- Those are narrow macOS-target exceptions, not a claim that the overall
  dependency graph is vulnerability-free.

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

## Ordered screenshot feedback — 2026-10-25

Samlad task #999 curates input `in_5afc1a4e4d954a0fa6d73abf6e497163`
and the instruction to continue on `feature/ui-reference-rewrite`. All 39
chronological Desktop references were inspected.

- The sidebar's centered handle resizes, collapses and reopens it, including by
  keyboard. The redundant title-bar button is removed.
- Adjacent selected rows join into one surface. Rows and editors share padded
  checkbox/title columns; heading edits save without confirmation controls.
  Project progress and completed project controls use the logo's exact `#DC00FF`.
- Today acknowledges existing items newly scheduled into it. Evening sections
  use neutral type and moon icons. Upcoming includes 30 consecutive dates and
  offers a scheduled-only switch. Anytime groups tasks with expandable previews.
- Trash includes blank-title tasks and repeating templates, sorts newest first,
  and has a confirmed Empty Trash action that also removes dangling series links.
- Scheduling uses a wider, non-scrolling card with shared navigation colors and
  removable chips. Quick Find and Move use compact contextual rows. Toolbar
  columns and pill-shaped controls keep the same centers while editing.
- Settings follows the sibling Samlad layout: contextual Back, breadcrumbs,
  section descriptions, content hierarchy and a yellow active underline.
- Simple recurring tasks have distinct templates/copies, an explicit rule dialog,
  next/previous copy actions, pause/resume and stop. Daily, weekly, monthly, yearly,
  after-completion and end-date rules have offline pipeline coverage. Local
  recurring reminder preferences stay outside the Cloud recurrence wire payload.

### Verification

- TypeScript production build, `--noUnusedLocals`, Prettier and diff checks pass.
- 37 Bun tests and 66 offline Rust tests pass. Coverage includes empty-day/list
  grouping, month-end previews, bounded recurrence catch-up, deduplication,
  completion-relative scheduling, end dates, pause and reset checklist copies.
- All 132 distinct Chromium/WebKit cases pass across the full run and targeted
  confirmations at 1120×780 and 760×540. The full run passed 128 cases; the four
  chip-height failures were fixed and all 40 affected/list/theme cases passed.
  Both heading cases then passed with additional autosave assertions.
- Two bounded visual rounds inspected dark/light task lists, scheduling,
  Quick Find, settings and recurring-rule dialogs. The mechanical design detector
  returned no findings. Artifacts are under ignored `out/ui-reference-feedback/`.
- The new section layout keys by stable section IDs. Existing draft recovery,
  delayed persistence, click-away saves and tag creation remain covered.

### Limits

This pass did not install or launch a native build, open the user's task database,
access credentials, or contact a live Cloud account. The installed app therefore
remains the earlier build. Opaque `rp` repeaters, advanced imported rule variants
and automatic copying of repeating projects still require Things; the app
preserves them and rejects unsupported rule changes. Simple rule support and
synthetic UI/native tests do not establish live cross-device interoperability.

### Installation follow-up

At the user's request, `bun run install:macos` now builds the current working
files, verifies and installs the signed app, quits the previous instance normally,
and opens the updated app. It was executed successfully with uncommitted command
and documentation changes. Save open edits before running it.

The installed executable matches `out/build-receipt.json`. Strict bundle/helper
signatures and all five synthetic installed Keychain checks passed. The updated
app was reopened and its native window shows the new sidebar handle and task UI.
The Keychain tests used no real credentials or task database. Normal app launch
opened the user's existing workspace; no task edits were made during inspection.
The installed build is locally certificate-signed and is not notarized.
