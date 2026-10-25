import { splitProps } from "solid-js";
import { twMerge } from "tailwind-merge";
import { Button, type ButtonProps } from "./Button";

export function NavigationItem(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <Button
      {...rest}
      variant="bare"
      class={twMerge(
        "sidebar-item grid min-h-8 w-full grid-cols-[--spacing(4.5)_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-2 py-1 text-left text-base leading-6 font-normal text-muted [&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:justify-self-center [&.active]:bg-selection [&.active]:text-ink",
        local.class,
      )}
    />
  );
}
