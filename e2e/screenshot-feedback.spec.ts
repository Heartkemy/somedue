import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

for (const theme of ["dark", "light"])
  for (const width of [1120, 760])
    test.describe(`Screenshot feedback ${theme} ${width}`, () => {
      test.use({ viewport: { width, height: width === 760 ? 540 : 780 } });
      test.beforeEach(async ({ page }) => {
        await page.goto("/");
        await page.evaluate(fixture);
        await page.evaluate(
          ({ theme }) => {
            const now = new Date(),
              day =
                Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) /
                1000;
            const task = (id: string, props: Record<string, any> = {}) => ({
              id,
              kind: "Task6",
              props: { tt: id, tp: 0, ss: 0, st: 1, tr: false, ...props },
            });
            (window as any).__TEST_STATE__.preferences.theme = theme;
            (window as any).__TEST_STATE__.entities = [
              { id: "area", kind: "Area3", props: { tt: "Home", ix: 1 } },
              task("project", { tt: "Projects", tp: 1, ar: ["area"] }),
              ...["a", "b", "c"].map((id, ix) => task(id, { st: 0, ix })),
              ...Array.from({ length: 6 }, (_, ix) =>
                task("work" + ix, {
                  tt: "Project task " + ix,
                  pr: ["project"],
                  ix,
                }),
              ),
              task("future", { sr: day + 2 * 86400, st: 2 }),
              task("template", {
                tt: "Repeating task",
                sr: day + 86400,
                tir: day + 86400,
                rr: {
                  rrv: 4,
                  tp: 0,
                  rc: 0,
                  ts: 0,
                  ed: 64092211200,
                  fu: 16,
                  fa: 1,
                  of: [{}],
                  ia: day,
                },
              }),
              task("trash-template", {
                tt: "",
                rr: { fu: 16 },
                tr: true,
                md: 2,
              }),
              task("trash", { tr: true, md: 1 }),
            ];
          },
          { theme },
        );
        await page
          .getByRole("button", { name: "Sync now", exact: true })
          .click();
        await page.getByRole("button", { name: "OK", exact: true }).click();
      });

      test("Today tracks an existing Inbox item, joins selection surfaces and uses neutral evening headings", async ({
        page,
      }, info) => {
        await page.locator("#item-a").click({ modifiers: ["Control"] });
        await page.locator("#item-c").click({ modifiers: ["Shift"] });
        await expect(page.locator("#item-a")).toHaveCSS(
          "border-bottom-left-radius",
          "0px",
        );
        await expect(page.locator("#item-b")).toHaveCSS(
          "border-top-left-radius",
          "0px",
        );
        await expect(page.locator("#item-b")).toHaveCSS(
          "border-bottom-left-radius",
          "0px",
        );
        await page.locator("#item-a").click({ modifiers: ["Control"] });
        await page.locator("#item-b").click({ modifiers: ["Control"] });
        await page.keyboard.press("Control+t");
        await page.getByRole("button", { name: "Today", exact: true }).click();
        await expect(page.locator(".new-todos")).toContainText(
          "You have 1 new to-do",
        );
        await expect(page.locator("#item-c")).toBeVisible();
        await page.getByRole("button", { name: "OK", exact: true }).click();
        await expect(page.locator(".new-todos")).toHaveCount(0);
        await page.getByRole("button", { name: "Inbox", exact: true }).click();
        await page.locator("#item-b").click({ modifiers: ["Control"] });
        await page.keyboard.press("Control+e");
        await page.getByRole("button", { name: "Today", exact: true }).click();
        const evening = page
          .locator(".list-group-heading")
          .filter({ hasText: "This Evening" });
        await expect(evening).toBeVisible();
        await expect(evening).not.toHaveCSS("color", "rgb(0, 255, 208)");
        await page.screenshot({
          path: info.outputPath("today-evening.png"),
          animations: "disabled",
        });
      });

      test("Upcoming has empty dates and a compact alternative; Anytime expands groups; Trash includes templates", async ({
        page,
      }, info) => {
        await page
          .getByRole("button", { name: "Upcoming", exact: true })
          .click();
        await expect(page.locator(".upcoming-day")).toHaveCount(30);
        await expect(
          page.locator("#item-template [aria-label='Repeating template']"),
        ).toBeVisible();
        await expect(page.locator("#item-template .task-check")).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath("upcoming-calendar.png"),
          animations: "disabled",
        });
        await page
          .getByRole("button", { name: "Scheduled only", exact: true })
          .click();
        await expect(page.locator(".upcoming-day")).toHaveCount(2);
        await page
          .getByRole("button", { name: "Anytime", exact: true })
          .click();
        await expect(page.locator(".task-row")).toHaveCount(3);
        await page
          .getByRole("button", { name: "Show 3 more", exact: true })
          .click();
        await expect(page.locator(".task-row")).toHaveCount(6);
        await page.getByRole("button", { name: "Trash", exact: true }).click();
        await expect(
          page.locator("#item-trash-template .task-title"),
        ).toHaveText("New To-Do");
        await page
          .getByRole("button", { name: "Empty Trash", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Confirm", exact: true })
          .click();
        await expect(page.locator(".task-row")).toHaveCount(0);
      });

      test("scheduling card fits without scrolling and its chip clears; pickers and settings use contextual UI", async ({
        page,
      }, info) => {
        await page.locator("#item-a .task-title").click();
        const title = page.getByRole("textbox", { name: "To-do title" });
        await expect(title).toHaveCSS("box-shadow", "none");
        const whenTrigger = page
          .locator(".task-editor")
          .getByRole("button", { name: "When", exact: true });
        await whenTrigger.click();
        const picker = page.getByRole("dialog", { name: "When", exact: true });
        const size = await picker.evaluate((el) => ({
          height: el.clientHeight,
          content: el.scrollHeight,
          bounds: el.getBoundingClientRect().toJSON(),
          viewport: innerHeight,
        }));
        expect(size.content).toBeLessThanOrEqual(size.height);
        expect(size.bounds.y).toBeGreaterThanOrEqual(0);
        expect(size.bounds.bottom).toBeLessThanOrEqual(size.viewport);
        await page.screenshot({
          path: info.outputPath("schedule-card.png"),
          animations: "disabled",
        });
        await picker
          .getByRole("button", { name: "Today", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Remove schedule", exact: true })
          .click();
        await expect(whenTrigger).toHaveText("Inbox");
        await page.locator("h1").click();
        await page.locator("#item-a").focus();
        await page
          .getByRole("button", { name: "Move selected item", exact: true })
          .click();
        const move = page.getByRole("dialog", {
          name: "Move to…",
          exact: true,
        });
        await expect(
          move.getByRole("option", { name: "No Project", exact: true }),
        ).toBeVisible();
        await move
          .getByRole("textbox", { name: "Move destination" })
          .fill("Projects");
        await page.keyboard.press("Enter");
        await expect(page.locator("#item-a")).toHaveCount(0);
        await page.locator(".project-nav").click();
        await page
          .getByRole("button", { name: "Quick Find", exact: true })
          .click();
        const find = page.getByRole("dialog", {
          name: "Quick Find",
          exact: true,
        });
        await expect(find.locator(".dialog-header")).toHaveCount(0);
        await expect(
          find.getByRole("option", { name: "Projects", exact: true }),
        ).toBeVisible();
        await expect(find.locator(".project-ring").first()).toHaveCSS(
          "color",
          "rgb(220, 0, 255)",
        );
        await page.screenshot({
          path: info.outputPath("quick-find.png"),
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await expect(
          page.getByRole("navigation", { name: "Breadcrumb" }),
        ).toHaveText("Somedue/Settings");
        await page
          .getByRole("button", { name: "Appearance", exact: true })
          .click();
        const underline = await page
          .getByRole("button", { name: "Appearance", exact: true })
          .evaluate((el) => getComputedStyle(el, "::after").width);
        expect(underline).toBe("20px");
        await page.screenshot({
          path: info.outputPath("settings.png"),
          animations: "disabled",
        });
      });

      test("repeat templates have an explicit rule dialog with after-completion, reminders and deadlines", async ({
        page,
      }, info) => {
        await page
          .getByRole("button", { name: "Upcoming", exact: true })
          .click();
        await page.locator("#item-template .task-title").click();
        await expect(
          page
            .locator(".task-editor")
            .getByRole("button", { name: "Complete to-do", exact: true }),
        ).toHaveCount(0);
        await page
          .getByRole("button", { name: "Repeating schedule", exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: "Edit Rule…", exact: true })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Repeat",
          exact: true,
        });
        await dialog.getByRole("combobox", { name: "Repeat pattern" }).click();
        await page
          .getByRole("option", { name: "After completion", exact: true })
          .click();
        await dialog
          .getByRole("spinbutton", { name: "Repeat interval" })
          .fill("2");
        await dialog.getByRole("combobox", { name: "Repeat unit" }).click();
        await page.getByRole("option", { name: "weeks", exact: true }).click();
        await dialog.getByRole("checkbox", { name: "Add reminders" }).check();
        await dialog.getByRole("checkbox", { name: "Add deadlines" }).check();
        await page.screenshot({
          path: info.outputPath("repeat-rule.png"),
          animations: "disabled",
        });
        await dialog.getByRole("button", { name: "OK", exact: true }).click();
        await page.locator("h1").click();
        await expect(page.locator(".task-editor")).toHaveCount(0);
        const rule = await page.evaluate(
          () =>
            (window as any).__TEST_STATE__.entities.find(
              (item: any) => item.id === "template",
            ).props.rr,
        );
        expect(rule.tp).toBe(1);
        expect(rule.fu).toBe(256);
        expect(rule.fa).toBe(2);
      });
    });
