import { For, Show } from "solid-js";
import {
  Archive,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileText,
  Flag,
  Inbox,
  Layers,
  ListChecks,
  Moon,
  RotateCw,
  Star,
  Tag,
  Trash2,
} from "lucide-solid";
import { Pill } from "./ui";
import {
  isProject,
  isTemplate,
  noteText,
  projectProgressPath,
  projectStats,
  refs,
  title,
  today,
  type Entity,
} from "./model";
import { Dynamic } from "solid-js/web";

export function ListIcon(props: { name: string; size?: number }) {
  const icons = {
    Inbox,
    Today: StarIcon,
    Upcoming: CalendarDays,
    Anytime: Layers,
    Someday: Archive,
    Logbook: BookOpen,
    Trash: Trash2,
    "This Evening": Moon,
  };
  const colors: Record<string, string> = {
    Today: "text-accent",
    Upcoming: "text-upcoming",
    Anytime: "text-anytime",
    Someday: "text-someday",
    "This Evening": "text-muted",
  };
  return (
    <Dynamic
      component={icons[props.name as keyof typeof icons] || Inbox}
      size={props.size || 16}
      class={colors[props.name] || "text-quiet"}
    />
  );
}

function StarIcon(props: Record<string, any>) {
  return <Star {...props} fill="currentColor" />;
}

export function EntityIcon(props: { item: Entity; all: Entity[] }) {
  return (
    <Show when={!props.item.kind.startsWith("Area")} fallback={<AreaIcon />}>
      <Show
        when={!isProject(props.item)}
        fallback={
          <Show
            when={!props.item.props.ss}
            fallback={<CheckCircle2 size={16} class="shrink-0 text-project" />}
          >
            <ProjectProgress project={props.item} all={props.all} />
          </Show>
        }
      >
        <Show
          when={!isTemplate(props.item)}
          fallback={<RotateCw size={16} class="shrink-0 text-upcoming" />}
        >
          <Show
            when={!props.item.kind.startsWith("Tag")}
            fallback={<Tag size={16} class="shrink-0 text-muted" />}
          >
            <CheckCircle2 size={16} class="shrink-0 text-muted" />
          </Show>
        </Show>
      </Show>
    </Show>
  );
}

export const isSomeday = (item: Entity) =>
  item.props.st === 2 && !(item.props.sr || item.props.tir);
export const isDueToday = (item: Entity) =>
  !item.props.ss &&
  (((item.props.sr || item.props.tir) <= today() &&
    !!(item.props.sr || item.props.tir)) ||
    item.props.dd === today());

export function AreaIcon(props: { stacked?: boolean }) {
  return (
    <svg
      class="area-icon size-4 shrink-0 text-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m4 7 8-4 8 4v9l-8 4-8-4Z M4 7l8 4 8-4" />
      <Show when={props.stacked}>
        <path d="m4 11 8 4 8-4 M4 15l8 4 8-4" />
      </Show>
    </svg>
  );
}

export function ProjectProgress(props: { project: Entity; all: Entity[] }) {
  const ratio = () => {
    const stats = projectStats(props.project, props.all);
    return stats.total ? stats.done / stats.total : 0;
  };
  return (
    <svg
      class="project-ring inline-block size-4 shrink-0 overflow-visible text-project"
      viewBox="0 0 20 20"
      role="img"
      aria-label={`${Math.round(ratio() * 100)}% complete`}
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        class="project-sector"
        fill="currentColor"
        d={projectProgressPath(ratio())}
      />
    </svg>
  );
}

export function TaskMetadata(props: { item: Entity; all: Entity[] }) {
  const checks = () =>
    props.all.filter((e) => refs(e, "ts").includes(props.item.id));
  return (
    <>
      <div class="task-indicators flex shrink-0 items-center gap-1.5 text-quiet">
        <Show when={noteText(props.item)}>
          <span title="Has notes" aria-label="Has notes">
            <FileText size={14} />
          </span>
        </Show>
        <Show when={checks().length}>
          <span
            class="checklist-indicator"
            aria-label="Has checklist"
            title={`${checks().filter((e) => e.props.ss === 3).length} of ${checks().length} checklist items complete`}
          >
            <ListChecks size={15} />
          </span>
        </Show>
        <Show
          when={
            refs(props.item, "rt").length ||
            isTemplate(props.item) ||
            props.item.props.rp
          }
        >
          <span title="Repeating">
            <RotateCw size={14} />
          </span>
        </Show>
        <Show when={isProject(props.item)}>
          <span class="project-task-count rounded border border-current px-1 text-xs leading-4 text-muted tabular-nums">
            {props.item.props.ss
              ? projectStats(props.item, props.all).total
              : projectStats(props.item, props.all).remaining}
          </span>
        </Show>
      </div>
      <div class="task-meta flex min-w-0 flex-wrap items-center gap-1.5">
        <For each={refs(props.item, "tg")}>
          {(id) => (
            <Pill class="row-tag max-w-32 max-lg:max-w-24">
              <span class="truncate">
                {title(
                  props.all.find((t) => t.id === id) || {
                    id,
                    kind: "Tag4",
                    props: { tt: "Tag" },
                  },
                )}
              </span>
            </Pill>
          )}
        </For>
      </div>
    </>
  );
}

export function TaskDeadline(props: { value: number }) {
  const days = () => Math.round((props.value - today()) / 86400);
  const label = () =>
    days() < 0
      ? `${-days()} day${days() === -1 ? "" : "s"} ago`
      : days() === 0
        ? "Today"
        : days() === 1
          ? "Tomorrow"
          : new Date(props.value * 1000).toLocaleDateString("en", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            });
  return (
    <span
      class="deadline ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap pl-3 text-xs text-deadline [&.overdue]:text-danger"
      classList={{ overdue: days() < 0 }}
      title={`Deadline ${new Date(props.value * 1000).toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" })}`}
    >
      <Flag size={13} fill="currentColor" />
      {label()}
    </span>
  );
}
