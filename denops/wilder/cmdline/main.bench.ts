import { parse, WilderContext } from "./main.ts";

Deno.bench(function parseCmdline() {
  const ctx: WilderContext = {
    cmdline: "echo ",
    pos: 0,
    cmd: "",
    expand: "",
  };
  parse(ctx);
});
