import {
  splitProps,
  createEffect,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  createContext,
  useContext,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
export const FeedbackContext = createContext<Accessor<string>>(() => "");
type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "regular" | "small" | "compact";
  variant?: "primary" | "secondary" | "quiet" | "danger" | "bare";
};
export function Menu(
  props: JSX.HTMLAttributes<HTMLDivElement> & { close?: () => void },
) {
  const [local, rest] = splitProps(props, ["class", "close"]);
  return (
    <div
      {...rest}
      class={`ui-menu ${local.class || ""}`}
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
      variant="quiet"
      role="menuitem"
      class={`ui-menu-item ${local.class || ""}`}
    />
  );
}
function activateButton(
  event: MouseEvent & { currentTarget: HTMLButtonElement; target: Element },
  handler: JSX.ButtonHTMLAttributes<HTMLButtonElement>["onClick"],
) {
  if (!event.currentTarget.disabled && event.detail === 0)
    event.currentTarget.focus({ preventScroll: true });
  if (typeof handler === "function") handler(event);
  else if (Array.isArray(handler)) handler[0](handler[1], event);
}
export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "class",
    "size",
    "variant",
    "onClick",
    "classList",
  ]);
  return (
    <button
      type="button"
      {...rest}
      onClick={(e) => activateButton(e, local.onClick)}
      data-size={local.size || "regular"}
      data-variant={local.variant || "secondary"}
      class={`${local.variant === "bare" ? "bare-button" : "control-button"} ${local.variant === "primary" ? "primary" : ""} ${local.class || ""}`}
      classList={local.classList}
    />
  );
}
export function IconButton(props: ButtonProps & { "aria-label": string }) {
  const [local, rest] = splitProps(props, [
    "class",
    "size",
    "variant",
    "onClick",
    "classList",
  ]);
  return (
    <button
      type="button"
      {...rest}
      onClick={(e) => activateButton(e, local.onClick)}
      data-size={local.size || "regular"}
      data-variant={local.variant || "secondary"}
      class={`control-button icon-button ${local.class || ""}`}
      classList={local.classList}
    />
  );
}
export function Checkbox(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <input
      {...rest}
      type="checkbox"
      class={`control-checkbox ${local.class || ""}`}
    />
  );
}
export function Field(props: {
  label: string;
  children: JSX.Element;
  hint?: string;
}) {
  const id = createUniqueId();
  let field!: HTMLDivElement;
  onMount(() => {
    field
      .querySelectorAll("input,textarea,button[role=combobox]")
      .forEach((el) => {
        if (!el.hasAttribute("aria-label"))
          el.setAttribute("aria-labelledby", id);
      });
  });
  return (
    <div class="field" ref={field}>
      <span
        id={id}
        onClick={() =>
          field
            .querySelector<HTMLElement>("input,textarea,button[role=combobox]")
            ?.focus()
        }
      >
        {props.label}
      </span>
      {props.children}
      {props.hint && <small>{props.hint}</small>}
    </div>
  );
}
export function Dialog(props: {
  title: string;
  close: () => void;
  children: JSX.Element;
  wide?: boolean;
}) {
  const feedback = useContext(FeedbackContext);
  let el!: HTMLDialogElement;
  let previous: Element | null = null;
  onMount(() => {
    previous = document.activeElement;
    el.showModal();
  });
  onCleanup(() => {
    el.close();
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus();
    else
      document
        .querySelector<HTMLElement>("dialog[open] button, main button")
        ?.focus();
  });
  return (
    <dialog
      ref={el}
      classList={{ wide: props.wide }}
      aria-label={props.title}
      onCancel={(e) => {
        e.preventDefault();
        props.close();
      }}
      onClick={(e) => {
        if (e.target === el) {
          const r = el.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            props.close();
        }
      }}
    >
      <div class="dialog-header">
        <h2>{props.title}</h2>
        <IconButton
          size="small"
          aria-label="Close dialog"
          onClick={props.close}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="m4 4 8 8m0-8-8 8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </IconButton>
      </div>
      <div class="dialog-body">
        <Show when={feedback()}>
          <p role="alert" class="error-text">
            {feedback()}
          </p>
        </Show>
        {props.children}
      </div>
    </dialog>
  );
}

/** App-rendered single-select. The hidden select preserves form values and existing handlers;
 * the top-layer popover escapes scrolling panels and native dialog clipping. */
