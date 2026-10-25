# Things Cloud protocol implementation evidence

Inspected 2026-10-23, read-only, from `/Users/notme/code/things-cloud-mcp-main`, after reading its AGENTS.md. This is source-derived evidence, not a successful live account test. References below are relative to that repository. No account credentials were inspected or used. The endpoint is unofficial.

## Authentication and HTTP

`things-cloud-sdk/client.go`, `verify.go`, `histories.go`:

- Base URL: `https://cloud.culturedcode.com`; production TLS verification must remain enabled.
- Verify with `GET /version/1/account/{percent-encoded-email}` and `Authorization: Password <password>`. This is **not** Basic auth. Basic/Bearer in the MCP service authenticates its own clients, not Things Cloud.
- Require HTTP 200 and well-formed verification JSON. Fields include `status: "SYAccountStatusActive"`, `history-key`, `email`, `issues`, `SLA-version-accepted`. Require nonempty authoritative history-key. Never pick the largest history from own-history-keys.
- The SDK does not add password auth to history URLs. Treat the history key as a sensitive capability; do not expose URLs containing it in logs or frontend errors. Keep it in private backend storage.
- Common SDK headers: `User-Agent: ThingsMac/32209501`, `Accept: application/json`, `Accept-Charset: UTF-8`, `Accept-Language: en-US,en;q=0.9`; `Things-Client-Info` is standard-base64 JSON:

```json
{"dm":"MacBookPro18,3","lr":"US","nf":true,"nk":true,"nn":"ThingsMac","nv":"32209501","on":"macOS","ov":"15.7.3","pl":"en-US","ul":"en-Latn-US"}
```

These are compatibility values in the inspected SDK, not claims about this client's identity. Requests with bodies add `Content-Type: application/json; charset=UTF-8` and `Content-Encoding: UTF-8`. HTTP timeout is 30 seconds; default request spacing is one second. `429` with `Things-Response: AbusePrevention` needs a visible backoff state, not repeated immediate retries. Return sanitized status/error classes, not raw response bodies.

The password belongs only in macOS Keychain. It may pass transiently through a password field and native IPC but must not appear in SQLite, frontend storage, diagnostic logs, or configuration. Account switches must separate cached history/state. Never use an email-only credential cache.

## Reading history atomically

`items.go`, `items_test.go`, `main.go:fullRebuild/incrementalSync`, `safety_test.go`:

1. `GET /version/1/history/{history-key}/items?start-index=0` for initial load, or the last **loaded** cursor for incremental load.
2. Response example (synthetic IDs):

```json
{"schema":301,"current-item-index":2,"items":[
  {"entity-a":{"t":0,"e":"Task6","p":{"tt":"First","tp":0,"ss":0}}},
  {"entity-a":{"t":1,"e":"Task6","p":{"tt":"Edited"}},"entity-b":{"t":0,"e":"Area3","p":{"tt":"Work"}}}
],"start-total-content-size":0,"end-total-content-size":100,"latest-total-content-size":100}
```

3. `items` is an ordered array of **commit maps**. A map can contain several entities. Advance loaded cursor by `items.length`, not number of entities. Replay commits in array order; same ID may occur repeatedly.
4. `current-item-index` is server head; it is not necessarily this page's end. Next request starts at requested start + number of commits. Continue while loaded < head.
5. Use `schema` when nonzero, else `latest-schema-version`. SDK supports versions up to 301; it rejects >301. New client should also reject absent/invalid schema rather than silently assume current.
6. Reject negative request cursor, head below requested start, empty page while start < head, and page-end beyond head for schema 301. Bound page sizes and total work to avoid runaway pagination.
7. Stage every page in a candidate graph/cursor. Validate the complete delta before atomically persisting state + loaded cursor. If a later page fails, neither graph nor cursor changes. Never automatically reset to cursor zero on incremental failure.
8. Preserve raw unknown *fields* to avoid destructive round trips. Unknown business *entity versions/kinds/actions* are different: stop sync, retain current state/cursor, and report compatibility error.

Known kind families: tasks `Task`, `Task3`, `Task4`, `Task6`; areas `Area`, `Area2`, `Area3`; tags `Tag`, `Tag3`, `Tag4`; checklist `ChecklistItem`, `ChecklistItem2`, `ChecklistItem3`; tombstones `Tombstone`, `Tombstone2`. Actions: `t=0` create, `1` modify, `2` delete. `Settings` followed by one or more digits is explicitly ignorable account metadata, including versions such as Settings5. Unversioned Settings or malformed suffixes are not covered by this exception.

