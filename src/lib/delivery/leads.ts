// ---------------------------------------------------------------------------
// The client half of `POST /v1/sites/{id}/leads` (plan P0-2026-08-19 slice 2.5).
//
// An agency renders its client's contact form in its OWN app, so the hosted
// form's `/lead` route is not reachable from there. Until this helper existed,
// every agency hand-rolled the POST — and each hand-rolled one had to remember
// the consent flag, the honeypot field and which failures mean "fix your
// wiring" rather than "try again". Getting `consent` wrong is a 400 on every
// submission, so the form silently collected nothing.
//
// This is deliberately NOT part of `createDeliveryClient`: reads carry a
// delivery token and happen at build time, a lead carries no credential and
// happens when a visitor presses a button. Sharing a constructor would invite
// somebody to ship a read token to the browser.
// ---------------------------------------------------------------------------

import { DeliveryError, resolveDeliveryBaseUrl } from "./client";

/** Values a form can hold. Numbers and booleans are stringified server-side,
 *  so a checkbox does not have to be converted at the call site. */
export type LeadFieldValue = string | number | boolean;

export type SubmitLeadOptions = {
  /** The site's id, the same one `createDeliveryClient` reads. */
  siteId: string;
  /** The visitor's answers, keyed by the label the form showed. */
  fields: Record<string, LeadFieldValue>;
  /** Proof the visitor agreed to be contacted. The endpoint refuses anything
   *  else, so this helper refuses it locally with a message that names the
   *  cause rather than letting a 400 arrive with no explanation. */
  consent: boolean;
  /** Which kind of form this was. Defaults to `contact`. */
  sectionType?: string;
  /** The page the form sits on, for the Förfrågningar row. */
  pageSlug?: string;
  /** Free-text origin, e.g. a campaign name. */
  source?: string;
  /** The honeypot input's value. Send it even when empty: a filled one is how
   *  the shared spam guard drops a bot without telling it so. */
  hp?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
};

/** Send one lead. Resolves when SnabbSajt accepted it; throws `DeliveryError`
 *  otherwise, with `reason` saying which of the four things went wrong. */
export async function submitLead(options: SubmitLeadOptions): Promise<void> {
  const { siteId, fields, consent } = options;
  if (!siteId) throw new TypeError("submitLead: `siteId` is required.");
  if (consent !== true) {
    throw new DeliveryError(
      "consent_required",
      "submitLead: `consent` must be true. Ask the visitor for it in your form and pass the answer through.",
    );
  }
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new TypeError("submitLead: no global fetch available — pass `fetch` explicitly.");
  }
  // Same vetting the read path does: https only, `SNABBSAJT_API_URL` honoured.
  // A lead carries no token but it does carry a visitor's name and number.
  const baseUrl = resolveDeliveryBaseUrl(options.baseUrl);
  const url = `${baseUrl}/v1/sites/${encodeURIComponent(siteId)}/leads`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        consent: true,
        fields,
        sectionType: options.sectionType ?? "contact",
        ...(options.pageSlug ? { pageSlug: options.pageSlug } : {}),
        ...(options.source ? { source: options.source } : {}),
        ...(options.hp !== undefined ? { hp: options.hp } : {}),
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new DeliveryError(
      "network",
      `Could not reach ${baseUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (response.ok) return;

  let code: string | undefined;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string") code = body.error;
  } catch {
    /* the status is the authority; a missing body only costs detail */
  }
  // A lead is submitted by a visitor, so every message here is written for the
  // DEVELOPER reading their own logs: each one names what to change.
  if (response.status === 404) {
    throw new DeliveryError(
      "not_found",
      "No published site with that id. Check `siteId`, and publish the hemsida once before the form goes live.",
      404,
    );
  }
  if (response.status === 429) {
    throw new DeliveryError(
      "rate_limited",
      "Too many leads from this site in a short window. The visitor should try again shortly.",
      429,
    );
  }
  if (code === "consent_required") {
    throw new DeliveryError(
      "consent_required",
      "SnabbSajt refused the lead for missing consent.",
      response.status,
    );
  }
  if (response.status === 400) {
    throw new DeliveryError(
      "invalid",
      "The lead was rejected. `fields` must be a flat object of strings, numbers or booleans.",
      400,
    );
  }
  throw new DeliveryError("network", `Lead submission failed (${response.status}).`, response.status);
}
