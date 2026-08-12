# prompts/

Copy-paste prompts a developer hands their coding agent. Each prompt is the
portable distillation of a packaged skill in [`skills/`](../skills/): same
contracts, no install step.

| Prompt | Contract |
| --- | --- |
| [`convert-to-snabbsajt.md`](convert-to-snabbsajt.md) | Converts an existing site (Next.js repo, HTML, URL, WordPress) into a validated `sajt-site@1` package with a `snabbsajt-import-report@1` conversion report. Stops before import; the human reviews and imports the bundle. |

Every prompt carries a version header with a `requires-cli` floor, so a stale
prompt fails loudly at preflight instead of drifting against the validator.

Surfacing these prompts on `/developers`, in the public docs, and via
`snabbsajt skills install` is **planned, not built** — today the canonical copy
is this directory.
