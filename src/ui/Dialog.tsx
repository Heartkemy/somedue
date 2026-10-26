import { onMount, onCleanup, useContext, Show, type JSX } from "solid-js";
import { FeedbackContext } from "./Feedback";
import { IconButton } from "./Button";
export function Dialog(props: {
  title: string;
  close: () => void;
  children: JSX.Element;
  wide?: boolean;
  compact?: boolean;
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
      class="m-auto flex max-h-[calc(100dvh_-_--spacing(16))] max-w-[calc(100vw_-_--spacing(10))] flex-col overflow-hidden rounded-2xl border-0 bg-surface p-6 text-ink shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-xs"
      classList={{
        wide: props.wide,
        "w-190": props.wide,
        "w-110": !props.wide,
        "p-3": props.compact,
        "w-80": props.compact,
      }}
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
      <Show when={!props.compact}>
        <div class="dialog-header mb-5 flex shrink-0 items-center justify-between gap-4">
          <h2 class="min-w-0 font-sans text-2xl leading-tight font-semibold tracking-tight wrap-anywhere">
            {props.title}
          </h2>
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
      </Show>
      <div class="dialog-body -m-1.5 min-h-0 overflow-auto overscroll-contain p-1.5">
        <Show when={feedback()}>
          <p
            role="alert"
            class="error-text mb-4 text-xs leading-relaxed text-danger"
          >
            {feedback()}
          </p>
        </Show>
        {props.children}
      </div>
    </dialog>
  );
}
