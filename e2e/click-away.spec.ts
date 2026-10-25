import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    (window as any).__TEST_STATE__.entities = ["a", "b"].map((id) => ({
      id,
      kind: "Task6",
      props: { tt: id, st: 0, ss: 0, tr: false },
    }));
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
});

test("click-away saves the first editor and opens the clicked row; failure preserves the draft", async ({
  page,
}) => {
  const title = page.getByRole("textbox", { name: "To-do title" });
  await page.locator("#item-a .task-title").click();
  await title.fill("Saved first");
  await page.locator("#item-b .task-title").click();
  await expect(title).toHaveValue("b");
  await expect(page.locator("#item-a .task-title")).toHaveText("Saved first");
  await title.fill("Keep this draft");
  await page.evaluate(() => ((window as any).__TEST_FAIL__ = true));
  await page.locator("#item-a .task-title").click();
  await expect(title).toHaveValue("Saved first");
  await expect(page.locator(".error")).toContainText("not saved");
  await page.evaluate(() => ((window as any).__TEST_FAIL__ = false));
  await page.locator("#item-b .task-title").click();
  await expect(title).toHaveValue("Keep this draft");
  await page.locator("h1").click();
  await expect(page.locator(".task-editor")).toHaveCount(0);
  await expect(page.locator("#item-b .task-title")).toHaveText(
    "Keep this draft",
  );
  await page.locator("#item-a .task-title").click();
  await title.fill("Save before toolbar action");
  await page.locator('[aria-label="List options"] svg').click();
  await expect(page.locator(".list-menu")).toBeVisible();
  await expect(page.locator("#item-a .task-title")).toHaveText(
    "Save before toolbar action",
  );
});

test("editor controls occupy the footer and routine saves remain silent", async ({
  page,
}) => {
  await page.locator("#item-a .task-title").click();
  await expect(page.locator(".task-editor .editor-footer")).toHaveCount(0);
  await expect(
    page.locator(".list-footer .editor-move > button"),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "To-do title" }).fill("Saved draft");
  await page.locator("h1").click();
  await expect(page.locator(".task-editor")).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveCount(0);
  await expect(page.locator("#item-a .task-title")).toHaveText("Saved draft");
  const backgrounds = await page.evaluate(() =>
    [".app", ".titlebar", "main"].map((selector) => {
      const s = getComputedStyle(document.querySelector(selector)!);
      return { color: s.backgroundColor, image: s.backgroundImage };
    }),
  );
  expect(backgrounds[1]).toEqual({ color: "rgba(0, 0, 0, 0)", image: "none" });
  expect(backgrounds[2]).toEqual({ color: "rgba(0, 0, 0, 0)", image: "none" });
});

test("empty Today matches the icon-only reference and excludes unrelated tag filters", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).__TEST_STATE__.entities.push({
      id: "unrelated",
      kind: "Tag4",
      props: { tt: "Unrelated tag" },
    });
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".symbol-only .empty-symbol svg")).toBeVisible();
  await expect(
    page.locator(".empty h2,.empty p,.empty button,.tag-filters"),
  ).toHaveCount(0);
});

test("rapid editor handoffs stay instant and never start Cloud sync between edits", async ({
  page,
}) => {
  await page.evaluate(() => {
    const state = (window as any).__TEST_STATE__;
    state.account = "dummy@example.invalid";
    state.preferences.motion = true;
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.evaluate(() => {
    const w = window as any,
      original = w.__TAURI_INTERNALS__.invoke;
    w.__SYNC_CALLS__ = 0;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "sync") w.__SYNC_CALLS__++;
      if (command === "mutate") w.__TEST_STATE__.pending++;
      return original(command, args);
    };
    document.getAnimations().forEach((animation) => animation.finish());
  });
  await page.locator("#item-a .task-title").click();
  await page
    .getByRole("textbox", { name: "To-do title" })
    .fill("First saved edit");
  await page.locator("#item-b .task-title").click();
  await expect(page.getByRole("textbox", { name: "To-do title" })).toHaveValue(
    "b",
  );
  expect(
    await page
      .locator(".task-editor")
      .evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
  expect(await page.evaluate(() => (window as any).__SYNC_CALLS__)).toBe(0);
  await page
    .getByRole("textbox", { name: "To-do title" })
    .fill("Second saved edit");
  await page.locator("#item-a .task-title").click();
  await expect(page.getByRole("textbox", { name: "To-do title" })).toHaveValue(
    "First saved edit",
  );
  await page.locator("h1").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__SYNC_CALLS__))
    .toBe(1);
});

