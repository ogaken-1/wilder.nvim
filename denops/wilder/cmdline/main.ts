import { skipRange } from "./skipRange.ts";

const commandModifiers = {
  aboveleft: 1,
  argdo: 1,
  belowright: 1,
  botright: 1,
  browse: 1,
  bufdo: 1,
  cdo: 1,
  cfdo: 1,
  confirm: 1,
  debug: 1,
  folddoclosed: 1,
  folddoopen: 1,
  hide: 1,
  keepalt: 1,
  keepjumps: 1,
  keepmarks: 1,
  keeppatterns: 1,
  ldo: 1,
  leftabove: 1,
  lfdo: 1,
  lockmarks: 1,
  noautocmd: 1,
  noswapfile: 1,
  rightbelow: 1,
  sandbox: 1,
  silent: 1,
  tab: 1,
  tabdo: 1,
  topleft: 1,
  verbose: 1,
  vertical: 1,
  windo: 1,
};

type CommandModifier = keyof typeof commandModifiers;

/**
 * :h :command-completion
 */
const commandCompletes = [
  "arglist",
  "augroup",
  "buffer",
  "behave",
  "color",
  "command",
  "compiler",
  "dir",
  "environment",
  "event",
  "expression",
  "file",
  "file_in_path",
  "filetype",
  "function",
  "help",
  "highlight",
  "history",
  "locale",
  "lua",
  "mapclear",
  "mapping",
  "menu",
  "messages",
  "option",
  "packadd",
  "shellcmd",
  "sign",
  "syntax",
  "syntime",
  "tag",
  "tag_listfiles",
  "user",
  "var",
  "custom",
  "customlist",

  // invalid in -complete=
  "nothing",
  "unsuccessful",
  "file_opt",
  "user_commands",
  "tags",
  "",
] as const;
export type CompletionKind = ValueOf<typeof commandCompletes>;

export type WilderContext = {
  readonly cmdline: string;
  expand: CompletionKind;
  force?: boolean;
  pos: number;
  cmd: string;
};

export function getChar(ctx: WilderContext): string {
  return ctx.cmdline[ctx.pos];
}

function getNextChar(ctx: WilderContext): string {
  return ctx.cmdline[ctx.pos + 1];
}

export function endOfLine(ctx: WilderContext): boolean {
  return ctx.cmdline.length <= ctx.pos;
}

/**
 * wilder#cmdline#main#do()
 */
