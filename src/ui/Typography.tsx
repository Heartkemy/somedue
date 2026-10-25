import { splitProps, type JSX } from "solid-js";
import { twMerge } from "tailwind-merge";

export function Kbd(props: JSX.HTMLAttributes<HTMLElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <kbd
      {...rest}
      class={twMerge(
        "whitespace-nowrap font-mono text-xs text-quiet",
        local.class,
      )}
    />
  );
}

export function SectionHeading(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <h3
      {...rest}
      class={twMerge("mb-3 font-serif text-3xl font-medium", local.class)}
    />
  );
}

export function ListHeading(
  props: JSX.HTMLAttributes<HTMLHeadingElement> & {
    level?: "area" | "project" | "section";
  },
) {
  const [local, rest] = splitProps(props, ["class", "level"]);
  return (
    <h2
      {...rest}
      class={twMerge(
        "mt-7 mb-2 flex items-center gap-3 border-b border-hover pb-2 text-left text-lg leading-tight font-semibold text-ink first:mt-0",
        local.level === "area" && "text-2xl",
        local.level === "project" && "text-xl",
        local.class,
      )}
    />
  );
}