test("handoff opens the clicked editor before the previous save resolves, without a selected frame", async ({
  page,
}, info) => {
  await page.locator("#item-a .task-title").click();
  await page.getByRole("textbox", { name: "To-do title" }).fill("Unsaved A");
  await page.evaluate(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__HANDOFF_FRAMES__ = [];
    const record = () =>
      w.__HANDOFF_FRAMES__.push({
        selected: !!document.querySelector("#item-b.selected"),
        editor: (
          document.querySelector(
            '[aria-label="To-do title"]',
          ) as HTMLInputElement
        )?.value,
      });
    new MutationObserver(record).observe(
      document.querySelector(".task-list")!,
      { subtree: true, childList: true, attributes: true },
    );
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "mutate" && !w.__SAVE_GATE_USED__) {
        w.__SAVE_GATE_USED__ = true;
        w.__SAVE_PENDING__ = true;
        await new Promise<void>((resolve) => (w.__RELEASE_SAVE__ = resolve));
        w.__SAVE_PENDING__ = false;
      }
      return invoke(command, args);
    };
  });
  await page.locator("#item-b .task-title").click();
  const duringSave = await page.evaluate(() => ({
    title: (
      document.querySelector('[aria-label="To-do title"]') as HTMLInputElement
    )?.value,
    pending: (window as any).__SAVE_PENDING__,
    frames: (window as any).__HANDOFF_FRAMES__,
  }));
  await page.screenshot({
    path: info.outputPath("handoff-before-save.png"),
    animations: "disabled",
  });
  await page.evaluate(() => (window as any).__RELEASE_SAVE__());
  expect(duringSave.pending).toBe(true);
  expect(duringSave.title).toBe("b");
  expect(
    duringSave.frames.some(
      (frame: any) => frame.selected && frame.editor !== "b",
    ),
  ).toBe(false);
  await expect(page.getByRole("textbox", { name: "To-do title" })).toHaveValue(
    "b",
  );
});

test("a failed background save keeps the new editor and restores all old draft fields on reopen", async ({
  page,
}) => {
  const title = page.getByRole("textbox", { name: "To-do title" });
  await page.locator("#item-a .task-title").click();
  await title.fill("Retained A");
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Retained notes");
  await page.getByRole("button", { name: "Add checklist item" }).click();
  await page
    .getByRole("textbox", { name: "Checklist item", exact: true })
    .fill("Retained checklist");
  await page.evaluate(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "mutate" && !w.__SAVE_GATE_USED__) {
        w.__SAVE_GATE_USED__ = true;
        await new Promise<void>(
          (_resolve, reject) =>
            (w.__REJECT_SAVE__ = () =>
              reject(Error("Delayed persistence failed"))),
        );
      }
      return invoke(command, args);
    };
  });
  await page.locator("#item-b .task-title").click();
  await expect(title).toHaveValue("b");
  await title.fill("Current B typing");
  await page.evaluate(() => (window as any).__REJECT_SAVE__());
  await expect(page.locator(".error")).toContainText(
    "Delayed persistence failed",
  );
  await expect(title).toHaveValue("Current B typing");
  await page.locator("#item-a .task-title").click();
  await expect(title).toHaveValue("Retained A");
  await expect(
    page.getByRole("textbox", { name: "Notes", exact: true }),
  ).toHaveValue("Retained notes");
  await expect(
    page.getByRole("textbox", { name: "Checklist item", exact: true }),
  ).toHaveValue("Retained checklist");
  await page.locator("h1").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__TEST_STATE__.entities.find(
            (entity: any) => entity.id === "a",
          ).props.tt,
      ),
    )
    .toBe("Retained A");
});

test("late save completion cannot reset typing after rapid A-B-A handoffs", async ({
  page,
}) => {
  const title = page.getByRole("textbox", { name: "To-do title" });
  await page.locator("#item-a .task-title").click();
  await title.fill("Pending A");
  await page.evaluate(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "mutate" && !w.__SAVE_GATE_USED__) {
        w.__SAVE_GATE_USED__ = true;
        await new Promise<void>((resolve) => (w.__RELEASE_SAVE__ = resolve));
      }
      return invoke(command, args);
    };
  });
  await page.locator("#item-b .task-title").click();
  await title.fill("Pending B");
  await page.locator("#item-a .task-title").click();
  await expect(title).toHaveValue("Pending A");
  await title.fill("Latest A typing");
  await page.evaluate(() => (window as any).__RELEASE_SAVE__());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__TEST_STATE__.entities.find(
            (entity: any) => entity.id === "b",
          ).props.tt,
      ),
    )
    .toBe("Pending B");
  await expect(title).toHaveValue("Latest A typing");
  await page.locator("h1").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__TEST_STATE__.entities.find(
            (entity: any) => entity.id === "a",
          ).props.tt,
      ),
    )
    .toBe("Latest A typing");
});

test("a new draft can hand off before creation finishes and late creation keeps the next editor", async ({
  page,
}) => {
  const title = page.getByRole("textbox", { name: "To-do title" });
  await page.getByRole("button", { name: "New to-do", exact: true }).click();
  await title.fill("New pending capture");
  await page.evaluate(() => {
    const w = window as any,
      invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === "mutate" && !w.__SAVE_GATE_USED__) {
        w.__SAVE_GATE_USED__ = true;
        await new Promise<void>((resolve) => (w.__RELEASE_SAVE__ = resolve));
      }
      return invoke(command, args);
    };
  });
  await page.locator("#item-a .task-title").click();
  expect(await title.inputValue()).toBe("a");
  await title.fill("Current item typing");
  await page.evaluate(() => (window as any).__RELEASE_SAVE__());
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__TEST_STATE__.entities.some(
          (entity: any) => entity.props.tt === "New pending capture",
        ),
      ),
    )
    .toBe(true);
  await expect(title).toHaveValue("Current item typing");
});
