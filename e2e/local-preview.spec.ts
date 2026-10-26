import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);

test("local-only previews explain Cloud availability without offering credentials", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(fixture);
  await page.evaluate(() => {
    (window as any).__TEST_STATE__.cloudAvailable = false;
  });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Things Cloud", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Settings", exact: true }),
  ).toContainText("Things Cloud sync is unavailable");
  await expect(
    page.getByRole("button", { name: "Connect Things Cloud", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Things Cloud password", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Settings", exact: true }),
  ).toContainText("Alpha 1");
  await expect(
    page.getByRole("region", { name: "Settings", exact: true }),
  ).toContainText("Local-only download");
});
