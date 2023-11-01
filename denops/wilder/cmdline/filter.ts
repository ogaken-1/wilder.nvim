import { endOfLine, WilderContext } from "./main.ts";

export function filterDo(ctx: WilderContext): void {
  if (endOfLine(ctx)) {
    return;
  }
}
