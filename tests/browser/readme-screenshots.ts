import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Entity, State } from "../../src/model";

const fixture = readFileSync(
  new URL("../browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

for (const view of ["today", "project", "upcoming", "schedule"] as const) {
  test(`capture ${view}`, async ({ page, context }) => {
    if (view === "today")
      await page.setViewportSize({ width: 900, height: 560 });
    if (view === "project")
      await page.setViewportSize({ width: 900, height: 960 });
    // A fixed clock and isolated IPC keep captures repeatable and free of personal data.
    await page.clock.setFixedTime(new Date("2026-10-26T10:00:00Z"));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === "http://127.0.0.1:1422"
        ? route.continue()
        : route.abort(),
    );
    await page.goto("/");
    // Capture-only presentation: keep the real app's browser-preview notice intact.
    await page.addStyleTag({
      content: ".preview-note { display: none !important; }",
    });
    await page.evaluate(fixture);
    await page.evaluate(() => {
      const state = (window as unknown as { __TEST_STATE__: State })
        .__TEST_STATE__;
      const day = Date.UTC(2026, 9, 26) / 1000;
      const task = (
        id: string,
        tt: string,
        props: Entity["props"] = {},
      ): Entity => ({
        id,
        kind: "Task6",
        props: { tt, tp: 0, st: 1, ss: 0, ix: 0, ...props },
      });
      state.preferences = {
        motion: false,
        theme: "dark",
      };
      state.entities = [
        { id: "everyday", kind: "Area3", props: { tt: "Everyday", ix: 0 } },
        {
          id: "curiosity",
          kind: "Area3",
          props: { tt: "Small adventures", ix: 1 },
        },
        { id: "gentle", kind: "Tag4", props: { tt: "Gentle pace" } },
        { id: "outside", kind: "Tag4", props: { tt: "Outdoors" } },
        { id: "creative", kind: "Tag4", props: { tt: "Creative" } },
        task("garden", "Windowsill garden", {
          tp: 1,
          ar: ["everyday"],
          nt: "Basil, mint and parsley. A little green corner, one pot at a time.",
        }),
        task("wander", "Slow weekend club", {
          tp: 1,
          ar: ["curiosity"],
          ix: 1,
        }),
        task("make", "Play with paper", {
          tp: 1,
          ar: ["curiosity"],
          ix: 2,
        }),
        task("seeds", "Planting day", { tp: 2, pr: ["garden"] }),
        task("care", "Keep it growing", { tp: 2, pr: ["garden"], ix: 1 }),
        task("pots", "Pot the herbs by the kitchen window", {
          pr: ["garden"],
          agr: ["seeds"],
          sr: day,
          dd: day + 86400,
          tg: ["gentle"],
          nt: "Basil by the bright pane; mint in its own pot.",
        }),
        ...[
          "Add fresh potting mix",
          "Plant the basil and mint",
          "Water gently and add labels",
        ].map((tt, ix) => ({
          id: `check-${ix}`,
          kind: "ChecklistItem3",
          props: { tt, ts: ["pots"], ix, ss: ix < 2 ? 3 : 0 },
        })),
        ...[
          "Choose three easy herbs",
          "Find pots with drainage holes",
          "Make a little space by the window",
        ].map((tt, ix) =>
          task(`garden-done-${ix}`, tt, {
            pr: ["garden"],
            agr: ["seeds"],
            ss: 3,
            sp: day - (5 - ix) * 86400,
            ix: ix + 1,
          }),
        ),
        task("water", "Check the soil before watering", {
          pr: ["garden"],
          agr: ["care"],
          st: 2,
          sr: day + 86400,
          tg: ["gentle"],
          ix: 1,
        }),
        task("labels", "Draw a tiny plant-care card", {
          pr: ["garden"],
          agr: ["care"],
          tg: ["creative"],
        }),
        task("leaves", "Photograph the first new leaves", {
          pr: ["garden"],
          agr: ["care"],
          st: 2,
          sr: day + 2 * 86400,
          ix: 2,
        }),
        task("sketch", "Sketch a leaf, wonky lines welcome", {
          pr: ["make"],
          sr: day,
          dd: day + 2 * 86400,
          tg: ["creative"],
          ix: 1,
        }),
        task("walk", "Take the scenic route around the pond", {
          pr: ["wander"],
          sr: day,
          tg: ["outside"],
          nt: "Take the footbridge, then follow the reeds. Leave time to watch the ducks.",
          ix: 2,
        }),
        task("tea", "Tea, a book, and no particular hurry", {
          ar: ["everyday"],
          sr: day,
          sb: 1,
          ix: 3,
        }),
        task("swap", "Swap a book at the little free library", {
          pr: ["wander"],
          st: 2,
          sr: day + 86400,
          tg: ["outside"],
        }),
        task("postcard", "Draw a postcard from an imaginary island", {
          pr: ["make"],
          st: 2,
          sr: day + 2 * 86400,
          tg: ["creative"],
        }),
        task("route", "Pick a gentle route for the weekend", {
          pr: ["wander"],
          st: 2,
          sr: day + 3 * 86400,
          tg: ["outside"],
        }),
        task("picnic", "Pack a pocket picnic for the park", {
          pr: ["wander"],
          st: 2,
          sr: day + 4 * 86400,
          dd: day + 4 * 86400,
          tg: ["outside"],
        }),
        ...[
          "Save a map of the riverside paths",
          "Find the little free library",
          "Pick a shady spot by the pond",
          "Dust off the picnic basket",
        ].map((tt, ix) =>
          task(`wander-done-${ix}`, tt, {
            pr: ["wander"],
            ss: 3,
            sp: day - (7 - ix) * 86400,
            ix,
          }),
        ),
        task("paper-done", "Try a few paper folds", {
          pr: ["make"],
          ss: 3,
          sp: day - 2 * 86400,
        }),
        task("lantern", "Fold a little paper lantern", {
          pr: ["make"],
          tg: ["creative"],
          ix: 2,
        }),
        task("clouds", "Make a tiny cloud-watching notebook", { st: 2 }),
        task("inbox", "Try folding a paper boat", { st: 0 }),
      ];
    });
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page
      .locator(".new-todos")
      .getByRole("button", { name: "OK", exact: true })
      .click();

    if (view === "project" || view === "schedule") {
      await page
        .getByRole("button", {
          name: "43% complete Windowsill garden",
          exact: true,
        })
        .click();
      await page
        .locator(".new-todos")
        .getByRole("button", { name: "OK", exact: true })
        .click();
      if (view === "project") {
        await page
          .getByRole("button", { name: "List options", exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: "Hide later items", exact: true })
          .click();
      }
      await page.locator("#item-pots .task-title").dblclick();
      await expect(
        page.getByRole("textbox", { name: "To-do title" }),
      ).toHaveValue("Pot the herbs by the kitchen window");
      await expect(
        page.getByRole("textbox", { name: "Checklist item", exact: true }),
      ).toHaveCount(3);
      await expect(
        page.locator('.task-editor button[aria-checked="true"]'),
      ).toHaveCount(2);
      await page
        .getByRole("textbox", { name: "To-do title" })
        .evaluate((el) => (el as HTMLElement).blur());
      if (view === "schedule") {
        const trigger = page
          .locator(".task-editor")
          .getByRole("button", { name: "When", exact: true });
        await trigger.evaluate((el) =>
          el.scrollIntoView({ block: "center", behavior: "instant" }),
        );
        await trigger.click();
        const picker = page.getByRole("dialog", { name: "When", exact: true });
        await expect(picker).toBeVisible();
        await expect
          .poll(async () => {
            const anchor = (await trigger.boundingBox())!;
            const popup = (await picker.boundingBox())!;
            return popup.y >= anchor.y + anchor.height;
          })
          .toBe(true);
        await expect(picker).toBeInViewport({ ratio: 1 });
      } else {
        await expect(
          page.getByRole("button", { name: "Show logged items", exact: true }),
        ).toBeInViewport({ ratio: 1 });
      }
    } else {
      if (view === "upcoming") {
        await page
          .getByRole("button", { name: "Upcoming", exact: true })
          .click();
        await page
          .locator(".new-todos")
          .getByRole("button", { name: "OK", exact: true })
          .click();
      }
      await expect(
        page.locator(view === "upcoming" ? "#item-swap" : "#item-walk"),
      ).toBeVisible();
    }
    await expect(page.locator(".new-todos")).toHaveCount(0);
    for (const name of [
      "43% complete Windowsill garden",
      "50% complete Slow weekend club",
      "25% complete Play with paper",
    ]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    await expect(page.locator("[data-theme]")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await expect(page.locator(".preview-note")).toBeHidden();
    if (view === "upcoming") {
      // Fit the four populated days without a large empty tail or a clipped last row.
      const lastTask = (await page.locator("#item-picnic").boundingBox())!;
      await page.setViewportSize({
        width: 900,
        height: Math.ceil(lastTask.y + lastTask.height + 72),
      });
    }
    const viewport = page.viewportSize()!;
    if (view === "today" || view === "upcoming") {
      const lastTask = page.locator(
        view === "today" ? "#item-tea" : "#item-picnic",
      );
      await expect(lastTask).toBeInViewport({ ratio: 1 });
      const bounds = (await lastTask.boundingBox())!;
      expect(viewport.height - bounds.y - bounds.height).toBeLessThan(120);
    }
    const capture = await page.screenshot({
      animations: "disabled",
      caret: "hide",
    });

    // Synthetic macOS chrome belongs to the documentation artifact, not the product.
    // CSS here is a standalone capture stage; app UI styling stays in Tailwind.
    const frame = await context.newPage();
    await frame.setViewportSize({
      width: viewport.width + 80,
      height: viewport.height + 80,
    });
    await frame.setContent(`<!doctype html><html><head><style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 40px 48px; }
      main { position: relative; width: ${viewport.width}px; height: ${viewport.height}px; overflow: hidden;
        border-radius: 14px; box-shadow: 0 16px 32px rgb(0 0 0 / 28%); }
      img { display: block; width: 100%; height: 100%; }
      nav { position: absolute; top: 16px; left: 20px; display: flex; gap: 8px; }
      i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; }
      i:nth-child(2) { background: #febc2e; }
      i:nth-child(3) { background: #28c840; }
    </style></head><body><main>
      <img alt="Somedue ${view}" src="data:image/png;base64,${capture.toString("base64")}" />
      <nav aria-label="macOS window controls"><i></i><i></i><i></i></nav>
    </main></body></html>`);
    await frame
      .locator("img")
      .evaluate((img: HTMLImageElement) => img.decode());
    await expect(frame.locator("nav i")).toHaveCount(3);
    await frame.screenshot({
      path: `docs/screenshots/${view}.png`,
      animations: "disabled",
      omitBackground: true,
    });
    await frame.close();
  });
}
