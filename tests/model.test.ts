import { test, expect } from "bun:test";
import {
  visible,
  active,
  today,
  day,
  date,
  schedule,
  move,
  nextDate,
  uuid,
  listSections,
  upcomingDay,
  title,
  type Entity,
} from "../src/model";
const e = (id: string, p: Record<string, unknown> = {}): Entity => ({
  id,
  kind: "Task6",
  props: { tt: id, tp: 0, ss: 0, st: 1, ...p },
});
test("Inbox is unscheduled capture, Today inherits due and started dates", () => {
  const all = [
    e("inbox", { st: 0 }),
    e("today", { sr: today() }),
    e("due", { st: 2, dd: today() }),
    e("later", { st: 2, sr: today() + 86400 }),
  ];
  expect(visible(all, "Inbox").map((e) => e.id)).toEqual(["inbox"]);
  expect(visible(all, "Today").map((e) => e.id)).toEqual(["due", "today"]);
  expect(visible(all, "Upcoming").map((e) => e.id)).toEqual(["later"]);
});
test("completed, canceled and trashed container children are excluded", () => {
  for (const p of [{ ss: 3 }, { ss: 2 }, { tr: 1 }]) {
    const all = [
      e("p", { tp: 1, ...p }),
      e("h", { tp: 2, pr: ["p"] }),
      e("child", { pr: ["p"], agr: ["h"], sr: today() }),
    ];
    expect(active(all[2], all)).toBe(false);
    expect(visible(all, "Today")).toHaveLength(0);
  }
});
test("recurrence template stays hidden from search and lists", () => {
  expect(visible([e("template", { rr: { fu: 16 } })], "Anytime")).toEqual([]);
  expect(
    visible([e("template", { rr: { fu: 16 } })], "Inbox", "template"),
  ).toEqual([]);
});
test("Upcoming exposes future repeating templates and Trash includes blank titles and templates", () => {
  const all = [
    e("template", { rr: { fu: 16 }, sr: today() + 86400 }),
    e("deleted", { rr: { fu: 16 }, tt: "", tr: true, md: 100 }),
    e("older", { tr: true, md: 10 }),
  ];
  expect(visible(all, "Upcoming").map((item) => item.id)).toEqual(["template"]);
  expect(visible(all, "Trash").map((item) => item.id)).toEqual([
    "deleted",
    "older",
  ]);
  expect(title(all[1])).toBe("New To-Do");
});
test("Upcoming sections include empty days and use the next future deadline", () => {
  const task = e("past-start", {
    sr: today() - 86400,
    dd: today() + 2 * 86400,
  });
  expect(upcomingDay(task)).toBe(today() + 2 * 86400);
  expect(listSections([task], [task], "Upcoming")).toHaveLength(30);
  expect(listSections([task], [task], "Upcoming")[0].rows).toEqual([]);
  expect(listSections([task], [task], "Upcoming", false)).toHaveLength(1);
});
test("Anytime groups heading-only children under their project and loose tasks under areas", () => {
  const all: Entity[] = [
    e("project", { tp: 1 }),
    e("heading", { tp: 2, pr: ["project"] }),
    e("child", { agr: ["heading"] }),
    { id: "area", kind: "Area3", props: { tt: "Home" } },
    e("loose", { ar: ["area"] }),
  ];
  const sections = listSections(visible(all, "Anytime"), all, "Anytime");
  expect(
    sections.map((section) => [section.id, section.rows.map((row) => row.id)]),
  ).toEqual([
    ["project", ["child"]],
    ["area", ["loose"]],
  ]);
});
test("calendar dates are timezone independent", () => {
  expect(date(day("2026-10-25"))).toBe("2026-10-25");
  expect(day("2026-10-26") - day("2026-10-25")).toBe(86400);
});
test("month end and leap day recurrence do not skip a month", () => {
  expect(date(nextDate(day("2024-01-31"), 8))).toBe("2024-02-29");
  expect(date(nextDate(day("2024-02-29"), 4))).toBe("2025-02-28");
});
test("move to heading updates both project and heading, clears area", () => {
  expect(move(e("task"), e("heading", { tp: 2, pr: ["project"] }))).toEqual({
    pr: ["project"],
    ar: [],
    agr: ["heading"],
    st: 1,
  });
});
test("reopening clears completion and leaves trash explicitly restorable", () => {
  const all = [e("done", { ss: 3 }), e("gone", { tr: 1 })];
  expect(visible(all, "Logbook").map((e) => e.id)).toEqual(["done"]);
  expect(visible(all, "Trash").map((e) => e.id)).toEqual(["gone"]);
});
test("notes participate in search, tags narrow results", () => {
  const all = [
    e("one", { nt: { v: "tomorrow plan" }, tg: ["work"] }),
    e("two", { nt: { v: "tomorrow home" }, tg: ["home"] }),
  ];
  expect(visible(all, "Anytime", "tomorrow", "work").map((e) => e.id)).toEqual([
    "one",
  ]);
});
test("future schedule uses someday state plus calendar date", () => {
  const s = schedule("Date", date(today() + 86400));
  expect(s.st).toBe(2);
  expect(s.sr).toBe(today() + 86400);
  expect(schedule("This Evening").sb).toBe(1);
});
test("base58 random identities are unique and use protocol alphabet", () => {
  const ids = Array.from({ length: 500 }, uuid);
  expect(new Set(ids).size).toBe(500);
  expect(ids.every((x) => /^[1-9A-HJ-NP-Za-km-z]+$/.test(x))).toBe(true);
});
test("heading children render immediately below their heading, including agr-only native tasks", () => {
  const all = [
    e("p", { tp: 1 }),
    e("heading", { tp: 2, pr: ["p"], ix: 20 }),
    e("child", { agr: ["heading"], ix: 0 }),
    e("loose", { pr: ["p"], ix: 50 }),
  ];
  expect(visible(all, "p").map((e) => e.id)).toEqual([
    "loose",
    "heading",
    "child",
  ]);
});
test("a deferred task becomes actionable when its date arrives", () => {
  expect(
    visible([e("scheduled", { st: 2, sr: today() - 86400 })], "Anytime"),
  ).toHaveLength(1);
});