export function parse(ctx: WilderContext): void {
  // default
  ctx.expand = "command";
  ctx.force = false;

  if (endOfLine(ctx)) {
    return;
  }

  if (!skipWhitespace(ctx)) {
    return;
  }

  if (getChar(ctx) === '"') {
    ctx.pos = ctx.cmdline.length;
    ctx.expand = "nothing";
    return;
  }

  skipRange(ctx);

  if (!skipWhitespace(ctx)) {
    return;
  }

  if (getChar(ctx) === '"') {
    // comment
    ctx.pos = ctx.cmdline.length;
    ctx.expand = "nothing";
    return;
  }

  if (getChar(ctx) === "|" || getChar(ctx) === ":") {
    ctx.pos += 1;
    ctx.cmd = "";

    parse(ctx);
    return;
  }

  let isUserCmd = false;
  if (getChar(ctx) === "k" && ctx.cmdline[ctx.pos + 1] !== "e") {
    ctx.cmd = "k";
    ctx.pos += 1;
    return;
  }

  const cmdStart = ctx.pos;
  let char = getChar(ctx);
  if (char.match(/[A-Z]/) === null) {
    while (char.match(/[a-zA-Z0-9]/) !== null) {
      ctx.pos += 1;
      char = getChar(ctx);
    }

    const command = ctx.cmdline.substring(cmdStart, ctx.pos);
    // if (command !== "" && !isCommand(command)) {
    //   throw Error(`${command} is not valid command.`);
    // }
    ctx.cmd = command;
    isUserCmd = true;
  } else {
    // non-alphabet command
    if ("@*!=><&~#".includes(char)) {
      ctx.pos += 1;
      char = getChar(ctx);
    } else {
      // py3, python3, py3file and py3do are the only commands with numbers
      // all other commands are alphabet only
      if (ctx.cmdline.match(/^py3/) !== null) {
        ctx.pos += 3;
        char = getChar(ctx);
      }

      // this should check for [a-zA-Z] only, but the Vim implementation
      // skips over wildcards. This matters for commands which accept
      // non-alphanumeric arguments e.g. 'e*' would be parsed as an 'edit'
      // command with a '*' argument otherwise. These commands typically
      // don't need a space between the command and argument e.g. 'e++opt'
      // is a valid command.
      while (char.match(/[a-zA-Z*]/) !== null) {
        ctx.pos += 1;
        char = getChar(ctx);
      }
    }

    if (ctx.pos === cmdStart) {
      ctx.expand = "unsuccessful";
      return;
    }

    // find the command
    if (ctx.pos > cmdStart) {
      const cmd = ctx.cmdline.substring(cmdStart, ctx.pos);
      const len = ctx.pos - cmdStart;

      const char = isKeyOf(commandCharPos, cmd[0]) ? cmd[0] : "z";

      const nextChar = String.fromCharCode(char.charCodeAt(0) + 1);

      let i = commandCharPos[char];
      const end = isKeyOf(commandCharPos, nextChar)
        ? commandCharPos[nextChar]
        : commands.length;

      while (i < end) {
        const command = commands[i];
        if (cmd === command.substring(0, len - 1)) {
          ctx.cmd = command;
          break;
        }
        i += 1;
      }
    }
  }

  // cursor is touching command and ends in alpha-numeric character
  // complete the command name
  if (endOfLine(ctx)) {
    const char = ctx.cmdline[ctx.pos - 1];

    if (char.match(/[a-zA-Z0-9]/) !== null) {
      ctx.pos = cmdStart;
      ctx.cmd = "";
      // expand commands
      return;
    }
  }

  // no matching command found, treat as no arguments
  if (ctx.cmd === "") {
    if (
      ctx.cmdline[cmdStart] === "s" &&
      "cgriI".includes(ctx.cmdline[cmdStart + 1])
    ) {
      ctx.cmd = "s";
    }

    ctx.pos = ctx.cmdline.length;
    ctx.expand = "nothing";
    return;
  }

  ctx.expand = "nothing";

  // handle !
  if (getChar(ctx) === "!") {
    ctx.pos += 1;
    ctx.force = true;
  }

  if (ctx.cmd as string in commandModifiers) {
    ctx.cmd = "";
    ctx.expand = "";
    parse(ctx);
    return;
  }

  skipWhitespace(ctx);

  const flags = commandFlags.get(ctx.cmd as string) ?? 0;
  let useFilter = false;

  if (ctx.cmd === "write" || ctx.cmd === "update") {
    if (getChar(ctx) === ">") {
      if (ctx.cmdline[ctx.pos + 1] === ">") {
        ctx.pos += 2;
      }

      skipWhitespace(ctx);
    }

    if (ctx.cmd === "write" && getChar(ctx) === "!") {
      ctx.pos += 1;
      useFilter = true;
    }
  } else if (ctx.cmd === "read") {
    if (getChar(ctx) === "!") {
      ctx.pos += 1;
      useFilter = true;
    } else {
      useFilter = ctx.force;
    }
  } else if (ctx.cmd === "<" || ctx.cmd === ">") {
    while (getChar(ctx) === ctx.cmd) {
      ctx.pos += 1;
    }

    skipWhitespace(ctx);
  }

  // Handle +cmd or ++opt
  if (
    getChar(ctx) === "+" &&
    (((flags & EDITCMD) && !useFilter) || flags & ARGOPT)
  ) {
    let allowOpt = true;
    let allowCmd = (flags & EDITCMD) && !useFilter;

    while (getChar(ctx) === "+" && !endOfLine(ctx)) {
      ctx.pos += 1;

      let expand: CompletionKind;
      if (getChar(ctx) === "+") {
        if (allowOpt) {
          ctx.pos += 1;
          expand = "file_opt";
        } else {
          expand = "nothing";
        }
      } else if (allowCmd) {
        expand = "command";
        // ++opt must be before +cmd
        allowOpt = false;
        // only 1 +cmd allowed
        allowCmd = false;
      } else {
        expand = "nothing";
      }

      const argStart = ctx.pos;

      // skip to next arg
      while (!endOfLine(ctx) && !isWhitespace(getChar(ctx))) {
        if (getChar(ctx) === "\\" && ctx.pos + 1 < ctx.cmdline.length) {
          ctx.pos += 1;
        }

        // TODO: multibyte
        ctx.pos += 1;
      }

      // still in command or option
      if (getChar(ctx) === "") {
        ctx.pos = argStart;
        ctx.expand = expand;
        return;
      }

      skipWhitespace(ctx);
    }

    if (ctx.cmd === "write" && getChar(ctx) === "!") {
      ctx.pos += 1;
      useFilter = true;
    } else if (ctx.cmd === "read") {
      if (getChar(ctx) === "!") {
        ctx.pos += 1;
        useFilter = true;
      } else {
        useFilter = ctx.force;
      }
    }
  }

  // look for | for new command and " for comment
  if ((flags & TRLBAR) && !useFilter) {
    if (
      ctx.cmd === "redir" && getChar(ctx) === "@" && getNextChar(ctx) === '"'
    ) {
      ctx.pos += 2;
    }

    let lookahead = ctx.pos;
    while (lookahead < ctx.cmdline.length) {
      if (
        ctx.cmdline[lookahead] === "\x16" /* <C-v> */ ||
        ctx.cmdline[lookahead] === "\\"
      ) {
        lookahead += 1;

        if (lookahead + 1 < ctx.cmdline.length) {
          lookahead += 1;
        } else {
          break;
        }
      }

      // Check if " indicates a comment or start of string
      if (ctx.cmdline[lookahead] === '"') {
        lookahead += 1;

        let endQuoteReached = false;
        // Consume until next char is " or end of cmdline is reached
        while (lookahead < ctx.cmdline.length) {
          if (ctx.cmdline[lookahead] === "\\") {
            lookahead += 1;
          } else if (ctx.cmdline[lookahead] === '"') {
            endQuoteReached = true;
            lookahead += 1;
            break;
          }

          lookahead += 1;
        }

        // remaining part of cmdline is comment, treat as no arguments
        if (!endQuoteReached) {
          ctx.pos = ctx.cmdline.length;
          return;
        }

        // start of new command
      } else if (ctx.cmdline[lookahead] === "|") {
        ctx.pos = lookahead + 1;
        ctx.cmd = "";
        ctx.expand = "";
        parse(ctx);
        return;
      }

      // TODO: multibyte
      lookahead += 1;
    }
  }

  // command does not take extra arguments
  if (flags & EXTRA && !isUserCmd) {
    // consume whitespace
    skipWhitespace(ctx);

    // and check for | or "
    if (getChar(ctx) === "|") {
      ctx.pos += 1;
      ctx.cmd = "";
      ctx.expand = "";
      parse(ctx);
      return;
    } else {
      // remaining part is either comment or invalid arguments
      // either way, treat as no arguments
      ctx.pos = ctx.cmdline.length;
      ctx.expand = "nothing";
      return;
    }
  }

  if (useFilter || ctx.cmd === "!" || ctx.cmd === "terminal") {
    const beforeArgs = ctx.pos;

    if (!skipNonWhitespace(ctx)) {
      ctx.pos = beforeArgs;
      ctx.expand = "shellcmd";
      return;
    }

    // Reset pos back to beforeArgs
    ctx.pos = beforeArgs;
  }

  if (flags & XFILE) {
    // TODO: handle backticks :h backtick-expansion

    let argStart = ctx.pos;

    // Check if completing $ENV
    if (getChar(ctx) === "$") {
      argStart = ctx.pos;
      ctx.pos += 1;

      while (!endOfLine(ctx)) {
        const char = getChar(ctx);
        if (!isIdentifierCharacter(char)) {
          break;
        }

        ctx.pos += 1;
      }

      if (endOfLine(ctx)) {
        ctx.expand = "environment";
        ctx.pos = argStart + 1;
        return;
      }
    }

    // Check if completing ~user
    if (getChar(ctx) === "~") {
      while (!endOfLine(ctx)) {
        const char = getChar(ctx);
        if (isFnameCharacter(char)) {
          break;
        }

        ctx.pos += 1;
      }

      // + 1 since we want to expand ~ to HOME
      if (endOfLine(ctx) && ctx.pos > argStart + 1) {
        ctx.expand = "user";
        ctx.pos = argStart + 1;
        return;
      }
    }

    ctx.pos = argStart;
    ctx.expand = "file";

    // vim assumes for XFILE, we can ignore arguments other than the last one but
    // this is not necessarily true, we should not do this for NOSPC
    if (!(flags & NOSPC)) {
      movePosToLastArg(ctx);
    }
  }

  if (isOneOf(["find", "sfind", "tabfind"] as const, ctx.cmd)) {
    if (ctx.expand === "file") {
      ctx.expand = "file_in_path";
    }
    return;
  } else if (
    isOneOf(["cd", "chdir", "lcd", "lchdir", "tcd", "tchdir"] as const, ctx.cmd)
  ) {
    if (ctx.expand === "file") {
      ctx.expand = "dir";
    }
    return;
  } else if (ctx.cmd === "help") {
    ctx.expand = "help";
    return;
  } else if (isKeyOf(commandModifiers, ctx.cmd)) {
    ctx.cmd = "";
    ctx.expand = "";
    parse(ctx);
    return;
  } else if (ctx.cmd === "filter") {
    return;
  } else if (ctx.cmd === "match") {
    return;
  } else if (ctx.cmd === "command") {
    return;
  } else if (ctx.cmd === "delcommand") {
    ctx.expand = "user_commands";
    return;
  } else if (isOneOf(["global", "vglobal"] as const, ctx.cmd)) {
    return;
  } else if (isOneOf(["&", "substitute"] as const, ctx.cmd)) {
    return;
  } else if (
    isOneOf(
      [
        "isearch",
        "dsearch",
        "ilist",
        "dlist",
        "ijump",
        "psearch",
        "djump",
        "isplit",
        "dsplit",
      ] as const,
      ctx.cmd,
    )
  ) {
    return;
  } else if (ctx.cmd === "autocmd") {
    return;
  } else if (isOneOf(["doautocmd", "doautoall"] as const, ctx.cmd)) {
    return;
  } else if (isOneOf(["set", "setglobal", "setlocal"] as const, ctx.cmd)) {
    return;
  } else if (
    isOneOf(
      [
        "tag",
        "stag",
        "ptag",
        "ltag",
        "tselect",
        "stselect",
        "tjump",
        "stjump",
        "ptselect",
        "ptjump",
      ] as const,
      ctx.cmd,
    )
  ) {
    ctx.expand = "tags";
    return;
  }
}

