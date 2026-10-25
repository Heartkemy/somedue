import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    const task = (id: string, props = {}) => ({
      id,
      kind: "Task6",
      props: { tt: id, tp: 0, ss: 0, st: 0, ...props },
    });
    (window as any).__TEST_STATE__.entities = [
      task("a", { nt: "Notes stay aligned" }),
      task("b"),
      task("project", { tp: 1, st: 1 }),
      task("heading", { tt: "General", tp: 2, st: 1, pr: ["project"] }),
      task("child", { st: 1, pr: ["project"], agr: ["heading"] }),
      task("later", { st: 2, pr: ["project"] }),
      task("logged-project", { tp: 1, st: 1, ss: 3, sp: Date.now() / 1000 }),
      ...["First step", "Second step"].map((tt, ix) => ({
        id: `check-${ix}`,
        kind: "ChecklistItem3",
        props: { tt, ts: ["a"], ss: 0, ix: ix * 1024 },
      })),
    ];
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
});

test("single click selects, empty space clears, and Enter or double click edits", async ({
  page,
}) => {
  await page.locator("#item-a .task-title").click();
  await expect(page.locator("#item-a")).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".task-editor")).toHaveCount(0);
  await page.locator(".list-page").click({ position: { x: 300, y: 400 } });
  await expect(page.locator(".task-row[aria-current=true]")).toHaveCount(0);
  await page.locator("#item-a .task-title").click();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "To-do title" })).toHaveValue(
    "a",
  );
  await page.getByRole("textbox", { name: "To-do title" }).fill("Saved A");
  await page.locator("#item-b .task-title").click();
  await expect(page.locator(".task-editor")).toHaveCount(0);
  await expect(page.locator("#item-b")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#item-a .task-title")).toHaveText("Saved A");
  await page.locator("#item-b .task-title").dblclick();
  await expect(page.getByRole("textbox", { name: "To-do title" })).toHaveValue(
    "b",
  );
  await page.keyboard.press("Escape");
  await page.locator("#item-a .task-title").click();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#item-b")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "To-do title" })).toHaveValue(
    "b",
  );
});

test("schedule glyph and list controls align with their text gutter", async ({
  page,
}, info) => {
  await page.locator("#item-a .task-title").dblclick();
  const when = page
    .locator(".task-editor")
    .getByRole("button", { name: "When", exact: true });
  await expect(when).not.toContainText("Inbox");
  await expect(when.locator("svg")).toHaveClass(/lucide-calendar-days/);
  const notesX = (await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .boundingBox())!.x;
  expect((await when.locator("svg").boundingBox())!.x).toBe(notesX);
  await when.click();
  const picker = page.getByRole("dialog", { name: "When", exact: true });
  await expect(
    picker
      .getByRole("button", { name: "Clear schedule", exact: true })
      .locator("svg"),
  ).toBeVisible();
  await picker
    .getByRole("button", { name: "This Evening", exact: true })
    .click();
  expect(
    (await page.locator(".task-editor .schedule-chip").first().boundingBox())!
      .x,
  ).toBe(notesX);
  await page.screenshot({
    path: info.outputPath("aligned-schedule.png"),
    animations: "disabled",
  });
  await page.locator("h1").click();
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  const calendar = page.getByRole("button", { name: "Calendar", exact: true });
  const textStart = await calendar.evaluate(
    (el) =>
      el.getBoundingClientRect().x +
      parseFloat(getComputedStyle(el).paddingLeft),
  );
  expect(textStart).toBe(
    (await page.locator(".upcoming-day").first().boundingBox())!.x,
  );
  await page
    .locator(".project-nav")
    .filter({ hasText: /^project$/ })
    .click();
  const tagGlyph = page.locator(
    ".list-tag-editor .tag-dropdown > button > svg",
  );
  expect((await tagGlyph.boundingBox())!.x).toBe(
    (await page.locator(".project-notes").boundingBox())!.x,
  );
});

