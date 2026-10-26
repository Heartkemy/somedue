import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

test("heading and task actions use the same quiet menu and icon-button geometry", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    (window as any).__TEST_STATE__.entities = [
      {
        id: "p",
        kind: "Task6",
        props: { tt: "Project", tp: 1, st: 1, tr: false },
      },
      {
        id: "h",
        kind: "Task6",
        props: { tt: "Heading", tp: 2, st: 1, pr: ["p"] },
      },
      { id: "t", kind: "Task6", props: { tt: "Task", st: 1, agr: ["h"] } },
    ];
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.locator(".project-nav").click();
  await page.locator("#item-h").dblclick();
  await expect(page.getByRole("button", { name: "Save heading" })).toHaveCount(
    0,
  );
  const trigger = page.getByRole("button", {
    name: "Heading actions",
    exact: true,
  });
  for (const button of [trigger]) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBe(28);
    expect(box.height).toBe(28);
  }
  await trigger.click();
  const menu = page.locator(".control-popover:popover-open .ui-menu:visible");
  await expect(menu).toHaveAttribute("role", "menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(4);
  await expect(menu.getByRole("menuitem", { name: "Cancel edit" })).toHaveCount(
    0,
  );
  await expect(menu.getByRole("menuitem").last()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(menu.getByRole("menuitem").last()).toHaveCSS(
    "font-weight",
    "400",
  );
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").nth(1)).toBeFocused();
  await page.screenshot({
    path: info.outputPath("shared-heading-menu.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Heading title" }),
  ).toHaveValue("Heading");
  await page
    .getByRole("textbox", { name: "Heading title" })
    .fill("Renamed heading");
  await page.locator("h1").click();
  await expect(page.locator("#item-h .task-title")).toHaveText(
    "Renamed heading",
  );
  await expect(page.locator("#item-h")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await page.locator("#item-t .task-title").dblclick();
  await page
    .getByRole("button", { name: "To-do actions", exact: true })
    .click();
  await expect(
    page.locator(".control-popover:popover-open .ui-menu:visible"),
  ).toBeVisible();
});
