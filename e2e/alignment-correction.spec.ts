import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

for (const [theme, width] of [
  ["dark", 1120],
  ["light", 760],
] as const) {
  test.describe(`Exact surface alignment ${theme} ${width}`, () => {
    test.use({ viewport: { width, height: 780 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(fixture);
      await page.evaluate((theme) => {
        const state = (window as any).__TEST_STATE__;
        state.preferences = { theme, motion: false };
        const task = (id: string, props = {}) => ({
          id,
          kind: "Task6",
          props: { tt: id, tp: 0, ss: 0, st: 0, ...props },
        });
        state.entities = [
          { id: "area", kind: "Area3", props: { tt: "Home" } },
          task("a", { nt: "Align with these notes" }),
          task("project", { tp: 1, st: 1, ar: ["area"] }),
          task("heading", { tt: "General", tp: 2, st: 1, pr: ["project"] }),
          task("child", { st: 1, pr: ["project"], agr: ["heading"] }),
          task("logged", { ss: 3, sp: Date.now() / 1000 }),
          {
            id: "check",
            kind: "ChecklistItem3",
            props: { tt: "First step", ts: ["a"], ss: 0 },
          },
        ];
      }, theme);
      await page.getByRole("button", { name: "Sync now", exact: true }).click();
      await page.getByRole("button", { name: "OK", exact: true }).click();
    });

    test("headers align visible icon bounds and dividers extend through heading actions", async ({
      page,
    }, info) => {
      const checkHeader = async () => {
        const edge = (await page.locator(".page-header").boundingBox())!.x;
        const icon = (await page.locator(".page-symbol > svg").boundingBox())!;
        const heading = (await page.locator("h1").boundingBox())!;
        expect(icon.x).toBe(edge);
        expect(heading.x - icon.x - icon.width).toBe(12);
      };
      for (const name of [
        "Inbox",
        "Today",
        "Upcoming",
        "Anytime",
        "Someday",
        "Logbook",
        "Trash",
      ]) {
        await page.getByRole("button", { name, exact: true }).click();
        await checkHeader();
      }
      await page.locator(".area-link").click();
      await checkHeader();
      await page.locator(".project-nav").click();
      await checkHeader();
      const row = page.locator("#item-heading");
      const line = (await row.locator(".heading-divider").boundingBox())!;
      const menu = (await row
        .getByRole("button", { name: "Heading actions" })
        .boundingBox())!;
      expect(line.x).toBe(
        (await row.locator(".task-content").boundingBox())!.x,
      );
      expect(line.x + line.width).toBe(menu.x + menu.width);
      await page.screenshot({
        path: info.outputPath("header-and-full-divider.png"),
        animations: "disabled",
      });
    });

    test("Upcoming uses shared typography and an active underline that grows on hover", async ({
      page,
    }, info) => {
      await page.getByRole("button", { name: "Upcoming", exact: true }).click();
      const calendar = page.getByRole("button", {
        name: "Calendar",
        exact: true,
      });
      const scheduled = page.getByRole("button", {
        name: "Scheduled only",
        exact: true,
      });
      for (const tab of [calendar, scheduled]) {
        await expect(tab).toHaveCSS("font-family", /Cormorant Garamond/);
        await expect(tab).toHaveCSS("font-size", "30px");
        await expect(tab).toHaveCSS("font-weight", "400");
      }
      expect((await calendar.boundingBox())!.x).toBe(
        (await page.locator(".page-header").boundingBox())!.x,
      );
      await page.mouse.move(10, 600);
      expect(
        await calendar.evaluate((el) => getComputedStyle(el, "::after").width),
      ).toBe("18px");
      expect(
        await calendar.evaluate((el) => getComputedStyle(el, "::after").height),
      ).toBe("2px");
      await calendar.hover();
      await expect
        .poll(() =>
          calendar.evaluate((el) => {
            const value = getComputedStyle(el, "::after").scale.split(" ")[0];
            return parseFloat(value) / (value.endsWith("%") ? 100 : 1);
          }),
        )
        .toBe(1.6);
      await scheduled.click();
      await expect(scheduled).toHaveAttribute("aria-pressed", "true");
      expect(
        await scheduled.evaluate((el) => getComputedStyle(el, "::after").width),
      ).toBe("18px");
      await calendar.click();
      await page.screenshot({
        path: info.outputPath("upcoming-underline-tabs.png"),
        animations: "disabled",
      });
    });

    test("checklist button and every assigned schedule surface start at the notes edge", async ({
      page,
    }, info) => {
      await page.locator("#item-a .task-title").dblclick();
      const edge = (await page
        .getByRole("textbox", { name: "Notes", exact: true })
        .boundingBox())!.x;
      const add = page.getByRole("button", {
        name: "Checklist item",
        exact: true,
      });
      expect((await add.boundingBox())!.x).toBe(edge);
      await expect(add).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const when = page
        .locator(".task-editor")
        .getByRole("button", { name: "When", exact: true });
      for (const mode of ["Today", "This Evening", "Anytime", "Someday"]) {
        await when.click();
        await page
          .getByRole("dialog", { name: "When", exact: true })
          .getByRole("button", { name: mode, exact: true })
          .click();
        const surface = page.locator(".task-editor .schedule-chip").first();
        expect(
          (await (
            mode === "Anytime" ? when.locator("svg") : surface
          ).boundingBox())!.x,
        ).toBe(edge);
      }
      await when.click();
      await page
        .getByRole("dialog", { name: "When", exact: true })
        .locator(".calendar-day:not(.outside)")
        .first()
        .click();
      expect(
        (await page
          .locator(".task-editor .schedule-chip")
          .first()
          .boundingBox())!.x,
      ).toBe(edge);
      await page.screenshot({
        path: info.outputPath("editor-surface-edges.png"),
        animations: "disabled",
      });
    });

    test("group title hover has padded rounded edges without moving its text", async ({
      page,
    }, info) => {
      await page.getByRole("button", { name: "Anytime", exact: true }).click();
      const heading = page
        .locator(".anytime-group-heading")
        .filter({ hasText: "project" });
      const button = heading.getByRole("button", {
        name: "project",
        exact: true,
      });
      const textX = () =>
        button.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect().x;
        });
      const before = await textX();
      expect(before).toBe((await heading.boundingBox())!.x + 16 + 12);
      await button.hover();
      expect(await textX()).toBe(before);
      await expect(button).toHaveCSS("padding-left", "8px");
      await expect(button).toHaveCSS("padding-right", "8px");
      await expect(button).toHaveCSS("padding-top", "4px");
      await expect(button).toHaveCSS("padding-bottom", "4px");
      await expect(button).toHaveCSS("border-radius", "6px");
      await expect(button).not.toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await page.screenshot({
        path: info.outputPath("group-title-hover.png"),
        animations: "disabled",
      });
    });

    test("editor background expands left while its content positions stay fixed", async ({
      page,
    }, info) => {
      const checkBefore = (await page
        .locator("#item-a .task-check")
        .boundingBox())!.x;
      const titleBefore = (await page
        .locator("#item-a .task-title")
        .boundingBox())!.x;
      await page.locator("#item-a .task-title").dblclick();
      const surface = (await page.locator(".task-editor").boundingBox())!;
      const check = (await page
        .locator(".editor-title .task-check")
        .boundingBox())!;
      expect(check.x).toBe(checkBefore);
      expect(
        (await page
          .getByRole("textbox", { name: "To-do title" })
          .boundingBox())!.x,
      ).toBe(titleBefore);
      expect(
        (await page
          .getByRole("textbox", { name: "Notes", exact: true })
          .boundingBox())!.x,
      ).toBe(titleBefore);
      expect(check.x - surface.x).toBe(check.y - surface.y);
      expect(check.x - surface.x).toBe(26);
      await page.screenshot({
        path: info.outputPath("expanded-editor-background.png"),
        animations: "disabled",
      });
    });
  });
}
