import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:1422", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command:
      process.env.SOMEDUE_TEST_SERVER ||
      "bunx vite preview --host 127.0.0.1 --port 1422 --strictPort",
    url: "http://127.0.0.1:1422",
    reuseExistingServer: false,
  },
});
