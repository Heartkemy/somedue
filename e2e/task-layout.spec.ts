import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);
const task = (id: string, p: any = {}) => ({
  id,
  kind: "Task6",
  props: { tt: id, tp: 0, st: 1, ss: 0, tr: false, pr: ["p"], ...p },
});
for (const width of [1120, 760])
  test.describe(`Task layout ${width}`, () => {
    test.use({ viewport: { width, height: width === 760 ? 540 : 780 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(fixture);
      const tomorrow = Math.floor(Date.now() / 86400000) * 86400 + 86400;
      await page.evaluate(
        (rows) => {
          (window as any).__TEST_STATE__.entities = rows;
        },
        [
          task("p", {
            tt: "Projects",
            tp: 1,
            pr: [],
            nt: { v: "Project notes" },
          }),
          task("a", { tt: "First actionable task", ix: 0, tg: ["tag"] }),
          task("b", { tt: "Second actionable task", ix: 1024 }),
          task("c", { tt: "Third actionable task", ix: 2048 }),
          task("s", { tt: "Someday idea", st: 2, ix: -200 }),
          task("f", {
            tt: "Scheduled future task",
            st: 2,
            sr: tomorrow,
            ix: -100,
          }),
          task("done", { ss: 3, ix: 3000, sp: 1000 }),
          { id: "tag", kind: "Tag4", props: { tt: "Important" } },
        ],
      );
      await page.getByRole("button", { name: "Sync now", exact: true }).click();
      await page
        .locator(".sidebar .project-nav")
        .filter({ hasText: "Projects" })
        .click();
    });
    test("shared gutters, reference progress and compact borderless editing", async ({
      page,
    }, info) => {
      const x = await page
        .locator(".task-list")
        .evaluate((el) => el.getBoundingClientRect().x);
      expect(
        await page
          .locator(".project-notes")
          .evaluate((el) => el.getBoundingClientRect().x),
      ).toBe(x);
      expect(
        await page
          .locator(".header-controls")
          .evaluate((el) => el.getBoundingClientRect().x),
      ).toBe(x);
      const alignment = await page.locator("#item-a").evaluate((el) => ({
        title: el.querySelector(".task-title")!.getBoundingClientRect().x,
        check: el.querySelector(".task-check")!.getBoundingClientRect().x + 8,
      }));
      expect(alignment.title).toBe(
        await page.locator("h1").evaluate((el) => el.getBoundingClientRect().x),
      );
      expect(
        Math.abs(
          alignment.check -
            (await page
              .locator(".page-symbol")
              .evaluate(
                (el) =>
                  el.getBoundingClientRect().x +
                  el.getBoundingClientRect().width / 2,
              )),
        ),
      ).toBeLessThan(1);
      await expect(
        page.locator(".page-symbol .project-sector"),
      ).toHaveAttribute("fill", "currentColor");
      const pie = await page
        .locator(".page-symbol .project-sector")
        .evaluate((el) => (el as SVGGraphicsElement).getBBox().width);
      expect(pie).toBeLessThanOrEqual(11.01);
      await page.screenshot({
        path: info.outputPath("project-gutters-and-groups.png"),
        animations: "disabled",
      });
      await page.locator("#item-a .task-title").dblclick();
      await expect(
        page.getByRole("textbox", { name: "To-do title" }),
      ).toHaveValue("First actionable task");
      const tools = await page
        .locator(
          ".task-editor .editor-tools .control-button, .task-editor .editor-footer > .control-button, .task-editor .editor-footer > .popover-control > button",
        )
        .evaluateAll((els) =>
          els
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => ({
              label: el.getAttribute("aria-label") || el.textContent,
              height: (el as HTMLElement).offsetHeight,
            })),
        );
      for (const tool of tools)
        expect(tool.height, tool.label || "editor action").toBe(28);
      await expect(page.locator(".task-editor")).toHaveCSS(
        "outline-style",
        "none",
      );
      expect(
        (await page.locator(".task-editor").boundingBox())!.height,
      ).toBeLessThan(240);
      await page
        .getByRole("textbox", { name: "Notes", exact: true })
        .fill("Keep these notes while previewing.");
      await page.locator(".editor-more > button").click();
      await page
        .getByRole("menuitem", { name: "Preview notes", exact: true })
        .click();
      await expect(page.locator(".task-editor .markdown")).toContainText(
        "Keep these notes",
      );
      await page.locator(".editor-more > button").click();
      await page
        .getByRole("menuitem", { name: "Edit notes", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Notes", exact: true }),
      ).toHaveValue("Keep these notes while previewing.");
      await page.screenshot({
        path: info.outputPath("compact-editor.png"),
        animations: "disabled",
      });
    });
    test("dragging down/up persists; schedule groups and heading ownership stay intact", async ({
      page,
    }) => {
      await expect(page.locator(".task-list .task-title")).toHaveText([
        "First actionable task",
        "Second actionable task",
        "Third actionable task",
        "Scheduled future task",
        "Someday idea",
      ]);
      await expect(page.locator(".list-group-heading")).toHaveText([
        "Later",
        "Someday",
      ]);
      await page
        .locator("#item-a")
        .dragTo(page.locator("#item-b"), { targetPosition: { x: 100, y: 29 } });
      await expect(page.locator(".task-list .task-title")).toHaveText([
        "Second actionable task",
        "First actionable task",
        "Third actionable task",
        "Scheduled future task",
        "Someday idea",
      ]);
      await page
        .locator("#item-a")
        .dragTo(page.locator("#item-c"), { targetPosition: { x: 100, y: 29 } });
      await expect(page.locator(".task-list .task-title").nth(2)).toHaveText(
        "First actionable task",
      );
      await page
        .locator("#item-a")
        .dragTo(page.locator("#item-b"), { targetPosition: { x: 100, y: 2 } });
      await expect(page.locator(".task-list .task-title").first()).toHaveText(
        "First actionable task",
      );
      await page.locator("#item-b").focus();
      await page.keyboard.press("Control+ArrowDown");
      await expect(page.locator(".task-list .task-title").nth(2)).toHaveText(
        "Second actionable task",
      );
      await page.getByRole("button", { name: "Inbox", exact: true }).click();
      await page
        .locator(".sidebar .project-nav")
        .filter({ hasText: "Projects" })
        .click();
      await expect(page.locator(".task-list .task-title")).toHaveText([
        "First actionable task",
        "Third actionable task",
        "Second actionable task",
        "Scheduled future task",
        "Someday idea",
      ]);
      const state = await page.evaluate(() => (window as any).__TEST_STATE__);
      expect(state.entities.find((e: any) => e.id === "s").props.st).toBe(2);
      expect(state.entities.find((e: any) => e.id === "a").props.pr).toEqual([
        "p",
      ]);
    });
  });