Validate envelopes and payload types before mutation. Apply partial patches: absent property means unchanged; explicit null means clear. The SDK memory state's explicit-null handling is more complete than its separate `sync/` package. **Follow `state/memory` plus main.go safety behavior, not `sync/process.go`**, which emits unknown changes and has weaker null behavior.

## Identifiers and migration

`things-cloud-sdk/base58.go`, `state/memory/legacy_uuid_test.go`:

- New IDs: UUID v4's 16 bytes encoded in Bitcoin Base58 alphabet `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`, preserving leading zero bytes as `1` characters. Canonical ID decodes to exactly 16 bytes.
- Older kinds have historical identifiers. If identifier is already canonical Base58, keep it. Otherwise SHA1 the original UTF-8 ID **case-sensitively**, take first 16 bytes, encode Base58.
- Special old recurring ID `<36-char UUID>-YYYYMMDD`: SHA1 UUID string, take first 16 bytes, append literal `-YYYYMMDD`, SHA1 that, take first 16 bytes, Base58.
- Apply migration to object keys **and relationships** ar/pr/agr/tg/rt/dl, checklist ts, tag pn, tombstone dloid. Legacy kinds: Task/Task3/Task4; ChecklistItem/ChecklistItem2; Area/Area2; Tag/Tag3; Tombstone. Current versions must not have keys arbitrarily rederived.

## Entity model and mutations

`types.go`, `main.go:TaskCreatePayload/newTaskCreatePayload/newTaskUpdate`:

| Field | Meaning |
|---|---|
| `tt`, `nt` | Title and structured/plain legacy notes |
| `tp` | 0 task, 1 project, 2 heading |
| `ss` | 0 pending, 2 canceled, 3 completed |
| `tr` | Boolean trash flag; distinct from permanent deletion |
| `st` | 0 Inbox, 1 Anytime/started, 2 Someday/deferred |
| `sr`, `tir` | Scheduled date and Today/occurrence reference date; prefer tir when present |
| `dd` | Deadline |
| `cd`, `md`, `sp` | Creation, modification, completion timestamps |
| `ix`, `ti`, `do` | Container order, Today order, deadline order |
| `sb` | 0 daytime, 1 This Evening |
| `ar`, `pr`, `agr` | Array of area IDs, project IDs, heading IDs |
| `tg`, `dl`, `rt` | Tag IDs, delegates, recurrence-template references |
| `rr`, `icsd` | Template rule and instance-creation start date |
| `rmd`, `ato` | Repeater migration timestamp (native evidence below); legacy alarm offset |
| `xx` | Extension object; preserve unknown data |

Tasks under a heading can carry only `agr`, and heading's `pr` resolves project. Resolve ancestors cycle-safely. Active filters hide pending descendants of completed/canceled/trashed ancestors. Creation and moves must reject inactive/missing ancestors. Moving to area sets ar=[id], pr=[], agr=[]; project sets ar=[], pr=[id], agr=[]; heading sets ar=[], pr=[], agr=[id].

Default full task create payload (synthetic timestamp/title; all keys retained, including nulls):

```json
{"tp":0,"sr":null,"dds":null,"rt":[],"rmd":null,"ss":0,"tr":false,"dl":[],"icp":false,"st":0,"ar":[],"tt":"New task","do":0,"lai":null,"tir":null,"tg":[],"agr":[],"ix":0,"cd":1790000000.25,"lt":false,"icc":0,"md":null,"ti":0,"dd":null,"ato":null,"nt":{"_t":"tx","ch":0,"v":"","t":1},"icsd":null,"pr":[],"rp":null,"acrd":null,"sp":null,"sb":0,"rr":null,"xx":{"sn":{},"_t":"oo"}}
```

Project/heading use same payload with tp=1/2, default st=1. Headings require a valid project. Normal task default Inbox; contained tasks default Anytime if no explicit schedule.

Current create kinds: Task6, Area3, Tag4, ChecklistItem3. Area payload `{"tt":"Work","ix":0,"tg":[],"xx":{"sn":{},"_t":"oo"}}`. Tag payload `{"tt":"Focus","ix":0,"sh":null,"pn":[],"xx":{"sn":{},"_t":"oo"}}`. Checklist payload `{"cd":1790000000.25,"md":null,"tt":"Step","ss":0,"sp":null,"ix":0,"ts":["task-id"],"lt":false,"xx":{"sn":{},"_t":"oo"}}`.

