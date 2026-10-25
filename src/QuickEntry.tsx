import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { call, native } from "./api";
import { create, schedule } from "./model";
import { Select, Button, IconButton, Field } from "./ui";
import { Plus, X } from "lucide-solid";
export default function QuickEntry() {
  const [title, setTitle] = createSignal(""),
    [notes, setNotes] = createSignal(""),
    [destination, setDestination] = createSignal("Inbox"),
    [error, setError] = createSignal(""),
    [saving, setSaving] = createSignal(false),
    [theme, setTheme] = createSignal("dark");
  let input!: HTMLInputElement;
  onMount(() => {
    input.focus();
    const focus = () => {
      input.focus();
      if (native())
        void call("load")
          .then((s) => setTheme(s.preferences.theme || "dark"))
          .catch((e) => setError(String(e)));
    };
    window.addEventListener("focus", focus);
    onCleanup(() => window.removeEventListener("focus", focus));
    if (native())
      void call("load")
        .then((s) => {
          setTheme(s.preferences.theme || "dark");
          setDestination(s.preferences.defaultList || "Inbox");
        })
        .catch((e) => setError(String(e)));
  });
  async function close() {
    if (native()) await getCurrentWindow().hide();
  }
  async function save() {
    if (!title().trim() || saving()) return;
    setSaving(true);
    setError("");
    try {
      const changes = create("Task6", {
        tt: title().trim(),
        nt: notes(),
        ...schedule(destination()),
      });
      const state = await call("mutate", { changes, confirm: false });
      setTitle("");
      setNotes("");
      await emit("workspace-changed");
      if (state.account !== "local")
        void call("sync")
          .then(() => emit("workspace-changed"))
          .catch(async (e) => {
            await emit("sync-error", String(e));
            await emit("workspace-changed");
          });
      await close();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div class="app quick-app" data-theme={theme()}>
      <div class="quick-titlebar" data-tauri-drag-region>
        <span>Quick Entry</span>
        <IconButton aria-label="Close quick entry" onClick={() => void close()}>
          <X size={16} />
        </IconButton>
      </div>
      <form
        class="quick-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
          if (
            e.key === "Escape" &&
            !(e.target as HTMLElement).closest("[role=listbox]")
          )
            void close();
        }}
      >
        <input
          ref={input}
          autofocus
          aria-label="Quick entry title"
          placeholder="What’s on your mind?"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <textarea
          aria-label="Quick entry notes"
          placeholder="Notes"
          value={notes()}
          onInput={(e) => setNotes(e.currentTarget.value)}
        />
        <Show when={error()}>
          <p role="alert" class="error-text">
            {error()}
          </p>
        </Show>
        <div class="quick-actions">
          <Field label="Add to">
            <Select
              value={destination()}
              onChange={(e) => setDestination(e.currentTarget.value)}
            >
              <option>Inbox</option>
              <option>Today</option>
              <option>This Evening</option>
              <option>Anytime</option>
              <option>Someday</option>
            </Select>
          </Field>
          <Button
            variant="primary"
            type="submit"
            disabled={!title().trim() || saving()}
          >
            <Plus size={16} />
            {saving() ? "Saving…" : "Add To-Do"}
            <kbd>⌘ ↵</kbd>
          </Button>
        </div>
      </form>
    </div>
  );
}
