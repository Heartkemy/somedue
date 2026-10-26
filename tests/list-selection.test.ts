import { expect, test } from "bun:test";
import { selectListItems } from "../src/list-selection";

const rows = ["a", "b", "c", "d"];

test("toggle selection preserves other items and removes the target", () => {
  expect(selectListItems(rows, ["a"], "a", "c", { toggle: true })).toEqual([
    "a",
    "c",
  ]);
  expect(selectListItems(rows, ["a", "c"], "a", "a", { toggle: true })).toEqual(
    ["c"],
  );
});

test("range selection follows visible order in either direction", () => {
  expect(selectListItems(rows, ["d"], "d", "b", { range: true })).toEqual([
    "b",
    "c",
    "d",
  ]);
  expect(
    selectListItems(rows, ["a"], "b", "d", { range: true, toggle: true }),
  ).toEqual(rows);
  expect(selectListItems(rows, ["a"], "hidden", "c", { range: true })).toEqual([
    "c",
  ]);
});

test("plain selection replaces the previous selection and ignores missing rows", () => {
  expect(selectListItems(rows, ["a", "c"], "a", "b")).toEqual(["b"]);
  expect(selectListItems(rows, ["a"], "a", "hidden")).toEqual(["a"]);
});
