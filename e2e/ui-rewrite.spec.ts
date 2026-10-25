import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

for (const width of [1120, 760])
  test.describe(`UI rewrite ${width}`, () => {
    test.use({ viewport: { width, height: width === 760 ? 540 : 780 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(fixture);
      await page.evaluate(() => {
        const now = new Date(),
          day =
            Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 1000;
        const task = (id: string, props = {}) => ({
          id,
          kind: "Task6",
          props: { tt: id, st: 1, ss: 0, tr: false, pr: ["p"], ...props },
        });
        (window as any).__TEST_STATE__.entities = [
          { id: "area", kind: "Area3", props: { tt: "Health" } },
          task("p", { tt: "Tasks", tp: 1, pr: [], ar: ["area"] }),
          task("a", {
            tt: "First task",
            ix: 0,
            nt: { v: "Keep the notes transparent" },
            tg: ["tag"],
          }),
          task("b", { tt: "Second task", ix: 1024 }),
          task("c", { tt: "Third task", ix: 2048 }),
          task("today", {
            tt: "Today task",
            sr: day,
            dd: day - 10 * 86400,
            ix: 3072,
            tg: ["tag"],
          }),
          task("future", {
            tt: "Future task",
            st: 2,
            sr: day + 86400,
            ix: 4096,
          }),
          task("someday", { tt: "Someday task", st: 2, ix: 5120 }),
          {
            id: "check",
            kind: "ChecklistItem3",
            props: { tt: "First step", ts: ["today"], ss: 0 },
          },
          { id: "tag", kind: "Tag4", props: { tt: "Offline" } },
        ];
      });
      await page.getByRole("button", { name: "Sync now", exact: true }).click();
      await page.locator(".project-nav").click();
      await page.getByRole("button", { name: "OK", exact: true }).click();
    });

    test("editor keeps the row grid, transparent notes, and quiet saves", async ({
      page,
    }, info) => {
      const footerBefore = await page
        .locator(".footer-actions > *")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const r = element.getBoundingClientRect();
            return r.x + r.width / 2;
          }),
        );
      const before = await page.locator("#item-a").evaluate((row) => ({
        check: row.querySelector(".task-check")!.getBoundingClientRect().x,
        title: row.querySelector(".task-title")!.getBoundingClientRect().x,
        top: row.querySelector(".task-title")!.getBoundingClientRect().y,
        neighbor: document
          .querySelector("#item-b .task-title")!
          .getBoundingClientRect().x,
      }));
      await page.locator("#item-a .task-title").click();
      const footerAfter = await page
        .locator(".editor-footer-actions > *")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const r = element.getBoundingClientRect();
            return r.x + r.width / 2;
          }),
        );
      expect(footerAfter).toEqual(footerBefore);
      const after = await page.locator(".task-editor").evaluate((editor) => ({
        check: editor.querySelector(".task-check")!.getBoundingClientRect().x,
        title: editor
          .querySelector(".editor-title input")!
          .getBoundingClientRect().x,
        top: editor
          .querySelector(".editor-title input")!
          .getBoundingClientRect().y,
        neighbor: document
          .querySelector("#item-b .task-title")!
          .getBoundingClientRect().x,
        left: editor.getBoundingClientRect().x,
        padding: parseFloat(getComputedStyle(editor).paddingLeft),
        list: document.querySelector(".task-list")!.getBoundingClientRect().x,
      }));
      expect(after.check).toBe(before.check);
      expect(after.title).toBe(before.title);
      expect(after.top - before.top).toBeGreaterThanOrEqual(12);
      expect(after.neighbor).toBe(before.neighbor);
      expect(after.left + after.padding).toBe(after.list);
      const notes = page.getByRole("textbox", { name: "Notes", exact: true });
      await notes.focus();
      await expect(notes).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await page.screenshot({
        path: info.outputPath("aligned-editor.png"),
        animations: "disabled",
      });
      await page.evaluate(() => {
        const w = window as any,
          invoke = w.__TAURI_INTERNALS__.invoke;
        w.__MUTATIONS__ = 0;
        w.__TAURI_INTERNALS__.invoke = (command: string, args: any) => {
          if (command === "mutate") w.__MUTATIONS__++;
          return invoke(command, args);
        };
      });
      await page.locator("h1").click();
      await expect(page.locator(".task-editor")).toHaveCount(0);
      expect(await page.evaluate(() => (window as any).__MUTATIONS__)).toBe(0);
      await expect(page.locator(".toast")).toHaveCount(0);
      await page.locator("#item-a .task-title").click();
      await notes.fill("Updated notes");
      await page.locator("h1").click();
      await expect(page.locator(".task-editor")).toHaveCount(0);
      await expect(page.locator(".toast")).toHaveCount(0);
    });

    test("Settings is a page with compact tag controls and visible dropdown separation", async ({
      page,
    }, info) => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "Settings", exact: true }),
      ).toBeVisible();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await page.getByRole("button", { name: "General", exact: true }).click();
      await page.getByRole("combobox", { name: "New to-dos go to" }).click();
      await expect(page.locator(".select-popup:popover-open")).not.toHaveCSS(
        "box-shadow",
        "none",
      );
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Tags", exact: true }).click();
      const row = page.locator(".tag-setting");
      await expect(row).toHaveClass(/(?:^|\s)tag-pill(?:\s|$)/);
      const trash = row.getByRole("button", { name: "Delete tag Offline" });
      expect((await trash.boundingBox())!.height).toBe(28);
      await expect(trash).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(trash.locator("svg")).toHaveCount(1);
      expect((await row.boundingBox())!.height).toBeLessThanOrEqual(36);
      await page
        .getByRole("textbox", { name: "Rename tag Offline" })
        .fill("Offline tasks");
      await page
        .getByRole("heading", { name: "Settings", exact: true })
        .click();
      await page.screenshot({
        path: info.outputPath("settings-page-tags.png"),
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Back to Tasks", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Tasks", exact: true }),
      ).toBeVisible();
      await expect(page.locator("#item-a .row-tag")).toHaveText(
        "Offline tasks",
      );
      await expect(page.locator(".toast")).toHaveCount(0);
    });

    test("reference indicators, shared pills, and hover-only calendar", async ({
      page,
    }, info) => {
      await expect(
        page.locator("#item-future .task-check"),
      ).not.toHaveAttribute("data-someday", "true");
      await expect(page.locator("#item-someday .task-check")).toHaveAttribute(
        "data-someday",
        "true",
      );
      await expect(
        page.locator("#item-someday .task-check circle"),
      ).toHaveAttribute("stroke-dasharray", "1.5 3");
      await expect(page.locator("#item-today .due-today")).toHaveCount(0);
      await expect(
        page.locator("#item-today .checklist-indicator"),
      ).toHaveAttribute("aria-label", "Has checklist");
      await expect(page.locator(".checklist-count")).toHaveCount(0);
      await expect(page.locator("#item-today .deadline")).toHaveText(
        "10 days ago",
      );
      const right = await page.locator("#item-today").evaluate((row) => ({
        row: row.getBoundingClientRect().right,
        deadline: row.querySelector(".deadline")!.getBoundingClientRect().right,
      }));
      expect(right.row - right.deadline).toBe(12);
      const calendar = page.locator("#item-a .row-schedule");
      await page.locator("h1").hover();
      await expect(calendar).toHaveCSS("opacity", "0");
      await page.locator("#item-a").hover();
      await expect(calendar).toHaveCSS("opacity", "1");
      await expect(
        calendar.getByRole("button", { name: "When", exact: true }),
      ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const scheduleBox = (await calendar.boundingBox())!,
        checkBox = (await page.locator("#item-a .task-check").boundingBox())!;
      expect(scheduleBox.x + scheduleBox.width).toBeLessThan(checkBox.x);
      const pills = await page
        .locator(".tag-filters .tag-pill, #item-a .row-tag")
        .evaluateAll((els) =>
          els.map((el) => ({
            radius: getComputedStyle(el).borderRadius,
            padding: getComputedStyle(el).paddingInlineStart,
            height: el.getBoundingClientRect().height,
          })),
        );
      expect(new Set(pills.map((pill) => JSON.stringify(pill))).size).toBe(1);
      await page.screenshot({
        path: info.outputPath("reference-task-list.png"),
        animations: "disabled",
      });
    });

    test("modifier selection, range selection, menu and bulk scheduling", async ({
      page,
    }, info) => {
      await page.locator("#item-a").click({ modifiers: ["Control"] });
      await page.locator("#item-c").click({ modifiers: ["Shift"] });
      await expect(page.locator(".task-row.selected")).toHaveCount(3);
      await expect(page.locator(".task-editor")).toHaveCount(0);
      await expect(page.locator("#item-a")).toHaveCSS(
        "background-image",
        "none",
      );
      await page.locator("#item-b").click({ modifiers: ["Control"] });
      await expect(page.locator(".task-row.selected")).toHaveCount(2);
      await page.locator("#item-a").click({ button: "right" });
      const menu = page.getByRole("dialog", {
        name: "Task actions",
        exact: true,
      });
      await expect(
        menu.getByRole("menuitem", { name: "When…", exact: true }),
      ).toBeFocused();
      await expect(page.locator(".task-row.selected")).toHaveCount(2);
      await menu
        .getByRole("menuitem", { name: "Shortcuts", exact: true })
        .click();
      await page.getByRole("menuitem", { name: /^Someday/ }).click();
      await expect(page.locator("#item-a .task-check")).toHaveAttribute(
        "data-someday",
        "true",
      );
      await expect(page.locator("#item-c .task-check")).toHaveAttribute(
        "data-someday",
        "true",
      );
      await page.locator("#item-b").click({ button: "right" });
      await expect(
        menu.getByRole("menuitem", { name: "Get Info", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath("reference-task-menu.png"),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await page.keyboard.press("Control+a");
      await expect(page.locator(".task-row.selected")).toHaveCount(6);
      await page.keyboard.press("Control+k");
      await expect(page.locator(".task-row")).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: "Selected item actions",
          exact: true,
        }),
      ).toHaveCount(0);
    });

    test("navigation and local saves continue during delayed sync; remote arrivals are acknowledged", async ({
      page,
    }) => {
      await page.evaluate(() => {
        const w = window as any,
          invoke = w.__TAURI_INTERNALS__.invoke;
        w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
          if (command === "sync")
            await new Promise<void>((resolve) => {
              w.__RELEASE_SYNC__ = resolve;
            });
          return invoke(command, args);
        };
      });
      await page.getByRole("button", { name: "Sync now", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Sync now", exact: true }),
      ).toBeDisabled();
      await page.locator("#item-a .task-title").click();
      await page
        .getByRole("textbox", { name: "To-do title" })
        .fill("Edited during sync");
      await page.getByRole("button", { name: "Inbox", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Inbox", exact: true }),
      ).toBeVisible({ timeout: 1000 });
      await page.locator(".project-nav").click();
      await expect(page.locator("#item-a .task-title")).toHaveText(
        "Edited during sync",
      );
      await page.locator("#item-b .task-title").click();
      await page
        .getByRole("textbox", { name: "To-do title" })
        .fill("Local title");
      await page.evaluate(() => {
        const w = window as any;
        w.__TEST_STATE__.entities.find(
          (item: any) => item.id === "b",
        ).props.nt = { v: "Note updated on another device" };
        w.__TEST_STATE__.entities.push({
          id: "remote",
          kind: "Task6",
          props: {
            tt: "New from another device",
            st: 1,
            ss: 0,
            tr: false,
            pr: ["p"],
          },
        });
        w.__RELEASE_SYNC__();
      });
      await expect(page.locator(".new-todos")).toContainText(
        "You have 1 new to-do",
      );
      await page.locator("h1").click();
      await expect(page.locator("#item-b .task-title")).toHaveText(
        "Local title",
      );
      expect(
        await page.evaluate(
          () =>
            (window as any).__TEST_STATE__.entities.find(
              (item: any) => item.id === "b",
            ).props.nt.v,
        ),
      ).toBe("Note updated on another device");
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await expect(page.locator(".new-todos")).toHaveCount(0);
      await expect(page.locator(".toast")).toHaveCount(0);
    });
  });

test("unhandled errors offer reload and dismissal without freezing navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("unhandledrejection")),
  );
  const notice = page.locator(".recovery-notice");
  await expect(notice).toBeVisible();
  await expect(
    notice.getByRole("button", { name: "Reload app", exact: true }),
  ).toBeVisible();
  await notice.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Settings", exact: true }),
  ).toBeVisible();
});

test("a render crash shows recovery actions and the workspace can reopen", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    (window as any).__TEST_STATE__.entities = [
      {
        id: "project",
        kind: "Task6",
        props: { tt: "Project", tp: 1, st: 1, ss: 0, tr: false },
      },
    ];
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.locator(".project-nav").click();
  await page.evaluate(() => {
    (window as any).__TEST_STATE__.entities[0].props.tt = {
      invalid: "Synthetic render failure",
    };
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Somedue couldn’t display this page.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reload app", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("recoverable-render-error.png"),
    animations: "disabled",
  });
  await page.evaluate(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
});
