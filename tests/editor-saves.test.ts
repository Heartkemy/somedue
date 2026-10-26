import { expect, test } from "bun:test";
import { createEditorSaves } from "../src/editor-saves";
import type { Entity } from "../src/model";

const item: Entity = { id: "a", kind: "Task6", props: { tt: "A" } };
const draft = () => ({
  name: "Unsaved A",
  notes: "Notes",
  checks: [{ title: "Step", done: true }],
  start: "2026-11-01",
  deadline: "2026-11-02",
  reminder: "2026-11-01T10:00",
  tags: ["tag"],
  destination: "project",
  status: 0,
  repeat: "256",
  convert: true,
});

test("reopening a pending or failed draft restores every field and keeps row identity", () => {
  const saves = createEditorSaves<ReturnType<typeof draft>>();
  const values = draft();
  const first = saves.retain(item, () => structuredClone(values));
  const submitted = first.read();
  const restored = saves.drafts.get("a")!.read();
  const reopened = saves.retain(
    { ...item, props: { tt: "Saved A" } },
    () => restored,
  );
  expect(reopened.item).toBe(item);
  expect(reopened.read()).toEqual(values);
  expect(saves.unchanged(first, submitted)).toBe(false);
  saves.release(first);
  expect(saves.drafts.get("a")).toBe(reopened);
  restored.name = "Latest typing";
  expect(saves.drafts.get("a")!.read().name).toBe("Latest typing");
});

test("typing during an explicit save prevents that completion from closing the draft", () => {
  const saves = createEditorSaves<ReturnType<typeof draft>>();
  const values = draft();
  const session = saves.retain(item, () => structuredClone(values));
  const submitted = session.read();
  expect(saves.unchanged(session, submitted)).toBe(true);
  values.checks.push({ title: "Added while saving", done: false });
  expect(saves.unchanged(session, submitted)).toBe(false);
  expect(submitted.checks).toHaveLength(1);
});

test("save queue preserves ordering through delayed persistence and errors", async () => {
  const saves = createEditorSaves<string>();
  const order: string[] = [];
  let unblock!: () => void;
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const first = saves.enqueue(async () => {
    order.push("A started");
    await blocked;
    order.push("A failed");
    throw Error("Persistence failed");
  });
  const rejected = first.catch((error: Error) => error.message);
  const second = saves.enqueue(async () => {
    order.push("B saved");
    return "B";
  });
  const third = saves.enqueue(async () => {
    order.push("Latest A saved");
  });
  await Promise.resolve();
  expect(order).toEqual(["A started"]);
  unblock();
  expect(await rejected).toBe("Persistence failed");
  expect(await second).toBe("B");
  await third;
  expect(order).toEqual(["A started", "A failed", "B saved", "Latest A saved"]);
});