test("project duplication preserves heading and checklist hierarchy with fresh IDs", async () => {
  const { duplicateTree } = await import("../src/model");
  const p = e("p", { tp: 1 }),
    h = e("h", { tp: 2, pr: ["p"] }),
    t = e("t", { pr: ["p"], agr: ["h"] }),
    c = { ...e("c", { ts: ["t"] }), kind: "ChecklistItem3" };
  const { changes, id } = duplicateTree(p, [p, h, t, c]);
  expect(Object.keys(changes)).toHaveLength(4);
  const heading = Object.entries(changes).find(([, v]) => v.p.tp === 2)!;
  expect(heading[1].p.pr).toEqual([id]);
  const task = Object.entries(changes).find(([, v]) => v.p.tt === "t")!;
  expect(task[1].p.agr).toEqual([heading[0]]);
  expect(
    Object.values(changes).find((v) => v.e === "ChecklistItem3")!.p.ts,
  ).toEqual([task[0]]);
});
test("permanent project deletion includes descendant checklist entities", async () => {
  const { deleteTree } = await import("../src/model");
  const p = e("p", { tp: 1 }),
    t = e("t", { pr: ["p"] }),
    c = { ...e("c", { ts: ["t"] }), kind: "ChecklistItem3" };
  expect(Object.keys(deleteTree(p, [p, t, c, e("unrelated")]))).toEqual([
    "p",
    "t",
    "c",
  ]);
});
test("tag filters inherit project/area tags and include parent tag groups", () => {
  const all: Entity[] = [
    { id: "parent-tag", kind: "Tag4", props: { tt: "Work", pn: [] } },
    {
      id: "child-tag",
      kind: "Tag4",
      props: { tt: "Calls", pn: ["parent-tag"] },
    },
    { id: "area", kind: "Area3", props: { tt: "Office", tg: ["child-tag"] } },
    e("project", { tp: 1, ar: ["area"] }),
    e("heading", { tp: 2, pr: ["project"] }),
    e("task", { agr: ["heading"] }),
  ];
  expect(visible(all, "Anytime", "", "parent-tag").map((e) => e.id)).toContain(
    "task",
  );
  expect(visible(all, "Anytime", "", "child-tag").map((e) => e.id)).toContain(
    "task",
  );
  expect(all.find((e) => e.id === "task")!.props.tg).toBeUndefined();
});

