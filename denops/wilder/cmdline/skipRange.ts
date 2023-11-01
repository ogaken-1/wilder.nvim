import { getChar, WilderContext } from "./main.ts";

const chars = " \t0123456789.$%'/?-+,;\\";

export function skipRange(ctx: WilderContext): boolean {
  while (ctx.pos < ctx.cmdline.length && chars.includes(getChar(ctx))) {
    const char = getChar(ctx);
    if (char === "\\") {
      if (ctx.pos + 1 >= ctx.cmdline.length) {
        return true;
      }
      const secondChar = ctx.cmdline[ctx.pos + 1];
      if (secondChar === "?" || secondChar === "/" || secondChar === "&") {
        ctx.pos += 2;
      } else {
        return true;
      }
    } else if (char === "'") {
      ctx.pos += 1;
    } else if (char === "/" || char === "?") {
      const delim = char;
      ctx.pos += 1;

      while (ctx.pos < ctx.cmdline.length && getChar(ctx) !== delim) {
        if (getChar(ctx) === "\\" && ctx.pos + 1 < ctx.cmdline.length) {
          ctx.pos += 1;
        }

        ctx.pos += 1;
      }

      if (ctx.pos === ctx.cmdline.length) {
        return false;
      }
    }

    ctx.pos += 1;
  }
  return false;
}
