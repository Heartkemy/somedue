import { type JSX } from "@solidjs/web";
import { omit } from "solid-js";
import { classes } from "./classes";

export function Kbd(props: JSX.HTMLAttributes<HTMLElement>) {
  const local = props,
    rest = omit(props, "class");
  return (
    <kbd
      {...rest}
      class={classes(
        "whitespace-nowrap font-mono text-xs text-quiet",
        local.class,
      )}
    />
  );
}

export function SectionHeading(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const local = props,
    rest = omit(props, "class");
  return (
    <h3
      {...rest}
      class={classes("mb-3 font-serif text-3xl font-medium", local.class)}
    />
  );
}

export function ListHeading(
  props: JSX.HTMLAttributes<HTMLHeadingElement> & {
    level?: "area" | "project" | "section";
  },
) {
  const local = props,
    rest = omit(props, "class", "level");
  return (
    <h2
      {...rest}
      class={classes(
        "mt-7 mb-2 flex items-center gap-3 border-b border-hover pb-2 text-left text-lg leading-tight font-semibold text-ink first:mt-0",
        local.level === "area" && "text-2xl",
        local.level === "project" && "text-xl",
        local.class,
      )}
    />
  );
}
