import { createInterface } from "node:readline";
import type { Output } from "./output";

// ---------------------------------------------------------------------------
// Interactive prompts, with no dependency.
//
// A picker is ~150 lines of readline and ANSI, and every prompt library that
// would save them brings a tree of transitive packages into a CLI whose whole
// pitch is that it runs locally and needs no credentials. So: two functions,
// `select` and `confirm`, and nothing else.
//
// Three rules the implementation is shaped by, all learned the hard way by
// other people's CLIs:
//
//   1. NEVER assume a TTY. A prompt in a pipe is a hang, and this CLI is called
//      by agents and by CI. Without raw mode `select` prints a numbered list and
//      reads one line; with no stdin at all it refuses loudly instead of
//      blocking forever.
//   2. ALWAYS restore the terminal. Raw mode and a hidden cursor are global
//      state on the user's shell — leaking either after Ctrl-C is the kind of
//      bug people remember about a tool. Restoration lives in `finally`.
//   3. Ctrl-C means SIGINT. Exit code 130, nothing written, no stack trace.
// ---------------------------------------------------------------------------

/** Thrown when the human cancels (Ctrl-C, Esc, EOF). The caller decides the
 *  exit code; nothing partial has been written by then. */
export class PromptCancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

export type SelectChoice<T> = {
  value: T;
  label: string;
  /** Dimmed, right of the label. The one line of context that makes two
   *  similarly named rows tellable apart. */
  hint?: string;
};

/** How many rows the picker draws before it starts scrolling. Ten is the most a
 *  terminal shows without the question scrolling off the top. */
const WINDOW = 10;

const ESC = "\u001b";
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const DIM = `${ESC}[2m`;
const CYAN = `${ESC}[36m`;
const RESET = `${ESC}[0m`;

/** True when we may draw an interactive, redrawing picker on this terminal.
 *
 *  `NO_COLOR` deliberately does NOT disable interactivity — it disables colour.
 *  Conflating them is why some tools drop to a numbered list on a perfectly
 *  good terminal. */
export function canPromptInteractively(): boolean {
  return Boolean(
    process.stdin.isTTY &&
      process.stdout.isTTY &&
      typeof process.stdin.setRawMode === "function",
  );
}

function useColour(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function paint(text: string, code: string): string {
  return useColour() ? `${code}${text}${RESET}` : text;
}

/** Read one keypress in raw mode. Resolves with the raw sequence. */
function readKey(): Promise<string> {
  return new Promise((resolve) => {
    const onData = (data: Buffer) => {
      process.stdin.off("data", onData);
      resolve(data.toString("utf8"));
    };
    process.stdin.on("data", onData);
  });
}

/** Read one line from stdin. Used by every non-raw-mode path. */
function readLine(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    rl.on("close", () => reject(new PromptCancelled()));
  });
}

function renderRows<T>(
  choices: SelectChoice<T>[],
  cursor: number,
  output: Output,
): number {
  // Keep the cursor inside a sliding window rather than paging: a list that
  // jumps by ten loses the reader's place.
  const half = Math.floor(WINDOW / 2);
  let start = Math.max(0, Math.min(cursor - half, choices.length - WINDOW));
  if (choices.length <= WINDOW) start = 0;
  const end = Math.min(choices.length, start + WINDOW);
  const width = Math.max(...choices.slice(start, end).map((c) => c.label.length));

  let lines = 0;
  for (let i = start; i < end; i++) {
    const choice = choices[i]!;
    const selected = i === cursor;
    const marker = selected ? "❯ " : "  ";
    const label = selected ? paint(choice.label, CYAN) : choice.label;
    const pad = " ".repeat(Math.max(0, width - choice.label.length));
    const hint = choice.hint ? `  ${pad}${paint(choice.hint, DIM)}` : "";
    output.stdout(`${marker}${label}${hint}`);
    lines++;
  }
  const hidden = choices.length - (end - start);
  if (hidden > 0) {
    output.stdout(paint(`  … ${hidden} more`, DIM));
    lines++;
  }
  return lines;
}

