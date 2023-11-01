import { assertEquals } from "https://deno.land/std@0.204.0/assert/mod.ts";
import { CompletionKind, getChar, parse, WilderContext } from "./main.ts";

const expect = (expected: CompletionKind) => {
  return (cmdline: string) => {
    const ctx: WilderContext = {
      cmdline,
      pos: 0,
      cmd: "",
      expand: "",
    };
    parse(ctx);
    assertEquals(ctx.expand, expected);
  };
};

Deno.test("getChar", () => {
  const ctx: WilderContext = {
    cmdline: 'echo "',
    pos: 5,
    cmd: "",
    expand: "",
  };
  assertEquals(getChar(ctx), '"');
});

Deno.test("expand: nothing", () => {
  const nothing = expect("nothing");
  nothing('echo "');
  nothing('" e');
});

Deno.test("expand: file", () => {
  const file = expect("file");
  file("   edit ");
  // file("!ls ");
});

Deno.test("expand: help", () => {
  const help = expect("help");
  help("help ");
  help("h ");
  help("he ");
  help("hel ");
});
