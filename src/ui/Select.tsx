import {
  createSignal,
  createUniqueId,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
  type JSX,
} from "solid-js";
/** App-rendered single-select. The hidden select preserves form values and existing handlers;
 * the top-layer popover escapes scrolling panels and native dialog clipping. */
export function Select(props: JSX.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = createUniqueId();
  const [options, setOptions] = createSignal<
    { value: string; label: string; disabled: boolean; separator: boolean }[]
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
      separator:
        o.parentElement?.tagName === "OPTGROUP" &&
        o.parentElement.firstElementChild === o &&
        o.index > 0,
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
    // Anchored viewport placement depends on measured screen coordinates, not static styling.
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
    <div class="select-control min-w-0 w-full">
      <select {...props} ref={native} hidden aria-hidden="true" tabIndex={-1} />
      <button
        ref={trigger}
        type="button"
        class="select-trigger flex min-h-10 w-full cursor-pointer items-center justify-between gap-2.5 rounded-full border-0 bg-field px-3 py-2 text-left text-sm leading-6 tracking-tight transition-colors hover:not-disabled:bg-ink/6 disabled:cursor-default disabled:opacity-45 [&>span]:min-w-0 [&>span]:truncate [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-muted [&>svg]:stroke-1 [&>svg]:transition-transform aria-expanded:[&>svg]:rotate-180"
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
        class="select-popup fixed inset-auto m-0 overflow-auto overscroll-contain rounded-2xl border-0 bg-surface py-4.5 font-sans text-sm leading-6 text-ink shadow-xl ring-1 ring-ink/15 outline-none [scrollbar-width:thin] backdrop:bg-transparent"
        role="listbox"
        tabIndex={-1}
        aria-label={props["aria-label"] || "Options"}
        aria-activedescendant={`${id}-${active()}`}
        onKeyDown={key}
        onToggle={() => setOpened(popup.matches(":popover-open"))}
      >
        <For each={options()}>
          {(option, i) => (
            <>
              <Show when={option.separator}>
                <hr
                  role="separator"
                  class="mx-3 my-2 border-0 border-t border-quiet/20"
                />
              </Show>
              <div
                id={`${id}-${i()}`}
                data-index={i()}
                role="option"
                aria-selected={
                  option.value === String(props.value ?? native?.value)
                }
                aria-disabled={option.disabled}
                class="relative block min-h-9 cursor-pointer rounded-none bg-transparent px-3 py-2.5 wrap-anywhere aria-selected:bg-ink/4 aria-disabled:cursor-default aria-disabled:text-quiet aria-disabled:opacity-55 hover:not-aria-disabled:bg-ink/9 [&.active-option]:before:absolute [&.active-option]:before:top-1/2 [&.active-option]:before:left-0 [&.active-option]:before:h-1/2 [&.active-option]:before:w-0.5 [&.active-option]:before:-translate-y-1/2 [&.active-option]:before:rounded-r-sm [&.active-option]:before:bg-highlight [&.active-option]:before:content-['']"
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
            </>
          )}
        </For>
      </div>
    </div>
  );
}
