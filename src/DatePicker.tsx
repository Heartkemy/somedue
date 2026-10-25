import { Input } from "./ui";
import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import {
  CalendarDays,
  Flag,
  ChevronLeft,
  ChevronRight,
  Bell,
  CalendarX,
  X,
} from "lucide-solid";
import { Button, IconButton } from "./ui";
import { Popover } from "./Popover";
import { date, today } from "./model";
import { ListIcon } from "./TaskIndicators";
function Calendar(props: { value: string; choose: (value: string) => void }) {
  const [month, setMonth] = createSignal(
    new Date(`${props.value || date(today())}T00:00:00Z`),
  );
  createEffect(() => {
    if (props.value) setMonth(new Date(`${props.value}T00:00:00Z`));
  });
  const monthLabel = () =>
    month().toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const days = createMemo(() => {
    const d = month(),
      first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
      offset = (first.getUTCDay() + 6) % 7;
    return Array.from(
      { length: 42 },
      (_, i) =>
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), i - offset + 1)),
    );
  });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (n: number) =>
    setMonth(
      (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)),
    );
  return (
    <div class="calendar">
      <div class="calendar-header mb-2 flex items-center justify-between gap-1.5 text-xs">
        <IconButton
          size="small"
          aria-label="Previous month"
          onClick={() => shift(-1)}
        >
          <ChevronLeft size={16} />
        </IconButton>
        <strong aria-live="polite">{monthLabel()}</strong>
        <IconButton
          size="small"
          aria-label="Next month"
          onClick={() => shift(1)}
        >
          <ChevronRight size={16} />
        </IconButton>
      </div>
      <div
        class="calendar-weekdays mb-1.5 grid grid-cols-7 gap-0.5 text-center text-xs text-quiet"
        aria-hidden="true"
      >
        <For each={["M", "T", "W", "T", "F", "S", "S"]}>
          {(d) => <span>{d}</span>}
        </For>
      </div>
      <div
        class="calendar-days grid grid-cols-7 gap-0.5"
        role="group"
        aria-label={monthLabel()}
      >
        <For each={days()}>
          {(d) => (
            <Button
              variant="bare"
              class="calendar-day min-h-7 min-w-0 w-full rounded-full p-0 text-xs [&.outside:not(.chosen)]:text-quiet [&.today:not(.chosen)]:text-accent [&.chosen]:bg-ink [&.chosen]:text-bg focus-visible:relative focus-visible:z-1"
              data-date={iso(d)}
              aria-label={d.toLocaleDateString("en", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
              aria-pressed={props.value === iso(d)}
              classList={{
                outside: d.getUTCMonth() !== month().getUTCMonth(),
                today: iso(d) === date(today()),
                chosen: props.value === iso(d),
              }}
              onClick={() => props.choose(iso(d))}
              onKeyDown={(e) => {
                const delta: Record<string, number> = {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -7,
                  ArrowDown: 7,
                };
                if (delta[e.key]) {
                  e.preventDefault();
                  const next = new Date(d.getTime() + delta[e.key] * 86400000),
                    root = e.currentTarget.closest(".calendar")!;
                  if (next.getUTCMonth() !== month().getUTCMonth())
                    setMonth(next);
                  queueMicrotask(() =>
                    root
                      .querySelector<HTMLElement>(`[data-date="${iso(next)}"]`)
                      ?.focus({ preventScroll: true }),
                  );
                }
              }}
            >
              {d.getUTCDate()}
            </Button>
          )}
        </For>
      </div>
    </div>
  );
}
export default function DatePicker(props: {
  kind: "when" | "deadline";
  compact?: boolean;
  iconOnly?: boolean;
  value: string;
  mode?: string;
  change: (value: string, mode?: string) => void;
  reminder?: string;
  changeReminder?: (value: string) => void;
  clearable?: boolean;
  align?: "content";
}) {
  const [query, setQuery] = createSignal("");
  const [error, setError] = createSignal("");
  const [reminderOpen, setReminderOpen] = createSignal(false);
  const parse = () => {
    const text = query().trim().toLowerCase();
    if (
      props.kind === "when" &&
      ["today", "this evening", "anytime", "someday"].includes(text)
    )
      return {
        value: "",
        mode:
          text === "this evening"
            ? "This Evening"
            : text[0].toUpperCase() + text.slice(1),
      };
    const base = new Date(`${date(today())}T00:00:00Z`);
    if (text === "today") return { value: date(today()), mode: "Date" };
    if (text === "tomorrow") base.setUTCDate(base.getUTCDate() + 1);
    else {
      const weekday = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ].findIndex((day) => day === text);
      if (weekday >= 0)
        base.setUTCDate(
          base.getUTCDate() + ((weekday - base.getUTCDay() + 7) % 7 || 7),
        );
      else if (
        /^\d{4}-\d{2}-\d{2}$/.test(text) &&
        !Number.isNaN(Date.parse(text)) &&
        new Date(text).toISOString().slice(0, 10) === text
      )
        return { value: text, mode: "Date" };
      else return null;
    }
    return { value: base.toISOString().slice(0, 10), mode: "Date" };
  };
  const label = () => (props.kind === "when" ? "When" : "Deadline");
  const text = () =>
    props.kind === "when"
      ? props.mode === "Date" && props.value
        ? new Date(props.value + "T00:00:00Z").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
        : props.mode || "When"
      : props.value
        ? new Date(props.value + "T00:00:00Z").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
        : "Deadline";
  const hasSurface = () =>
    !!props.clearable &&
    (props.kind === "deadline"
      ? !!props.value
      : !!props.mode && props.mode !== "Inbox");
  const iconOnly = () =>
    props.iconOnly ||
    (props.clearable &&
      props.kind === "when" &&
      (!props.mode || props.mode === "Inbox"));
  return (
    <div
      class="schedule-chip flex min-w-0 items-center rounded-md transition-colors"
      classList={{
        "bg-hover hover:bg-ink/10": hasSurface(),
        "-ml-1.5": props.align === "content" && !!iconOnly(),
        "-ml-2": props.align === "content" && !iconOnly() && !!props.compact,
        "-ml-3": props.align === "content" && !iconOnly() && !props.compact,
      }}
    >
      <Popover
        width={400}
        triggerClass={
          iconOnly()
            ? "bg-transparent hover:bg-transparent text-quiet hover:text-ink"
            : hasSurface()
              ? "bg-transparent hover:bg-transparent"
              : undefined
        }
        size={props.compact ? "compact" : "small"}
        iconOnly={iconOnly()}
        label={label()}
        class="date-picker"
        trigger={
          <>
            <Show when={props.kind === "when"} fallback={<Flag size={16} />}>
              <Show
                when={
                  props.mode &&
                  !iconOnly() &&
                  [
                    "Today",
                    "This Evening",
                    "Anytime",
                    "Someday",
                    "Inbox",
                  ].includes(props.mode)
                }
                fallback={<CalendarDays size={16} class="text-muted" />}
              >
                <ListIcon name={props.mode!} size={16} />
              </Show>
            </Show>
            <Show
              when={
                !iconOnly() &&
                (!props.compact || props.kind === "when" || props.value)
              }
            >
              {text()}
            </Show>
          </>
        }
      >
        {(close) => (
          <>
            <form
              class="date-query [&>input]:min-h-8 [&>input]:px-2 [&>input]:py-1 [&>input]:text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parse();
                if (!parsed || (props.kind === "deadline" && !parsed.value)) {
                  setError("Use today, tomorrow, a weekday, or YYYY-MM-DD.");
                  return;
                }
                props.change(parsed.value, parsed.mode);
                setQuery("");
                setError("");
                close();
              }}
            >
              <Input
                variant="plain"
                autofocus
                aria-label={`${label()} date`}
                placeholder={label()}
                value={query()}
                onInput={(e) => {
                  setQuery(e.currentTarget.value);
                  setError("");
                }}
              />
            </form>
            <Show when={error()}>
              <p
                role="alert"
                class="error-text mb-4 text-xs leading-relaxed text-danger"
              >
                {error()}
              </p>
            </Show>
            <div class="date-layout grid grid-cols-[--spacing(32)_minmax(0,1fr)] items-start gap-3">
              <div class="date-options flex flex-col gap-2">
                <Show when={props.kind === "when"}>
                  <div class="date-shortcuts grid gap-1 [&>button]:min-h-8 [&>button]:justify-start [&>button]:rounded-md [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-xs [&>button[aria-pressed=true]]:bg-selection">
                    <For each={["Today", "This Evening", "Anytime", "Someday"]}>
                      {(mode) => (
                        <Button
                          size="small"
                          aria-pressed={props.mode === mode}
                          onClick={() => {
                            props.change("", mode);
                            close();
                          }}
                        >
                          <ListIcon name={mode} size={14} />
                          {mode}
                        </Button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={props.kind === "when"}>
                  <Button
                    size="small"
                    class="reminder-toggle justify-start text-muted"
                    aria-expanded={reminderOpen()}
                    onClick={() => setReminderOpen((open) => !open)}
                  >
                    <Bell size={14} />
                    {props.reminder ? "Edit reminder" : "Add reminder"}
                  </Button>
                </Show>
                <Show when={props.value || props.kind === "when"}>
                  <Button
                    size="small"
                    class="justify-start"
                    onClick={() => {
                      props.change(
                        "",
                        props.kind === "when" ? "Inbox" : undefined,
                      );
                      close();
                    }}
                  >
                    <Show
                      when={props.kind === "when"}
                      fallback={<X size={14} />}
                    >
                      <CalendarX size={14} />
                    </Show>
                    {props.kind === "when"
                      ? "Clear schedule"
                      : "Clear deadline"}
                  </Button>
                </Show>
              </div>
              <Calendar
                value={
                  props.value ||
                  (props.kind === "when" &&
                  ["Today", "This Evening"].includes(props.mode || "")
                    ? date(today())
                    : "")
                }
                choose={(value) => {
                  props.change(value, "Date");
                  close();
                }}
              />
            </div>
            <Show when={props.kind === "when" && reminderOpen()}>
              <Show
                when={props.changeReminder}
                fallback={
                  <p>Reminder saving is not available in this editor yet.</p>
                }
              >
                <label class="reminder-field grid gap-1.5 text-xs text-muted">
                  Remind me
                  <Input
                    type="datetime-local"
                    aria-label="Reminder date and time"
                    value={props.reminder || ""}
                    onChange={(e) =>
                      props.changeReminder?.(e.currentTarget.value)
                    }
                  />
                  <small class="text-quiet">
                    On this Mac while Somedue is open. Reminders stay on this
                    device.
                  </small>
                </label>
                <Show when={props.reminder}>
                  <Button
                    size="small"
                    onClick={() => props.changeReminder?.("")}
                  >
                    Remove reminder
                  </Button>
                </Show>
              </Show>
            </Show>
          </>
        )}
      </Popover>
      <Show
        when={
          props.clearable &&
          (props.kind === "deadline"
            ? props.value
            : props.mode && props.mode !== "Inbox")
        }
      >
        <IconButton
          size="compact"
          variant="quiet"
          class="rounded-md bg-transparent hover:bg-transparent active:scale-100"
          aria-label={
            props.kind === "when" ? "Remove schedule" : "Remove deadline"
          }
          onClick={() =>
            props.change("", props.kind === "when" ? "Inbox" : undefined)
          }
        >
          <X size={13} />
        </IconButton>
      </Show>
    </div>
  );
}
