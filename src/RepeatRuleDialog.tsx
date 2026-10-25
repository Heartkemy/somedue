import { createSignal, For, Show } from "solid-js";
import { RotateCw } from "lucide-solid";
import { Button, Checkbox, Dialog, Input, Select } from "./ui";
import { date, today, type Props } from "./model";
import {
  makeRule,
  neverEnds,
  repeatUnits,
  ruleDates,
  simpleRule,
} from "./recurrence";

export type RepeatOptions = { deadlineOffset?: number; reminderTime?: string };
export default function RepeatRuleDialog(props: {
  rule?: Props;
  next?: number;
  options?: RepeatOptions;
  close: () => void;
  save: (rule: Props, next: string, options: RepeatOptions) => void;
}) {
  const [pattern, setPattern] = createSignal(
    props.rule?.tp === 1 ? "completion" : String(props.rule?.fu || 16),
  );
  const [unit, setUnit] = createSignal(props.rule?.fu || 16),
    [interval, setInterval] = createSignal(props.rule?.fa || 1);
  const [next, setNext] = createSignal(
    date(props.next || props.rule?.ia || today()),
  );
  const [ends, setEnds] = createSignal(
    !!props.rule?.ed && props.rule.ed !== neverEnds,
  );
  const [end, setEnd] = createSignal(
    props.rule?.ed && props.rule.ed !== neverEnds ? date(props.rule.ed) : "",
  );
  const [hasDeadline, setHasDeadline] = createSignal(
      props.options?.deadlineOffset !== undefined,
    ),
    [deadlineOffset, setDeadlineOffset] = createSignal(
      props.options?.deadlineOffset || 0,
    );
  const [hasReminder, setHasReminder] = createSignal(
      !!props.options?.reminderTime,
    ),
    [reminderTime, setReminderTime] = createSignal(
      props.options?.reminderTime || "09:00",
    );
  const [error, setError] = createSignal("");
  const editable = () => !props.rule || simpleRule(props.rule);
  const preview = () => {
    try {
      return ruleDates(
        makeRule(
          unit(),
          interval(),
          next(),
          pattern() === "completion",
          ends() ? end() : "",
        ),
      );
    } catch {
      return [];
    }
  };
  return (
    <Dialog title="Repeat" close={props.close} wide>
      <form
        class="repeat-rule grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const rule = {
              ...props.rule,
              ...makeRule(
                unit(),
                interval(),
                next(),
                pattern() === "completion",
                pattern() !== "completion" && ends() ? end() : "",
              ),
            };
            props.save(rule, next(), {
              deadlineOffset: hasDeadline() ? deadlineOffset() : undefined,
              reminderTime: hasReminder() ? reminderTime() : undefined,
            });
          } catch (failure) {
            setError(String(failure));
          }
        }}
      >
        <Show when={!editable()}>
          <p class="text-sm leading-relaxed text-muted">
            This imported rule uses options this editor cannot change safely.
            Its original rule is preserved.
          </p>
        </Show>
        <fieldset
          disabled={!editable()}
          class="grid min-w-0 gap-3 border-0 p-0"
        >
          <div class="flex items-center gap-3">
            <RotateCw size={18} class="text-upcoming" />
            <span class="text-sm font-semibold">Repeat</span>
            <div class="min-w-0 w-64">
              <Select
                aria-label="Repeat pattern"
                value={pattern()}
                onChange={(event) => {
                  setPattern(event.currentTarget.value);
                  if (event.currentTarget.value !== "completion")
                    setUnit(Number(event.currentTarget.value));
                }}
              >
                <option value="completion">After completion</option>
                <option value="16">Daily</option>
                <option value="256">Weekly</option>
                <option value="8">Monthly</option>
                <option value="4">Yearly</option>
              </Select>
            </div>
          </div>
          <div class="grid gap-4 rounded-xl bg-hover p-4">
            <div class="flex flex-wrap items-center gap-3 text-sm">
              <span>{pattern() === "completion" ? "Repeat" : "Every"}</span>
              <Input
                required
                type="number"
                aria-label="Repeat interval"
                min="1"
                max="1000"
                class="w-20"
                value={interval()}
                onInput={(event) =>
                  setInterval(Number(event.currentTarget.value))
                }
              />
              <Show
                when={pattern() === "completion"}
                fallback={<span>{repeatUnits[unit()]}</span>}
              >
                <div class="w-28">
                  <Select
                    aria-label="Repeat unit"
                    value={String(unit())}
                    onChange={(event) =>
                      setUnit(Number(event.currentTarget.value))
                    }
                  >
                    <For each={[16, 256, 8, 4]}>
                      {(unit) => (
                        <option value={unit}>{repeatUnits[unit]}</option>
                      )}
                    </For>
                  </Select>
                </div>
                <span>after completion</span>
              </Show>
            </div>
            <Show
              when={pattern() !== "completion"}
              fallback={
                <p class="text-xs leading-relaxed text-muted">
                  The next copy is scheduled from the day you complete the
                  current one.
                </p>
              }
            >
              <div class="flex flex-wrap items-center gap-3 border-t border-quiet/15 pt-4">
                <span class="text-sm">Next</span>
                <Input
                  type="date"
                  required
                  aria-label="Next repeat date"
                  class="w-auto"
                  value={next()}
                  onInput={(event) => setNext(event.currentTarget.value)}
                />
                <span class="text-xs text-muted">
                  {preview()
                    .slice(1)
                    .map((stamp) =>
                      new Date(stamp * 1000).toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      }),
                    )
                    .join(", ")}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-3 border-t border-quiet/15 pt-4">
                <span class="text-sm">Ends</span>
                <div class="w-32">
                  <Select
                    aria-label="Repeat ends"
                    value={ends() ? "date" : "never"}
                    onChange={(event) =>
                      setEnds(event.currentTarget.value === "date")
                    }
                  >
                    <option value="never">Never</option>
                    <option value="date">On date</option>
                  </Select>
                </div>
                <Show when={ends()}>
                  <Input
                    type="date"
                    required
                    min={next()}
                    aria-label="Repeat end date"
                    class="w-auto"
                    value={end()}
                    onInput={(event) => setEnd(event.currentTarget.value)}
                  />
                </Show>
              </div>
            </Show>
          </div>
          <div class="flex min-h-10 flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-sm">
              <Checkbox
                checked={hasReminder()}
                onChange={(event) =>
                  setHasReminder(event.currentTarget.checked)
                }
              />
              Add reminders
            </label>
            <Show when={hasReminder()}>
              <Input
                type="time"
                required
                aria-label="Reminder time"
                class="w-36"
                value={reminderTime()}
                onInput={(event) => setReminderTime(event.currentTarget.value)}
              />
            </Show>
          </div>
          <div class="flex min-h-10 flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-sm">
              <Checkbox
                checked={hasDeadline()}
                onChange={(event) =>
                  setHasDeadline(event.currentTarget.checked)
                }
              />
              Add deadlines
            </label>
            <Show when={hasDeadline()}>
              <Input
                type="number"
                min="0"
                max="365"
                required
                aria-label="Days after each copy starts"
                class="w-20"
                value={deadlineOffset()}
                onInput={(event) =>
                  setDeadlineOffset(Number(event.currentTarget.value))
                }
              />
              <span class="text-xs text-muted">
                days after each copy starts
              </span>
            </Show>
          </div>
          <Show when={hasReminder()}>
            <p class="text-xs leading-relaxed text-muted">
              Reminders fire on this Mac while Somedue is open.
            </p>
          </Show>
        </fieldset>
        <Show when={error()}>
          <p role="alert" class="text-sm text-danger">
            {error()}
          </p>
        </Show>
        <div class="flex justify-end gap-2">
          <Button onClick={props.close}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!editable()}>
            OK
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
