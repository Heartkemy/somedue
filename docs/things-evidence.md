# Things evidence and acceptance inventory

## Original inspected before implementation

REA `open_binary` bound `/Applications/Things3.app/Contents/MacOS/Things3`, universal Mach-O, arm64, SHA-256 `daec0821d4dfbb473bfdeefbf0e2fa7c68b6f33d36d0ccce8565b7fa491df024`. Bundle version 3.23.1. Session closed after inspection.

The initial deep inventory returned `provider_unavailable`: no configured Ghidra/Hopper/IDA/Kuna. Runtime observation of PID 441 window 243 failed first with `screen-recording-denied`, then the accessibility-only request failed with `accessibility-denied`. That initial pass obtained no original UI screenshots or interaction observations. Subsequent user-supplied reference screenshots and native inspection of the replacement app are recorded in [the task #984 comparison](ui-fidelity-984.md). The initial permission failures are not evidence of UI behavior.

Ordinary read-only bundle inspection extracted English Localizable.strings with plutil into `docs/evidence/things-localization.json`. The original application and previous attempt are untouched. Native bundle resources identify preferences for General, Quick Entry, Calendars, Reminders Inbox, Things Cloud; recurrence dialogs, checklist actions, headings, projects, list navigation, deadlines, repeat-after-completion, and trash/Logbook confirmations. Strings establish available functionality, not geometry or executed behavior.

The bundled tutorial JSON and resource names, together with the official [Things keyboard reference](https://culturedcode.com/things/support/articles/2785159/), supplement artifact evidence. The later screenshot comparison verifies the supplied layout structure and requested interactions. It does not establish identical pixels or functionality that the references and tests do not cover.

## Feature inventory and implementation coverage

| Workflow | Evidence | Implementation / verification target |
| --- | --- | --- |
| Inbox, Today, Upcoming, Anytime, Someday | Shipped labels and navigation strings | Sidebar, date-driven filtering, unit tests |
| Logbook, Trash | Shipped archive and destructive confirmations | Completion/reopen/cancel, restore/permanent delete, inherited container state |
| Tasks and inline editing | Official open/save keyboard commands | Inline title, notes, date/tag/checklist form; UI fixture verification |
| Projects / areas / headings | Native resource strings and SDK types | Creation, rename, navigation, hierarchy, moving, project progress |
| Notes and checklists | Shipped actions, SDK nt/ChecklistItem3 | Unicode-safe notes, sanitized Markdown preview, CRC metadata, checklist editing; Rust protocol tests |
| Tags | SDK Tag4 and keyboard reference | Create/rename/delete/filter, task assignment |
| Start dates / evening / deadlines | Native labels and SDK st/sr/tir/sb/dd | Explicit distinct schedule/deadline fields, UTC date-only unit tests |
| Ordering and moves | Official shortcuts and SDK ix/pr/agr | Drag/drop, keyboard move, move picker, validation |
| Search | Official reference and native strings | Title + note search, typing/Command-F |
| Recurrence | Native dialogs and SDK rr/rt/icsd | Template + instance atomic creation, basic daily/weekly/monthly/yearly, stopping; advanced native recurrence behavior remains incomplete |
| Settings / keyboard / native menus | Native preferences and official reference | Appearance/density/motion/default capture/sync/tags/keyboard panels; native File/Edit/View menus |
| Cloud | Direct SDK and tests | Rust auth, authoritative history paging, durable outbox, conflict and uncertain-write recovery |
| Quick Entry globally | Shipped preference nib and strings | Dedicated capture window; configurable global shortcut; native handler validation tests |
| Autofill, reminders import, calendar events | Shipped preference nibs and strings | Not implemented; explicit remaining parity work |
| Full multi-selection, nested tag keyboard shortcuts, multiple main windows, Shortcuts/AppleScript/URL automation | Native strings / official keyboard reference | Not fully implemented; explicit remaining parity work |

These gaps prohibit describing this build as a complete production-ready reproduction. See VERIFICATION.md for actual test/build results and local signing limitations.
