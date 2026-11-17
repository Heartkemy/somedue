import type { JSX } from "@solidjs/web";
import { twMerge } from "tailwind-merge";

/** Normalize Solid's structured classes before resolving Tailwind conflicts. */
export function classes(...values: JSX.ClassValue[]): string {
  const flatten = (value: JSX.ClassValue): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value && typeof value === "object")
      return Object.keys(value).filter((key) => value[key]);
    return [];
  };
  return twMerge(values.flatMap(flatten));
}
