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
