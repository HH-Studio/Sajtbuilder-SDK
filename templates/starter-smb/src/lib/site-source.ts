import { cache } from "react";
import {
  createDeliveryClient,
  DeliveryError,
  renderModelFromPackage,
  renderModelFromPublished,
  type RenderSite,
} from "@snabbsajt/site-kit";
import { site } from "@/site";

// ---------------------------------------------------------------------------
// Where this deployment's content comes from.
//
//   No env vars set   → `src/site.ts`, the site you are authoring locally.
//   Delivery env set  → the PUBLISHED snapshot of the SnabbSajt site, fetched
//                       at build time.
//
// That is the whole round-trip: you author here, push into SnabbSajt, your
// client edits and presses Publish, SnabbSajt calls your deploy hook, this
// build fetches their words, and your components render them on your host.
//
// Set in your host's SERVER environment (never `NEXT_PUBLIC_`, never a client
// bundle — the token is read-only and single-site, but it is still a
// credential):
//
//   SNABBSAJT_SITE_ID=<site id, shown beside the key in SnabbSajt>
//   SNABBSAJT_DELIVERY_TOKEN=sajt_pub_…
//   SNABBSAJT_API_URL=https://<deployment>.convex.site   # optional override
// ---------------------------------------------------------------------------

/** Fetch published content at BUILD time, not per request.
 *
 *  A published snapshot only changes when someone publishes, and publishing
 *  fires your deploy hook — so a per-request fetch would buy nothing and spend
 *  the endpoint's rate limit on every visitor. `force-cache` is what keeps
 *  these routes statically prerendered under Next's default `no-store` fetch. */
const buildTimeFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, { ...init, cache: "force-cache" });

function readDeliveryEnv():
  | { siteId: string; token: string; baseUrl?: string }
  | undefined {
  const siteId = process.env.SNABBSAJT_SITE_ID;
  const token = process.env.SNABBSAJT_DELIVERY_TOKEN;
  const baseUrl = process.env.SNABBSAJT_API_URL;

  if (!siteId && !token) return undefined;
  // Half-configured is the dangerous state: it would silently deploy the
  // checked-in demo content to a customer's domain. Fail the build instead.
  if (!siteId || !token) {
    throw new Error(
      "SnabbSajt delivery is half-configured: set BOTH SNABBSAJT_SITE_ID and SNABBSAJT_DELIVERY_TOKEN, or neither (which renders src/site.ts).",
    );
  }
  return { siteId, token, ...(baseUrl ? { baseUrl } : {}) };
}

/** The site this deployment renders. Deduped per render pass, so the layout,
 *  the page and `generateStaticParams` share one fetch. */
export const loadSite = cache(async (): Promise<RenderSite> => {
  const env = readDeliveryEnv();
  if (!env) return renderModelFromPackage(site);

  const client = createDeliveryClient({ ...env, fetch: buildTimeFetch });
  try {
    const published = await client.getPublishedSite();
    const model = renderModelFromPublished(published);
    console.log(
      `[snabbsajt] rendering published version ${model.versionId} of ${model.businessName}`,
    );
    return model;
  } catch (cause) {
    // Say which failure this is. "Publish it once" and "your token is wrong"
    // look identical in a build log otherwise, and the first one is not a bug.
    if (cause instanceof DeliveryError) {
      throw new Error(
        `[snabbsajt] delivery failed (${cause.reason}) reading ${client.endpoint}: ${cause.message}`,
      );
    }
    throw cause;
  }
});