test("the full sidebar edge resizes and its handle appears only near the edge", async ({
  page,
}) => {
  const edge = page.getByRole("separator", { name: "Sidebar width" });
  const handle = page.locator(".sidebar-resize-handle");
  await page.mouse.move(500, 400);
  await expect(handle).toHaveCSS("opacity", "0");
  const bounds = (await edge.boundingBox())!;
  expect(bounds.height).toBeGreaterThan(600);
  await edge.hover({ position: { x: bounds.width / 2, y: 100 } });
  await expect(handle).toHaveCSS("opacity", "1");
  const old = Number(await edge.getAttribute("aria-valuenow"));
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 40, 100, { steps: 4 });
  await page.mouse.up();
  await expect(edge).toHaveAttribute("aria-valuenow", String(old + 40));
  await page.locator("#item-a").hover();
  const schedule = (await page.locator("#item-a .row-schedule").boundingBox())!;
  expect(schedule.x).toBeGreaterThanOrEqual(
    (await edge.boundingBox())!.x + (await edge.boundingBox())!.width + 4,
  );
  await expect(handle).toHaveCSS("opacity", "0");
});

test("headings have persistent quiet menus and page icons match title scale", async ({
  page,
}, info) => {
  await page
    .locator(".project-nav")
    .filter({ hasText: /^project$/ })
    .click();
  const heading = page.locator("#item-heading");
  const headingSize = await heading
    .locator(".task-title")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const bucketSize = await page
    .locator(".list-group-heading")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(headingSize).toBeGreaterThan(bucketSize);
  const actions = heading.getByRole("button", { name: "Heading actions" });
  await expect(actions).toBeVisible();
  await expect(actions).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await actions.click();
  await expect(
    page.getByRole("menuitem", { name: "Archive", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("h1").click();
  const size = (await page.locator(".page-symbol > svg").boundingBox())!.width;
  expect(size).toBeGreaterThanOrEqual(32);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Settings", exact: true }).hover();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({
    path: info.outputPath("heading-and-icons.png"),
    animations: "disabled",
  });
});

test("checklist rows share task check geometry and reorder with their right handles", async ({
  page,
}, info) => {
  const taskCheck = await page.locator("#item-a .task-check").boundingBox();
  await page.locator("#item-a .task-title").dblclick();
  const first = page.locator('.check-row[data-check-id="check-0"]');
  const second = page.locator('.check-row[data-check-id="check-1"]');
  const checkbox = first.getByRole("checkbox");
  expect((await checkbox.boundingBox())!.width).toBe(taskCheck!.width);
  await expect(first).toHaveCSS("border-bottom-width", "1px");
  const grip = first.getByRole("button", { name: "Reorder checklist item" });
  await grip.dragTo(second, {
    targetPosition: { x: 80, y: (await second.boundingBox())!.height - 2 },
  });
  expect(
    await page
      .getByRole("textbox", { name: "Checklist item", exact: true })
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLInputElement).value),
      ),
  ).toEqual(["Second step", "First step"]);
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.screenshot({
    path: info.outputPath("checklist.png"),
    animations: "disabled",
  });
  await page.locator("h1").click();
  await page.locator("#item-a .task-title").dblclick();
  expect(
    await page
      .getByRole("textbox", { name: "Checklist item", exact: true })
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLInputElement).value),
      ),
  ).toEqual(["Second step", "First step"]);
});

test("completed projects retain the outer progress ring around their check mark", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Logbook", exact: true }).click();
  const project = page.locator("#item-logged-project .task-check");
  await expect(project.locator("circle")).toHaveCount(2);
  await expect(project.locator("circle").first()).toHaveAttribute(
    "fill",
    "none",
  );
  await expect(project.locator(".lucide-check")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("completed-project.png"),
    animations: "disabled",
  });
});

test("narrow light controls fit and the evening crescent uses the shared outline weight", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 760, height: 540 });
  await page.evaluate(
    () => ((window as any).__TEST_STATE__.preferences.theme = "light"),
  );
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.locator("#item-a .task-title").dblclick();
  expect(
    await page
      .locator(".task-editor")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const when = page
    .locator(".task-editor")
    .getByRole("button", { name: "When", exact: true });
  await when.click();
  await page
    .getByRole("dialog", { name: "When", exact: true })
    .getByRole("button", { name: "This Evening", exact: true })
    .click();
  await expect(when.locator("svg")).toHaveAttribute("fill", "none");
  await expect(when.locator("svg")).toHaveAttribute("stroke-width", "1.8");
  await page.screenshot({
    path: info.outputPath("narrow-light-editor.png"),
    animations: "disabled",
  });
  await page.locator("h1").click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".list-group-heading svg")).toHaveAttribute(
    "fill",
    "none",
  );
  expect((await page.locator(".page-symbol > svg").boundingBox())!.width).toBe(
    32,
  );
  await page.screenshot({
    path: info.outputPath("narrow-light-evening.png"),
    animations: "disabled",
  });
});
