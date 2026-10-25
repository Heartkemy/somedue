import { expect, test } from "bun:test";
import { day, date } from "../src/model";
import {
  makeRule,
  ruleDates,
  ruleSummary,
  simpleRule,
} from "../src/recurrence";

test("monthly previews keep the anchor day through shorter months", () => {
  const rule = makeRule(8, 1, "2024-01-31");
  expect(ruleDates(rule).map(date)).toEqual([
    "2024-01-31",
    "2024-02-29",
    "2024-03-31",
  ]);
});
test("after-completion and end-date rules retain their wire settings", () => {
  const rule = makeRule(256, 2, "2026-10-25", true);
  expect(rule.tp).toBe(1);
  expect(rule.of).toEqual([{ wd: 0 }]);
  expect(ruleSummary(rule)).toBe("Repeat every 2 weeks after completion");
  const ended = makeRule(16, 1, "2026-10-25", false, "2026-10-26");
  expect(ruleDates(ended)).toEqual([day("2026-10-25"), day("2026-10-26")]);
});
test("unsupported imported variants cannot be silently edited", () => {
  const rule = makeRule(256, 1, "2026-10-25");
  expect(simpleRule({ ...rule, of: [{ wd: 0 }, { wd: 1 }] })).toBe(false);
  expect(simpleRule({ ...rule, ts: 1 })).toBe(false);
  expect(() => makeRule(16, 0, "2026-10-25")).toThrow();
  expect(() => makeRule(16, 1, "2026-10-25", false, "2026-10-24")).toThrow();
});
