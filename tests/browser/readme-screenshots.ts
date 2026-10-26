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
    if (view === "upcoming")
      await page.setViewportSize({ width: 900, height: 680 });
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
        task("garden", "Windowsill garden", {
          tp: 1,
          ar: ["everyday"],
          nt: "A little green corner. Start small and see what grows.",
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
        task("seeds", "Small beginnings", { tp: 2, pr: ["garden"] }),
        task("care", "Room to grow", { tp: 2, pr: ["garden"], ix: 1 }),
        task("pots", "Find a sunny spot for the little pots", {
          pr: ["garden"],
          agr: ["seeds"],
          sr: day,
          tg: ["gentle"],
          nt: "The bright corner by the window looks promising.\n\nNo perfect setup needed — just a little light and room to grow.",
        }),
        ...[
          "Choose a favourite herb",
          "Gather a few small pots",
          "Add plant labels with tiny doodles",
        ].map((tt, ix) => ({
          id: `check-${ix}`,
          kind: "ChecklistItem3",
          props: { tt, ts: ["pots"], ix, ss: ix === 0 ? 3 : 0 },
        })),
        task("soil", "Pick up a small bag of potting mix", {
          pr: ["garden"],
          agr: ["seeds"],
          ix: 1,
        }),
        task("water", "Give the seedlings a little water", {
          pr: ["garden"],
          agr: ["care"],
          ix: 2,
        }),
        task("sketch", "Sketch a leaf, wonky lines welcome", {
          pr: ["make"],
          sr: day,
          ix: 1,
        }),
        task("walk", "Take the scenic route around the pond", {
          pr: ["wander"],
          sr: day,
          tg: ["outside"],
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
        }),
        task("postcard", "Draw a postcard from an imaginary island", {
          pr: ["make"],
          st: 2,
          sr: day + 2 * 86400,
        }),
        task("picnic", "Pack a pocket picnic for the park", {
          pr: ["wander"],
          st: 2,
          sr: day + 4 * 86400,
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
          name: "0% complete Windowsill garden",
          exact: true,
        })
        .click();
      await page
        .locator(".new-todos")
        .getByRole("button", { name: "OK", exact: true })
        .click();
      await page.locator("#item-pots .task-title").dblclick();
      await expect(
        page.getByRole("textbox", { name: "To-do title" }),
      ).toHaveValue("Find a sunny spot for the little pots");
      await expect(
        page.getByRole("textbox", { name: "Checklist item", exact: true }),
      ).toHaveCount(3);
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
    await expect(page.locator("[data-theme]")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await expect(page.locator(".preview-note")).toBeHidden();
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
