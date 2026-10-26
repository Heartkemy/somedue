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
    const now = new Date();
    const day =
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 1000;
    const task = (id: string, props = {}) => ({
      id,
      kind: "Task6",
      props: { tt: id, tp: 0, ss: 0, st: 1, ix: 0, ...props },
    });
    (window as any).__TEST_STATE__.entities = [
      { id: "area-a", kind: "Area3", props: { tt: "Home", ix: 0 } },
      { id: "area-b", kind: "Area3", props: { tt: "Work", ix: 1024 } },
      { id: "tag-a", kind: "Tag4", props: { tt: "Important" } },
      { id: "tag-b", kind: "Tag4", props: { tt: "Offline" } },
      task("project-a", { tp: 1, ar: ["area-a"], ix: 0 }),
      task("project-b", { tp: 1, ar: ["area-a"], ix: 1024 }),
      task("heading-a", { tp: 2, pr: ["project-a"], ix: 0 }),
      task("heading-b", { tp: 2, pr: ["project-a"], ix: 1024 }),
      task("child-a", { pr: ["project-a"], agr: ["heading-a"] }),
      task("child-b", { pr: ["project-a"], agr: ["heading-b"] }),
      task("old-today", { sr: day, tir: day }),
      task("new-today", { st: 0 }),
      task("template", {
        sr: day + 86400,
        rr: {
          rrv: 4,
          tp: 0,
          rc: 0,
          fu: 16,
          fa: 1,
          of: [{}],
          ia: day,
          ed: 64092211200,
        },
      }),
      ...Array.from({ length: 5 }, (_, ix) =>
        task(`loose-${ix}`, { ar: ["area-b"], ix }),
      ),
    ];
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
}

test.beforeEach(async ({ page }) => seed(page));

test("schedule and checklist controls keep padding and a single chip surface", async ({
  page,
}, info) => {
  await expect(
    page.locator("#item-new-today .row-schedule .date-picker > button > svg"),
  ).toHaveClass(/lucide-calendar-days/);
  await page.locator("#item-new-today .task-title").dblclick();
  const trigger = page
    .locator(".task-editor")
    .getByRole("button", { name: "When", exact: true });
  await page
    .getByRole("button", { name: "Add checklist item", exact: true })
    .click();
  const addCheck = page.getByRole("button", {
    name: "Checklist item",
    exact: true,
  });
  for (const control of [addCheck]) {
    expect(
      await control.evaluate((el) =>
        parseFloat(getComputedStyle(el).paddingLeft),
      ),
    ).toBeGreaterThanOrEqual(8);
  }
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "When", exact: true });
  await picker.getByRole("button", { name: "Today", exact: true }).click();
  const chip = page.locator(".task-editor .schedule-chip").first();
  const remove = page.getByRole("button", { name: "Remove schedule" });
  await remove.hover();
  for (const control of [trigger, remove])
    await expect(control).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(chip).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await trigger.click();
  const selectedDay = picker.locator(".calendar-day.chosen.today");
  expect(await selectedDay.count()).toBe(1);
  await expect(selectedDay).toHaveCSS("color", "rgb(25, 22, 20)");
  await page.screenshot({
    path: info.outputPath("schedule.png"),
    animations: "disabled",
  });
});

test("Today acknowledgement clears dots and only later additions become new", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".due-today")).toHaveCount(0);
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.locator("#item-new-today").click({ modifiers: ["Control"] });
  await page.keyboard.press("Control+t");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".new-todos")).toContainText("1 new to-do");
  await expect(page.locator("#item-new-today .due-today")).toHaveCount(1);
  await expect(page.locator("#item-old-today .due-today")).toHaveCount(0);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator(".due-today")).toHaveCount(0);
});

test("settings tags wrap and categories have rounded padded hover surfaces", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 760, height: 540 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const tags = page.getByRole("button", { name: "Tags", exact: true });
  await tags.click();
  await tags.hover();
  expect(
    await tags.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)),
  ).toBeGreaterThanOrEqual(8);
  expect(
    await tags.evaluate((el) => parseFloat(getComputedStyle(el).borderRadius)),
  ).toBeGreaterThan(0);
  for (const pill of await page.locator(".tag-setting").all()) {
    await expect(
      pill.getByRole("button", { name: /^Delete tag/ }),
    ).toBeVisible();
    expect(
      await pill.evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThan(260);
  }
  await expect(page.locator(".status-dot")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }).locator("svg"),
  ).toHaveClass(/settings-icon/);
  await page.screenshot({
    path: info.outputPath("settings-tags.png"),
    animations: "disabled",
  });
});

