# Styling

Use Tailwind utilities and the standard theme scale for styling. Reuse and extend
the primitives in `src/ui/` instead of duplicating control styles. Keep the layout
and behavior consistent when refactoring; small changes to fit the scale are fine.

Custom CSS is allowed only in exceptional cases where Tailwind cannot express
what is needed. Document the reason beside the exception. Theme configuration
belongs in `src/style.css`; do not reintroduce component stylesheets or hard-coded
pixel utilities.

# README screenshots

When a UI change affects a README screenshot, refresh the affected images in
`docs/screenshots/` before finishing. Run `bun run screenshots` (requires Docker)
and visually inspect the results. Use only the dark theme. Keep the synthetic
fixture in `tests/browser/readme-screenshots.ts` serene, playful, and non-biased; never
capture personal tasks, credentials, or Things Cloud data. Update README image
references and captions when the views change.

Use compact app viewports for Today and Upcoming to avoid large empty areas;
do not shrink README images with fixed display widths. Keep image proportions intact. The
capture script sizes the window frame to each viewport, hides the browser preview
notice only while taking screenshots and adds
synthetic macOS traffic lights, rounded corners, and soft shadows. Preserve this
presentation when refreshing images; do not change the app for screenshot framing.
