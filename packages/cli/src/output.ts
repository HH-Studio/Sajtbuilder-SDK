// ---------------------------------------------------------------------------
// Where a command writes.
//
// One shared definition rather than four identical local ones, because the
// DEFAULT is the load-bearing part and it was wrong.
//
// `console.error` is not a neutral writer. Under Bun it wraps everything it
// prints in ANSI red (`\x1b[0m\x1b[31m … \x1b[0m`) whenever the environment
// allows colour, which is the normal case in a terminal and the normal case for
// an agent harness that allocates a pty. `snabbsajt skills … --json` writes its
// error object to stderr, so its one and only audience — a script or a coding
// agent calling `JSON.parse` — got a string that is not JSON. CI never saw it
// because CI has no TTY, which is why this survived into the published 0.2.0
// and 0.3.0.
//
// So the default writes RAW lines to the streams. Two consequences worth
// stating: the output is now byte-identical under Bun and Node (`console.error`
// colours under one and not the other, which made "what does this command
// print" a question with two answers), and human-facing stderr loses a red
// tint nobody in this codebase ever asked for. If a command later wants colour
// for a human, it must decide that itself — and check `--json` first.
// ---------------------------------------------------------------------------

/** The two streams a command may write to. Injected everywhere so tests can
 *  capture output without spawning a process. */
export type Output = {
  stdout(message: string): void;
  stderr(message: string): void;
};

/** The real streams, uncoloured and unconditional. `process.*.write` does not
 *  append a newline the way `console.*` does, so each writer adds one. */
export const consoleOutput: Output = {
  stdout: (message: string) => {
    process.stdout.write(`${message}\n`);
  },
  stderr: (message: string) => {
    process.stderr.write(`${message}\n`);
  },
};
