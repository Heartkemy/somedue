import { createSignal, createMemo, For, Show } from "solid-js";
import { Tag, Plus, X } from "lucide-solid";
import { Button, Checkbox, IconButton } from "./ui";
import { Popover } from "./Popover";
import { title, type Entity } from "./model";
export default function TagPicker(props: {
  label?: string;
  compact?: boolean;
  busyChange?: (busy: boolean) => void;
  tags: Entity[];
  selected: string[];
  change: (ids: string[]) => void;
  create: (name: string) => Promise<string>;
}) {
  const [query, setQuery] = createSignal(""),
    [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal("");
  const filtered = createMemo(() =>
    props.tags.filter((t) =>
      title(t).toLocaleLowerCase().includes(query().trim().toLocaleLowerCase()),
    ),
  );
  const toggle = (id: string) =>
    props.change(
      props.selected.includes(id)
        ? props.selected.filter((x) => x !== id)
        : [...props.selected, id],
    );
  const exact = () =>
    props.tags.find(
      (t) =>
        title(t).toLocaleLowerCase() === query().trim().toLocaleLowerCase(),
    );
  async function add() {
    if (!query().trim() || busy()) return;
    setBusy(true);
    props.busyChange?.(true);
    setError("");
    try {
      const id = exact()?.id || (await props.create(query().trim()));
      if (!props.selected.includes(id)) props.change([...props.selected, id]);
      setQuery("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      props.busyChange?.(false);
    }
  }
  return (
    <div class="tag-picker">
      <Popover
        size={props.compact ? "compact" : "small"}
        label={props.label || "Tags"}
        class="tag-dropdown"
        width={248}
        trigger={
          <>
            <Tag size={14} />
            <Show when={!props.compact}>Tags</Show>
          </>
        }
      >
        {() => (
          <>
            <form
              class="tag-picker-search"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <input
                autofocus
                aria-label="Find or create tag"
                placeholder="Find or create a tag"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                disabled={busy()}
              />
              <IconButton
                size="small"
                type="submit"
                aria-label="Create or add tag"
                disabled={!query().trim() || busy()}
              >
                <Plus size={16} />
              </IconButton>
            </form>
            <Show when={error()}>
              <p role="alert" class="error-text">
                {error()}
              </p>
            </Show>
            <div class="tag-picker-list" aria-label="Available tags">
              <For each={filtered()}>
                {(tag) => (
                  <label class="tag-picker-option">
                    <Checkbox
                      aria-label={title(tag)}
                      disabled={busy()}
                      checked={props.selected.includes(tag.id)}
                      onChange={() => toggle(tag.id)}
                    />
                    <span>{title(tag)}</span>
                  </label>
                )}
              </For>
            </div>
            <Show when={query().trim() && !filtered().length}>
              <p>No matching tags.</p>
            </Show>
            <Show when={!props.tags.length && !query()}>
              <p>
                No tags yet. Type a name and press Return to create your first
                tag.
              </p>
            </Show>
            <Show when={query().trim() && !exact()}>
              <Button size="small" onClick={() => void add()} disabled={busy()}>
                <Plus size={14} />
                {busy() ? "Creating…" : `Create “${query().trim()}”`}
              </Button>
            </Show>
          </>
        )}
      </Popover>
      <For each={props.tags.filter((t) => props.selected.includes(t.id))}>
        {(tag) => (
          <Button
            size={props.compact ? "compact" : "small"}
            class="assigned-tag"
            aria-label={`Remove tag ${title(tag)}`}
            onClick={() => toggle(tag.id)}
          >
            {title(tag)}
            <X size={12} />
          </Button>
        )}
      </For>
    </div>
  );
}
