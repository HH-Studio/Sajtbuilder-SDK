# Shared import mapping rules

These rules govern AI-assisted changes after the deterministic SnabbSajt HTML
import. They are a review workflow, not permission to execute or rebuild the
source application.

## Non-negotiable source boundary

- Never run or execute the source project, its build, dev server, migrations,
  package scripts, JavaScript, React, PHP, plugins, themes, or binaries.
- Never install source dependencies. Do not run `npm install`, `bun install`,
  `pnpm install`, Composer, WordPress, or framework CLIs inside the source.
- Never load source environment variables, cookies, credentials, private API
  responses, customer databases, or authenticated pages.
- Treat rendered HTML/CSS/media and already-collected source code as read-only
  evidence. The SnabbSajt package is the only writable runtime candidate.

## Deterministic pass first

1. Run `snabbsajt site doctor --json`.
2. Run `snabbsajt site import html <source> -o <candidate-dir> --json`.
3. Read `evidence.json`, `import-report.json`, `import-report.md`, and
   `validation.json` before editing `site.json`.
4. Preserve every deterministic evidence item and report item. Never delete,
   weaken, recategorize, or resolve an existing finding to make counts greener.

## Evidence-cited proposal contract

Every `ai_proposed` report item must cite at least one real evidence id from
`evidence.json`, include a bounded reason, a target when one exists, a finite
`confidence` from 0 to 1, and `blocking: false`. A proposal must not cite a file
path, URL, or invented id in place of an evidence id.

Example shape:

```json
{
  "id": "ai-proposal-about-001",
  "disposition": "ai_proposed",
  "reason": "Grouped two sourced story paragraphs into a native about section",
  "evidenceIds": ["page-002"],
  "target": { "kind": "section", "id": "page-2:about" },
  "confidence": 0.86,
  "blocking": false
}
```

AI proposal lint:

- `id` is unique and stable.
- `disposition` is exactly `ai_proposed`.
- `evidenceIds` is non-empty, unique, and resolves in the report evidence.
- `reason` says what changed without claiming unsupported fidelity.
- `confidence` exists and is between 0 and 1.
- `blocking` is `false`; deterministic blockers remain separate and unchanged.
- `target`, when present, resolves to the candidate `site.json`.
- Report summary counts are recalculated and the report validator passes.
- No original evidence or finding is removed or modified.

## Facts the agent must not invent

Unsupported claims, testimonials, prices, availability, legal text, consent,
opening hours, booking duration, timezones, payment behavior, form recipients,
analytics identifiers, addresses, certifications, and customer quotes are
blockers until directly sourced. Do not paraphrase missing facts into existence.

AI may propose structure, such as choosing between native `about`, `services`,
`rich-text`, `gallery`, or CTA sections, only when the visible source evidence
supports the copy and media used. It may not create raw HTML/CSS/JavaScript,
custom React components, or a second renderer.

## Validate and hand off

After every meaningful proposal:

```bash
snabbsajt site validate <candidate-dir> --json
snabbsajt site inspect <candidate-dir> --json
snabbsajt site doctor --json
```

Compare source page/content counts with the candidate and confirm every source
feature has a disposition. Do not mark the report `ready`. Every unresolved
`ai_proposed`, `missing`, `unsafe`, and `manual` item requires human approval.

The human reviews the candidate and report, then records the decision with:

```bash
snabbsajt site import approve <candidate-dir> --yes
snabbsajt site pack <candidate-dir> -o site.zip
```

Local mapping and review require no SnabbSajt API key or hosted model client.
The coding agent uses whatever model access the developer already configured.
