import { expect, test } from "bun:test";
import { classes } from "../src/ui/classes";

test("structured Solid classes preserve flags and resolve Tailwind overrides", () => {
  expect(
    classes(
      "px-2 text-sm",
      [false, { selected: true, hidden: false }, ["px-4"]],
      undefined,
    ),
  ).toBe("text-sm selected px-4");
});
