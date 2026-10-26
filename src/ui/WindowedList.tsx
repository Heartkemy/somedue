import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  untrack,
  type Accessor,
  type JSX,
} from "solid-js";

// Variable row heights keep headings, wrapped metadata and live editors in one list.
export function WindowedList<T extends { id: string }>(props: {
  each: T[];
  scroller?: HTMLElement;
  reset: string;
  activeId: string;
  pinnedId: string;
  children: (entry: Accessor<T>) => JSX.Element;
}) {
  let root!: HTMLDivElement;
  const heights = new Map<string, number>();
  const [measured, setMeasured] = createSignal(0);
  const [viewport, setViewport] = createSignal({ top: 0, height: 800 });
  const entries = createMemo(
    () => new Map(props.each.map((entry) => [entry.id, entry])),
  );
  const ids = createMemo(() => props.each.map((entry) => entry.id));
  const windowed = () => ids().length > 100;
  const offsets = createMemo(() => {
    measured();
    const result = [0];
    for (const id of ids())
      result.push(result.at(-1)! + (heights.get(id) ?? 40));
    return result;
  });
  const positions = createMemo(() => new Map(ids().map((id, i) => [id, i])));
  function indexAt(offset: number) {
    const values = offsets();
    let low = 0,
      high = ids().length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (values[middle + 1] < offset) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  const rendered = createMemo(() => {
    if (!windowed()) return ids();
    const { top, height } = viewport();
    const start = indexAt(Math.max(0, top - 400));
    const end = Math.min(ids().length, indexAt(top + height + 400) + 1);
    const indexes = new Set(
      Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i),
    );
    for (const id of [props.activeId, props.pinnedId]) {
      const position = positions().get(id);
      if (position !== undefined) indexes.add(position);
    }
    return [...indexes].sort((a, b) => a - b).map((i) => ids()[i]);
  });
  const rootTop = () =>
    root.getBoundingClientRect().top -
    props.scroller!.getBoundingClientRect().top +
    props.scroller!.scrollTop;
  function updateViewport() {
    if (!root || !props.scroller) return;
    const next = {
      top: props.scroller.scrollTop - rootTop(),
      height: props.scroller.clientHeight,
    };
    setViewport((old) =>
      old.top === next.top && old.height === next.height ? old : next,
    );
  }
  let measurementFrame = 0;
  let sizesChanged = false;
  const observer = new ResizeObserver((records) => {
    for (const record of records) {
      const id = (record.target as HTMLElement).dataset.windowId;
      if (!id) continue;
      const height =
        record.borderBoxSize[0]?.blockSize ??
        record.target.getBoundingClientRect().height;
      if (height > 0 && Math.abs((heights.get(id) ?? 40) - height) > 0.5) {
        heights.set(id, height);
        sizesChanged = true;
      }
    }
    // Apply measured layout in the next frame, outside ResizeObserver delivery.
    if (!measurementFrame)
      measurementFrame = requestAnimationFrame(() => {
        measurementFrame = 0;
        if (sizesChanged) {
          sizesChanged = false;
          const scroller = props.scroller!;
          const anchor = indexAt(scroller.scrollTop - rootTop());
          const before = offsets()[anchor];
          const atBottom =
            scroller.scrollTop + scroller.clientHeight >=
            scroller.scrollHeight - 1;
          setMeasured((n) => n + 1);
          if (windowed()) {
            // Preserve the scroll anchor as estimates become measured heights.
            if (atBottom) scroller.scrollTop = scroller.scrollHeight;
            else scroller.scrollTop += offsets()[anchor] - before;
          }
        }
        updateViewport();
      });
  });
  onMount(() => {
    const scroller = props.scroller!;
    scroller.addEventListener("scroll", updateViewport, { passive: true });
    observer.observe(scroller);
    updateViewport();
    onCleanup(() => scroller.removeEventListener("scroll", updateViewport));
  });
  onCleanup(() => {
    observer.disconnect();
    cancelAnimationFrame(measurementFrame);
  });
  createEffect(
    on(
      () => props.reset,
      () => {
        heights.clear();
        setMeasured((n) => n + 1);
        if (props.scroller) props.scroller.scrollTop = 0;
        updateViewport();
      },
    ),
  );
  createEffect(
    on(
      () => props.activeId,
      (id) =>
        untrack(() => {
          if (!windowed() || !props.scroller || !root) return;
          const index = positions().get(id);
          if (index === undefined) return;
          const top = rootTop() + offsets()[index];
          const bottom = rootTop() + offsets()[index + 1];
          if (top < props.scroller.scrollTop) props.scroller.scrollTop = top;
          else if (
            bottom >
            props.scroller.scrollTop + props.scroller.clientHeight
          )
            props.scroller.scrollTop = bottom - props.scroller.clientHeight;
          updateViewport();
        }),
    ),
  );
  createEffect(() => {
    const live = new Set(ids());
    for (const id of heights.keys()) if (!live.has(id)) heights.delete(id);
  });
  return (
    <div
      ref={root}
      class="[overflow-anchor:none]"
      classList={{ relative: windowed(), contents: !windowed() }}
      // Runtime measurements cannot be expressed with theme spacing utilities.
      style={{ height: windowed() ? `${offsets().at(-1)}px` : undefined }}
    >
      <For each={rendered()}>
        {(id) => {
          let element!: HTMLDivElement;
          const entry = createMemo<T>(
            (previous) => entries().get(id) || previous!,
          );
          onMount(() => observer.observe(element));
          onCleanup(() => observer.unobserve(element));
          return (
            <div
              ref={element}
              data-window-id={id}
              data-first={positions().get(id) === 0}
              class="[&>h2:first-child]:mt-7 data-[first=true]:[&>h2:first-child]:mt-0"
              classList={{
                "absolute inset-x-0 flow-root": windowed(),
                contents: !windowed(),
              }}
              style={{
                top: windowed()
                  ? `${offsets()[positions().get(id)!]}px`
                  : undefined,
              }}
            >
              {props.children(entry)}
            </div>
          );
        }}
      </For>
    </div>
  );
}
