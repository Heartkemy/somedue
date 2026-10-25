import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);
async function start(page: any) {
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    const s = (window as any).__TEST_STATE__;
    s.preferences.motion = true;
    s.entities = [
      {
        id: "p",
        kind: "Task6",
        props: { tt: "Launch Project", tp: 1, st: 1, ss: 0, tr: false },
      },
      ...[0, 1, 2].map((i) => ({
        id: "t" + i,
        kind: "Task6",
        props: { tt: "Task " + i, st: 1, pr: ["p"], ix: i },
      })),
    ];
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.locator(".sidebar .project-nav").click();
}
test("source-backed headline and accelerating rows use one entry clock", async ({
  page,
}, info) => {
  await start(page);
  const timing = await page.evaluate(() => {
    const animation = (e: Element) => {
      const a = e.getAnimations()[0];
      return a
        ? {
            timing: a.effect!.getTiming(),
            first: (a.effect as KeyframeEffect).getKeyframes()[0],
          }
        : null;
    };
    return {
      words: [...document.querySelectorAll("[data-motion-word]")].map(
        animation,
      ),
      supporting: [
        ...document.querySelectorAll(
          ".project-notes,.header-controls,.page-divider,.list-visibility",
        ),
      ].map((element) => ({
        className: [
          "project-notes",
          "header-controls",
          "page-divider",
          "list-visibility",
        ].find((name) => element.classList.contains(name)),
        animation: animation(element),
      })),
      rows: [...document.querySelectorAll(".task-row")].map(animation),
    };
  });
  expect(timing.words.map((w: any) => w.timing.delay)).toEqual([0, 50]);
  expect(timing.words.map((w: any) => w.timing.duration)).toEqual([700, 700]);
  expect(timing.words[0]!.first.filter).toBe("blur(10px)");
  expect(timing.supporting.map((element) => element.className)).toEqual([
    "project-notes",
    "header-controls",
    "page-divider",
    "list-visibility",
  ]);
  expect(
    timing.supporting.map((element) => element.animation!.timing.delay),
  ).toEqual([500, 530, 560, 590]);
  for (const element of timing.supporting) {
    expect(element.animation!.timing.duration).toBe(600);
    expect(element.animation!.timing.fill).toBe("both");
    expect(Number(element.animation!.first.opacity)).toBe(0.001);
    expect(element.animation!.first.transform).toBe("translateY(10px)");
  }
  const delays = timing.rows.map((r: any) => r.timing.delay);
  expect(delays[0]).toBe(60);
  expect(delays[1] - delays[0]).toBeCloseTo(72);
  expect(delays[2] - delays[1]).toBeGreaterThan(0);
  expect(delays[2] - delays[1]).toBeLessThan(delays[1] - delays[0]);
  expect(Math.max(...delays)).toBeLessThanOrEqual(300);
  expect(timing.rows[0]!.timing.duration).toBeGreaterThan(1000);
  for (const time of [200, 500, 900, 1300]) {
    await page.evaluate(
      (t) =>
        document.getAnimations().forEach((a) => {
          a.pause();
          a.currentTime = t;
        }),
      time,
    );
    await page.screenshot({
      path: info.outputPath(`entry-${time}ms.png`),
      animations: "allow",
    });
  }
  await page.evaluate(() =>
    document.getAnimations().forEach((a) => a.finish()),
  );
  await page.locator("#item-t0 .task-title").click();
  const panelDelay = await page
    .locator(".task-editor")
    .evaluate((el) =>
      el.getAnimations().map((a) => a.effect!.getTiming().delay),
    );
  expect(panelDelay).toEqual([0]);
  await page
    .getByRole("textbox", { name: "To-do title" })
    .fill("Typing remains immediate");
  await expect(page.getByRole("textbox", { name: "To-do title" })).toHaveValue(
    "Typing remains immediate",
  );
  expect(
    await page
      .locator(".page-header,.list-visibility")
      .evaluateAll(
        (elements) =>
          elements.flatMap((el) => el.getAnimations({ subtree: true })).length,
      ),
  ).toBe(0);
  expect(
    await page
      .locator(".task-row,.list-group-heading")
      .evaluateAll((rows) => rows.flatMap((row) => row.getAnimations()).length),
  ).toBe(0);
  await page.getByRole("button", { name: "List options", exact: true }).click();
  expect(
    await page
      .locator(".ui-menu.list-menu")
      .evaluate((el) =>
        el.getAnimations().map((a) => a.effect!.getTiming().delay),
      ),
  ).toEqual([0]);
  await page.evaluate(() => {
    const wrapper = document.createElement("div");
    wrapper.id = "shared-menu-fixture";
    wrapper.innerHTML = '<div class="ui-menu"></div>';
    document.body.append(wrapper);
  });
  expect(
    await page
      .locator("#shared-menu-fixture .ui-menu")
      .evaluate((el) =>
        el.getAnimations().map((a) => a.effect!.getTiming().delay),
      ),
  ).toEqual([0]);
  await page.locator("#shared-menu-fixture").evaluate((el) => el.remove());
});
test("reduced motion skips the entry choreography", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  expect(
    await page
      .locator(".list-page")
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await expect(page.locator("#item-t0")).toBeVisible();
  await expect(page.locator(".page-divider")).toBeVisible();
  await expect(page.locator(".list-visibility")).toBeVisible();
  await page.getByRole("button", { name: "List options", exact: true }).click();
  expect(
    await page
      .locator(".ui-menu.list-menu")
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
});
