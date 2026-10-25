import { Show, type JSX } from "solid-js";
import { RotateCw } from "lucide-solid";
import { Button, CheckButton } from "./ui";
import {
  container,
  isHeading,
  isProject,
  isTemplate,
  later,
  title,
  type Entity,
} from "./model";
import {
  isDueToday,
  isSomeday,
  ProjectProgress,
  TaskDeadline,
  TaskMetadata,
} from "./TaskIndicators";

export default function TaskRow(props: {
  item: Entity;
  all: Entity[];
  selected: boolean;
  name?: string;
  showContainer: boolean;
  dropEdge?: "before" | "after";
  schedule: JSX.Element;
  open: (event: MouseEvent | KeyboardEvent) => void;
  focus: () => void;
  complete: (cancel: boolean) => void;
  context: (event: MouseEvent) => void;
  dragStart: (event: DragEvent) => void;
  dragEnd: () => void;
  dragOver: (event: DragEvent & { currentTarget: HTMLDivElement }) => void;
  dragLeave: (event: DragEvent & { currentTarget: HTMLDivElement }) => void;
  drop: (event: DragEvent) => void;
}) {
  return (
    <div
      id={`item-${props.item.id}`}
      role="listitem"
      aria-current={props.selected ? "true" : undefined}
      tabindex="0"
      class="task-row group/task relative grid min-h-10 grid-cols-[--spacing(7)_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-1.5 outline-none transition-colors hover:bg-hover compact:min-h-9 [&.selected]:bg-mint/10 [&.selected:has(+.selected)]:rounded-b-none [&.selected+.selected]:rounded-t-none [&.logged]:grid-cols-[--spacing(7)_--spacing(13)_minmax(0,1fr)] [&.heading]:mt-6 [&.heading]:mb-2 [&.heading]:flex [&.heading]:bg-transparent [&.heading]:py-2 data-[drop-edge]:after:pointer-events-none data-[drop-edge]:after:absolute data-[drop-edge]:after:inset-x-0 data-[drop-edge]:after:h-0.5 data-[drop-edge]:after:bg-mint data-[drop-edge]:after:content-[''] data-[drop-edge=before]:after:-top-0.5 data-[drop-edge=after]:after:-bottom-0.5"
      classList={{
        selected: props.selected,
        completed: props.item.props.ss === 3,
        cancelled: props.item.props.ss === 2,
        logged: !!props.item.props.ss,
        later: later(props.item) && !props.item.props.ss,
        "project-row": isProject(props.item),
        heading: isHeading(props.item),
      }}
      data-drop-edge={props.dropEdge}
      draggable="true"
      onPointerDown={(e) => {
        if (
          (e.metaKey || e.ctrlKey || e.shiftKey) &&
          !(e.target as HTMLElement).closest("button,input,[data-row-control]")
        )
          e.preventDefault();
      }}
      onFocus={(e) => {
        if (e.target === e.currentTarget) props.focus();
      }}
      onDragStart={props.dragStart}
      onDragEnd={props.dragEnd}
      onDragOver={props.dragOver}
      onDragLeave={props.dragLeave}
      onDrop={props.drop}
      onContextMenu={props.context}
      onClick={(e) => {
        if (
          !(e.target as HTMLElement).closest("button,input,[data-row-control]")
        )
          props.open(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          props.open(e);
        }
      }}
    >
      <Show when={!isHeading(props.item)}>
        <Show
          when={!isTemplate(props.item)}
          fallback={
            <RotateCw
              size={16}
              class="justify-self-center text-upcoming"
              aria-label="Repeating template"
            />
          }
        >
          <Show
            when={isProject(props.item) && !props.item.props.ss}
            fallback={
              <CheckButton
                checked={!!props.item.props.ss}
                canceled={props.item.props.ss === 2}
                dashed={isSomeday(props.item)}
                class={
                  isProject(props.item)
                    ? "text-project hover:bg-project/10"
                    : undefined
                }
                aria-label={`${props.item.props.ss ? "Reopen" : "Complete"} ${title(props.item)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  props.complete(e.altKey);
                }}
              />
            }
          >
            <Button
              variant="bare"
              class="task-check project grid size-4 min-h-4 place-items-center justify-self-center rounded-full p-0"
              aria-label={`Complete ${title(props.item)}`}
              onClick={(e) => {
                e.stopPropagation();
                props.complete(e.altKey);
              }}
            >
              <ProjectProgress project={props.item} all={props.all} />
            </Button>
          </Show>
        </Show>
      </Show>
      <Show when={props.item.props.ss}>
        <span
          class="logged-date text-xs font-medium whitespace-nowrap text-accent tabular-nums"
          title={props.item.props.ss === 2 ? "Cancelled" : "Completed"}
        >
          {props.item.props.sp
            ? new Date(props.item.props.sp * 1000).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
              })
            : "Date unavailable"}
        </span>
      </Show>
      <div class="task-content flex min-w-0 flex-col group-[.heading]/task:flex-1">
        <div class="task-summary flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Show when={isDueToday(props.item) && !isHeading(props.item)}>
            <span
              class="due-today size-2 shrink-0 rounded-full bg-highlight"
              title="Scheduled for today"
              aria-label="Due today"
            />
          </Show>
          <span class="task-title min-w-0 shrink truncate text-sm leading-6 group-[.heading]/task:text-base group-[.heading]/task:font-semibold group-[.heading]/task:text-accent group-[.completed]/task:text-muted group-[.cancelled]/task:text-quiet group-[.cancelled]/task:line-through">
            {props.name || title(props.item)}
          </span>
          <TaskMetadata item={props.item} all={props.all} />
          <Show when={props.item.props.dd}>
            <TaskDeadline value={props.item.props.dd} />
          </Show>
        </div>
        <Show when={props.showContainer && container(props.item, props.all)}>
          <span class="container-label max-w-full truncate text-xs leading-4 text-quiet">
            {container(props.item, props.all)}
          </span>
        </Show>
      </div>
      <Show
        when={
          !props.item.props.ss &&
          !isHeading(props.item) &&
          !isTemplate(props.item)
        }
      >
        <div
          data-row-control
          class="row-schedule absolute top-0 -left-8 flex h-9 w-7 items-center justify-center opacity-0 transition-opacity group-hover/task:opacity-100 group-focus-within/task:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={(e) => e.stopPropagation()}
          role="group"
          aria-label={`Schedule ${title(props.item)}`}
        >
          {props.schedule}
        </div>
      </Show>
    </div>
  );
}