/** Ask the human to pick one of `choices`.
 *
 *  Interactive when the terminal allows it; a numbered list otherwise. Throws
 *  `PromptCancelled` on Ctrl-C, Esc or EOF — never returns a default the human
 *  did not choose, because a picker that silently picks is worse than one that
 *  refuses. */
export async function select<T>(
  question: string,
  choices: SelectChoice<T>[],
  output: Output,
): Promise<T> {
  if (choices.length === 0) throw new Error("select() needs at least one choice");

  if (!canPromptInteractively()) {
    // Non-raw fallback: print once, read one line. Works in CI shells, editor
    // terminals and anything piping us input.
    output.stdout(question);
    choices.forEach((choice, i) => {
      output.stdout(`  ${i + 1}) ${choice.label}${choice.hint ? `  ${choice.hint}` : ""}`);
    });
    const answer = await readLine("Number: ");
    const index = Number.parseInt(answer, 10) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
      throw new PromptCancelled();
    }
    return choices[index]!.value;
  }

  let cursor = 0;
  let drawn = 0;
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;

  const clear = () => {
    // Move up over everything we drew and wipe from there down. `1A` per line
    // plus `0J` is the smallest correct redraw; a full clear would eat the
    // developer's scrollback.
    if (drawn > 0) process.stdout.write(`${ESC}[${drawn}A${ESC}[0J`);
  };

  try {
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write(HIDE_CURSOR);
    output.stdout(question);

    for (;;) {
      drawn = renderRows(choices, cursor, output);
      const key = await readKey();

      if (key === "\u0003") throw new PromptCancelled(); // Ctrl-C
      if (key === ESC || key === "\u0004") throw new PromptCancelled(); // Esc, Ctrl-D
      if (key === "\r" || key === "\n") return choices[cursor]!.value;

      if (key === `${ESC}[A` || key === "k") {
        cursor = cursor === 0 ? choices.length - 1 : cursor - 1;
      } else if (key === `${ESC}[B` || key === "j") {
        cursor = cursor === choices.length - 1 ? 0 : cursor + 1;
      } else if (key === `${ESC}[H`) {
        cursor = 0;
      } else if (key === `${ESC}[F`) {
        cursor = choices.length - 1;
      }
      clear();
    }
  } finally {
    // Every exit runs through here, including the throw above. Raw mode and a
    // hidden cursor are the user's shell, not ours.
    clear();
    process.stdout.write(SHOW_CURSOR);
    if (stdin.setRawMode) stdin.setRawMode(wasRaw);
    stdin.pause();
  }
}

/** Yes/no. `defaultYes: false` is the right default for anything that runs a
 *  command on the user's machine. */
export async function confirm(
  question: string,
  defaultYes: boolean,
  _output: Output,
): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultYes;
  const suffix = defaultYes ? "(Y/n)" : "(y/N)";
  let answer: string;
  try {
    answer = (await readLine(`${question} ${suffix} `)).toLowerCase();
  } catch {
    return false;
  }
  if (answer === "") return defaultYes;
  return answer === "y" || answer === "yes";
}

/** "published 2 days ago". Deliberately coarse: the picker needs "is this the
 *  live one", not a timestamp.
 *
 *  English, like every other string this CLI prints. The app itself is
 *  Swedish-first because its user is a small-business owner; the CLI's user is
 *  a developer, and half-translating a terminal reads as a bug rather than as
 *  care. Where a sentence has to name a screen in the app, it names the real
 *  Swedish label. */
export function relativeTime(ms: number | null, now: number): string {
  if (ms === null) return "never published";
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return "published just now";
  const units: [number, string][] = [
    [60, "minute"],
    [60, "hour"],
    [24, "day"],
    [7, "week"],
    [4.35, "month"],
    [12, "year"],
  ];
  let value = seconds;
  let unit = "second";
  for (const [step, name] of units) {
    if (value < step) break;
    value = Math.floor(value / step);
    unit = name;
  }
  return `published ${value} ${unit}${value === 1 ? "" : "s"} ago`;
}