Modification uses action 1 and only changed fields plus md timestamp. Complete: ss=3, sp=now; reopen: ss=0, sp=null. Cancel: ss=2, sp=now. Trash/restore: tr=true/false. Permanent delete uses action 2 and empty payload; reading Tombstone[2] deletes dloid across entity families. Confirm destructive permanent deletion and recurrence stopping. Do not expose a history-delete action in normal application UI.

## Dates and lists

Timestamp values are Unix seconds, allowing fractions, not Apple 2001 reference seconds. Date-only fields are UTC-midnight encodings of **calendar dates**, independent of local timezone; never display by directly converting UTC midnight to a local timestamp date. Derive today's date from local calendar and encode those components at UTC midnight. Preserve day strings in frontend.

- Inbox: st=0.
- Anytime: st=1 and no future deferred schedule; unscheduled normal started tasks.
- Someday: st=2 with no sr/tir.
- Today: st=1 or 2 with effective date (tir else sr) today or earlier, pending/active. Deadlines can require additional Today presentation per native inspection.
- This Evening: Today and sb=1.
- Upcoming: scheduled future calendar date; deadline also contributes to upcoming ordering (`effectiveUpcomingDate` picks earliest).
- Today/tonight assignment writes st=1, sr=today, tir=today, sb=0/1. Explicit future date writes st=2, sr=date, tir=date. Clear schedule dates with explicit nulls.
- Today order uses ti, normal sibling order ix. Sort ties deterministically.
- Logbook: completed/canceled items; Trash: tr=true; avoid incorrectly reviving descendants when restoring one node.

## Notes

`notes.go`, `notes_test.go`, `main.go:noteChecksum/textNote`:

Write full text as `{"_t":"tx","ch":CRC32_IEEE(UTF8(text)),"v":text,"t":1}`. CRC is unsigned 32-bit widened to JSON integer. Empty text checksum is zero. Receive legacy strings, null clears, full objects (`t=1`), or patches (`t=2`, `ps:[{"r":"replacement","p":0,"l":3,"ch":...}]`). SDK patches operate on Unicode scalar values (Go runes) sequentially, with out-of-bounds position/length clamping. Do not treat byte offsets as characters. CRC validation and UTF-16 behavior are not established by this SDK; fail explicitly if a received format cannot be applied safely. Do not silently replace unknown note format with empty text.

## Commit lifecycle

`histories.go:Write`, `main.go:writeAndSync`, `safety_test.go:TestUncertainCommitIsReconciledWithoutRetryingWrite`:

Serialize account operations for the entire pre-sync, validation, POST, reconciliation, persistence lifetime. After fresh incremental sync and validation send:

```
POST /version/1/history/{key}/commit?ancestor-index={head}&_cnt=1
Schema: 301
Push-Priority: 5
App-Id: com.culturedcode.ThingsMac
App-Instance-Id: {61 zeroes}-com.culturedcode.ThingsMac-{61 zeroes}
```

SDK uses the zero-valued compatibility App-Instance-Id above. Body is map from each unique ID to `{"t":1,"e":"Task6","p":{"tt":"Updated title","md":1790000000.25}}`. Never allow duplicates, empty IDs, empty batches, unsupported schema, malformed dates or relationships. HTTP 200 response must be JSON `{"server-head-index":old_head+1}`.

On confirmed commit apply the exact already-validated events and increment both cursors atomically; a subsequent read failure must not misreport a successful write as failed. Persist an outbox/journal before sending so process death after POST also enters uncertain reconciliation rather than blind replay.

Transport failure, truncated body, malformed response, or unexpected head after POST means **uncertain commit**. Read authoritative history from previous cursor. Confirm expected events (ideally exact payload too; reference checks UUID/kind/action only). If not provable, retain pending/uncertain action and show actionable recovery; never automatically retry that POST. A stale ancestor rejection needs fresh read and explicit conflict policy, not overwriting remote state. Preserve local drafts when offline or pre-sync fails.

## Recurrence

`repeat.go`, `main.go:parseRecurrence/splitRecurringPayload`, `pure_test.go`, `safety_test.go`:

Create two Task6 records in one commit: hidden template with rr and icsd; visible instance has rr=null, icsd=null, rt=[templateID]. Templates are excluded from ordinary lists. Template's sr/tir are next occurrence; st=1, sb=0. Instance retains current intended date and fields. Recurring project is same model with tp=1.

Rule base: `{"rrv":4,"tp":0,"rc":0,"ts":0,"ed":64092211200,"ia":referenceDate,"sr":referenceDate,"fu":16,"fa":1,"of":[{"dy":0}]}`. ed is year-4001 never-ending marker. Frequency units: daily16, weekly256, monthly8, yearly4; fa positive interval. Monthly dy is zero-based, -1 last day; yearly has dy/mo. Weekly source parser emits separate `of` entries with wd integers Sunday0..Saturday6.

