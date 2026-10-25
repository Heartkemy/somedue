# Task #984 — structural fidelity record

The original task and child briefs were recovered from Samlad, including every attached correction. All chronological reference screenshots from 2026-10-24, the Samlad options reference from 2026-10-25 and the final sidebar correction were inspected. No personal data is included in this public record.

| Reference surface | Implemented structure and evidence |
| --- | --- |
| Sidebar and header | Full-height sidebar, common icon/text columns, trailing hover-only carets, gold progress sectors, aligned traffic lights/toggle/tools; native screenshot plus sidebar/chrome regression checks. Task #984 used 14px text and 26px rows; task #1000 later increased navigation to 16px text and 32px rows. |
| Empty Today | Header and single centered list symbol; no extra hero text, CTA or unrelated tag strip. Native screenshot and empty-list regression. |
| Compact create/edit | Checkbox/title, notes/checklist, schedule at left, tags/checklist/deadline at right; shared editor. Move/Trash/More are in the persistent app footer. Native/browser captures and picker/save tests. |
| Date, deadline, tags, moves, actions | Compact anchored popovers with keyboard/escape behavior, async tag creation, draft destination, repetition/duplicate/convert/share controls. Browser fixture checks and screenshots. |
| Area/project lists | Projects before loose tasks, progress/counts, inline headings, schedule groups and persistent drag ordering. Desktop and narrow Chromium/WebKit captures. |
| Logbook and inline history | Month grouping; checkbox, logged date, title/adjacent tags; project context below; completed and cancelled states differ. Stacked later/logged toggles precede history. Screenshot and position assertions. |
| Quick Find | Focused overlay, blurred background, title/note/tag search and list switching. Keyboard and screenshot coverage. |
| Options menu | Shared Menu/MenuItem primitives own heading/task/options keyboard and row geometry; ported Samlad HeaderTools and shell.css geometry: floating surface, status/header, quiet icon rows and separators, with Things-specific actions. Native/browser captures. |
| Snackbar | Ported Samlad toast appearance, dismiss action and hover/focus pause. A dedicated layout slot prevents overlap with content/footer. Geometry checks and native/browser captures. |
| Motion | Source-inspired spring curves with task-app adaptation: delays 60 + 240 × (1 − 0.7^index) ms. Divider/supporting controls participate in the same clock. Decreasing gaps, 300ms cap, immediate handoffs, no list replay on editing and reduced-motion skip are tested. |

Ego Browser was used for live isolated interaction checks, including successful click-away switching and a synthetic failed save followed by retry. Dockerized Playwright supplies repeatable Chromium/WebKit assertions and screenshots. Native computer use verifies the installed binary rather than treating browser results as proof of native rendering.

Task #984 verified immediate click-away editor switching while persistence remained unresolved. Task #1000's follow-up supersedes that gesture: one click selects, Enter or a double-click opens the editor, and empty space clears selection. Closing an existing editor preserves the original double-click target through the resulting layout change. Delayed-save, failed-draft restoration, rapid A→B→A switching and delayed new-item creation checks cover the revised behavior. Failed drafts remain in memory for the running session only.

The task #1000 follow-up passes 162 Chromium/WebKit UI cases and 37 model, motion and editor-save tests. A final 14-case run covers selected-row Enter handling and transparent Settings hover. Browser captures cover the revised controls in desktop dark and narrow light layouts; these results do not claim native-window or live Cloud verification. App icon generation is handled separately by task #1002.

Later task #1000 corrections measure visible icon bounds and control surfaces directly. Header icons occupy their full 32px column with a 12px text gap; project-heading dividers span the action-menu column. Assigned schedule chips and the checklist-add button align their background edges with the notes. The editor's matched negative margin and left padding extend only its surface, keeping content in place. Upcoming uses the shared Samlad-style serif underline tabs, including 1.6× underline growth on hover.

Named views now share `ListIcon` across navigation, headings, pickers and empty states, with a fixed glyph, color, fill and stroke per view. Area/project icons share `EntityIcon`; collapsing an area changes its caret without changing its glyph. Checklist-add has an 8px separator gap, and repetition controls fit their content within the editor width.

The visual verdict is structural agreement with the references and the latest explicit corrections. Samlad colors/fonts/surface treatment intentionally differ from the original Things screenshots. The checks do not claim identical pixels or complete product parity.

Reproduce with the commands in README.md. Browser screenshots are generated under ignored test-results/; native screenshots and exact local receipts are under ignored out/ui-984/.
