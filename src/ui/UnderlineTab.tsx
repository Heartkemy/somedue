import { splitProps } from "solid-js";
import { twMerge } from "tailwind-merge";
import { Button, type ButtonProps } from "./Button";

export function UnderlineTab(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <Button
      {...rest}
      variant="quiet"
      class={twMerge(
        "relative min-h-10 items-baseline rounded-none bg-transparent px-0 pt-1.5 pb-2 font-serif text-3xl leading-tight font-normal text-quiet hover:bg-transparent active:scale-100 aria-pressed:text-ink after:origin-left after:transition-transform after:duration-200 after:ease-out hover:after:scale-x-160 aria-pressed:after:absolute aria-pressed:after:bottom-px aria-pressed:after:left-0 aria-pressed:after:h-0.5 aria-pressed:after:w-4.5 aria-pressed:after:rounded-full aria-pressed:after:bg-accent aria-pressed:after:content-[''] motion-reduce:after:transition-none",
        local.class,
      )}
    />
  );
}
