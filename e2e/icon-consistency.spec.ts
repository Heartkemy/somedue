import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../tests/browser-ipc-fixture.js", import.meta.url),
  "utf8",
);
const fingerprint = (icon: Locator) =>
  icon.evaluate((el) => ({
    shape: el.innerHTML,
    color: getComputedStyle(el).color,
    fill: getComputedStyle(el).fill,
    stroke: getComputedStyle(el).strokeWidth,
  }));

for (const [theme, width] of [
  ["dark", 1120],
  ["light", 760],
] as const) {
  test.describe(`Shared view icons ${theme}`, () => {
    test.use({ viewport: { width, height: 780 } });
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(fixture);
      await page.evaluate((theme) => {
        const now = new Date(),
          day =
            Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 1000;
        const task = (id: string, props = {}) => ({
          id,
          kind: "Task6",
          props: { tt: id, tp: 0, ss: 0, st: 0, ...props },
        });
        (window as any).__TEST_STATE__.preferences.theme = theme;
        (window as any).__TEST_STATE__.entities = [
          { id: "area", kind: "Area3", props: { tt: "Home" } },
          task("project", { tp: 1, st: 1, ar: ["area"] }),
          task("a", { nt: "Keep the alignment", rt: ["template"] }),
          task("someday", { st: 2 }),
          task("template", {
            st: 2,
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
          ...[0, 1].map((ix) => ({
            id: `check-${ix}`,
            kind: "ChecklistItem3",
            props: { tt: `Step ${ix + 1}`, ts: ["a"], ss: 0, ix },
          })),
        ];
      }, theme);
      await page.getByRole("button", { name: "Sync now", exact: true }).click();
      await page.getByRole("button", { name: "OK", exact: true }).click();
    });

    test("sidebar, header, empty state and schedule shortcuts share the same icon", async ({
      page,
    }, info) => {
      const names = [
        "Inbox",
        "Today",
        "Upcoming",
        "Anytime",
        "Someday",
        "Logbook",
        "Trash",
      ];
      for (const name of names) {
        const nav = page.locator(`.nav-item[aria-label="${name}"]`);
        const before = await fingerprint(nav.locator("svg"));
        await nav.click();
        expect(await fingerprint(nav.locator("svg"))).toEqual(before);
        expect(await fingerprint(page.locator(".page-symbol > svg"))).toEqual(
          before,
        );
        if (await page.locator(".empty-symbol").count()) {
          expect(
            await fingerprint(page.locator(".empty-symbol > svg")),
          ).toEqual(before);
          await expect(page.locator(".empty-symbol")).toHaveCSS("opacity", "1");
        }
        if (["Someday", "Anytime"].includes(name))
          await page.screenshot({
            path: info.outputPath(`${name.toLowerCase()}.png`),
            animations: "disabled",
          });
      }
      for (const selector of [".area-link", ".project-nav"]) {
        const nav = page.locator(selector);
        const icon = await fingerprint(nav.locator("svg"));
        await nav.click();
        expect(await fingerprint(page.locator(".page-symbol > svg"))).toEqual(
          icon,
        );
        if (selector === ".area-link") {
          await page
            .getByRole("button", { name: "Collapse Home", exact: true })
            .click();
          expect(await fingerprint(nav.locator("svg"))).toEqual(icon);
          await page
            .getByRole("button", { name: "Expand Home", exact: true })
            .click();
        }
      }
      await page.getByRole("button", { name: "Inbox", exact: true }).click();
      await page.locator("#item-a .task-title").dblclick();
      await page
        .locator(".task-editor")
        .getByRole("button", { name: "When", exact: true })
        .click();
      for (const name of ["Today", "Anytime", "Someday"]) {
        const shortcut = page
          .getByRole("dialog", { name: "When", exact: true })
          .getByRole("button", { name, exact: true });
        expect(await fingerprint(shortcut.locator("svg"))).toEqual(
          await fingerprint(
            page.locator(`.nav-item[aria-label="${name}"] svg`),
          ),
        );
      }
    });

    test("checklist button has a separator gap and repetition fits its content", async ({
      page,
    }, info) => {
      await page.locator("#item-a .task-title").dblclick();
      const last = (await page.locator(".check-row").last().boundingBox())!;
      const add = (await page
        .getByRole("button", { name: "Checklist item", exact: true })
        .boundingBox())!;
      expect(add.y - last.y - last.height).toBeGreaterThanOrEqual(8);
      const repeat = page.getByRole("button", {
        name: "Repeating schedule",
        exact: true,
      });
      const geometry = await repeat.evaluate((el) => {
        const style = getComputedStyle(el),
          icon = el.querySelector("svg")!,
          content = el.querySelector("span")!;
        return {
          width: el.getBoundingClientRect().width,
          needed:
            icon.getBoundingClientRect().width +
            content.getBoundingClientRect().width +
            parseFloat(style.gap) +
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight),
        };
      });
      expect(Math.abs(geometry.width - geometry.needed)).toBeLessThan(1);
      expect(geometry.width).toBeLessThan(
        (await page.locator(".task-editor").boundingBox())!.width - 48,
      );
      expect(
        await page
          .locator(".task-editor")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath("checklist-and-repeat.png"),
        animations: "disabled",
      });
    });
  });
}
