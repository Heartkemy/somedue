import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

test("rejected authentication offers reconnection without discarding saved edits", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    (window as any).__TEST_STATE__.account = "synthetic@example.invalid";
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.evaluate(() => {
    const ipc = (window as any).__TAURI_INTERNALS__;
    const invoke = ipc.invoke;
    ipc.invoke = (command: string, args: unknown) =>
      command === "sync"
        ? Promise.reject(
            Error(
              "Things Cloud: authentication was rejected; reconnect with your Things Cloud password",
            ),
          )
        : invoke(command, args);
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  const feedback = page.locator(".notice.error");
  await expect(feedback).toContainText("Your changes are saved on this Mac");
  await feedback
    .getByRole("button", { name: "Reconnect account", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Things Cloud connection" }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 760, height: 540 },
  { width: 1120, height: 780 },
]) {
  test(`cloud feedback stays below controls and retry clears it at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(fixture);
    await page.evaluate(() => {
      (window as any).__TEST_STATE__.account = "synthetic@example.invalid";
      (window as any).__TEST_STATE__.pending = 4;
      (window as any).__TEST_STATE__.preferences.theme = "dark";
    });
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await page.evaluate(() => {
      const ipc = (window as any).__TAURI_INTERNALS__;
      const invoke = ipc.invoke;
      ipc.invoke = async (command: string, args: unknown) => {
        if (command === "sync" && !(window as any).__ALLOW_SYNC__)
          throw Error(
            "Your changes are saved on this Mac. Somedue is checking whether Things Cloud received the last update and will check again automatically. " +
              "long-diagnostic-".repeat(30),
          );
        return invoke(command, args);
      };
    });
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    const feedback = page.locator(".notice.error");
    await expect(feedback).toHaveAttribute("role", "status");
    await expect(feedback).toContainText("Changes saved on this Mac");
    await expect(feedback).toContainText(
      "Somedue will keep trying automatically",
    );
    const toolbar = await page.locator(".top-tools").boundingBox();
    const box = await feedback.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
    const retry = feedback.getByRole("button", { name: "Try syncing now" });
    await expect(retry).toBeEnabled();
    await feedback.getByText("Technical details", { exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await feedback.boundingBox())!.height).toBeLessThan(
      viewport.height - 100,
    );
    const heading = await page
      .getByRole("heading", { name: "Inbox", exact: true })
      .boundingBox();
    const emptyIcon = await page.locator(".empty-symbol").boundingBox();
    expect(emptyIcon!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
    await page.screenshot({
      path: info.outputPath(`sync-feedback-${viewport.width}.png`),
      animations: "disabled",
    });
    await feedback.getByText("Technical details", { exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Things Cloud", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Use cloud version" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Sync will continue automatically.", { exact: false }),
    ).toBeVisible();
    await page.evaluate(() => {
      (window as any).__ALLOW_SYNC__ = true;
    });
    await retry.click();
    await expect(feedback).toHaveCount(0);
    await page.evaluate(() => {
      (window as any).__ALLOW_SYNC__ = false;
    });
    await page
      .getByRole("button", { name: "Sync now", exact: true })
      .first()
      .click();
    await expect(feedback).toHaveAttribute("role", "status");
    await page.getByRole("button", { name: "General", exact: true }).click();
    await page.evaluate(() => {
      (window as any).__TEST_FAIL__ = true;
    });
    await page
      .getByRole("checkbox", {
        name: "Sync automatically while the app is open",
      })
      .click();
    await expect(feedback).toHaveAttribute("role", "alert");
    await expect(feedback).toContainText("your changes were not saved");
    await expect(
      feedback.getByRole("button", { name: "Try syncing now" }),
    ).toHaveCount(0);
  });
}

test("sync failure remains visible after reloading saved drafts", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    readFileSync(
      new URL("../tests/browser-ipc-fixture.js", import.meta.url),
      "utf8",
    ),
  );
  await page.evaluate(() => {
    const ipc = (window as any).__TAURI_INTERNALS__;
    const invoke = ipc.invoke;
    ipc.invoke = async (command: string, args: unknown) => {
      if (command === "sync")
        throw Error("A saved edit needs review. Draft preserved.");
      return invoke(command, args);
    };
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText(
    "A saved edit needs review",
  );
});
