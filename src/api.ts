import { invoke } from "@tauri-apps/api/core";
import type { State } from "./model";
export const native = () => !!(window as any).__TAURI_INTERNALS__;
export async function call<T = State>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!native())
    throw Error(
      "Open the installed Somedue app to use your data. The browser is a visual preview.",
    );
  return invoke<T>(command, args);
}
