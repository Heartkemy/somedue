import { createUniqueId } from "solid-js";
import { type JSX } from "@solidjs/web";
import { onSettled } from "solid-js";
export function Field(props: {
  label: string;
  children: JSX.Element;
  hint?: string;
}) {
  const id = createUniqueId();
  let field!: HTMLDivElement;
  onSettled(() => {
    field
      .querySelectorAll("input,textarea,button[role=combobox]")
      .forEach((el) => {
        if (!el.hasAttribute("aria-label"))
          el.setAttribute("aria-labelledby", id);
      });
  });
  return (
    <div class="field my-4 flex min-w-0 flex-col gap-2 text-xs" ref={field}>
      <span
        id={id}
        class="text-xs text-muted"
        onClick={() =>
          field
            .querySelector<HTMLElement>("input,textarea,button[role=combobox]")
            ?.focus()
        }
      >
        {props.label}
      </span>
      {props.children}
      {props.hint && (
        <small class="text-xs leading-relaxed text-quiet">{props.hint}</small>
      )}
    </div>
  );
}
