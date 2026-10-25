// RoboLabs source timings/physics: docs/motion-reference.json. Native WAAPI, no runtime dependency.
function spring(stiffness: number, damping: number, duration?: number) {
  const omega = Math.sqrt(stiffness),
    zeta = damping / (2 * omega);
  const response = (t: number) => {
    if (duration) {
      // Zero-bounce duration spring: (1+x)e^-x settles to the source restDelta .001.
      let x = 5;
      for (let i = 0; i < 11; i++)
        x -= ((1 + x) * Math.exp(-x) - 0.001) / (-x * Math.exp(-x));
      const elapsed = (x * t) / (duration / 1000);
      return 1 - (1 + elapsed) * Math.exp(-elapsed);
    }
    if (Math.abs(zeta - 1) < 0.00001)
      return 1 - (1 + omega * t) * Math.exp(-omega * t);
    const a = omega * (zeta + Math.sqrt(zeta * zeta - 1)),
      b = omega * (zeta - Math.sqrt(zeta * zeta - 1));
    return 1 - (a * Math.exp(-b * t) - b * Math.exp(-a * t)) / (a - b);
  };
  let end = duration || 10;
  if (!duration) while (end < 10000 && response(end / 1000) < 0.995) end += 10;
  const count = Math.ceil(end / 10);
  return {
    duration: end,
    samples: Array.from({ length: count + 1 }, (_, i) =>
      i === count ? 1 : response(((i / count) * end) / 1000),
    ),
  };
}
const headline = spring(1, 2, 700),
  supporting = spring(1, 2, 600),
  section = spring(210, 70),
  panel = spring(400, 40);
export function listEntryDelay(index: number) {
  // Shrinking geometric gaps keep even long lists inside a 300ms entry window.
  return 60 + 240 * (1 - 0.7 ** index);
}
export function installMotion(enabled: () => boolean) {
  const active = new Set<Animation>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const allowed = () => enabled() && !reduced.matches;
  const cancel = () => {
    for (const animation of active) animation.cancel();
    active.clear();
  };
  function reveal(
    element: Element | null,
    curve: ReturnType<typeof spring>,
    delay: number,
    y: number,
    blur = 0,
  ) {
    if (!element || !allowed()) return;
    const animation = element.animate(
      curve.samples.map((p, i) => ({
        offset: i / (curve.samples.length - 1),
        opacity: 0.001 + 0.999 * p,
        transform: `translateY(${y * (1 - p)}px)`,
        filter: blur ? `blur(${blur * (1 - p)}px)` : "none",
      })),
      { duration: curve.duration, delay, fill: "both", easing: "linear" },
    );
    active.add(animation);
    animation.finished.then(
      () => {
        active.delete(animation);
        animation.cancel();
      },
      () => active.delete(animation),
    );
    return animation;
  }
  function enter(page: Element) {
    cancel();
    if (!allowed()) return;
    reveal(page.querySelector(".page-symbol"), section, 0, 15);
    page
      .querySelectorAll("h1 [data-motion-word]")
      .forEach((word, i) => reveal(word, headline, i * 50, 10, 10));
    page
      .querySelectorAll(
        ".project-notes,.header-controls,.page-divider,.list-visibility",
      )
      .forEach((element, i) =>
        reveal(element, supporting, 500 + i * 30, 10, 10),
      );
    const visible = [
      ...page.querySelectorAll(".task-row,.list-group-heading"),
    ].filter((element) => {
      const r = element.getBoundingClientRect(),
        p = page.getBoundingClientRect();
      return r.bottom > p.top && r.top < p.bottom;
    });
    visible.forEach((row, i) => reveal(row, section, listEntryDelay(i), 15));
    reveal(page.querySelector(".empty"), supporting, 500, 15);
    reveal(page.querySelector(".empty .primary"), supporting, 1000, 15);
  }
  const panelAnimations = new WeakMap<Element, Animation>();
  const animatePanel = (element: Element) => {
    if (
      element.matches(".task-editor[data-instant]") ||
      !element.getClientRects().length
    )
      return;
    if (panelAnimations.get(element)?.playState === "running") return;
    const animation = reveal(element, panel, 0, 15);
    if (animation) panelAnimations.set(element, animation);
  };
  const panels = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        if (node instanceof Element) {
          if (node.matches(".task-editor,.ui-menu,.list-menu,dialog[open]"))
            animatePanel(node);
          node
            .querySelectorAll(".task-editor,.ui-menu,.list-menu,dialog[open]")
            .forEach(animatePanel);
        }
  });
  panels.observe(document.documentElement, { childList: true, subtree: true });
  const toggle = (event: Event) => {
    const element = event.target;
    if (
      (event as ToggleEvent).newState === "closed" &&
      element instanceof Element
    ) {
      panelAnimations.get(element)?.cancel();
      panelAnimations.delete(element);
    }
    if (
      (event as ToggleEvent).newState === "open" &&
      element instanceof Element &&
      element.matches(".control-popover,dialog")
    )
      animatePanel(element);
  };
  document.addEventListener("toggle", toggle, true);
  reduced.addEventListener("change", cancel);
  return {
    enter,
    cancel,
    dispose() {
      cancel();
      panels.disconnect();
      document.removeEventListener("toggle", toggle, true);
      reduced.removeEventListener("change", cancel);
    },
  };
}
