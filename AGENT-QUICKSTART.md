# Convert a website into SnabbSajt — one-paste agent prompt

You are a technical user with a coding agent (Claude Code or Codex). You want to
take an existing website and turn it into a **safe, editable SnabbSajt site** —
without hand-writing any of the conversion.

**Copy the block below, paste it into your agent as a single message, and replace
`<SOURCE>` with your website** (a live URL, a `.html` file, an HTML/CSS/assets
`.zip`, a WordPress URL + WXR export, or a Next.js/React repo path). That is the
only edit you make.

The agent installs the official Site Kit skills, converts your site to SnabbSajt's
typed format, validates it against the same rules the production importer runs,
packs a checksum-protected bundle, and then hands you the exact import steps. No
API key. Nothing runs your source code. Nothing publishes automatically.

---

```text
Convert the website at <SOURCE> into an importable SnabbSajt site package.

Setup (run once, project-local):
  npx @snabbsajt/cli@latest skills install --agent auto
Then READ the freshly installed `import-website` skill and follow it exactly —
it is the contract. Do not guess the package format; the skill and the CLI
validators are the source of truth.

Rules (non-negotiable):
- Never execute my source code. Read Next.js/React/HTML/WordPress ONLY as
  content and design evidence — no npm install, no builds, no running scripts.
- Never invent facts. Keep my real wording, prices, hours, contact details.
  Anything you cannot find stays a review item — "don't know" beats fabrication.
- No raw HTML, no custom components, no tracking scripts, no iframes. Map every
  region to a registered SnabbSajt section type; report anything you must skip.
- Editability beats pixel fidelity. Pick the closest section type/variant and
  theme token; do not contort content to fake a layout.

Steps:
1. Get the source locally (clone/unpack/fetch rendered HTML; respect robots).
2. Convert:
   - Live URL / .html / HTML zip:
       npx @snabbsajt/cli@latest site import html <SOURCE> -o ./import
   - WordPress (needs both):
       npx @snabbsajt/cli@latest site import wordpress --url <SOURCE> --wxr <export.xml> --out ./import
   - Next.js/React repo or anything the converters can't take: build the
     package by hand per the import-website skill into ./import.
3. Review the generated import report with me BEFORE approving. Show what was
   imported exactly, converted, merged, skipped (and why), and what needs a human.
4. Approve, validate, pack:
       npx @snabbsajt/cli@latest site import approve ./import --yes
       npx @snabbsajt/cli@latest site validate ./import
       npx @snabbsajt/cli@latest site pack ./import -o site.zip
   Fix every validation error and re-run until it prints "OK — 0 errors".
5. Give me site.zip plus an honest report: pages produced, source pages
   merged/skipped, section types used, facts carried vs missing, and every
   manual action required before publish.

Finally, tell me to import it: sign in to SnabbSajt → Settings → Backup & move →
import site.zip. It creates a NEW unpublished draft. It never overwrites or
publishes an existing site. I review the skipped-asset summary there and publish
when I'm ready.
```

---

## What this does and does not do

| Step | Automated by the agent | Who does it |
| --- | --- | --- |
| Install skills + CLI | ✅ `skills install` | agent |
| Convert Next.js / HTML / WordPress → typed package | ✅ | agent |
| Validate against production import rules | ✅ | agent |
| Pack a checksum-protected bundle | ✅ | agent |
| **Import into your account** | ✅ via MCP · or manual upload | agent **or** you |
| Edit text/images and publish | ❌ normal editor | you |

Two import paths:

- **Hands-free (MCP)** — connect the SnabbSajt MCP server to your agent, grant a
  connection `content:write` + the advanced-editor capability, and the agent
  calls the **`import_site`** tool with the converted `PortableSiteV1` payload.
  It creates a new unpublished draft directly and returns the editor URL. No
  manual step. (Create-mode only for now; nothing is published or overwritten.)
- **Manual upload** — no MCP connection: sign in to SnabbSajt → Settings →
  Backup & move → import the `site.zip` the CLI packed. Same server-side
  validation, same "new draft, nothing published" guarantee.

## Prefer the skill directly?

If you already have the skills installed, you don't need this prompt — just tell
your agent *"use the import-website skill to convert `<SOURCE>`"*. This file is
the zero-setup onboarding version for someone who has never touched Site Kit.

Full format contract: [`skills/import-website/SKILL.md`](skills/import-website/SKILL.md)
and the developer docs at <https://snabbsajt.com/docs/en/developer/site-kit>.
