import { splitProps, type JSX } from "solid-js";
import { twMerge } from "tailwind-merge";

const inputClasses =
  "min-w-0 w-full rounded-lg border-0 bg-field px-3 py-2 text-sm leading-6 tracking-tight text-ink caret-mint outline-none placeholder:text-quiet transition-colors duration-200 hover:bg-hover disabled:opacity-50 [color-scheme:dark] light:[color-scheme:light]";
type InputStyle = { class?: string; variant?: "field" | "plain" };

export function Input(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & InputStyle,
) {
  const [local, rest] = splitProps(props, ["class", "variant"]);
  return (
    <input
      {...rest}
      class={twMerge(
        inputClasses,
        "min-h-10",
        local.variant === "plain" &&
          "bg-transparent hover:bg-transparent focus-visible:bg-field focus-visible:[box-shadow:none]",
        local.class,
      )}
    />
  );
}

export function Textarea(
  props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement> & InputStyle,
) {
  const [local, rest] = splitProps(props, ["class", "variant"]);
  return (
    <textarea
      {...rest}
      class={twMerge(
        inputClasses,
        "resize-y",
        local.variant === "plain" &&
          "bg-transparent hover:bg-transparent focus-visible:bg-field focus-visible:[box-shadow:none]",
        local.class,
      )}
    />
  );
}
