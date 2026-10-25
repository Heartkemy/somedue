import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import {
  CalendarDays,
  Flag,
  ChevronLeft,
  ChevronRight,
  Star,
  Moon,
  Archive,
  Bell,
} from "lucide-solid";
import { Button, IconButton } from "./ui";
import { Popover } from "./Popover";
import { date, today } from "./model";
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
      <div class="calendar-header">
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
      <div class="calendar-weekdays" aria-hidden="true">
        <For each={["M", "T", "W", "T", "F", "S", "S"]}>
          {(d) => <span>{d}</span>}
        </For>
      </div>
      <div class="calendar-days" role="group" aria-label={monthLabel()}>
        <For each={days()}>
          {(d) => (
            <Button
              variant="bare"
              class="calendar-day"
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
  value: string;
  mode?: string;
  change: (value: string, mode?: string) => void;
  reminder?: string;
  changeReminder?: (value: string) => void;
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
  return (
    <Popover
      size={props.compact ? "compact" : "small"}
      label={label()}
      class="date-picker"
      trigger={
        <>
          <Show when={props.kind === "when"} fallback={<Flag size={14} />}>
            {props.mode === "Today" ? (
              <Star size={14} />
            ) : props.mode === "This Evening" ? (
              <Moon size={14} />
            ) : props.mode === "Someday" ? (
              <Archive size={14} />
            ) : (
              <CalendarDays size={14} />
            )}
          </Show>
          <Show when={!props.compact || props.kind === "when" || props.value}>
            {text()}
          </Show>
        </>
      }
    >
      {(close) => (
        <>
          <form
            class="date-query"
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
            <input
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
            <p role="alert" class="error-text">
              {error()}
            </p>
          </Show>
          <Show when={props.kind === "when"}>
            <div class="date-shortcuts">
              <For each={["Today", "This Evening"]}>
                {(mode) => (
                  <Button
                    size="small"
                    aria-pressed={props.mode === mode}
                    onClick={() => {
                      props.change("", mode);
                      close();
                    }}
                  >
                    {mode === "Today" ? <Star size={14} /> : <Moon size={14} />}
                    {mode}
                  </Button>
                )}
              </For>
            </div>
          </Show>
          <Calendar
            value={props.value}
            choose={(value) => {
              props.change(value, "Date");
              close();
            }}
          />
          <Show when={props.kind === "when"}>
            <div class="date-shortcuts date-secondary">
              <For each={["Anytime", "Someday"]}>
                {(mode) => (
                  <Button
                    size="small"
                    aria-pressed={props.mode === mode}
                    onClick={() => {
                      props.change("", mode);
                      close();
                    }}
                  >
                    <Archive size={14} />
                    {mode}
                  </Button>
                )}
              </For>
            </div>
            <Button
              size="small"
              class="reminder-toggle"
              aria-expanded={reminderOpen()}
              onClick={() => setReminderOpen((open) => !open)}
            >
              <Bell size={14} />
              {props.reminder ? "Edit reminder" : "Add reminder"}
            </Button>
            <Show when={reminderOpen()}>
              <Show
                when={props.changeReminder}
                fallback={
                  <p>Reminder saving is not available in this editor yet.</p>
                }
              >
                <label class="reminder-field">
                  Remind me
                  <input
                    type="datetime-local"
                    aria-label="Reminder date and time"
                    value={props.reminder || ""}
                    onChange={(e) =>
                      props.changeReminder?.(e.currentTarget.value)
                    }
                  />
                  <small>
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
          </Show>
          <Show when={props.value || props.kind === "when"}>
            <Button
              size="small"
              onClick={() => {
                props.change("", props.kind === "when" ? "Inbox" : undefined);
                close();
              }}
            >
              {props.kind === "when" ? "Clear schedule" : "Clear deadline"}
            </Button>
          </Show>
        </>
      )}
    </Popover>
  );
}
