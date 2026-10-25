import "./cloud-connection.css";
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
      class="cloud-screen"
      aria-label="Things Cloud connection"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy()) props.close();
      }}
    >
      <div class="cloud-screen-scroll">
        <div class="cloud-card">
          <Show when={!busy()}>
            <IconButton
              size="small"
              class="cloud-back"
              aria-label="Close Things Cloud connection"
              onClick={props.close}
            >
              <X size={18} />
            </IconButton>
          </Show>
          <div class="cloud-mark">
            <Show when={busy()} fallback={<Cloud size={28} />}>
              <RefreshCw size={28} class="spin" />
            </Show>
          </div>
          <h1 ref={heading} tabIndex={-1}>
            {busy() ? "Syncing your Things" : "Connect Things Cloud"}
          </h1>
          <Show
            when={busy()}
            fallback={
              <>
                <p class="cloud-intro">
                  Bring your projects, to-dos, and notes together.
                </p>
                <Show when={error()}>
                  <div role="alert" class="cloud-error">
                    <strong>Connection couldn’t finish</strong>
                    <p>{error()}</p>
                    <small>Your saved workspace hasn’t been replaced.</small>
                  </div>
                </Show>
                <form onSubmit={connect}>
                  <Field label="Email">
                    <input
                      ref={input}
                      type="email"
                      autocomplete="username"
                      required
                      value={email()}
                      onInput={(e) => setEmail(e.currentTarget.value)}
                    />
                  </Field>
                  <Field label="Things Cloud password">
                    <input
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
                <p class="cloud-privacy">
                  <ShieldCheck size={16} />
                  Your password stays in macOS Keychain.
                </p>
                <Button onClick={props.close}>
                  Continue with local workspace
                </Button>
              </>
            }
          >
            <p class="cloud-intro" role="status" aria-live="polite">
              {description()}
            </p>
            <div
              class="sync-activity"
              role="progressbar"
              aria-label="Initial sync in progress"
            >
              <span />
            </div>
            <ol class="sync-steps">
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
              <p class="sync-count">
                {(progress().receivedBytes / 1024 / 1024).toFixed(1)} MB
                received
                <Show when={progress().items > 0}>
                  {" "}
                  · {progress().items.toLocaleString()} items processed
                </Show>
              </p>
            </Show>
            <p class="cloud-footnote">
              The first sync can take a few minutes. Your workspace opens when
              it’s ready.
            </p>
          </Show>
        </div>
      </div>
    </dialog>
  );
}
