import { splitProps, type JSX } from "solid-js";
import { twMerge } from "tailwind-merge";

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "regular" | "small" | "compact";
  variant?: "primary" | "secondary" | "quiet" | "danger" | "bare";
  iconOnly?: boolean;
};

const sizes = {
  regular:
    "min-h-10 gap-2 px-4 text-sm font-semibold leading-none rounded-full",
  small:
    "min-h-8 gap-2 px-3 py-1.5 text-xs font-semibold leading-none rounded-full",
  compact: "min-h-7 gap-1.5 px-2 py-1 text-xs font-medium leading-5 rounded-md",
};
const iconSizes = {
  regular: "size-10 min-h-10 rounded-full",
  small: "size-8 min-h-8 rounded-full",
  compact: "size-7 min-h-7 rounded-md",
};
const variants = {
  primary:
    "primary bg-ink text-bg hover:brightness-95 disabled:bg-hover disabled:text-quiet disabled:opacity-100 [&_kbd]:text-bg [&_kbd]:opacity-65",
  secondary: "bg-ink/3 hover:bg-ink/6",
  quiet: "bg-transparent text-muted hover:bg-hover",
  danger: "bg-danger/10 text-danger hover:bg-danger/15",
  bare: "hover:bg-hover",
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "class",
    "size",
    "variant",
    "iconOnly",
    "onClick",
    "classList",
  ]);
  const size = () => local.size || "regular";
  const variant = () => local.variant || "secondary";
  return (
    <button
      type="button"
      {...rest}
      onClick={(event) => {
        if (!event.currentTarget.disabled && event.detail === 0)
          event.currentTarget.focus({ preventScroll: true });
        const handler = local.onClick;
        if (typeof handler === "function") handler(event);
        else if (Array.isArray(handler)) handler[0](handler[1], event);
      }}
      data-size={size()}
      data-variant={variant()}
      class={twMerge(
        "inline-flex shrink-0 cursor-pointer items-center justify-center border-0 text-inherit tracking-tight transition-colors duration-200 ease-in-out active:scale-98 disabled:cursor-default disabled:opacity-45 motion-reduce:transition-none [&>svg]:shrink-0",
        local.iconOnly
          ? `control-button icon-button ${iconSizes[size()]} p-1 gap-0`
          : variant() === "bare"
            ? "bare-button"
            : `control-button ${sizes[size()]}`,
        variants[variant()],
        local.class,
      )}
      classList={local.classList}
    />
  );
}

export function IconButton(props: ButtonProps & { "aria-label": string }) {
  return <Button {...props} iconOnly />;
}
