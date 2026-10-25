import { splitProps, type JSX } from "solid-js";
import { twMerge } from "tailwind-merge";

export function ActionBar(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <div
      {...rest}
      class={twMerge(
        "grid w-72 grid-cols-4 items-center justify-items-center gap-1 [&>*]:flex [&>*]:w-16 [&>*]:justify-center [&>button]:h-7 [&>button]:min-h-7 [&>button]:rounded-full [&_.popover-control>button]:w-16 [&_.popover-control>button]:rounded-full",
        local.class,
      )}
    />
  );
}
