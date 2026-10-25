# Task #984 — structural fidelity record

The original task and child briefs were recovered from Samlad, including every attached correction. All chronological reference screenshots from 2026-10-24, the Samlad options reference from 2026-10-25 and the final sidebar correction were inspected. No personal data is included in this public record.

| Reference surface | Implemented structure and evidence |
| --- | --- |
| Sidebar and header | Full-height sidebar, common icon/text columns, trailing hover-only carets, gold progress sectors, aligned traffic lights/toggle/tools; native screenshot plus sidebar/chrome regression checks. Latest user preference overrides original density: 14px text, 26px rows. |
| Empty Today | Header and single subdued centered list symbol; no extra hero text, CTA or unrelated tag strip. Native screenshot and empty-list regression. |
| Compact create/edit | Checkbox/title, notes/checklist, schedule at left, tags/checklist/deadline at right; shared editor. Move/Trash/More are in the persistent app footer. Native/browser captures and picker/save tests. |
| Date, deadline, tags, moves, actions | Compact anchored popovers with keyboard/escape behavior, async tag creation, draft destination, repetition/duplicate/convert/share controls. Browser fixture checks and screenshots. |
| Area/project lists | Projects before loose tasks, progress/counts, inline headings, schedule groups and persistent drag ordering. Desktop and narrow Chromium/WebKit captures. |
| Logbook and inline history | Month grouping; checkbox, logged date, title/adjacent tags; project context below; completed and cancelled states differ. Stacked later/logged toggles precede history. Screenshot and position assertions. |
| Quick Find | Focused overlay, blurred background, title/note/tag search and list switching. Keyboard and screenshot coverage. |
| Options menu | Shared Menu/MenuItem primitives own heading/task/options keyboard and row geometry; ported Samlad HeaderTools and shell.css geometry: floating surface, status/header, quiet icon rows and separators, with Things-specific actions. Native/browser captures. |
| Snackbar | Ported Samlad toast appearance, dismiss action and hover/focus pause. A dedicated layout slot prevents overlap with content/footer. Geometry checks and native/browser captures. |
| Motion | Source-inspired spring curves with task-app adaptation: delays 60 + 240 × (1 − 0.7^index) ms. Divider/supporting controls participate in the same clock. Decreasing gaps, 300ms cap, immediate handoffs, no list replay on editing and reduced-motion skip are tested. |

Ego Browser was used for live isolated interaction checks, including successful click-away switching and a synthetic failed save followed by retry. Dockerized Playwright supplies repeatable Chromium/WebKit assertions and screenshots. Native computer use verifies the installed binary rather than treating browser results as proof of native rendering.

The latest editor-switch correction has a stricter timing check: persistence remains unresolved while a real click opens the next editor. A mutation observer rejects a selected-only intermediate state, and `handoff-before-save.png` captures the open next editor while the old save is still blocked. Both engines failed this check before the correction and now pass. Failed-save draft restoration, rapid A→B→A switching and delayed new-item creation also pass. This replaces the earlier eventual-result assertion, which did not prove immediate switching. Failed drafts are retained in memory for the running session only. The full current suite passes 70 browser cases and 28 Bun tests.

The visual verdict is structural agreement with the references and the latest explicit corrections. Samlad colors/fonts/surface treatment intentionally differ from the original Things screenshots. The checks do not claim identical pixels or complete product parity.

Reproduce with the commands in README.md. Browser screenshots are generated under ignored test-results/; native screenshots and exact local receipts are under ignored out/ui-984/.