function movePosToLastArg(ctx: WilderContext): void {
  let lastArg = ctx.pos;

  // find start of last argument
  while (!endOfLine(ctx)) {
    const char = getChar(ctx);

    if (char === " " || char === "\t") {
      ctx.pos += 1;
      lastArg = ctx.pos;
    } else {
      if (char === "\\" && ctx.pos + 1 < ctx.cmdline.length) {
        ctx.pos += 1;
      }
      ctx.pos += 1;
    }
  }

  ctx.pos = lastArg;
}

function isFnameCharacter(char: string): boolean {
  return char.match(/[\/\\a-zA-Z0-9.\-_+,#$%~=]/) !== null;
}

function isIdentifierCharacter(char: string): boolean {
  return char.match(/[a-zA-Z0-9\_]/) !== null;
}

/**
 * wilder#cmdline#skip_whitespace()
 */
function skipWhitespace(ctx: WilderContext): boolean {
  if (endOfLine(ctx)) {
    return false;
  }

  while (isWhitespace(getChar(ctx))) {
    ctx.pos += 1;

    if (endOfLine(ctx)) {
      return false;
    }
  }

  return true;
}

function skipNonWhitespace(ctx: WilderContext): boolean {
  if (endOfLine(ctx)) {
    return false;
  }

  while (!isWhitespace(getChar(ctx))) {
    ctx.pos += 1;

    if (endOfLine(ctx)) {
      return false;
    }
  }

  return true;
}

function isWhitespace(char: string): boolean {
  const nr = char.charCodeAt(0);
  return char === " " || (nr >= 9 && nr <= 13);
}

const commands = [
  "append",
  "abbreviate",
  "abclear",
  "aboveleft",
  "all",
  "amenu",
  "anoremenu",
  "args",
  "argadd",
  "argdelete",
  "argdo",
  "argedit",
  "argglobal",
  "arglocal",
  "argument",
  "ascii",
  "autocmd",
  "augroup",
  "aunmenu",
  "buffer",
  "bNext",
  "ball",
  "badd",
  "bdelete",
  "behave",
  "belowright",
  "bfirst",
  "blast",
  "bmodified",
  "bnext",
  "botright",
  "bprevious",
  "brewind",
  "break",
  "breakadd",
  "breakdel",
  "breaklist",
  "browse",
  "buffers",
  "bufdo",
  "bunload",
  "bwipeout",
  "change",
  "cNext",
  "cNfile",
  "cabbrev",
  "cabclear",
  "caddbuffer",
  "caddexpr",
  "caddfile",
  "call",
  "catch",
  "cbuffer",
  "cbottom",
  "cc",
  "cclose",
  "cd",
  "cdo",
  "center",
  "cexpr",
  "cfile",
  "cfdo",
  "cfirst",
  "cgetfile",
  "cgetbuffer",
  "cgetexpr",
  "chdir",
  "changes",
  "checkhealth",
  "checkpath",
  "checktime",
  "chistory",
  "clist",
  "clast",
  "close",
  "clearjumps",
  "cmap",
  "cmapclear",
  "cmenu",
  "cnext",
  "cnewer",
  "cnfile",
  "cnoremap",
  "cnoreabbrev",
  "cnoremenu",
  "copy",
  "colder",
  "colorscheme",
  "command",
  "comclear",
  "compiler",
  "continue",
  "confirm",
  "copen",
  "cprevious",
  "cpfile",
  "cquit",
  "crewind",
  "cscope",
  "cstag",
  "cunmap",
  "cunabbrev",
  "cunmenu",
  "cwindow",
  "delete",
  "delmarks",
  "debug",
  "debuggreedy",
  "delcommand",
  "delfunction",
  "display",
  "diffupdate",
  "diffget",
  "diffoff",
  "diffpatch",
  "diffput",
  "diffsplit",
  "diffthis",
  "digraphs",
  "djump",
  "dlist",
  "doautocmd",
  "doautoall",
  "drop",
  "dsearch",
  "dsplit",
  "edit",
  "earlier",
  "echo",
  "echoerr",
  "echohl",
  "echomsg",
  "echon",
  "else",
  "elseif",
  "emenu",
  "endif",
  "endfunction",
  "endfor",
  "endtry",
  "endwhile",
  "enew",
  "ex",
  "execute",
  "exit",
  "exusage",
  "file",
  "files",
  "filetype",
  "filter",
  "find",
  "finally",
  "finish",
  "first",
  "fold",
  "foldclose",
  "folddoopen",
  "folddoclosed",
  "foldopen",
  "for",
  "function",
  "global",
  "goto",
  "grep",
  "grepadd",
  "gui",
  "gvim",
  "help",
  "helpclose",
  "helpgrep",
  "helptags",
  "hardcopy",
  "highlight",
  "hide",
  "history",
  "insert",
  "iabbrev",
  "iabclear",
  "if",
  "ijump",
  "ilist",
  "imap",
  "imapclear",
  "imenu",
  "inoremap",
  "inoreabbrev",
  "inoremenu",
  "intro",
  "isearch",
  "isplit",
  "iunmap",
  "iunabbrev",
  "iunmenu",
  "join",
  "jumps",
  "k",
  "keepmarks",
  "keepjumps",
  "keeppatterns",
  "keepalt",
  "list",
  "lNext",
  "lNfile",
  "last",
  "language",
  "laddexpr",
  "laddbuffer",
  "laddfile",
  "later",
  "lbuffer",
  "lbottom",
  "lcd",
  "lchdir",
  "lclose",
  "lcscope",
  "ldo",
  "left",
  "leftabove",
  "let",
  "lexpr",
  "lfile",
  "lfdo",
  "lfirst",
  "lgetfile",
  "lgetbuffer",
  "lgetexpr",
  "lgrep",
  "lgrepadd",
  "lhelpgrep",
  "lhistory",
  "ll",
  "llast",
  "llist",
  "lmap",
  "lmapclear",
  "lmake",
  "lnoremap",
  "lnext",
  "lnewer",
  "lnfile",
  "loadview",
  "loadkeymap",
  "lockmarks",
  "lockvar",
  "lolder",
  "lopen",
  "lprevious",
  "lpfile",
  "lrewind",
  "ltag",
  "lunmap",
  "lua",
  "luado",
  "luafile",
  "lvimgrep",
  "lvimgrepadd",
  "lwindow",
  "ls",
  "move",
  "mark",
  "make",
  "map",
  "mapclear",
  "marks",
  "match",
  "menu",
  "menutranslate",
  "messages",
  "mkexrc",
  "mksession",
  "mkspell",
  "mkvimrc",
  "mkview",
  "mode",
  "mzscheme",
  "mzfile",
  "next",
  "nbkey",
  "nbclose",
  "nbstart",
  "new",
  "nmap",
  "nmapclear",
  "nmenu",
  "nnoremap",
  "nnoremenu",
  "noremap",
  "noautocmd",
  "nohlsearch",
  "noreabbrev",
  "noremenu",
  "noswapfile",
  "normal",
  "number",
  "nunmap",
  "nunmenu",
  "oldfiles",
  "omap",
  "omapclear",
  "omenu",
  "only",
  "onoremap",
  "onoremenu",
  "options",
  "ounmap",
  "ounmenu",
  "ownsyntax",
  "print",
  "packadd",
  "packloadall",
  "pclose",
  "perl",
  "perldo",
  "pedit",
  "pop",
  "popup",
  "ppop",
  "preserve",
  "previous",
  "promptfind",
  "promptrepl",
  "profile",
  "profdel",
  "psearch",
  "ptag",
  "ptNext",
  "ptfirst",
  "ptjump",
  "ptlast",
  "ptnext",
  "ptprevious",
  "ptrewind",
  "ptselect",
  "put",
  "pwd",
  "python",
  "pydo",
  "pyfile",
  "py3",
  "py3do",
  "python3",
  "py3file",
  "quit",
  "quitall",
  "qall",
  "read",
  "recover",
  "redo",
  "redir",
  "redraw",
  "redrawstatus",
  "registers",
  "resize",
  "retab",
  "return",
  "rewind",
  "right",
  "rightbelow",
  "rshada",
  "runtime",
  "rundo",
  "ruby",
  "rubydo",
  "rubyfile",
  "rviminfo",
  "substitute",
  "sNext",
  "sargument",
  "sall",
  "sandbox",
  "saveas",
  "sbuffer",
  "sbNext",
  "sball",
  "sbfirst",
  "sblast",
  "sbmodified",
  "sbnext",
  "sbprevious",
  "sbrewind",
  "scriptnames",
  "scriptencoding",
  "scscope",
  "set",
  "setfiletype",
  "setglobal",
  "setlocal",
  "sfind",
  "sfirst",
  "simalt",
  "sign",
  "silent",
  "sleep",
  "slast",
  "smagic",
  "smap",
  "smapclear",
  "smenu",
  "snext",
  "snomagic",
  "snoremap",
  "snoremenu",
  "source",
  "sort",
  "split",
  "spellgood",
  "spelldump",
  "spellinfo",
  "spellrepall",
  "spellundo",
  "spellwrong",
  "sprevious",
  "srewind",
  "stop",
  "stag",
  "startinsert",
  "startgreplace",
  "startreplace",
  "stopinsert",
  "stjump",
  "stselect",
  "sunhide",
  "sunmap",
  "sunmenu",
  "suspend",
  "sview",
  "swapname",
  "syntax",
  "syntime",
  "syncbind",
  "t",
  "tcd",
  "tchdir",
  "tNext",
  "tag",
  "tags",
  "tab",
  "tabclose",
  "tabdo",
  "tabedit",
  "tabfind",
  "tabfirst",
  "tabmove",
  "tablast",
  "tabnext",
  "tabnew",
  "tabonly",
  "tabprevious",
  "tabNext",
  "tabrewind",
  "tabs",
  "tcl",
  "tcldo",
  "tclfile",
  "terminal",
  "tfirst",
  "throw",
  "tjump",
  "tlast",
  "tmap",
  "tmapclear",
  "tmenu",
  "tnext",
  "tnoremap",
  "topleft",
  "tprevious",
  "trewind",
  "try",
  "tselect",
  "tunmap",
  "tunmenu",
  "undo",
  "undojoin",
  "undolist",
  "unabbreviate",
  "unhide",
  "unlet",
  "unlockvar",
  "unmap",
  "unmenu",
  "unsilent",
  "update",
  "vglobal",
  "version",
  "verbose",
  "vertical",
  "visual",
  "view",
  "vimgrep",
  "vimgrepadd",
  "viusage",
  "vmap",
  "vmapclear",
  "vmenu",
  "vnoremap",
  "vnew",
  "vnoremenu",
  "vsplit",
  "vunmap",
  "vunmenu",
  "write",
  "wNext",
  "wall",
  "while",
  "winsize",
  "wincmd",
  "windo",
  "winpos",
  "wnext",
  "wprevious",
  "wq",
  "wqall",
  "wsverb",
  "wshada",
  "wundo",
  "wviminfo",
  "xit",
  "xall",
  "xmap",
  "xmapclear",
  "xmenu",
  "xnoremap",
  "xnoremenu",
  "xunmap",
  "xunmenu",
  "yank",
  "z",
  "!",
  "#",
  "&",
  "<",
  ":",
  ">",
  "@",
  "Next",
  "~",
] as const;

const firstIndex = (char: string): number =>
  commands.findIndex((cmd) => (cmd.startsWith(char)));

const commandCharPos = {
  a: firstIndex("a"),
  b: firstIndex("b"),
  c: firstIndex("c"),
  d: firstIndex("d"),
  e: firstIndex("e"),
  f: firstIndex("f"),
  g: firstIndex("g"),
  h: firstIndex("h"),
  i: firstIndex("i"),
  j: firstIndex("j"),
  k: firstIndex("k"),
  l: firstIndex("l"),
  m: firstIndex("m"),
  n: firstIndex("n"),
  o: firstIndex("o"),
  p: firstIndex("p"),
  q: firstIndex("q"),
  r: firstIndex("r"),
  s: firstIndex("s"),
  t: firstIndex("t"),
  u: firstIndex("u"),
  v: firstIndex("v"),
  w: firstIndex("w"),
  x: firstIndex("x"),
  y: firstIndex("y"),
  z: firstIndex("z"),
  ["{"]: firstIndex("z") + 1,
} as const;

function isKeyOf<T extends object>(obj: T, x: unknown): x is keyof T {
  return (
    typeof x === "string" ||
    typeof x === "number" ||
    typeof x === "symbol"
  ) && x in obj;
}

function isOneOf<T extends readonly string[]>(
  xs: T,
  x: unknown,
): x is ValueOf<T> {
  return typeof x === "string" && xs.includes(x);
}

type ValueOf<T extends readonly string[]> = T[number];

type Command = ValueOf<typeof commands>;
function isCommand(x: unknown): x is Command {
  return typeof x === "string" && isOneOf(commands, x);
}

const EXTRA = 0x004;
const XFILE = 0x008;
const NOSPC = 0x010;
const TRLBAR = 0x100;
const EDITCMD = 0x8000;
const ARGOPT = 0x40000;

const commandFlags = new Map<string, number>(
  [
    ["append", 0x301103],
    ["abbreviate", 0x102904],
    ["abclear", 0x100104],
    ["aboveleft", 0x884],
    ["all", 0x4503],
    ["amenu", 0x107905],
    ["anoremenu", 0x107905],
    ["args", 0x4810e],
    ["argadd", 0x510f],
    ["argdelete", 0x410f],
    ["argdo", 0x48a7],
    ["argedit", 0x4d18f],
    ["argglobal", 0x4810e],
    ["arglocal", 0x4810e],
    ["argument", 0x4c507],
    ["ascii", 0x180100],
    ["autocmd", 0x102806],
    ["augroup", 0x100116],
    ["aunmenu", 0x102904],
    ["buffer", 0x3c507],
    ["bNext", 0xc503],
    ["ball", 0x4501],
    ["badd", 0x10819c],
    ["bdelete", 0x14507],
    ["behave", 0x100194],
    ["belowright", 0x884],
    ["bfirst", 0xc103],
    ["blast", 0xc103],
    ["bmodified", 0xc503],
    ["bnext", 0xc503],
    ["botright", 0x884],
    ["bprevious", 0xc503],
    ["brewind", 0xc103],
    ["break", 0x180100],
    ["breakadd", 0x100104],
    ["breakdel", 0x100104],
    ["breaklist", 0x100104],
    ["browse", 0x100884],
    ["buffers", 0x100106],
    ["bufdo", 0x48a7],
    ["bunload", 0x14507],
    ["bwipeout", 0x34507],
    ["change", 0x300543],
    ["cNext", 0x4503],
    ["cNfile", 0x4503],
    ["cabbrev", 0x102904],
    ["cabclear", 0x100104],
    ["caddbuffer", 0x4115],
    ["caddexpr", 0x994],
    ["caddfile", 0x11c],
    ["call", 0x180885],
    ["catch", 0x180004],
    ["cbuffer", 0x4117],
    ["cbottom", 0x100],
    ["cc", 0x4503],
    ["cclose", 0x4501],
    ["cd", 0x10011e],
    ["cdo", 0x48a7],
    ["center", 0x300145],
    ["cexpr", 0x996],
    ["cfile", 0x11e],
    ["cfdo", 0x48a7],
    ["cfirst", 0x4503],
    ["cgetfile", 0x11c],
    ["cgetbuffer", 0x4115],
    ["cgetexpr", 0x994],
    ["chdir", 0x10011e],
    ["changes", 0x100100],
    ["checkhealth", 0x104],
    ["checkpath", 0x100102],
    ["checktime", 0x14505],
    ["chistory", 0x100],
    ["clist", 0x100106],
    ["clast", 0x4503],
    ["close", 0x104503],
    ["clearjumps", 0x100100],
    ["cmap", 0x102904],
    ["cmapclear", 0x100104],
    ["cmenu", 0x107905],
    ["cnext", 0x4503],
    ["cnewer", 0x4501],
    ["cnfile", 0x4503],
    ["cnoremap", 0x102904],
    ["cnoreabbrev", 0x102904],
    ["cnoremenu", 0x107905],
    ["copy", 0x300145],
    ["colder", 0x4501],
    ["colorscheme", 0x100114],
    ["command", 0x102806],
    ["comclear", 0x100100],
    ["compiler", 0x100116],
    ["continue", 0x180100],
    ["confirm", 0x100884],
    ["copen", 0x4501],
    ["cprevious", 0x4503],
    ["cpfile", 0x4503],
    ["cquit", 0x5503],
    ["crewind", 0x4503],
    ["cscope", 0x80c],
    ["cstag", 0x116],
    ["cunmap", 0x102904],
    ["cunabbrev", 0x102904],
    ["cunmenu", 0x102904],
    ["cwindow", 0x4501],
    ["delete", 0x300741],
    ["delmarks", 0x100106],
    ["debug", 0x180884],
    ["debuggreedy", 0x105101],
    ["delcommand", 0x100196],
    ["delfunction", 0x100096],
    ["display", 0x180904],
    ["diffupdate", 0x102],
    ["diffget", 0x200105],
    ["diffoff", 0x102],
    ["diffpatch", 0x20011c],
    ["diffput", 0x105],
    ["diffsplit", 0x11c],
    ["diffthis", 0x100],
    ["digraphs", 0x100104],
    ["djump", 0x67],
    ["dlist", 0x100067],
    ["doautocmd", 0x100104],
    ["doautoall", 0x100104],
    ["drop", 0x4818c],
    ["dsearch", 0x100067],
    ["dsplit", 0x67],
    ["edit", 0x4811e],
    ["earlier", 0x100114],
    ["echo", 0x180804],
    ["echoerr", 0x180804],
    ["echohl", 0x180104],
    ["echomsg", 0x180804],
    ["echon", 0x180804],
    ["else", 0x180100],
    ["elseif", 0x180804],
    ["emenu", 0x104985],
    ["endif", 0x180100],
    ["endfunction", 0x100100],
    ["endfor", 0x180100],
    ["endtry", 0x180100],
    ["endwhile", 0x180100],
    ["enew", 0x102],
    ["ex", 0x4811e],
    ["execute", 0x180804],
    ["exit", 0x14017f],
    ["exusage", 0x100],
    ["file", 0x511f],
    ["files", 0x100106],
    ["filetype", 0x100104],
    ["filter", 0x886],
    ["find", 0x4c11f],
    ["finally", 0x180100],
    ["finish", 0x180100],
    ["first", 0x48106],
    ["fold", 0x180141],
    ["foldclose", 0x180143],
    ["folddoopen", 0x8a5],
    ["folddoclosed", 0x8a5],
    ["foldopen", 0x180143],
    ["for", 0x180804],
    ["function", 0x100006],
    ["global", 0x180067],
    ["goto", 0x184501],
    ["grep", 0x498f],
    ["grepadd", 0x498f],
    ["gui", 0x14810e],
    ["gvim", 0x14810e],
    ["help", 0x806],
    ["helpclose", 0x4501],
    ["helpgrep", 0x884],
    ["helptags", 0x10018c],
    ["hardcopy", 0x527],
    ["highlight", 0x180106],
    ["hide", 0x4507],
    ["history", 0x100104],
    ["insert", 0x300103],
    ["iabbrev", 0x102904],
    ["iabclear", 0x100104],
    ["if", 0x180804],
    ["ijump", 0x67],
    ["ilist", 0x100067],
    ["imap", 0x102904],
    ["imapclear", 0x100104],
    ["imenu", 0x107905],
    ["inoremap", 0x102904],
    ["inoreabbrev", 0x102904],
    ["inoremenu", 0x107905],
    ["intro", 0x100100],
    ["isearch", 0x100067],
    ["isplit", 0x67],
    ["iunmap", 0x102904],
    ["iunabbrev", 0x102904],
    ["iunmenu", 0x102904],
    ["join", 0x700543],
    ["jumps", 0x100100],
    ["k", 0x180115],
    ["keepmarks", 0x884],
    ["keepjumps", 0x884],
    ["keeppatterns", 0x884],
    ["keepalt", 0x884],
    ["list", 0x500541],
    ["lNext", 0x4503],
    ["lNfile", 0x4503],
    ["last", 0x48106],
    ["language", 0x100104],
    ["laddexpr", 0x994],
    ["laddbuffer", 0x4115],
    ["laddfile", 0x11c],
    ["later", 0x100114],
    ["lbuffer", 0x4117],
    ["lbottom", 0x100],
    ["lcd", 0x10011e],
    ["lchdir", 0x10011e],
    ["lclose", 0x4501],
    ["lcscope", 0x80c],
    ["ldo", 0x48a7],
    ["left", 0x300145],
    ["leftabove", 0x884],
    ["let", 0x180804],
    ["lexpr", 0x996],
    ["lfile", 0x11e],
    ["lfdo", 0x48a7],
    ["lfirst", 0x4503],
    ["lgetfile", 0x11c],
    ["lgetbuffer", 0x4115],
    ["lgetexpr", 0x994],
    ["lgrep", 0x498f],
    ["lgrepadd", 0x498f],
    ["lhelpgrep", 0x884],
    ["lhistory", 0x100],
    ["ll", 0x4503],
    ["llast", 0x4503],
    ["llist", 0x100106],
    ["lmap", 0x102904],
    ["lmapclear", 0x100104],
    ["lmake", 0x90e],
    ["lnoremap", 0x102904],
    ["lnext", 0x4503],
    ["lnewer", 0x4501],
    ["lnfile", 0x4503],
    ["loadview", 0x11c],
    ["loadkeymap", 0x100000],
    ["lockmarks", 0x884],
    ["lockvar", 0x180086],
    ["lolder", 0x4501],
    ["lopen", 0x4501],
    ["lprevious", 0x4503],
    ["lpfile", 0x4503],
    ["lrewind", 0x4503],
    ["ltag", 0x4116],
    ["lunmap", 0x102904],
    ["lua", 0x100085],
    ["luado", 0x1000a5],
    ["luafile", 0x10009d],
    ["lvimgrep", 0x498f],
    ["lvimgrepadd", 0x498f],
    ["lwindow", 0x4501],
    ["ls", 0x100106],
    ["move", 0x300145],
    ["mark", 0x180115],
    ["make", 0x90e],
    ["map", 0x102906],
    ["mapclear", 0x100106],
    ["marks", 0x100104],
    ["match", 0x104005],
    ["menu", 0x107907],
    ["menutranslate", 0x102904],
    ["messages", 0x100105],
    ["mkexrc", 0x10011e],
    ["mksession", 0x11e],
    ["mkspell", 0x98e],
    ["mkvimrc", 0x10011e],
    ["mkview", 0x11e],
    ["mode", 0x100114],
    ["mzscheme", 0x1800a5],
    ["mzfile", 0x10009d],
    ["next", 0x4c10f],
    ["nbkey", 0x4084],
    ["nbclose", 0x100100],
    ["nbstart", 0x100114],
    ["new", 0x4c11f],
    ["nmap", 0x102904],
    ["nmapclear", 0x100104],
    ["nmenu", 0x107905],
    ["nnoremap", 0x102904],
    ["nnoremenu", 0x107905],
    ["noremap", 0x102906],
    ["noautocmd", 0x884],
    ["nohlsearch", 0x180100],
    ["noreabbrev", 0x102904],
    ["noremenu", 0x107907],
    ["noswapfile", 0x884],
    ["normal", 0x182887],
    ["number", 0x500541],
    ["nunmap", 0x102904],
    ["nunmenu", 0x102904],
    ["oldfiles", 0x180102],
    ["omap", 0x102904],
    ["omapclear", 0x100104],
    ["omenu", 0x107905],
    ["only", 0x4503],
    ["onoremap", 0x102904],
    ["onoremenu", 0x107905],
    ["options", 0x100],
    ["ounmap", 0x102904],
    ["ounmenu", 0x102904],
    ["ownsyntax", 0x180804],
    ["print", 0x580541],
    ["packadd", 0x18019e],
    ["packloadall", 0x180102],
    ["pclose", 0x102],
    ["perl", 0x1800a5],
    ["perldo", 0x1000a5],
    ["pedit", 0x4811e],
    ["pop", 0x5503],
    ["popup", 0x100986],
    ["ppop", 0x5503],
    ["preserve", 0x100],
    ["previous", 0x4c507],
    ["promptfind", 0x100804],
    ["promptrepl", 0x100804],
    ["profile", 0x100106],
    ["profdel", 0x100104],
    ["psearch", 0x67],
    ["ptag", 0x5117],
    ["ptNext", 0x5103],
    ["ptfirst", 0x5103],
    ["ptjump", 0x116],
    ["ptlast", 0x102],
    ["ptnext", 0x5103],
    ["ptprevious", 0x5103],
    ["ptrewind", 0x5103],
    ["ptselect", 0x116],
    ["put", 0x301343],
    ["pwd", 0x100100],
    ["python", 0x100085],
    ["pydo", 0x1000a5],
    ["pyfile", 0x10009d],
    ["py3", 0x100085],
    ["py3do", 0x1000a5],
    ["python3", 0x100085],
    ["py3file", 0x10009d],
    ["quit", 0x104503],
    ["quitall", 0x102],
    ["qall", 0x100102],
    ["read", 0x34115f],
    ["recover", 0x11e],
    ["redo", 0x100100],
    ["redir", 0x10010e],
    ["redraw", 0x100102],
    ["redrawstatus", 0x100102],
    ["registers", 0x100904],
    ["resize", 0x104115],
    ["retab", 0x300177],
    ["return", 0x180804],
    ["rewind", 0x48106],
    ["right", 0x300145],
    ["rightbelow", 0x884],
    ["rshada", 0x10011e],
    ["runtime", 0x18018e],
    ["rundo", 0x9c],
    ["ruby", 0x100085],
    ["rubydo", 0x1000a5],
    ["rubyfile", 0x10009d],
    ["rviminfo", 0x10011e],
    ["substitute", 0x100045],
    ["sNext", 0x4c507],
    ["sargument", 0x4c507],
    ["sall", 0x4503],
    ["sandbox", 0x884],
    ["saveas", 0x14013e],
    ["sbuffer", 0x3c507],
    ["sbNext", 0xc501],
    ["sball", 0xc501],
    ["sbfirst", 0x8100],
    ["sblast", 0x8100],
    ["sbmodified", 0xc501],
    ["sbnext", 0xc501],
    ["sbprevious", 0xc501],
    ["sbrewind", 0x8100],
    ["scriptnames", 0x100100],
    ["scriptencoding", 0x100114],
    ["scscope", 0x804],
    ["set", 0x180104],
    ["setfiletype", 0x100184],
    ["setglobal", 0x180104],
    ["setlocal", 0x180104],
    ["sfind", 0x4c11f],
    ["sfirst", 0x48106],
    ["simalt", 0x100194],
    ["sign", 0x104085],
    ["silent", 0x180886],
    ["sleep", 0x104505],
    ["slast", 0x48106],
    ["smagic", 0x100045],
    ["smap", 0x102904],
    ["smapclear", 0x100104],
    ["smenu", 0x107905],
    ["snext", 0x4c10f],
    ["snomagic", 0x100045],
    ["snoremap", 0x102904],
    ["snoremenu", 0x107905],
    ["source", 0x18011e],
    ["sort", 0x200867],
    ["split", 0x4c11f],
    ["spellgood", 0x4187],
    ["spelldump", 0x102],
    ["spellinfo", 0x100],
    ["spellrepall", 0x100],
    ["spellundo", 0x4187],
    ["spellwrong", 0x4187],
    ["sprevious", 0x4c507],
    ["srewind", 0x48106],
    ["stop", 0x100102],
    ["stag", 0x5117],
    ["startinsert", 0x100102],
    ["startgreplace", 0x100102],
    ["startreplace", 0x100102],
    ["stopinsert", 0x100102],
    ["stjump", 0x116],
    ["stselect", 0x116],
    ["sunhide", 0x4501],
    ["sunmap", 0x102904],
    ["sunmenu", 0x102904],
    ["suspend", 0x100102],
    ["sview", 0x4c11f],
    ["swapname", 0x100100],
    ["syntax", 0x100804],
    ["syntime", 0x100194],
    ["syncbind", 0x100],
    ["t", 0x300145],
    ["tcd", 0x10011e],
    ["tchdir", 0x10011e],
    ["tNext", 0x5103],
    ["tag", 0x5117],
    ["tags", 0x100100],
    ["tab", 0x884],
    ["tabclose", 0x105117],
    ["tabdo", 0x48a5],
    ["tabedit", 0x4d11f],
    ["tabfind", 0x4d19f],
    ["tabfirst", 0x100],
    ["tabmove", 0x5115],
    ["tablast", 0x100],
    ["tabnext", 0x5115],
    ["tabnew", 0x4d11f],
    ["tabonly", 0x105117],
    ["tabprevious", 0x5115],
    ["tabNext", 0x5115],
    ["tabrewind", 0x100],
    ["tabs", 0x100100],
    ["tcl", 0x100085],
    ["tcldo", 0x1000a5],
    ["tclfile", 0x10009d],
    ["terminal", 0x10000e],
    ["tfirst", 0x5103],
    ["throw", 0x180084],
    ["tjump", 0x116],
    ["tlast", 0x102],
    ["tmap", 0x102904],
    ["tmapclear", 0x100104],
    ["tmenu", 0x107905],
    ["tnext", 0x5103],
    ["tnoremap", 0x102904],
    ["topleft", 0x884],
    ["tprevious", 0x5103],
    ["trewind", 0x5103],
    ["try", 0x180100],
    ["tselect", 0x116],
    ["tunmap", 0x102904],
    ["tunmenu", 0x102904],
    ["undo", 0x105501],
    ["undojoin", 0x100100],
    ["undolist", 0x100100],
    ["unabbreviate", 0x102904],
    ["unhide", 0x4501],
    ["unlet", 0x180086],
    ["unlockvar", 0x180086],
    ["unmap", 0x102906],
    ["unmenu", 0x102906],
    ["unsilent", 0x180884],
    ["update", 0x4017f],
    ["vglobal", 0x100065],
    ["version", 0x100104],
    ["verbose", 0x184885],
    ["vertical", 0x884],
    ["visual", 0x4811e],
    ["view", 0x4811e],
    ["vimgrep", 0x498f],
    ["vimgrepadd", 0x498f],
    ["viusage", 0x100],
    ["vmap", 0x102904],
    ["vmapclear", 0x100104],
    ["vmenu", 0x107905],
    ["vnoremap", 0x102904],
    ["vnew", 0x4c11f],
    ["vnoremenu", 0x107905],
    ["vsplit", 0x4c11f],
    ["vunmap", 0x102904],
    ["vunmenu", 0x102904],
    ["write", 0x14017f],
    ["wNext", 0x4415f],
    ["wall", 0x100102],
    ["while", 0x180804],
    ["winsize", 0x184],
    ["wincmd", 0x104095],
    ["windo", 0x48a5],
    ["winpos", 0x100104],
    ["wnext", 0x4411f],
    ["wprevious", 0x4411f],
    ["wq", 0x4017f],
    ["wqall", 0x4013e],
    ["wsverb", 0x4084],
    ["wshada", 0x10011e],
    ["wundo", 0x9e],
    ["wviminfo", 0x10011e],
    ["xit", 0x14017f],
    ["xall", 0x102],
    ["xmap", 0x102904],
    ["xmapclear", 0x100104],
    ["xmenu", 0x107905],
    ["xnoremap", 0x102904],
    ["xnoremenu", 0x107905],
    ["xunmap", 0x102904],
    ["xunmenu", 0x102904],
    ["yank", 0x100741],
    ["z", 0x500145],
    ["!", 0x10004f],
    ["#", 0x500541],
    ["&", 0x300045],
    ["<", 0x700541],
    [":", 0x500121],
    [">", 0x700541],
    ["@", 0x100145],
    ["Next", 0x4c507],
    ["~", 0x300045],
  ] satisfies [Command, number][],
);
