import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { twMerge } from "tailwind-merge";

export function Pill(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean },
) {
  const [local, rest] = splitProps(props, ["class", "selected", "onClick"]);
  return (
    <Dynamic
      component={local.onClick ? "button" : "span"}
      {...rest}
      type={local.onClick ? "button" : undefined}
      onClick={local.onClick}
      aria-pressed={local.onClick ? !!local.selected : undefined}
      class={twMerge(
        "tag-pill inline-flex min-h-6 max-w-full shrink-0 items-center justify-center gap-1.5 rounded-full border border-ink/20 bg-transparent px-2.5 py-0.5 text-xs font-normal leading-4 text-muted",
        local.onClick &&
          "cursor-pointer transition-colors hover:border-mint/60 hover:bg-mint/5 hover:text-ink",
        local.selected && "border-mint/60 bg-mint/10 text-mint",
        local.class,
      )}
    />
  );
}
