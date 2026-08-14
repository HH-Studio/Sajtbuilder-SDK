# SnabbSajt MCP reference

The MCP server is the **live-site** surface: it reads and edits a site that
already exists. The CLI's `site` namespace builds packages offline and never
touches a live site. Use this reference when a tool is denied, when you need to
know which tool exists, or before asking the human to widen a connection.

Endpoint: `https://snabbsajt.com/api/mcp` (Streamable HTTP, OAuth via the
human's SnabbSajt login). The human creates connections in the app under
AI-integrationer; you cannot mint one.

## Contents

- [Scopes](#scopes) — what a connection is allowed to do
- [Presets](#presets)
- [Tool catalogue](#tool-catalogue)
- [Confirm-gated actions](#confirm-gated-actions)
- [Prompts](#prompts)
- [Failure modes](#failure-modes)

## Scopes

`site:read` is always on — you cannot act blind. Everything else is granted per
connection, and the owner can untick anything at approval time.

| Scope | Grants |
| --- | --- |
| `site:read` | business, site, draft, published, brand, analytics |
| `content:write` | create/edit **draft** pages, sections, posts |
| `publish` | push the draft to the live snapshot |
| `ai:generate` | credit-spending generation (text + image) — **spends the owner's money** |
| `crm:read` | read leads, bookings, contacts — **real customer PII** |
| `crm:write` | update customer records/bookings (never deletion) |
| `settings:write` | business profile, brand, visitor assistant, search visibility |
| `domain:write` | connect/verify/select an existing domain (never purchase) |
| `access:write` | create/revoke website access |
| `communications:write` | send quotes, invoices, invites |
| `commerce:write` | invoices, offers, services, products |
| `workspace:write` | create a new site or a new company |

## Presets

The app offers presets rather than raw scopes. A new connection defaults to
**edit** — no publish, no spend, no PII.

| Preset | Scopes |
| --- | --- |
| view | `site:read` |
| **edit** (default) | `site:read`, `content:write` |
| publish | + `publish` |
| manage | `site:read`, `content:write`, `settings:write`, `crm:read`, `crm:write`, `commerce:write` |
| full | everything except `ai:generate` and `workspace:write` |

## Tool catalogue

### Read — `site:read`
`list_sites` · `get_site_overview` · `list_pages` · `get_page` ·
`list_draft_changes` · `get_brand` · `get_analytics_summary` ·
`get_section_json`*

Start every task with `list_sites` → `get_site_overview` → `list_pages` →
`get_page`. `list_draft_changes` before and after writing is how you separate
your changes from work that was already waiting.

### Draft edits — `content:write`
`update_section_text` (one content field by dot path, e.g. `headline`,
`items.0.title`) · `add_section` · `move_section` · `set_section_hidden` ·
`create_page` · `create_blog_post` · `update_page_seo` ·
`replace_section_content`* · `set_section_layout`* · `import_site` ·
`migrate_site_from_url`

Every one of these writes the DRAFT. The live site does not change.

\* `get_section_json`, `replace_section_content` and `set_section_layout`
additionally need the workspace's advanced-editor (Labs) grant and fail closed
without it. Treat a denial as "this is an ordinary workspace" and fall back to
`update_section_text`. When you do use them, pass the `rev` from
`get_section_json` as `clientRev` so a concurrent browser edit is rejected
instead of silently overwritten.

### Publishing — `publish`
`prepare_publish` · `prepare_unpublish` · `confirm_pending_action`

`publish_site` is **deprecated and always fails**. That is deliberate — see
[confirm-gated actions](#confirm-gated-actions).

### Settings — `settings:write`
`update_business_name` · `prepare_search_visibility`

### Commerce — `commerce:write`
`list_services` · `create_service` · `list_products` · `create_product` ·
`get_commerce_overview` · `prepare_publish_product`

### Customer data — `crm:read` / `crm:write`
`list_leads` · `list_bookings` · `list_contacts` (read) · `crm_update` (write)

Real people's data. Only touch these when the human asked for that specific
thing, never as background context-gathering.

### Domains — `domain:write`
`list_domains` (read is `site:read`) · `connect_domain` · `set_primary_domain`.
Connecting an existing domain only; no purchases over MCP.

### Access — `access:write`
`list_access` · `prepare_grant_access`

### Communications — `communications:write`
`list_sendable_documents` · `prepare_send_document`

### Generation — `ai:generate`
`generate_image` — spends the owner's credits. Ask first, every time.

### Workspace — `workspace:write`
`create_site` (unattended: a new draft is reversible) ·
`prepare_create_company` (confirm-gated: a company is a billing subject)

## Confirm-gated actions

Anything irreversible or outward-facing runs a two-step handshake:

```
prepare_*  →  the human approves the review card  →  confirm_pending_action
```

Gated: `prepare_publish`, `prepare_unpublish`, `prepare_search_visibility`,
`prepare_publish_product`, `prepare_send_document`, `prepare_grant_access`,
`prepare_create_company`.

`prepare_*` creates a review and changes nothing. `confirm_pending_action` is
redeemable **only from a press in the card** — you cannot call it to complete
your own plan. Do not look for a second route to the same effect; there isn't
one, and trying is the failure this design exists to catch.

A request to *edit* is never a request to publish. Publishing needs an explicit
ask in the current conversation ("publish", "gå live", "lägg ut det").

## Prompts

The server also ships guided prompts the human can invoke: `write_news_post`,
`prep_for_launch`, `seasonal_update`. They orient you first
(`get_site_overview`) and end by asking the human before anything is applied.

## Failure modes

| Symptom | Cause | What to do |
| --- | --- | --- |
| `Missing the "<scope>" permission.` | the owner did not grant it | Name the refused tool and scope, and stop. Offer to let them widen it in AI-integrationer; never work around it. |
| Advanced tool denied but `update_section_text` works | no Labs/advanced-editor grant | Fall back to `update_section_text`. This is an ordinary workspace, not a bug. |
| `publish_site` fails | deprecated by design | Use `prepare_publish` and let the human approve. |
| A `prepare_*` result never completes | the human has not pressed approve | Tell them the approval is theirs to give. The action ref expires. |
| `clientRev` conflict | somebody edited in the browser meanwhile | Re-read with `get_section_json` and re-apply. Never retry with a stale rev. |
| A named tool does not exist on the server | server older or newer than this skill | Say so plainly. Never substitute a tool that merely sounds similar. |
| An edit is reported but a read does not show it | it did not land | Report the failure. Never claim a write you did not verify by reading it back. |
