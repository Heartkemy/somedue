import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);
test("pointer focus stays quiet; keyboard focus, scroll indicators and sidebar controls work", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1120, height: 780 });
  await page.goto("/");
  await page.evaluate(fixture);
  await page.getByRole("button", { name: "List options", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "List options", exact: true }),
  ).toHaveCSS("box-shadow", "none");
  const rows = page.locator(".list-menu > button");
  for (const row of await rows.all()) {
    await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(
      await row.evaluate(
        (el) => parseFloat(getComputedStyle(el).borderRadius) === 8,
      ),
    ).toBe(true);
    await expect(row.locator("svg")).toHaveCount(1);
  }
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("html")).toHaveAttribute(
    "data-input-modality",
    "keyboard",
  );
  await page.screenshot({
    path: info.outputPath("samlad-options-menu.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  const focus = page.getByRole("button", { name: "List options", exact: true });
  await expect(focus).toBeFocused();
  await expect(focus).not.toHaveCSS("box-shadow", "none");
  const grip = page.getByRole("separator", { name: "Sidebar width" });
  await grip.click();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await grip.click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await grip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page.keyboard.press("Enter");
  const primary = await page
    .locator(".footer-actions > button, .footer-actions > .footer-schedule")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return r.x + r.width / 2;
      }),
    );
  expect(primary).toHaveLength(4);
  expect(primary[1] - primary[0]).toBe(73);
  expect(primary[1] - primary[0]).toBe(primary[2] - primary[1]);
  expect(primary[2] - primary[1]).toBe(primary[3] - primary[2]);
  await page.evaluate(() => {
    (window as any).__TEST_STATE__.entities = Array.from(
      { length: 50 },
      (_, i) => ({
        id: "p" + i,
        kind: "Task6",
        props: { tt: "Project " + i, tp: 1, st: 1, ss: 0, tr: false, ix: i },
      }),
    );
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  const scroll = page.locator(".sidebar-body");
  await expect(scroll).not.toHaveAttribute("data-scrolling", "true");
  await scroll.evaluate((el) => (el.scrollTop = 200));
  await expect(scroll).toHaveAttribute("data-scrolling", "true");
  await expect(scroll).not.toHaveAttribute("data-scrolling", "true", {
    timeout: 2000,
  });
  await page.screenshot({
    path: info.outputPath("chrome-idle.png"),
    animations: "disabled",
  });
});
