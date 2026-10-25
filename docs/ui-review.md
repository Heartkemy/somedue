# UI follow-up review — 2026-10-23

Reviewed all ten `Screenshot 2026-10-23 at …` PNGs on the Desktop. The source reference is read-only; app-visible naming remains Somedue.

| Screenshot time | Issue reviewed | Shared correction |
| --- | --- | --- |
| 20.34.56 | Title-field focus ring clipped at the dialog body's edges | Dialog reserves six pixels for focus rings inside its scrolling body |
| 20.35.00 | macOS system select menu | Top-layer, app-rendered Select; same reference geometry and states |
| 20.35.05 | Trigger/caret spacing and focus boundary | Shared Select trigger: 40px control, 12px caret, 12px right inset |
| 20.35.11 | Cancel button sizing/padding | Shared Button: 40px height, 17px horizontal padding, pill radius |
| 20.35.17 | Sidebar action hover shape lacks inner padding | Explicit small Button; removed parent padding reset |
| 20.35.23 | Connection action crowded against following text | Dedicated CloudConnection screen and separate syncing state |
| 20.35.40 | Search/header spacing and alignment | Shared search-container geometry; heading wraps without overflowing; the sidebar owns its scroll area so the app frame cannot scroll |
| 20.35.44 | Search focus treatment excludes its icon and lacks inset | Focus ring surrounds the entire padded search control |
| 20.35.55 | Dots action is an oval | Explicit IconButton with equal width/height and circular radius |
| 20.58.57 | Export action icon touches hover background's left edge | Removed container padding reset; shared Button geometry |

Checkbox uses explicit appearance rather than system rendering: 18px square, 6px corners, yellow checked fill, inverse-ink check, mint focus ring. Native input semantics remain intact.

Select appearance follows the reference's `packages/ui/src/select.css`: no checkmark; 20px popup corners; 18px vertical surface padding; 10px × 12px option padding; muted 12px caret; subtle selected/hover fills; 2px yellow focus marker. DOM rendering replaces browser-specific `base-select` support without introducing a different visual design.

`Button`, `IconButton`, `Checkbox`, `Field`, `Select`, and `Dialog` are shared primitives in `src/ui.tsx`; visual rules live in `src/primitives.css`. Cloud screen layout is isolated in `src/cloud-connection.css`. Button activation explicitly focuses its control before the action so WebKit restores focus to the correct trigger after dialogs.

Reproducible checks: `bun run test:ui` (Chromium and WebKit, 1120×780 and 760×540). These exercise isolated fixture data, never the live account. Screenshots and traces are generated under ignored `test-results/`. Tests cover popup geometry/no checkmark, keyboard selection/typeahead/Escape, checkbox shape/color/Space, modal positioning and focus restoration, inline draft preservation, circular buttons, menu keyboard navigation, and connection → pending sync → error/retry → success handoff.

These browser checks do not certify pixel-identical native macOS rendering or resolve unsupported live account records by themselves.
