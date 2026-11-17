import { type JSX } from "@solidjs/web";
import { createEffect, onSettled, omit } from "solid-js";
import { classes } from "./classes";

const inputClasses =
  "min-w-0 w-full rounded-lg border-0 bg-field px-3 py-2 text-sm leading-6 tracking-tight text-ink caret-mint outline-none placeholder:text-quiet transition-colors duration-200 hover:bg-hover disabled:opacity-50 [color-scheme:dark] light:[color-scheme:light]";
type InputStyle = { class?: string; variant?: "field" | "plain" };

export function Input(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & InputStyle,
) {
  const local = props,
    rest = omit(props, "class", "variant");
  return (
    <input
      {...rest}
      class={classes(
        inputClasses,
        "min-h-10",
        local.variant === "plain" &&
          "bg-transparent hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:[box-shadow:none]",
        local.class,
      )}
    />
  );
}

export function Textarea(
  props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement> &
    InputStyle & { autosize?: boolean },
) {
  const local = props,
    rest = omit(props, "class", "variant", "autosize", "onInput", "ref");
  let element!: HTMLTextAreaElement;
  const resize = () => {
    if (!local.autosize || !element?.isConnected) return;
    // Notes grow to their measured content instead of exposing a native resize grip.
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };
  onSettled(resize);
  createEffect(
    () => props.value,
    () => queueMicrotask(resize),
  );
  return (
    <textarea
      {...rest}
      ref={(el) => {
        element = el;
        if (typeof local.ref === "function") local.ref(el);
      }}
      onInput={(event) => {
        const handler = local.onInput;
        if (typeof handler === "function") handler(event);
        else if (Array.isArray(handler)) handler[0](handler[1], event);
        resize();
      }}
      class={classes(
        inputClasses,
        local.autosize ? "resize-none" : "resize-y",
        local.variant === "plain" &&
          "bg-transparent hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:[box-shadow:none]",
        local.class,
      )}
    />
  );
}
