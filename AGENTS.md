# Styling

Use Tailwind utilities and the standard theme scale for styling. Reuse and extend
the primitives in `src/ui/` instead of duplicating control styles. Keep the layout
and behavior consistent when refactoring; small changes to fit the scale are fine.

Custom CSS is allowed only in exceptional cases where Tailwind cannot express
what is needed. Document the reason beside the exception. Theme configuration
belongs in `src/style.css`; do not reintroduce component stylesheets or hard-coded
pixel utilities.
