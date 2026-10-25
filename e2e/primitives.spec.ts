import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(fixture);
});

test("shared controls keep keyboard focus and remain usable with long content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 540 });
  await page.getByRole("button", { name: "New project or area" }).click();
  const dialog = page.getByRole("dialog");
  const title = dialog.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("A long project title ".repeat(8));
  const kind = dialog.getByRole("combobox", { name: "Kind", exact: true });
  await kind.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(kind).toHaveText("Tag");
  await expect(kind).toBeFocused();
  await expect(title).toHaveValue(/A long project title/);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "New project or area" }),
  ).toBeFocused();
});

test("checkbox keeps its native checked, disabled and mixed states", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const checkbox = page.getByRole("checkbox", {
    name: "Sync automatically while the app is open",
  });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).not.toBeChecked();
  await checkbox.evaluate((el: HTMLInputElement) => {
    el.indeterminate = true;
  });
  await expect(checkbox).toBeChecked({ indeterminate: true });
  await checkbox.evaluate((el: HTMLInputElement) => {
    el.disabled = true;
  });
  await expect(checkbox).toBeDisabled();
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(checkbox).toHaveCSS("appearance", "auto");
});

test("quick entry uses the same fields and themed controls", async ({
  page,
}) => {
  await page.goto("/?quick");
  const title = page.getByRole("textbox", { name: "Quick entry title" });
  await expect(title).toBeFocused();
  await title.fill("Capture a thought");
  await page
    .getByRole("textbox", { name: "Quick entry notes" })
    .fill("Keep these notes");
  const destination = page.getByRole("combobox", { name: "Add to" });
  await destination.click();
  await page.getByRole("option", { name: "Someday", exact: true }).click();
  await expect(destination).toHaveText("Someday");
  await expect(title).toHaveValue("Capture a thought");
  await expect(page.getByRole("button", { name: /Add To-Do/ })).toBeEnabled();
});
