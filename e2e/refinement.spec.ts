import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);
const seed = [
  { id: "a", kind: "Area3", props: { tt: "Work", ix: 0 } },
  { id: "b", kind: "Area3", props: { tt: "Home", ix: 1024 } },
  {
    id: "p",
    kind: "Task6",
    props: { tt: "Launch", tp: 1, st: 1, ar: ["a"], ix: 1024 },
  },
  {
    id: "p2",
    kind: "Task6",
    props: { tt: "Review", tp: 1, st: 1, ar: ["a"], ix: 2048 },
  },
  {
    id: "h",
    kind: "Task6",
    props: { tt: "Preparation", tp: 2, st: 1, pr: ["p"], ix: 0 },
  },
  {
    id: "t",
    kind: "Task6",
    props: {
      tt: "Write proposal",
      st: 1,
      pr: ["p"],
      agr: ["h"],
      tg: ["tag"],
      ix: 0,
    },
  },
  {
    id: "t2",
    kind: "Task6",
    props: { tt: "Loose task", st: 1, ar: ["a"], ix: 0 },
  },
  {
    id: "done",
    kind: "Task6",
    props: {
      tt: "Shipped task",
      st: 1,
      pr: ["p"],
      ss: 3,
      sp: 1790000000,
      ix: 100,
    },
  },
  {
    id: "cancel",
    kind: "Task6",
    props: {
      tt: "Cancelled idea",
      st: 1,
      pr: ["p"],
      ss: 2,
      sp: 1787000000,
      ix: 200,
    },
  },
  {
    id: "later",
    kind: "Task6",
    props: { tt: "Future task", st: 2, pr: ["p"], ix: 300 },
  },
  { id: "tag", kind: "Tag4", props: { tt: "Writing" } },
];
for (const width of [1120, 760])
  test.describe(`Refinement ${width}`, () => {
    test.use({ viewport: { width, height: width === 760 ? 540 : 780 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(fixture);
      await page.evaluate((rows) => {
        (window as any).__TEST_STATE__.entities = rows;
      }, seed);
      await page.getByRole("button", { name: "Sync now", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Work", exact: true }),
      ).toBeVisible();
    });
    test("area hierarchy, progress, persistent ordering and sidebar controls", async ({
      page,
    }, info) => {
      await page.getByRole("button", { name: "Work", exact: true }).click();
      await expect(page.locator(".task-list .task-title")).toHaveText([
        "Launch",
        "Review",
        "Loose task",
      ]);
      await expect(page.locator(".project-task-count").first()).toHaveText("2");
      await page.locator("#item-p2").dragTo(page.locator("#item-p"));
      await expect(page.locator(".task-list .task-title")).toHaveText([
        "Review",
        "Launch",
        "Loose task",
      ]);
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await page.getByRole("button", { name: "Work", exact: true }).click();
      await expect(page.locator(".task-list .task-title")).toHaveText([
        "Review",
        "Launch",
        "Loose task",
      ]);
      await page
        .getByRole("button", { name: "Collapse Work", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await expect(
        page.locator(".sidebar .project-nav").filter({ hasText: "Launch" }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Expand Work", exact: true })
        .click();
      const grip = page.getByRole("separator", { name: "Sidebar width" });
      await grip.focus();
      await page.keyboard.press("ArrowRight");
      await expect(grip).toHaveAttribute("aria-valuenow", "246");
      await page.screenshot({
        path: info.outputPath("area.png"),
        animations: "disabled",
      });
    });
    test("single click, draft move, checklist, reminder persistence and conversion", async ({
      page,
    }, info) => {
      await page
        .locator(".sidebar .project-nav")
        .filter({ hasText: "Launch" })
        .click();
      await page.locator("#item-t .task-title").click();
      await expect(
        page.getByRole("textbox", { name: "To-do title" }),
      ).toHaveValue("Write proposal");
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "New to-do", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "To-do title" })
        .fill("Draft to move");
      await page.getByRole("button", { name: "Move to", exact: true }).click();
      await page
        .locator(".editor-move-panel")
        .getByRole("option", { name: "Work", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Add checklist item", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Checklist item", exact: true })
        .fill("First step");
      await page
        .locator(".task-editor")
        .getByRole("button", { name: "When", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Add reminder", exact: true })
        .click();
      await page.getByLabel("Reminder date and time").fill("2030-01-01T09:00");
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "To-do actions", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Convert to Project…", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Draft to move", exact: true }),
      ).toBeVisible();
      const persisted = await page.evaluate(() => {
        const s = (window as any).__TEST_STATE__,
          p = s.entities.find((x: any) => x.props.tt === "Draft to move");
        return {
          tp: p.props.tp,
          tr: p.props.tr,
          ar: p.props.ar,
          reminder: s.preferences.reminders["local:" + p.id],
          checks: s.entities.filter((x: any) => x.props.ts?.includes(p.id))
            .length,
        };
      });
      expect(persisted).toEqual({
        tp: 1,
        tr: false,
        ar: ["a"],
        reminder: "2030-01-01T09:00",
        checks: 1,
      });
      await page.screenshot({
        path: info.outputPath("converted-project.png"),
        animations: "disabled",
      });
    });
    test("quick find switches lists, searches tags and opens a task", async ({
      page,
    }, info) => {
      await page
        .getByRole("button", { name: "Quick Find", exact: true })
        .click();
      const query = page.getByRole("combobox", { name: "Quick Find query" });
      await query.fill("Launch");
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", { name: "Launch", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Control+f");
      await query.fill("#Writing");
      await expect(
        page.getByRole("option", { name: /Write proposal/ }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath("quick-find.png"),
        animations: "disabled",
      });
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("textbox", { name: "To-do title" }),
      ).toHaveValue("Write proposal");
    });
    test("later/logged toggles, inline headings, dates and distinct status rendering", async ({
      page,
    }, info) => {
      await page
        .locator(".sidebar .project-nav")
        .filter({ hasText: "Launch" })
        .click();
      await expect(page.locator("#item-later")).toHaveClass(/later/);
      await page
        .getByRole("button", { name: "Hide later items", exact: true })
        .click();
      await expect(page.locator("#item-later")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Show later items", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Show logged items", exact: true })
        .click();
      await expect(page.locator("#item-done")).toHaveClass(/completed/);
      await expect(page.locator("#item-cancel")).toHaveClass(/cancelled/);
      await expect(page.locator("#item-done .logged-date")).not.toBeEmpty();
      const loggedGeometry = await page
        .locator("#item-done")
        .evaluate((row) => ({
          dateX: row.querySelector(".logged-date")!.getBoundingClientRect().x,
          titleX: row.querySelector(".task-title")!.getBoundingClientRect().x,
          decoration: getComputedStyle(row.querySelector(".task-title")!)
            .textDecorationLine,
          controlsBottom: document
            .querySelector(".list-visibility")!
            .getBoundingClientRect().bottom,
          rowTop: row.getBoundingClientRect().top,
        }));
      expect(loggedGeometry.dateX).toBeLessThan(loggedGeometry.titleX);
      expect(loggedGeometry.decoration).toBe("none");
      expect(loggedGeometry.controlsBottom).toBeLessThanOrEqual(
        loggedGeometry.rowTop,
      );
      await page.locator("#item-h").click();
      await page
        .getByRole("textbox", { name: "Heading title" })
        .fill("Ready to ship");
      await page.keyboard.press("Enter");
      await expect(page.locator("#item-h .task-title")).toHaveText(
        "Ready to ship",
      );
      await page.getByRole("button", { name: "Logbook", exact: true }).click();
      await expect(page.locator(".list-group-heading")).toHaveCount(2);
      const context = await page.locator("#item-done").evaluate((row) => ({
        contextTop: row
          .querySelector(".container-label")!
          .getBoundingClientRect().top,
        titleBottom: row.querySelector(".task-title")!.getBoundingClientRect()
          .bottom,
      }));
      expect(context.contextTop).toBeGreaterThanOrEqual(context.titleBottom);
      await page.screenshot({
        path: info.outputPath("logbook.png"),
        animations: "disabled",
      });
      expect(
        await page
          .locator(".app")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBeTruthy();
    });
  });
