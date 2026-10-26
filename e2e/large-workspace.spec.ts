import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

async function seed(page: Page) {
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    const task = (id: string, props: Record<string, unknown>) => ({
      id,
      kind: "Task6",
      props: { tt: id, tp: 0, st: 1, ss: 0, tr: false, ...props },
    });
    (window as any).__TEST_STATE__.entities = [
      task("project", { tp: 1 }),
      ...Array.from({ length: 5_000 }, (_, i) =>
        task(`logged-${i}`, {
          ss: 3,
          sp: 1_790_000_000 - i * 86_400,
          pr: ["project"],
        }),
      ),
      ...Array.from({ length: 5_000 }, (_, i) =>
        task(`trash-${i}`, {
          tr: true,
          md: 1_790_000_000 - i,
          pr: ["project"],
        }),
      ),
      ...Array.from({ length: 5_000 }, (_, i) =>
        task(`active-${i}`, {
          st: 0,
          ix: i,
          pr: ["project"],
        }),
      ),
    ];
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  const ok = page.getByRole("button", { name: "OK", exact: true });
  if (await ok.isVisible()) await ok.click();
}

test("large task views paint promptly and keep rendered work bounded", async ({
  page,
}, info) => {
  await seed(page);
  const measurements: Record<string, { paintMs: number; rows: number }> = {};
  for (const name of ["Trash", "Logbook", "Inbox"]) {
    const result = await page.evaluate(async (name) => {
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>(".sidebar button"),
      ].find((button) => button.getAttribute("aria-label") === name)!;
      const start = performance.now();
      button.click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return {
        paintMs: performance.now() - start,
        rows: document.querySelectorAll(".task-row").length,
      };
    }, name);
    measurements[name] = result;
    console.log(`${info.project.name} ${name}: ${JSON.stringify(result)}`);
    expect
      .soft(result.rows, `${name} must not mount thousands of rows`)
      .toBeLessThan(150);
    expect.soft(result.paintMs, `${name} click-to-paint`).toBeLessThan(250);
    await expect(page.locator(".task-row").first()).toBeVisible();
    await page
      .locator(".list-page")
      .evaluate((element) => (element.scrollTop = element.scrollHeight));
    const prefix =
      name === "Trash" ? "trash" : name === "Logbook" ? "logged" : "active";
    await expect(page.locator(`#item-${prefix}-4999`)).toBeVisible();
    expect(await page.locator(".task-row").count()).toBeLessThan(150);
  }
  await info.attach("navigation-measurements", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
});

test("large lists preserve keyboard selection, live editors, search and project grouping", async ({
  page,
}, info) => {
  await seed(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator("#item-active-0").click();
  for (let i = 0; i < 35; i++) await page.keyboard.press("ArrowDown");
  const row = page.locator("#item-active-35");
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(row).toBeInViewport();
  await expect(row).toHaveAttribute("aria-posinset", "36");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator(".task-row.selected")).toHaveCount(2);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "To-do title", exact: true });
  await input.fill("Preserved while scrolling");
  await page
    .locator(".list-page")
    .evaluate((element) => (element.scrollTop = element.scrollHeight));
  await expect(page.locator("#item-active-4999")).toBeVisible();
  await expect(input).toHaveValue("Preserved while scrolling");
  await expect(page.locator(".task-editor")).toHaveCount(1);
  await page.locator(".task-editor").scrollIntoViewIfNeeded();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".task-editor")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__TEST_STATE__.entities.find(
            (e: any) => e.id === "active-35",
          ).props.tt,
      ),
    )
    .toBe("Preserved while scrolling");
  await page.keyboard.press("Control+f");
  await page
    .getByRole("combobox", { name: "Quick Find query" })
    .fill("active-4999");
  await expect(
    page.getByRole("option", { name: "active-4999", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".list-page")).toHaveAttribute(
    "data-list",
    "project",
  );
  await expect(input).toHaveValue("active-4999");
  await expect(page.locator(".task-editor")).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("large-project-editor.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Show logged items", exact: true })
    .click();
  await expect(page.locator(".task-row").first()).toHaveAttribute(
    "aria-setsize",
    "10000",
  );
  expect(await page.locator(".task-row").count()).toBeLessThan(150);
  expect(errors).toEqual([]);
});

test("many Upcoming groups and expanded Anytime groups stay bounded", async ({
  page,
}, info) => {
  await seed(page);
  await page.evaluate(() => {
    const now = new Date();
    const day =
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 1000;
    for (const item of (window as any).__TEST_STATE__.entities)
      if (item.id.startsWith("active-")) {
        item.props.st = 2;
        item.props.sr = day + (Number(item.id.slice(7)) + 1) * 86400;
      }
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await expect(page.locator("#item-active-0")).toBeVisible();
  expect(await page.locator(".upcoming-day").count()).toBeLessThan(100);
  await page
    .locator(".list-page")
    .evaluate((element) => (element.scrollTop = element.scrollHeight));
  await expect(page.locator("#item-active-4999")).toBeVisible();
  await page.evaluate(() => {
    for (const item of (window as any).__TEST_STATE__.entities)
      if (item.id.startsWith("active-")) {
        item.props.st = 1;
        item.props.sr = null;
      }
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.getByRole("button", { name: "Anytime", exact: true }).click();
  await page
    .getByRole("button", { name: "Show 4997 more", exact: true })
    .click();
  await expect(page.locator("#item-active-0")).toBeVisible();
  expect(await page.locator(".task-row").count()).toBeLessThan(150);
  await page
    .locator(".list-page")
    .evaluate((element) => (element.scrollTop = element.scrollHeight));
  await expect(page.locator("#item-active-4999")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("large-anytime-bottom.png"),
    animations: "disabled",
  });
});