test("headings clear their selection and sections and sidebar entries reorder in both directions", async ({
  page,
}) => {
  await page.locator(".project-nav").filter({ hasText: "project-a" }).click();
  await page.locator("#item-heading-a .task-title").dblclick();
  await page.locator("h1").click();
  await expect(page.locator(".inline-heading-editor")).toHaveCount(0);
  await expect(page.locator("#item-heading-a")).not.toHaveAttribute(
    "aria-current",
    "true",
  );
  const drag = async (from: string, to: string, bottom = false) => {
    await page.locator(from).dragTo(page.locator(to), {
      targetPosition: {
        x: 12,
        y: bottom ? (await page.locator(to).boundingBox())!.height - 2 : 2,
      },
    });
  };
  await drag("#item-heading-b", "#item-heading-a");
  await expect(page.locator(".task-row").first()).toHaveAttribute(
    "id",
    "item-heading-b",
  );
  await expect(page.locator(".task-row").nth(1)).toHaveAttribute(
    "id",
    "item-child-b",
  );
  await drag("#item-heading-b", "#item-heading-a", true);
  await expect(page.locator(".task-row").first()).toHaveAttribute(
    "id",
    "item-heading-a",
  );
  const projects = page.locator(".project-nav");
  await projects
    .filter({ hasText: "project-b" })
    .dragTo(projects.filter({ hasText: "project-a" }));
  await expect(projects.first()).toContainText("project-b");
  const projectTarget = projects.filter({ hasText: "project-a" });
  await projects.filter({ hasText: "project-b" }).dragTo(projectTarget, {
    targetPosition: {
      x: 12,
      y: (await projectTarget.boundingBox())!.height - 2,
    },
  });
  await expect(projects.first()).toContainText("project-a");
  const areas = page.locator(".area-link");
  await areas
    .filter({ hasText: "Work" })
    .dragTo(areas.filter({ hasText: "Home" }));
  await expect(areas.first()).toContainText("Work");
  const areaTarget = areas.filter({ hasText: "Home" });
  await areas.filter({ hasText: "Work" }).dragTo(areaTarget, {
    targetPosition: { x: 12, y: (await areaTarget.boundingBox())!.height - 2 },
  });
  await expect(areas.first()).toContainText("Home");
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(areas.first()).toContainText("Home");
  await expect(projects.first()).toContainText("project-a");
});