**Reference discrepancy:** AGENTS.md says weekly uses a wd bitmask, but main.go parser, Go time.Weekday model and pure_test.go explicitly expect `weekly:mon,wed` → `[{"wd":1},{"wd":3}]`. Do not silently claim bitmask support or infer complete native recurrence compatibility from these tests. Keep imported recurrence JSON losslessly, validate unsupported variants before editing, and corroborate recurrence scheduling with native evidence. `NextOccurrenceAfter` in repeat.go is the implementation reference for calendar stepping; daily arithmetic alone is insufficient for monthly/yearly dates.

Changing recurrence edits template; stopping recurrence clears template rr/icsd and visible rt as appropriate with explicit destructive confirmation. Editing a visible occurrence must not accidentally edit every future occurrence. This SDK does not establish all native automatic instance-generation behavior; keep that a separately tested requirement.

## Required tests for Rust/client implementation

1. Fake HTTP server verifies auth/header/path escaping, throttling, malformed verify, missing history, 401 and 429; errors/logs do not contain credentials or history capability.
2. Multi-page sync counts commit maps (several entities each), repeated entity patches, empty final page, cursor regression, no progress, unsupported schema, unknown kind/action, Settings5 ignored; later-page failure leaves graph and cursor unchanged.
3. Legacy ID/key/reference normalization, including case sensitivity, canonical IDs unchanged and special recurrence IDs; tombstones delete canonical target.
4. Partial patch vs explicit null for schedule/deadline/completion/notes/reminders/recurrence; unknown fields retained; Unicode note patches and CRC fixtures.
5. Complete/reopen/trash/restore and canceled parent visibility; invalid/cyclic/inactive destinations rejected before network; heading ancestry and sibling ordering.
6. Confirmed write applied locally once; malformed/timeout write reconciled with exactly one POST; unconfirmed uncertain write remains blocked; process-restart outbox recovery; stale ancestor conflicts.
7. Atomic recurring template+instance create, template hidden, occurrence vs series edits, monthly end-of-month/leap-year rules; unsupported imported recurrence cannot be silently rewritten.
8. Keychain storage/read/delete boundary, denied/locked/missing entry errors, app restart, account separation, no secret persistence in data files. Real credential persistence and cloud sync require an actual signed native run and credentials; fake HTTP tests cannot prove them.

Useful regression sources: `safety_test.go` tests full-rebuild settings/legacy tombstones, all-or-nothing later-page failure, uncertain-commit single POST, confirmations, recurring atomic create; `visibility_test.go`; SDK `items_test.go`, `histories_test.go`, `state/memory/legacy_uuid_test.go`, `notes_test.go`, `base58_test.go`. No reference files were changed.

## Implemented verification

`src-tauri/src/cloud.rs` implements native HTTP transport, staged history replay, identifier migration, explicit-null handling, Unicode note replay, fresh pre-write synchronization, same-field conflict checks, and exact-event uncertain-commit reconciliation without POST retries. `src-tauri/src/store.rs` supplies complete create defaults and shares the cloud validator; local replay is atomic. Workspace persistence distinguishes authoritative cloud state from optimistic draft state, and history capabilities are omitted from serialization and redacted from Debug.

27 Rust cloud/store tests passed on 2026-10-23 using an isolated Cargo harness in `/tmp/things-cloud-tests.uEQuhm` importing these exact source files. This avoided native bundle compilation while implementation was in progress. The same tests are included by the application crate and should also run with `cargo test --manifest-path src-tauri/Cargo.toml`. Coverage includes fake HTTP authentication/pagination/error/reconciliation, local complete/reopen, heading-only ancestry, atomic malformed-batch rollback, note CRC, unknown mutation rejection, tag cycles, authoritative/draft separation, and old-cache decoding. No live account read/write or actual Keychain credential persistence was established by these tests.

### Native workflow audit and final backend test pass

The native application crate subsequently passed **43 tests** with:

```sh
CARGO_TARGET_DIR='/Users/notme/Library/Caches/Somedue/cargo-target' cargo test --manifest-path src-tauri/Cargo.toml --lib
```

