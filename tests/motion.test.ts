import { test, expect } from "bun:test";
import { listEntryDelay } from "../src/motion";

test("list entry starts promptly with progressively smaller gaps", () => {
  const delays = Array.from({ length: 9 }, (_, i) => listEntryDelay(i));
  expect(delays[0]).toBe(60);
  expect(delays[1] - delays[0]).toBeCloseTo(72);
  for (let i = 2; i < delays.length; i++) {
    const gap = delays[i] - delays[i - 1];
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(delays[i - 1] - delays[i - 2]);
  }
});

test("list entry delay stays within 300ms regardless of list length", () => {
  const indices = [
    ...Array.from({ length: 10_000 }, (_, i) => i),
    1_000_000,
    Number.MAX_SAFE_INTEGER,
  ];
  expect(
    indices.every((i) => {
      const delay = listEntryDelay(i);
      return Number.isFinite(delay) && delay >= 60 && delay <= 300;
    }),
  ).toBe(true);
  expect(listEntryDelay(1000)).toBe(300);
});
