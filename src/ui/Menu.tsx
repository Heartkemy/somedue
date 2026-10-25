import {
  createSignal,
  onCleanup,
  onMount,
  splitProps,
  type JSX,
} from "solid-js";
import { twMerge } from "tailwind-merge";
import { Button, type ButtonProps } from "./Button";
import { ChevronRight } from "lucide-solid";
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
            ':scope > [role="menuitem"]:not(:disabled), :scope > .menu-submenu > [role="menuitem"]:not(:disabled)',
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
        "ui-menu-item w-full min-h-9 justify-start gap-2.5 rounded-lg bg-transparent px-3 py-1 text-sm font-normal leading-6 hover:bg-ink/9 focus-visible:bg-ink/9 focus-visible:ring-0 focus-visible:ring-offset-0 [&_kbd]:ml-auto",
        local.class,
      )}
    />
  );
}

export function MenuDivider() {
  return (
    <hr role="separator" class="mx-3 my-1.5 border-0 border-t border-ink/15" />
  );
}

export function MenuPopup(props: {
  label: string;
  point: { x: number; y: number };
  close: () => void;
  children: JSX.Element;
}) {
  let panel!: HTMLDivElement;
  onMount(() => {
    panel.showPopover();
    // Context menus follow the pointer and must stay inside the measured viewport.
    panel.style.left = `${Math.max(12, Math.min(props.point.x, innerWidth - panel.offsetWidth - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(props.point.y, innerHeight - panel.offsetHeight - 12))}px`;
    panel
      .querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
      ?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target))
        props.close();
    };
    document.addEventListener("pointerdown", dismiss);
    onCleanup(() => document.removeEventListener("pointerdown", dismiss));
  });
  onCleanup(() => panel.hidePopover());
  return (
    <div
      ref={panel}
      popover="manual"
      role="dialog"
      aria-label={props.label}
      class="control-popover task-context-menu fixed inset-auto m-0 max-h-[calc(100dvh_-_--spacing(6))] w-72 max-w-[calc(100vw_-_--spacing(6))] overflow-auto rounded-xl border-0 bg-surface p-2 text-ink shadow-xl ring-1 ring-ink/15"
      onToggle={(e) => {
        if (e.newState === "closed") props.close();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {props.children}
    </div>
  );
}

export function MenuSubmenu(props: {
  label: string;
  children: (close: () => void) => JSX.Element;
}) {
  let trigger!: HTMLButtonElement, panel!: HTMLDivElement;
  const [opened, setOpened] = createSignal(false);
  const close = () => {
    panel.hidePopover();
    setOpened(false);
    trigger.focus({ preventScroll: true });
  };
  const open = () => {
    panel.showPopover();
    setOpened(true);
    const r = trigger.getBoundingClientRect();
    panel.style.left = `${r.right + panel.offsetWidth + 8 <= innerWidth ? r.right + 4 : Math.max(8, r.left - panel.offsetWidth - 4)}px`;
    panel.style.top = `${Math.max(8, Math.min(r.top, innerHeight - panel.offsetHeight - 8))}px`;
    panel
      .querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  };
  return (
    <div class="menu-submenu">
      <MenuItem
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={opened()}
        onClick={() => (opened() ? close() : open())}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            open();
          }
        }}
      >
        <span class="pl-6.5">{props.label}</span>
        <ChevronRight class="ml-auto" size={16} />
      </MenuItem>
      <div
        ref={panel}
        popover="auto"
        class="control-popover fixed inset-auto m-0 w-60 rounded-xl border-0 bg-surface p-2 text-ink shadow-xl ring-1 ring-ink/15"
        onToggle={(e) => setOpened(e.newState === "open")}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        <Menu close={close}>{props.children(close)}</Menu>
      </div>
    </div>
  );
}
