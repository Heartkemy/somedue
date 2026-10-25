import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);
const project = (id: string, tt: string, ar: string[] = []) => ({
  id,
  kind: "Task6",
  props: { tt, tp: 1, st: 1, ss: 0, tr: false, ar },
});
const seed = [
  project("standalone", "Independent project"),
  { id: "a", kind: "Area3", props: { tt: "🧘 Rafael", ix: 0 } },
  ...[
    "🏗 Projects",
    "☑️ tasks",
    "🔬 Research",
    "🎧 Listen & Watch",
    "✨ Ideas",
    "🎵 Music",
    "📚 Books",
    "🛒 Shopping",
    "🚐 Van",
    "💻 Digital Order",
    "🤖 Agents and Tools",
    "👕 Réparations",
    "🌻 Day Script",
  ].map((title, i) => project("p" + i, title, ["a"])),
  { id: "b", kind: "Area3", props: { tt: "🫀 Health", ix: 1 } },
  project("health", "A deliberately long project title that must truncate", [
    "b",
  ]),
  {
    id: "t",
    kind: "Task6",
    props: { tt: "Inbox capture", st: 0, ss: 0, tr: false },
  },
];
for (const width of [1120, 760])
  test(`Sidebar columns, density, collapse and borderless editor at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 760 ? 540 : 780 });
    await page.goto("/");
    await page.evaluate(fixture);
    await page.evaluate(
      (rows) => ((window as any).__TEST_STATE__.entities = rows),
      seed,
    );
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(page.locator(".sidebar-body .sidebar-item")).toHaveCount(24);
    const shell = await page.evaluate(() => {
      const sidebar = document
          .querySelector(".sidebar")!
          .getBoundingClientRect(),
        toggle = document
          .querySelector('[aria-label="Sidebar width"]')!
          .getBoundingClientRect();
      const tools = document
        .querySelector(".top-tools")!
        .getBoundingClientRect();
      return {
        top: sidebar.top,
        gap: toggle.left - sidebar.right,
        centerY: toggle.y + toggle.height / 2,
        toolsCenterY: tools.y + tools.height / 2,
        font: getComputedStyle(document.querySelector(".sidebar-item")!)
          .fontSize,
      };
    });
    expect(shell).toEqual({
      top: 0,
      gap: 4,
      centerY: (width === 760 ? 540 : 780) / 2,
      toolsCenterY: 28,
      font: "16px",
    });
    const geometry = await page
      .locator(".sidebar-body .sidebar-item")
      .evaluateAll((els) =>
        els.map((el) => {
          const row = el.getBoundingClientRect(),
            icon = el.querySelector("svg")!.getBoundingClientRect(),
            text = el.querySelector(".sidebar-label")!.getBoundingClientRect();
          return {
            iconX: icon.x,
            textX: text.x,
            height: row.height,
            width: row.width,
            centerError: Math.abs(
              icon.y + icon.height / 2 - (text.y + text.height / 2),
            ),
          };
        }),
      );
    expect(new Set(geometry.map((x) => x.iconX)).size).toBe(1);
    expect(new Set(geometry.map((x) => x.textX)).size).toBe(1);
    expect(new Set(geometry.map((x) => x.width)).size).toBe(1);
    for (const row of geometry) {
      expect(row.height).toBe(32);
      expect(row.centerError).toBeLessThan(0.5);
    }
    const sidebarFooter = await page.locator(".sidebar-bottom").boundingBox(),
      mainFooter = await page.locator(".list-footer").boundingBox();
    expect(sidebarFooter!.y).toBe(mainFooter!.y);
    expect(sidebarFooter!.height).toBe(mainFooter!.height);
    const footerColumns = await page
      .locator(".sidebar-new-list")
      .evaluate((el) => ({
        iconX: el.querySelector("svg")!.getBoundingClientRect().x,
        textX: el.querySelector("span")!.getBoundingClientRect().x,
      }));
    expect(footerColumns.iconX).toBe(geometry[0].iconX);
    expect(footerColumns.textX).toBe(geometry[0].textX);
    await expect(page.getByText("YOUR LISTS", { exact: true })).toHaveCount(0);
    const toggle = page.getByRole("button", {
      name: "Collapse 🧘 Rafael",
      exact: true,
    });
    await expect(toggle).toHaveCSS("opacity", "0");
    await page.locator(".area-link").first().hover();
    await expect(toggle).toHaveCSS("opacity", "1");
    const caretBox = (await toggle.boundingBox())!,
      areaBox = (await page.locator(".area-link").first().boundingBox())!;
    expect(caretBox.width).toBe(32);
    expect(caretBox.x + caretBox.width).toBe(areaBox.x + areaBox.width - 8);
    const before = (await page
      .locator(".area-link .sidebar-label")
      .first()
      .boundingBox())!.x;
    await toggle.click();
    await expect(page.locator(".project-nav")).toHaveCount(2);
    expect(
      (await page.locator(".area-link .sidebar-label").first().boundingBox())!
        .x,
    ).toBe(before);
    await page
      .getByRole("button", { name: "Expand 🧘 Rafael", exact: true })
      .click();
    await page.locator(".sidebar-body").evaluate((el) => (el.scrollTop = 0));
    await page.locator(".sidebar .nav-item").first().hover();
    await page.screenshot({
      path: info.outputPath("sidebar-expanded-dark.png"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "New to-do", exact: true }).click();
    await page
      .getByRole("textbox", { name: "To-do title" })
      .fill("Borderless capture");
    await expect(page.locator(".task-editor")).toHaveCSS(
      "outline-style",
      "none",
    );
    await expect(page.locator(".task-editor")).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await expect(page.getByRole("textbox", { name: "To-do title" })).toHaveCSS(
      "box-shadow",
      "none",
    );
    await page.screenshot({
      path: info.outputPath("editor-no-frame.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("combobox", { name: "Color theme" }).click();
    await page.getByRole("option", { name: "Warm light", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: info.outputPath("sidebar-expanded-light.png"),
      animations: "disabled",
    });
    expect(
      await page
        .locator(".sidebar-body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBeTruthy();
  });
