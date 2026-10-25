import { createMemo, createSignal, For, Show } from "solid-js";
import { Check, Inbox, ListChecks, Search, X } from "lucide-solid";
import { Input, Button } from "./ui";
import { EntityIcon } from "./TaskIndicators";
import {
  active,
  descendants,
  isHeading,
  isProject,
  isTemplate,
  refs,
  title,
  type Entity,
} from "./model";

export default function DestinationPicker(props: {
  all: Entity[];
  item: Entity;
  selected?: string;
  choose: (destination: Entity | null, inbox: boolean) => void;
}) {
  const [query, setQuery] = createSignal(""),
    [index, setIndex] = createSignal(0);
  const entries = createMemo(() => {
    const excluded = new Set(
      descendants(props.item, props.all).map((item) => item.id),
    );
    const eligible = props.all.filter(
      (item) =>
        !excluded.has(item.id) && !isTemplate(item) && active(item, props.all),
    );
    const areas = eligible
      .filter((item) => item.kind.startsWith("Area"))
      .sort((a, b) => (a.props.ix || 0) - (b.props.ix || 0));
    const projects = eligible
      .filter(isProject)
      .sort((a, b) => (a.props.ix || 0) - (b.props.ix || 0));
    const headings = eligible.filter(isHeading);
    const result: {
      id: string;
      label: string;
      item: Entity | null;
      depth: number;
    }[] = [
      { id: "inbox", label: "Inbox", item: null, depth: 0 },
      { id: "none", label: "No Project", item: null, depth: 0 },
    ];
    const addProject = (project: Entity, depth: number) => {
      if (isProject(props.item)) return;
      result.push({
        id: project.id,
        label: title(project),
        item: project,
        depth,
      });
      if (!isHeading(props.item))
        for (const heading of headings.filter((item) =>
          refs(item, "pr").includes(project.id),
        ))
          result.push({
            id: heading.id,
            label: title(heading),
            item: heading,
            depth: depth + 1,
          });
    };
    for (const area of areas) {
      if (!isHeading(props.item))
        result.push({ id: area.id, label: title(area), item: area, depth: 0 });
      for (const project of projects.filter((item) =>
        refs(item, "ar").includes(area.id),
      ))
        addProject(project, 1);
    }
    for (const project of projects.filter((item) => !refs(item, "ar").length))
      addProject(project, 0);
    return result.filter((entry) =>
      entry.label.toLocaleLowerCase().includes(query().toLocaleLowerCase()),
    );
  });
  const selected = (id: string) =>
    id === (props.selected || (props.item.props.st === 0 ? "inbox" : "none"));
  return (
    <div
      class="destination-picker"
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          setIndex((i) =>
            Math.max(
              0,
              Math.min(
                entries().length - 1,
                i + (event.key === "ArrowDown" ? 1 : -1),
              ),
            ),
          );
          document
            .getElementById(`destination-${index()}`)
            ?.scrollIntoView({ block: "nearest" });
        }
        if (
          event.key === "Enter" &&
          (event.target as HTMLElement).matches("input")
        ) {
          event.preventDefault();
          const entry = entries()[index()];
          if (entry) props.choose(entry.item, entry.id === "inbox");
        }
      }}
    >
      <div class="mb-2 flex items-center gap-2 rounded-full bg-hover px-3 text-muted">
        <Search size={14} />
        <Input
          variant="plain"
          autofocus
          class="min-h-8 px-0 py-0 text-xs"
          aria-label="Move destination"
          placeholder="Move"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setIndex(0);
          }}
        />
      </div>
      <div
        class="destination-list flex max-h-[50dvh] flex-col overflow-auto"
        role="listbox"
        aria-label="Destinations"
      >
        <For each={entries()}>
          {(entry, i) => (
            <Button
              variant="bare"
              role="option"
              aria-label={entry.label}
              aria-selected={selected(entry.id)}
              id={`destination-${i()}`}
              class="min-h-7 w-full justify-start gap-2 rounded-md px-2 py-1 text-left text-xs text-ink"
              classList={{
                "bg-selection": index() === i(),
                "mt-2 border-t border-hover pt-2":
                  entry.id !== "inbox" && i() === 2,
              }}
              onPointerMove={() => setIndex(i())}
              onClick={() => props.choose(entry.item, entry.id === "inbox")}
            >
              <span
                class="flex min-w-0 flex-1 items-center gap-2"
                classList={{
                  "pl-3": entry.depth === 1,
                  "pl-6": entry.depth > 1,
                }}
              >
                <Show
                  when={entry.item}
                  fallback={
                    entry.id === "inbox" ? (
                      <Inbox size={16} class="text-quiet" />
                    ) : (
                      <X size={16} class="text-quiet" />
                    )
                  }
                >
                  <Show
                    when={!isHeading(entry.item!)}
                    fallback={
                      <ListChecks size={16} class="shrink-0 text-accent" />
                    }
                  >
                    <EntityIcon item={entry.item!} all={props.all} />
                  </Show>
                </Show>
                <span class="truncate">{entry.label}</span>
              </span>
              <Show when={selected(entry.id)}>
                <Check size={14} class="ml-auto text-accent" />
              </Show>
            </Button>
          )}
        </For>
        <Show when={!entries().length}>
          <p class="p-3 text-xs text-muted">No matching destinations.</p>
        </Show>
      </div>
    </div>
  );
}
