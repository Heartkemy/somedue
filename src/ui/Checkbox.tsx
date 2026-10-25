import { splitProps, type JSX } from "solid-js";
import { twMerge } from "tailwind-merge";

export function Checkbox(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <input
      {...rest}
      type="checkbox"
      class={twMerge(
        "control-checkbox peer relative m-0 inline-grid size-4.5 min-h-4.5 shrink-0 cursor-pointer appearance-none place-content-center rounded-md border-0 bg-ink/6 p-0 text-on-highlight transition-colors duration-150 hover:not-checked:not-disabled:bg-ink/9 checked:bg-highlight indeterminate:bg-highlight disabled:cursor-default disabled:opacity-50 forced-colors:appearance-auto",
        "after:size-2.5 after:scale-40 after:bg-current after:opacity-0 after:transition after:duration-150 after:content-[''] after:[clip-path:polygon(8%_48%,21%_35%,42%_56%,80%_17%,94%_30%,42%_84%)] checked:after:scale-100 checked:after:opacity-100 indeterminate:after:scale-100 indeterminate:after:opacity-100 indeterminate:after:[clip-path:inset(42%_8%)] motion-reduce:after:transition-none forced-colors:after:hidden",
        local.class,
      )}
    />
  );
}
