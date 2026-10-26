import { Input } from "./ui";
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { Channel } from "@tauri-apps/api/core";
import { Cloud, RefreshCw, X, ShieldCheck, Check } from "lucide-solid";
import { Button, Field, IconButton } from "./ui";
import { call } from "./api";
import type { State } from "./model";
type Progress = {
  stage: "verifying" | "downloading" | "processing" | "saving";
  receivedBytes: number;
  items: number;
};
export default function CloudConnection(props: {
  connected: (state: State) => void;
  close: () => void;
}) {
  const [email, setEmail] = createSignal(""),
    [password, setPassword] = createSignal("");
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal("");
  const [progress, setProgress] = createSignal<Progress>({
    stage: "verifying",
    receivedBytes: 0,
    items: 0,
  });
  let input!: HTMLInputElement;
  let heading!: HTMLHeadingElement;
  let dialog!: HTMLDialogElement;
  let previous: Element | null = null;
  onMount(() => {
    previous = document.activeElement;
    dialog.showModal();
    input?.focus({ preventScroll: true });
  });
  onCleanup(() => {
    dialog.close();
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus({ preventScroll: true });
  });
  const description = () =>
    ({
      verifying: "Checking your account…",
      downloading: "Downloading your Things history…",
      processing: "Organizing your projects and to-dos…",
      saving: "Saving your workspace securely…",
    })[progress().stage];
  async function connect(e: SubmitEvent) {
    e.preventDefault();
    if (busy()) return;
    setError("");
    setProgress({ stage: "verifying", receivedBytes: 0, items: 0 });
    setBusy(true);
    queueMicrotask(() => heading?.focus({ preventScroll: true }));
    try {
      let channel: Channel<Progress> | undefined;
      if (
        typeof (window as any).__TAURI_INTERNALS__?.transformCallback ===
        "function"
      ) {
        channel = new Channel<Progress>();
        channel.onmessage = setProgress;
      }
      const state = await call("connect", {
        email: email().trim(),
        password: password(),
        progress: channel ?? null,
      });
      setPassword("");
      props.connected(state);
    } catch (e) {
      setError(String(e));
      setBusy(false);
      queueMicrotask(() => heading?.focus({ preventScroll: true }));
    }
  }
  return (
    <dialog
      ref={dialog}
      class="cloud-screen fixed inset-0 m-auto max-h-[calc(100dvh_-_--spacing(12))] w-110 max-w-[calc(100vw_-_--spacing(8))] flex-col overflow-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-2xl open:flex backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      aria-label="Things Cloud connection"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy()) props.close();
      }}
    >
      <div class="cloud-screen-scroll flex min-h-0 flex-1 overflow-auto p-7">
        <div class="cloud-card relative m-auto w-105 max-w-full px-1.5 py-3 text-center [&>h1]:font-sans [&>h1]:text-2xl [&>h1]:leading-tight [&>h1]:font-semibold [&>h1]:tracking-tight [&>h1]:outline-none [&>form]:text-left [&>form>.primary]:mt-1.5 [&>form>.primary]:w-full">
          <Show when={!busy()}>
            <IconButton
              size="small"
              class="cloud-back absolute -top-4 -right-4"
              aria-label="Close Things Cloud connection"
              onClick={props.close}
            >
              <X size={18} />
            </IconButton>
          </Show>
          <div class="cloud-mark mx-auto mb-5.5 grid size-16 place-items-center rounded-2xl bg-selection text-accent">
            <Show when={busy()} fallback={<Cloud size={28} />}>
              <RefreshCw size={28} class="spin animate-spin" />
            </Show>
          </div>
          <h1 ref={heading} tabIndex={-1}>
            {busy() ? "Syncing your Things" : "Connect Things Cloud"}
          </h1>
          <Show
            when={busy()}
            fallback={
              <>
                <p class="cloud-intro mt-3.5 mb-6.5 text-sm leading-relaxed text-muted">
                  Bring your projects, to-dos, and notes together.
                </p>
                <Show when={error()}>
                  <div
                    role="alert"
                    class="cloud-error my-5 rounded-lg bg-danger/10 px-4 py-3.5 text-left text-xs leading-relaxed text-danger wrap-anywhere [&>p]:my-1 [&>small]:text-muted"
                  >
                    <strong>Connection couldn’t finish</strong>
                    <p>{error()}</p>
                    <small>Your saved workspace hasn’t been replaced.</small>
                  </div>
                </Show>
                <form onSubmit={connect}>
                  <Field label="Email">
                    <Input
                      ref={input}
                      type="email"
                      autocomplete="username"
                      required
                      value={email()}
                      onInput={(e) => setEmail(e.currentTarget.value)}
                    />
                  </Field>
                  <Field label="Things Cloud password">
                    <Input
                      type="password"
                      autocomplete="current-password"
                      required
                      value={password()}
                      onInput={(e) => setPassword(e.currentTarget.value)}
                    />
                  </Field>
                  <Button type="submit" variant="primary">
                    {error() ? "Try again" : "Connect Things Cloud"}
                  </Button>
                </form>
                <p class="cloud-privacy mt-5 mb-3 flex items-center justify-center gap-2 text-xs leading-relaxed text-muted [&>svg]:shrink-0">
                  <ShieldCheck size={16} />
                  Your password stays in macOS Keychain.
                </p>
                <Button onClick={props.close}>
                  Continue with local workspace
                </Button>
              </>
            }
          >
            <p
              class="cloud-intro mt-3.5 mb-6.5 text-sm leading-relaxed text-muted"
              role="status"
              aria-live="polite"
            >
              {description()}
            </p>
            <div
              class="sync-activity my-7.5 h-1 overflow-hidden rounded-full bg-hover [&>span]:block [&>span]:h-full [&>span]:w-1/3 [&>span]:rounded-full [&>span]:bg-mint motion-safe:[&>span]:animate-pulse"
              role="progressbar"
              aria-label="Initial sync in progress"
            >
              <span />
            </div>
            <ol class="sync-steps mx-auto w-fit list-none p-0 text-left text-sm text-quiet [&>li]:my-4 [&>li]:flex [&>li]:items-center [&>li]:gap-2.5 [&>.done]:text-mint [&>.current]:text-ink">
              <li classList={{ done: progress().stage !== "verifying" }}>
                <Check size={15} />
                Verify account
              </li>
              <li
                classList={{
                  current: ["downloading", "processing"].includes(
                    progress().stage,
                  ),
                }}
              >
                <Cloud size={15} />
                Download and organize history
              </li>
              <li classList={{ current: progress().stage === "saving" }}>
                <ShieldCheck size={15} />
                Save securely on this Mac
              </li>
            </ol>
            <Show when={progress().receivedBytes > 0}>
              <p class="sync-count mt-6 font-mono text-xs leading-6 text-muted">
                {(progress().receivedBytes / 1024 / 1024).toFixed(1)} MB
                received
                <Show when={progress().items > 0}>
                  {" "}
                  · {progress().items.toLocaleString()} items processed
                </Show>
              </p>
            </Show>
            <p class="cloud-footnote mx-auto mt-6 max-w-80 text-xs leading-relaxed text-muted">
              The first sync can take a few minutes. Your workspace opens when
              it’s ready.
            </p>
          </Show>
        </div>
      </div>
    </dialog>
  );
}