test("repeat template keeps a protected checkbox and one marker; menus have separators", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  await expect(page.locator("#item-template .task-check")).toHaveCount(1);
  await expect(page.locator("#item-template .lucide-rotate-cw")).toHaveCount(1);
  await page.locator("#item-template .task-check").click();
  expect(
    await page.evaluate(
      () =>
        (window as any).__TEST_STATE__.entities.find(
          (item: any) => item.id === "template",
        ).props.ss,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Repeating schedule", exact: true })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("separator")).toHaveCount(2);
  await expect(
    menu.getByRole("menuitem", { name: "Pause", exact: true }).locator("svg"),
  ).toHaveClass(/lucide-pause/);
  await menu.getByRole("menuitem", { name: "Edit Rule…", exact: true }).click();
  await page.getByRole("combobox", { name: "Repeat pattern" }).click();
  await expect(
    page
      .getByRole("listbox", { name: "Repeat pattern" })
      .getByRole("separator"),
  ).toHaveCount(1);
});

test("navigation stays responsive with hundreds of tasks and a pending sync", async ({
  page,
}) => {
  await page.evaluate(() => {
    const now = new Date();
    const day =
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 1000;
    (window as any).__TEST_STATE__.entities.push(
      ...Array.from({ length: 600 }, (_, ix) => ({
        id: `today-${ix}`,
        kind: "Task6",
        props: { tt: `Task ${ix}`, tp: 0, ss: 0, st: 1, sr: day, ix },
      })),
    );
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    (window as any).__TAURI_INTERNALS__.invoke = async (
      command: string,
      args: unknown,
    ) => {
      if (command === "sync")
        await new Promise(
          (resolve) => ((window as any).__releaseSync = resolve),
        );
      return invoke(command, args);
    };
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  const elapsed = await page.evaluate(async () => {
    const start = performance.now();
    (
      document.querySelector('button[aria-label="Today"]') as HTMLElement
    ).click();
    await new Promise(requestAnimationFrame);
    return performance.now() - start;
  });
  console.log(
    `600-task navigation with pending sync: ${elapsed.toFixed(1)}ms; hidden calendars: ${await page.locator(".calendar").count()}`,
  );
  await page.evaluate(() => (window as any).__releaseSync());
  expect(await page.locator(".task-row").count()).toBeLessThan(100);
  await expect(page.locator(".task-row").first()).toHaveAttribute(
    "aria-setsize",
    "601",
  );
  expect(elapsed).toBeLessThan(750);
  await expect(page.locator(".calendar")).toHaveCount(0);
});

for (const [theme, width] of [
  ["dark", 1120],
  ["light", 760],
] as const) {
  test(`list gutters, heading hierarchy and unobstructed scrolling ${theme} ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 760 ? 540 : 780 });
    await page.evaluate((theme) => {
      const state = (window as any).__TEST_STATE__;
      state.preferences.theme = theme;
      state.entities.push({
        id: "done",
        kind: "Task6",
        props: { tt: "Logged task", tp: 0, ss: 3, sp: Date.now() / 1000 },
      });
      for (let ix = 0; ix < 35; ix++)
        state.entities.push({
          id: `long-${ix}`,
          kind: "Task6",
          props: {
            tt: `Project task ${ix}`,
            tp: 0,
            ss: 0,
            st: 1,
            pr: ["project-a"],
            ix: 2048 + ix,
          },
        });
    }, theme);
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await page.getByRole("button", { name: "Anytime", exact: true }).click();
    const checkX = await page
      .locator(".task-check")
      .first()
      .evaluate((el) => el.getBoundingClientRect().x);
    for (const heading of await page.locator(".anytime-group-heading").all()) {
      expect(await heading.evaluate((el) => el.getBoundingClientRect().x)).toBe(
        checkX,
      );
    }
    await expect(
      page.locator(".anytime-group-heading").filter({ hasText: "Work" }),
    ).toHaveCSS("font-size", "24px");
    await expect(
      page.locator(".anytime-group-heading").filter({ hasText: "project-a" }),
    ).toHaveCSS("font-size", "20px");
    await expect(page.locator(".task-title").first()).toHaveCSS(
      "font-size",
      "14px",
    );
    const expand = page.getByRole("button", {
      name: "Show 2 more",
      exact: true,
    });
    expect(
      await expand.evaluate(
        (el) =>
          el.getBoundingClientRect().x +
          parseFloat(getComputedStyle(el).paddingLeft),
      ),
    ).toBe(checkX);
    await expand.click();
    await expect(
      page.getByRole("button", { name: "Show less", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("anytime.png"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Logbook", exact: true }).click();
    const logged = await page.locator("#item-done .task-check").boundingBox();
    expect((await page.locator(".list-group-heading").boundingBox())!.x).toBe(
      logged!.x,
    );
    await page.screenshot({
      path: info.outputPath("logbook.png"),
      animations: "disabled",
    });
    await page.locator(".project-nav").filter({ hasText: "project-a" }).click();
    const banner = page.locator(".new-todos");
    if (await banner.count())
      await banner.getByRole("button", { name: "OK", exact: true }).click();
    expect((await page.locator("main").boundingBox())!.y).toBe(0);
    const top = (await page.locator("h1").boundingBox())!.y;
    await page.locator(".list-page").evaluate((el) => (el.scrollTop = 60));
    expect((await page.locator("h1").boundingBox())!.y).toBe(top - 60);
    await page.screenshot({
      path: info.outputPath("project-scrolled.png"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    expect((await page.locator("main").boundingBox())!.y).toBe(0);
    await expect(page.locator(".titlebar")).toHaveCSS("position", "absolute");
    await page.getByRole("button", { name: "About", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator(".about-mark")
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath("settings-about.png"),
      animations: "disabled",
    });
  });
}
