import { Input, Textarea, Kbd } from "./ui";
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
    <div
      class="app quick-app bg-bg text-ink overflow-clip selection:bg-selection selection:text-ink flex h-dvh min-w-0 flex-col"
      data-theme={theme()}
    >
      <div
        class="quick-titlebar flex h-13 shrink-0 items-center justify-between py-2.5 pr-4.5 pl-21 text-xs text-quiet"
        data-tauri-drag-region
      >
        <span>Quick Entry</span>
        <IconButton aria-label="Close quick entry" onClick={() => void close()}>
          <X size={16} />
        </IconButton>
      </div>
      <form
        class="quick-form flex min-h-0 flex-1 flex-col gap-3 px-7 pt-4 pb-6 [&>input]:bg-transparent [&>input]:px-0 [&>input]:py-1 [&>input]:text-xl [&>input]:font-medium [&>textarea]:min-h-18 [&>textarea]:flex-1 [&>textarea]:bg-transparent [&>textarea]:px-0 [&>textarea]:py-1 [&>textarea]:text-sm [&>textarea]:text-muted"
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
        <Input
          variant="plain"
          ref={input}
          autofocus
          aria-label="Quick entry title"
          placeholder="What’s on your mind?"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <Textarea
          variant="plain"
          aria-label="Quick entry notes"
          placeholder="Notes"
          value={notes()}
          onInput={(e) => setNotes(e.currentTarget.value)}
        />
        <Show when={error()}>
          <p
            role="alert"
            class="error-text mb-4 text-xs leading-relaxed text-danger"
          >
            {error()}
          </p>
        </Show>
        <div class="quick-actions flex items-end justify-between gap-4.5 [&>.field]:m-0 [&>.field]:flex-1">
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
            <Kbd>⌘ ↵</Kbd>
          </Button>
        </div>
      </form>
    </div>
  );
}
