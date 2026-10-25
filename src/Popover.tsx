import {
  createSignal,
  createUniqueId,
  onMount,
  onCleanup,
  type JSX,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { Button, IconButton } from "./ui";
export function Popover(props: {
  label: string;
  trigger: JSX.Element;
  children: (close: () => void) => JSX.Element;
  class?: string;
  width?: number;
  size?: "small" | "compact";
  iconOnly?: boolean;
}) {
  const id = createUniqueId(),
    [opened, setOpened] = createSignal(false);
  let trigger!: HTMLButtonElement, panel!: HTMLDivElement;
  const close = () => {
    panel.hidePopover();
    setOpened(false);
    trigger.focus({ preventScroll: true });
  };
  const position = () => {
    const r = trigger.getBoundingClientRect();
    const width = Math.min(props.width || 272, innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12, Math.min(r.left, innerWidth - width - 12))}px`;
    const below = innerHeight - r.bottom - 12,
      above = r.top - 12;
    const down = below >= Math.min(panel.scrollHeight, 360) || below >= above;
    panel.style.maxHeight = `${Math.max(120, Math.min(480, down ? below : above))}px`;
    panel.style.top = `${down ? r.bottom + 6 : Math.max(12, r.top - panel.offsetHeight - 6)}px`;
  };
  const open = () => {
    panel.showPopover();
    setOpened(true);
    position();
    panel
      .querySelector<HTMLElement>("[autofocus],input,button")
      ?.focus({ preventScroll: true });
  };
  onMount(() => {
    const update = () => {
      if (opened()) position();
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    onCleanup(() => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    });
  });
  return (
    <div class={`popover-control ${props.class || ""}`}>
      <Dynamic
        component={props.iconOnly ? IconButton : Button}
        ref={trigger}
        size={props.size || "small"}
        variant={props.size === "compact" ? "quiet" : "secondary"}
        aria-label={props.label}
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={opened()}
        onClick={() => (opened() ? close() : open())}
      >
        {props.trigger}
      </Dynamic>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={props.label}
        class={`control-popover ${props.class ? `${props.class}-panel` : ""}`}
        onToggle={() => setOpened(panel.matches(":popover-open"))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      >
        <div class="control-popover-body">{props.children(close)}</div>
      </div>
    </div>
  );
}
