import { test, expect } from "bun:test";
import {
  visible,
  listSections,
  related,
  taskContainer,
  type Entity,
} from "../src/model";

test("showing a large project's logged tasks does linear snapshot lookup work", () => {
  let reads = 0;
  const count = 2_000;
  const project: Entity = {
    id: "project",
    kind: "Task6",
    props: { tp: 1, ss: 3 },
  };
  const all: Entity[] = [
    project,
    ...Array.from({ length: count }, (_, i) => ({
      get id() {
        reads++;
        return `task-${i}`;
      },
      kind: "Task6",
      props: { tp: 0, ss: 3, pr: ["project"], ix: i },
    })),
  ];
  expect(visible(all, "project", "", "", true)).toHaveLength(count);
  // This was a full snapshot copy and parent scan for every row.
  expect(reads).toBeLessThan(count * 30);
});

test("snapshot indexes follow moved relationships without retaining old results", () => {
  const project: Entity = { id: "project", kind: "Task6", props: { tp: 1 } };
  const task: Entity = {
    id: "task",
    kind: "Task6",
    props: { pr: ["project"] },
  };
  const first = [project, task];
  expect(taskContainer(task, first)).toBe(project);
  expect(related(first, "pr", "project")).toEqual([task]);
  const moved = { ...task, props: { ...task.props, pr: [] } };
  const next = [project, moved];
  expect(taskContainer(moved, next)).toBeUndefined();
  expect(related(next, "pr", "project")).toEqual([]);
  expect(related(first, "pr", "project")).toEqual([task]);
});

test("Upcoming groups thousands of distinct dates in a single pass", () => {
  let reads = 0;
  const count = 2_000;
  const rows: Entity[] = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    kind: "Task6",
    props: {
      get sr() {
        reads++;
        return 2_000_000_000 + i * 86_400;
      },
    },
  }));
  const sections = listSections(rows, rows, "Upcoming", false);
  expect(sections).toHaveLength(count);
  expect(sections[0].rows).toEqual([rows[0]]);
  expect(sections.at(-1)!.rows).toEqual([rows.at(-1)!]);
  expect(reads).toBeLessThan(count * 5);
});

test("large projects group heading children without rescanning every row per heading", () => {
  let reads = 0;
  const count = 1_000;
  const all: Entity[] = [
    { id: "project", kind: "Task6", props: { tp: 1 } },
    ...Array.from({ length: count }, (_, i) => ({
      get id() {
        reads++;
        return `heading-${i}`;
      },
      kind: "Task6",
      props: { tp: 2, pr: ["project"], ix: i },
    })),
    ...Array.from({ length: count }, (_, i) => ({
      id: `child-${i}`,
      kind: "Task6",
      props: { tp: 0, agr: [`heading-${i}`], ix: i },
    })),
  ];
  const rows = visible(all, "project");
  expect(rows).toHaveLength(count * 2);
  expect(rows.slice(0, 4).map((item) => item.id)).toEqual([
    "heading-0",
    "child-0",
    "heading-1",
    "child-1",
  ]);
  expect(reads).toBeLessThan(count * 50);
});