`workflow.rs` is the actual service called by native `connect`, `mutate`, and `sync` commands. Its regression tests cover frontend-minimal create payloads, pre-POST offline retryability, immutable conflict before-images, durable sending checkpoints, uncertain/crashed requests never resent, reconciliation after a successful POST followed by disk failure, disk failure before POST preventing network writes, individually checkpointed sequential drafts, and repeated conflict reviews preserving unrelated remote notes. Reconnect uses a non-secret one-way history fingerprint to prevent replaying drafts into a reset account history while the actual capability remains in Keychain.

`recurrence.rs` normalizes the initial template to its next occurrence while
leaving the first visible copy on its requested day. Simple daily, single-weekday
weekly, monthly and yearly rules support explicit next-copy creation and automatic
materialization on load/sync. Catch-up is bounded to 32 occurrences per series per
load. Templates appear in Upcoming with a repeat icon instead of a completion
control. End dates, paused/inactive parents and duplicate occurrence dates prevent
additional copies. Checklist copies reset their completion state.

After-completion rules use `tp: 1`, corroborated against the
[writer implementation](https://github.com/mattydsmith/things-cloud-mcp/blob/main/server/write.go)
and its [recurrence tests](https://github.com/mattydsmith/things-cloud-mcp/blob/main/server/write_repeat_test.go)
on 2026-10-25. They wait for the active copy to complete, then schedule from that
completion's local calendar day. This matches the documented
[Things repeat-pattern behavior](https://culturedcode.com/things/support/articles/3743733/).
Unit tests exercise this pipeline without contacting a live account.

Unsupported imported rules and opaque `rp` repeaters remain unchanged; autonomous
copying of repeating projects is still unsupported. Future-rule edits target the
template; ordinary copy edits affect that copy alone. Stopping requires explicit
confirmation and retains existing copies. Recurring reminder times are local,
account-scoped preferences, not invented recurrence wire fields. These checks do
not establish full native interoperability or live cross-device compatibility.

## Installed-model compatibility correction, 2026-10-23

The SDK reference is older than the installed Things model. Ordinary Apple
`llvm-objdump`/`strings` inspection (not decompilation) establishes Task7, Contact2,
Command3 and SmartList in the shipped ThingsModel framework. See
`evidence/things-task7.json` for artifact identity and focused disassembly.

Task7 remains Task7 in storage and outgoing edits; Task6→Task7 history migrations
retain existing properties. The app retains ancillary records and their opaque
properties, while rejecting unsupported edits to them. It does not silently discard
unknown kinds. Error messages now include a bounded alphanumeric kind identifier.

The original `_IsRepeaterPresentInOperation` tests `rp` as a CFString.
`_CopyRepeaterMigrationDateOfOperation` treats `rmd` as a Unix timestamp for repeater
migration, **not a reminder date**. Both remain preserved during ordinary editing;
new-format recurrence editing/materialization is not implemented. The native
database's FADay migration alone does not establish a changed cloud date encoding.
Live-account import and cross-device writes still require verification.

## Project creation `tr` correction, 2026-10-24

The reported `invalid field type for tr` is reproducible without an account:
the frontend's shared `create()` helper supplied numeric `tr: 0`, overriding
`store::prepare`'s boolean `tr: false` default for tasks and projects. A direct
invocation of `create("Task6", {tt:"Project regression", tp:1})` reproduced
the invalid field. This is an outgoing payload error; the error text alone
does not establish an incompatible incoming history format.

The protocol evidence still requires booleans:
[SDK `TaskActionItemPayload.InTrash`](https://github.com/arthursoares/things-cloud-sdk/blob/main/types.go)
is `*bool`, and the
[MCP writer's `TaskCreatePayload.Tr` and `taskUpdate.Trash`](https://github.com/wbopan/things-cloud-mcp/blob/main/main.go)
use `bool`. Both public sources were checked read-only on 2026-10-24.
The frontend default must therefore be `tr: false`; numeric values must not
be coerced or accepted by loosening the Cloud validator.

Backend regressions exercise the actual mutation pipeline for Task6/Task7
project defaults, trash/restore booleans, rejection of malformed outgoing
values without changing saved state or existing pending drafts, and rejection
of numeric `tr` on a later history page without publishing the partially
replayed graph or advancing the saved cursor. These are offline contract
checks; live dummy-account project creation remains a separate integration check.

Mixed-version replay correction: task history can contain older-format patches after
a Task7 record. Replay now accepts Task6/Task7 in either order (including normalized
legacy Task/Task3/Task4), retains Task7 once observed, and merges only supplied fields.
Outgoing downgrade attempts and changes between unrelated entity families remain
rejected. Regression coverage exercises pagination and an incremental reconnect,
including preservation of native repeater data, notes and explicit nulls.
