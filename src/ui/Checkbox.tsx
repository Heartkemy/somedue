import { splitProps, type JSX } from "solid-js";
import { twMerge } from "tailwind-merge";
import { Show } from "solid-js";
import { Check, X } from "lucide-solid";
import { Button, type ButtonProps } from "./Button";

export function Checkbox(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <input
      {...rest}
      type="checkbox"
      class={twMerge(
        "control-checkbox peer relative m-0 inline-grid size-4.5 min-h-4.5 shrink-0 cursor-pointer appearance-none place-content-center rounded-full border border-mint/65 bg-transparent p-0 text-bg transition-colors duration-150 hover:not-checked:not-disabled:bg-mint/10 checked:border-mint checked:bg-mint indeterminate:bg-mint disabled:cursor-default disabled:opacity-50 forced-colors:appearance-auto",
        "after:size-2.5 after:scale-40 after:bg-current after:opacity-0 after:transition after:duration-150 after:content-[''] after:[clip-path:polygon(8%_48%,21%_35%,42%_56%,80%_17%,94%_30%,42%_84%)] checked:after:scale-100 checked:after:opacity-100 indeterminate:after:scale-100 indeterminate:after:opacity-100 indeterminate:after:[clip-path:inset(42%_8%)] motion-reduce:after:transition-none forced-colors:after:hidden",
        local.class,
      )}
    />
  );
}

export function CheckButton(
  props: ButtonProps & {
    checked?: boolean;
    canceled?: boolean;
    dashed?: boolean;
    ringed?: boolean;
  },
) {
  const [local, rest] = splitProps(props, [
    "checked",
    "canceled",
    "dashed",
    "ringed",
    "class",
  ]);
  return (
    <Button
      {...rest}
      variant="bare"
      aria-pressed={rest.role === "checkbox" ? undefined : !!local.checked}
      data-someday={local.dashed || undefined}
      class={twMerge(
        "task-check relative grid size-4 min-h-4 shrink-0 place-items-center justify-self-center rounded-full bg-transparent p-0 text-mint hover:bg-mint/10",
        local.canceled && "text-quiet",
        local.class,
      )}
    >
      <svg
        viewBox="0 0 20 20"
        class="size-full overflow-visible"
        aria-hidden="true"
      >
        <circle
          cx="10"
          cy="10"
          r="9"
          fill={
            local.checked && !local.canceled && !local.ringed
              ? "currentColor"
              : "none"
          }
          stroke="currentColor"
          stroke-width="1.5"
          stroke-dasharray={
            local.dashed && !local.checked ? "1.5 3" : undefined
          }
          stroke-linecap="round"
        />
        <Show when={local.checked && !local.canceled && local.ringed}>
          <circle cx="10" cy="10" r="6" fill="currentColor" />
        </Show>
      </svg>
      <Show when={local.checked}>
        <span
          class="absolute inset-0 grid place-items-center text-bg"
          classList={{ "text-quiet": local.canceled }}
        >
          {local.canceled ? (
            <X size={11} stroke-width={2.5} />
          ) : (
            <Check size={11} stroke-width={2.5} />
          )}
        </span>
      </Show>
    </Button>
  );
}
