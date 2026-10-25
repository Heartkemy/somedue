import { splitProps, type JSX } from "solid-js";
import { twMerge } from "tailwind-merge";

export function ActionBar(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <div
      {...rest}
      class={twMerge(
        "grid grid-cols-4 items-center justify-items-center gap-3 [&>*]:w-16 [&>button]:w-7",
        local.class,
      )}
    />
  );
}
