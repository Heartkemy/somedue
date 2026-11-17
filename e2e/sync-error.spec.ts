import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

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
