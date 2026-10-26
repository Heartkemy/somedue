import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testDir: "./tests/browser",
  testMatch: "readme-screenshots.ts",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  use: {
    ...config.use,
    viewport: { width: 1200, height: 840 },
    deviceScaleFactor: 2,
    locale: "en-GB",
    timezoneId: "UTC",
    reducedMotion: "reduce",
  },
});