export function Select(props: JSX.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = createUniqueId();
  const [options, setOptions] = createSignal<
    { value: string; label: string; disabled: boolean }[]
  >([]);
  const [opened, setOpened] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const [label, setLabel] = createSignal("");
  let native!: HTMLSelectElement;
  let trigger!: HTMLButtonElement;
  let popup!: HTMLDivElement;
  let typeahead = "",
    lastType = 0;
  const refresh = () => {
    const items = Array.from(native.options).map((o) => ({
      value: o.value,
      label: o.text,
      disabled: o.disabled,
    }));
    setOptions(items);
    const value = props.value == null ? native.value : String(props.value);
    native.value = value;
    setLabel(items.find((o) => o.value === value)?.label || "Choose…");
  };
  createEffect(() => {
    void props.value;
    queueMicrotask(refresh);
  });
  onMount(() => {
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(native, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    onCleanup(() => observer.disconnect());
  });
  const close = (focus = true) => {
    popup.hidePopover();
    setOpened(false);
    if (focus) trigger.focus({ preventScroll: true });
  };
  const position = () => {
    const r = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 200), 480, window.innerWidth - 24);
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const down =
      below >= Math.min(popup.scrollHeight, 360, window.innerHeight * 0.6) ||
      below >= above;
    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${Math.max(60, Math.min(360, window.innerHeight * 0.6, down ? below : above))}px`;
    popup.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`;
    popup.style.top = `${down ? r.bottom + 6 : Math.max(6, r.top - popup.offsetHeight - 6)}px`;
  };
  const reveal = () =>
    queueMicrotask(() => {
      const item = popup.querySelector<HTMLElement>(
        `[data-index="${active()}"]`,
      );
      if (!item) return;
      const top = item.offsetTop,
        bottom = top + item.offsetHeight;
      if (top < popup.scrollTop) popup.scrollTop = top;
      else if (bottom > popup.scrollTop + popup.clientHeight)
        popup.scrollTop = bottom - popup.clientHeight;
    });
  const open = () => {
    if (props.disabled) return;
    refresh();
    setActive(
      Math.max(
        0,
        options().findIndex((o) => o.value === native.value),
      ),
    );
    popup.showPopover();
    setOpened(true);
    position();
    popup.focus({ preventScroll: true });
    reveal();
  };
  const choose = (index: number) => {
    const option = options()[index];
    if (!option || option.disabled) return;
    native.value = option.value;
    setLabel(option.label);
    native.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  };
  const key = (e: KeyboardEvent) => {
    if ((e.key === "Escape" || e.key === "Tab") && !opened()) return;
    if (e.metaKey || e.ctrlKey) return;
    e.stopPropagation();
    const items = options();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      close();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      opened() ? choose(active()) : open();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      if (!opened()) {
        open();
        return;
      }
      let index =
        e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : active();
      const direction = e.key === "ArrowUp" || e.key === "End" ? -1 : 1;
      if (e.key.startsWith("Arrow"))
        index = (index + direction + items.length) % items.length;
      for (let n = 0; n < items.length && items[index]?.disabled; n++)
        index = (index + direction + items.length) % items.length;
      setActive(index);
      reveal();
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (!opened()) open();
      typeahead = Date.now() - lastType > 700 ? e.key : typeahead + e.key;
      lastType = Date.now();
      const index = items.findIndex(
        (o) =>
          !o.disabled &&
          o.label.toLowerCase().startsWith(typeahead.toLowerCase()),
      );
      if (index >= 0) {
        setActive(index);
        reveal();
      }
    }
  };
  onMount(() => {
    const reposition = () => {
      if (opened()) position();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    onCleanup(() => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    });
  });
  return (
    <div class="select-control">
      <select {...props} ref={native} hidden aria-hidden="true" tabIndex={-1} />
      <button
        ref={trigger}
        type="button"
        class="select-trigger"
        role="combobox"
        aria-label={props["aria-label"]}
        aria-expanded={opened()}
        aria-controls={id}
        aria-haspopup="listbox"
        disabled={props.disabled}
        onKeyDown={key}
        onClick={() => (opened() ? close() : open())}
      >
        <span>{label()}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        class="select-popup"
        role="listbox"
        tabIndex={-1}
        aria-label={props["aria-label"] || "Options"}
        aria-activedescendant={`${id}-${active()}`}
        onKeyDown={key}
        onToggle={() => setOpened(popup.matches(":popover-open"))}
      >
        <For each={options()}>
          {(option, i) => (
            <div
              id={`${id}-${i()}`}
              data-index={i()}
              role="option"
              aria-selected={
                option.value === String(props.value ?? native?.value)
              }
              aria-disabled={option.disabled}
              classList={{
                "active-option": active() === i(),
                "disabled-option": option.disabled,
              }}
              onPointerMove={() => !option.disabled && setActive(i())}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i())}
            >
              <span>{option.label}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
