// One modality and scroll policy for the main app, dialogs and Quick Entry.
export function installInteractionState() {
  const root = document.documentElement;
  root.dataset.inputModality = "pointer";
  document.addEventListener(
    "pointerdown",
    () => {
      root.dataset.inputModality = "pointer";
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      const target = event.target as HTMLElement;
      const navigation = [
        "Tab",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "Enter",
        " ",
      ].includes(event.key);
      if (
        event.key === "Tab" ||
        event.metaKey ||
        event.ctrlKey ||
        (navigation && !target.matches("input,textarea,[contenteditable=true]"))
      )
        root.dataset.inputModality = "keyboard";
    },
    true,
  );
  const scrolling = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  document.addEventListener(
    "scroll",
    (event) => {
      const element =
        event.target instanceof HTMLElement
          ? event.target
          : document.scrollingElement;
      if (!(element instanceof HTMLElement)) return;
      clearTimeout(scrolling.get(element));
      element.dataset.scrolling = "true";
      scrolling.set(
        element,
        setTimeout(() => {
          delete element.dataset.scrolling;
          scrolling.delete(element);
        }, 700),
      );
    },
    { capture: true, passive: true },
  );
}
