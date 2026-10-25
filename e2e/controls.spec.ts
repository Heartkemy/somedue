import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);
for (const viewport of [
  { width: 1120, height: 780 },
  { width: 760, height: 540 },
]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(fixture);
      await page.getByRole("button", { name: "Sync now", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Inbox", exact: true }),
      ).toHaveClass(/active/);
    });
    test("Settings: geometry, custom selectors, checkbox appearance and keyboard", async ({
      page,
    }, info) => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const dialog = page.getByRole("region", {
        name: "Settings",
        exact: true,
      });
      await expect(
        page.getByRole("dialog", { name: "Settings", exact: true }),
      ).toHaveCount(0);
      await dialog.evaluate((el) =>
        Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))),
      );
      await expect(
        page.getByRole("button", { name: "General", exact: true }),
      ).toHaveClass(/active/);
      for (const tab of [
        "General",
        "Appearance",
        "Things Cloud",
        "Tags",
        "Keyboard",
        "About",
      ]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        const bounds = await dialog.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(
          (await page.locator(".sidebar").boundingBox())!.width,
        );
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
        expect(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        ).toBeTruthy();
      }
      await page.getByRole("button", { name: "General", exact: true }).click();
      const select = page.getByRole("combobox", { name: "New to-dos go to" });
      await select.click();
      await expect(page.getByRole("listbox")).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(select).toHaveText("Today");
      await expect(select).toBeFocused();
      await select.click();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await expect(select).toBeFocused();
      const checkbox = page.getByRole("checkbox", {
        name: "Sync automatically while the app is open",
      });
      await checkbox.focus();
      await page.keyboard.press("Space");
      await expect(checkbox).not.toBeChecked();
      await page.keyboard.press("Space");
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toHaveCSS("background-color", "rgb(0, 255, 208)");
      expect(
        await checkbox.evaluate((el) => {
          const s = getComputedStyle(el);
          return [
            s.appearance,
            s.width,
            s.height,
            parseFloat(s.borderRadius) >= 9,
            s.backgroundColor,
          ];
        }),
      ).toEqual(["none", "18px", "18px", true, "rgb(0, 255, 208)"]);
      expect(await page.locator(".app").evaluate((el) => el.scrollTop)).toBe(0);
      await page.screenshot({
        animations: "disabled",
        path: info.outputPath("settings.png"),
      });
      await page
        .getByRole("button", { name: "Appearance", exact: true })
        .click();
      const theme = page.getByRole("combobox").first();
      await theme.click();
      await page
        .getByRole("option", { name: "Warm light", exact: true })
        .click();
      await expect(page.locator(".app")).toHaveAttribute("data-theme", "light");
      await page.screenshot({
        animations: "disabled",
        path: info.outputPath("appearance-light.png"),
      });
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Settings", exact: true }),
      ).toBeFocused();
    });
    test("Creation dialog dropdown escapes clipping and preserves draft on Escape", async ({
      page,
    }, info) => {
      await page.getByRole("button", { name: "New project or area" }).click();
      await page
        .getByRole("textbox", { name: "Title", exact: true })
        .fill(
          "A project with a deliberately long title to exercise narrow layouts",
        );
      const select = page.getByRole("combobox", { name: "Kind", exact: true });
      await select.click();
      const popup = page.getByRole("listbox");
      await expect(popup).not.toContainText("✓");
      await expect(popup).toHaveCSS("border-radius", "16px");
      await expect(popup).toHaveCSS("padding", "18px 0px");
      const r = await popup.boundingBox();
      expect(r!.x).toBeGreaterThanOrEqual(0);
      expect(r!.y).toBeGreaterThanOrEqual(0);
      expect(r!.x + r!.width).toBeLessThanOrEqual(viewport.width);
      expect(r!.y + r!.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({
        animations: "disabled",
        path: info.outputPath("create-menu.png"),
      });
      await page.keyboard.press("a");
      await page.keyboard.press("Enter");
      await expect(select).toHaveText("Area");
      await select.click();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("textbox", { name: "Title", exact: true }),
      ).toHaveValue(/deliberately/);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    });
    test("Inline picker Escape keeps editing; icon buttons are round", async ({
      page,
    }, info) => {
      await page
        .getByRole("button", { name: "New to-do", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "To-do title" })
        .fill("Keep this draft");
      await page.getByRole("button", { name: "When", exact: true }).click();
      await page
        .getByRole("button", { name: "Today", exact: true })
        .last()
        .click();
      await expect(
        page.getByRole("textbox", { name: "To-do title" }),
      ).toHaveValue("Keep this draft");
      await page.getByRole("button", { name: "When", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(page.locator(".task-editor")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        animations: "disabled",
        path: info.outputPath("editor.png"),
      });
      await page.keyboard.press("Escape");
      const icons = await page.locator(".icon-button").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            radius: getComputedStyle(e).borderRadius,
            compact: e.getAttribute("data-size") === "compact",
          };
        }),
      );
      for (const i of icons) {
        expect(i.w).toBe(i.h);
        if (i.compact) expect(i.radius).toBe("6px");
        else expect(parseFloat(i.radius)).toBeGreaterThanOrEqual(i.w / 2);
        if (i.compact) expect(i.h).toBe(28);
      }
      await page
        .getByRole("button", { name: "List options", exact: true })
        .click();
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("menuitem", { name: "New Project", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "List options", exact: true }),
      ).toBeFocused();
    });
  });
}
test("Cloud credentials, real pending state, error recovery and successful handoff", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 760, height: 540 });
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = (name: string, args: any) =>
      name === "connect"
        ? new Promise((resolve, reject) => {
            w.__CONNECT_RESOLVE__ = resolve;
            w.__CONNECT_REJECT__ = reject;
          })
        : invoke(name, args);
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Things Cloud", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect Things Cloud", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Connect Things Cloud", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("fixture@example.invalid");
  await page
    .getByLabel("Things Cloud password", { exact: true })
    .fill("synthetic-test-only");
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("cloud-connect.png"),
  });
  await page
    .getByRole("button", { name: "Connect Things Cloud", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Syncing your Things" }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(
    page.getByLabel("Things Cloud password", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("cloud-syncing.png"),
  });
  await page.evaluate(() =>
    (window as any).__CONNECT_REJECT__("Synthetic note format failure"),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic note format failure",
  );
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("fixture@example.invalid");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Syncing your Things" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const w = window as any;
    w.__CONNECT_RESOLVE__({
      ...w.__TEST_STATE__,
      account: "fixture@example.invalid",
    });
  });
  await expect(page.locator(".cloud-screen")).toHaveCount(0);
});
test("Screenshot regressions: padded search focus and export action", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 760, height: 540 });
  await page.goto("/");
  await page.evaluate(fixture);
  await page.getByRole("button", { name: "Search all items" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(".search-box")).not.toHaveCSS("box-shadow", "none");
  await expect(
    page.getByRole("button", { name: "Search all items" }),
  ).toBeFocused();
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("search-focus.png"),
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const action = page.getByRole("button", {
    name: "Export backup",
    exact: true,
  });
  await action.scrollIntoViewIfNeeded();
  await action.focus();
  await expect(action).toHaveCSS("padding-left", "16px");
  await expect(action).toHaveCSS("padding-right", "16px");
  expect(
    await action.evaluate((el) => {
      const b = el.getBoundingClientRect(),
        icon = el.querySelector("svg")!.getBoundingClientRect();
      return icon.left - b.left;
    }),
  ).toBeGreaterThanOrEqual(16);
  expect(await page.locator(".app").evaluate((el) => el.scrollTop)).toBe(0);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("export-focus.png"),
  });
});

