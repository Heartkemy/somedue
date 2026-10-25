import { splitProps, type JSX } from "solid-js";
import { twMerge } from "tailwind-merge";
import { Button, type ButtonProps } from "./Button";
export function Menu(
  props: JSX.HTMLAttributes<HTMLDivElement> & { close?: () => void },
) {
  const [local, rest] = splitProps(props, ["class", "close"]);
  return (
    <div
      {...rest}
      class={twMerge("ui-menu flex flex-col gap-1", local.class)}
      role="menu"
      onKeyDown={(event) => {
        event.stopPropagation();
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            ':scope > [role="menuitem"]:not(:disabled)',
          ),
        ];
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        } else if (event.key === "Escape" || event.key === "Tab") {
          if (event.key === "Escape") event.preventDefault();
          local.close?.();
        }
      }}
    />
  );
}
export function MenuItem(props: Omit<ButtonProps, "size" | "variant">) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <Button
      {...rest}
      size="small"
      variant="bare"
      role="menuitem"
      class={twMerge(
        "ui-menu-item w-full min-h-10 justify-start gap-2.5 rounded-full bg-transparent px-3 py-0 text-xs font-normal leading-6 hover:bg-ink/9 focus-visible:bg-ink/9 focus-visible:ring-0 focus-visible:ring-offset-0 [&_kbd]:ml-auto",
        local.class,
      )}
    />
  );
}
