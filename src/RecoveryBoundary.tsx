import {
  ErrorBoundary,
  Show,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { AlertTriangle, RefreshCw } from "lucide-solid";
import { Button } from "./ui/Button";

export default function RecoveryBoundary(props: { children: JSX.Element }) {
  const [asyncError, setAsyncError] = createSignal(false);
  onMount(() => {
    const failed = () => setAsyncError(true);
    window.addEventListener("error", failed);
    window.addEventListener("unhandledrejection", failed);
    onCleanup(() => {
      window.removeEventListener("error", failed);
      window.removeEventListener("unhandledrejection", failed);
    });
  });
  return (
    <ErrorBoundary
      fallback={(_, reset) => (
        <main
          class="grid h-dvh place-content-center gap-5 bg-bg px-8 text-ink"
          role="alert"
        >
          <AlertTriangle class="text-accent" size={28} />
          <h1 class="text-2xl font-semibold">
            Somedue couldn’t display this page.
          </h1>
          <p class="max-w-prose text-sm leading-relaxed text-muted">
            Your saved tasks are still on this Mac. Try opening the workspace
            again, or reload the app. Unsaved changes may need to be entered
            again.
          </p>
          <div class="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                setAsyncError(false);
                reset();
              }}
            >
              Try again
            </Button>
            <Button variant="primary" onClick={() => location.reload()}>
              <RefreshCw size={15} />
              Reload app
            </Button>
          </div>
        </main>
      )}
    >
      {props.children}
      <Show when={asyncError()}>
        <div
          role="alert"
          class="recovery-notice fixed inset-x-6 bottom-16 z-100 mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-xl bg-surface p-4 text-sm text-ink shadow-xl ring-1 ring-danger/30"
        >
          <AlertTriangle size={18} class="shrink-0 text-danger" />
          <p class="min-w-0 flex-1">
            Something went wrong. You can keep working or reload Somedue.
          </p>
          <Button size="small" onClick={() => location.reload()}>
            Reload app
          </Button>
          <Button
            size="small"
            variant="quiet"
            onClick={() => setAsyncError(false)}
          >
            Dismiss
          </Button>
        </div>
      </Show>
    </ErrorBoundary>
  );
}