test("new projects and tasks use the boolean Cloud trash contract", async () => {
  const { create } = await import("../src/model");
  for (const kind of ["Task6", "Task7"])
    for (const tp of [0, 1, 2]) {
      const change = Object.values(create(kind, { tt: "New", tp }))[0];
      expect(change.p.tr).toBe(false);
    }
});
test("area projects precede loose tasks and logged items remain opt-in", () => {
  const area: Entity = { id: "area", kind: "Area3", props: {} };
  const rows = [
    area,
    e("task", { ar: ["area"], ix: 0 }),
    e("project", { ar: ["area"], tp: 1, ix: 10 }),
    e("cancelled", { ar: ["area"], ss: 2, ix: -1 }),
    e("done", { ar: ["area"], ss: 3, ix: -2 }),
    e("trash", { ar: ["area"], tr: true }),
  ];
  expect(visible(rows, "area").map((x) => x.id)).toEqual(["project", "task"]);
  expect(visible(rows, "area", "", "", true).map((x) => x.id)).toEqual([
    "project",
    "task",
    "done",
    "cancelled",
  ]);
});
test("heading-only children count toward project progress and search inherited tags", async () => {
  const { projectStats } = await import("../src/model");
  const p = e("p", { tp: 1, tg: ["tag"] });
  const rows = [
    p,
    e("h", { tp: 2, pr: ["p"] }),
    e("child", { agr: ["h"] }),
    e("done", { pr: ["p"], ss: 3 }),
    e("trashed", { pr: ["p"], tr: true }),
    { id: "tag", kind: "Tag4", props: { tt: "Work" } },
  ];
  expect(projectStats(p, rows)).toEqual({ total: 2, done: 1, remaining: 1 });
  expect(visible(rows, "Inbox", "#work").map((x) => x.id)).toContain("child");
});
test("reordering preserves entities and writes durable contiguous positions", async () => {
  const { orderBefore } = await import("../src/model");
  const rows = [
    e("first", { ix: 1 }),
    e("second", { ix: 2 }),
    e("third", { ix: 3 }),
  ];
  const changes = orderBefore(rows, rows[2], rows[0]);
  const updated = rows.map((row) => ({
    ...row,
    props: { ...row.props, ...changes[row.id].p },
  }));
  expect(visible(updated, "Anytime").map((x) => x.id)).toEqual([
    "third",
    "first",
    "second",
  ]);
  expect(rows[0].props.ix).toBe(1);
  expect(orderBefore(rows, e("outside"), rows[0])).toEqual({});
});

test("project sections place actionable tasks before future and Someday tasks", () => {
  const rows = [
    e("project", { tp: 1 }),
    e("someday", { pr: ["project"], st: 2, ix: 0 }),
    e("future", { pr: ["project"], st: 2, sr: today() + 86400, ix: 1 }),
    e("ready", { pr: ["project"], st: 1, ix: 50 }),
  ];
  expect(visible(rows, "project").map((x) => x.id)).toEqual([
    "ready",
    "future",
    "someday",
  ]);
});
test("Today respects Today order independently of project order", () => {
  const rows = [
    e("first", { sr: today(), ti: 0, ix: 100 }),
    e("second", { sr: today(), ti: 1024, ix: 0 }),
  ];
  expect(visible(rows, "Today").map((x) => x.id)).toEqual(["first", "second"]);
});
test("a drop on the lower half of a row moves an item after it", async () => {
  const { orderBefore } = await import("../src/model");
  const rows = [e("first", { ix: 0 }), e("second", { ix: 1024 })];
  const changes = orderBefore(rows, rows[0], rows[1], true);
  expect(changes.first.p.ix).toBeGreaterThan(changes.second.p.ix);
});

test("reference progress sector has a gap from the outer ring, including full completion", async () => {
  const { projectProgressPath } = await import("../src/model");
  expect(projectProgressPath(0)).toBe("");
  expect(projectProgressPath(0.25)).toContain("A5.5 5.5 0 0 1");
  expect(projectProgressPath(0.75)).toContain("A5.5 5.5 0 1 1");
  expect(projectProgressPath(1).match(/A5.5/g)).toHaveLength(2);
});