test("Editor preserves typing focus, creates tags, and saves checklist and dates", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 760, height: 540 });
  await page.goto("/");
  await page.evaluate(fixture);
  await page.getByRole("button", { name: "New to-do", exact: true }).click();
  await page
    .getByRole("textbox", { name: "To-do title" })
    .pressSequentially("Plan the trip");
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Keep this note while choosing dates and tags.");
  await page
    .getByRole("button", { name: "Add checklist item", exact: true })
    .click();
  const rows = page.getByRole("textbox", {
    name: "Checklist item",
    exact: true,
  });
  await rows.first().pressSequentially("Book the train");
  await expect(rows.first()).toHaveValue("Book the train");
  await expect(rows.first()).toBeFocused();
  await rows.first().press("Enter");
  await rows.nth(1).pressSequentially("Pack a bag");
  await expect(rows.nth(1)).toBeFocused();
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  const tags = page.getByRole("dialog", { name: "Tags", exact: true });
  await expect(tags).toContainText("No tags yet");
  const search = tags.getByRole("textbox", { name: "Find or create tag" });
  await search.pressSequentially("Travel");
  await search.press("Enter");
  await expect(
    tags.getByRole("checkbox", { name: "Travel", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Remove tag Travel" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "When", exact: true }).click();
  const when = page.getByRole("dialog", { name: "When", exact: true });
  const bounds = await when.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(540);
  await when.getByRole("button", { name: "Today", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("editor-tags-checklist.png"),
    animations: "disabled",
  });
  await page.getByRole("textbox", { name: "To-do title" }).focus();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".task-editor")).toHaveCount(0);
  const entities = await page.evaluate(
    () => (window as any).__TEST_STATE__.entities,
  );
  const task = entities.find((e: any) => e.props.tt === "Plan the trip");
  const tag = entities.find((e: any) => e.kind === "Tag4");
  expect(task.props.tg).toEqual([tag.id]);
  expect(task.props.nt.v).toContain("Keep this note");
  expect(
    entities
      .filter((e: any) => e.kind === "ChecklistItem3")
      .map((e: any) => e.props.tt),
  ).toEqual(["Book the train", "Pack a bag"]);
});
