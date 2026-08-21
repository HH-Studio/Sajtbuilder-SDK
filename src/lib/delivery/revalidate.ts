// ---------------------------------------------------------------------------
// The receiving half of "publishing pokes their host, cheaply first".
//
// `convex/agencyPreview.ts:revalidateThenDeploy` POSTs to
// `/api/snabbsajt/revalidate` on the agency's own deployment the moment a
// publish lands, and only THEN fires the deploy hook. Dropping a cache tag
// takes milliseconds and costs nothing; a Vercel rebuild takes minutes and
// costs money. Without this route the fast half 404s on every publish and every
// site pays for the slow one.
//
// Three decisions worth stating:
//
//  1. **No framework import.** Site Kit does not depend on Next.js, so the app
//     passes `revalidateTag` (and optionally `revalidatePath`) in. That also
//     makes the handler testable with no framework at all, which is how the
//     test beside this file drives it.
//  2. **No shared secret.** SnabbSajt sends no credential, so a required one
//     would turn every publish into a 401 and quietly put the deploy hook back
//     in charge. The route carries no data and reveals nothing: the worst a
//     stranger achieves is making the deployment refetch content that is
//     public anyway. Rate limiting belongs to the host, not to this handler.
//  3. **It answers 200 even when nothing was cached.** The caller swallows the
//     result either way, and an error status would only read as a broken
//     integration in someone's log.
// ---------------------------------------------------------------------------

/** The cache tag Site Kit revalidates by default. Tag the fetches that read
 *  your published content with it and one publish refreshes all of them. */
export const SNABBSAJT_CACHE_TAG = "snabbsajt";

/** A per-site tag, for a deployment that serves more than one hemsida. */
export function snabbsajtSiteTag(websiteId: string): string {
  return `${SNABBSAJT_CACHE_TAG}:${websiteId}`;
}

/** What SnabbSajt sends. The body is checked rather than trusted: a stray POST
 *  from something else must not be mistaken for a publish. */
export type RevalidateRequestBody = {
  source: "snabbsajt";
  event: "publish";
};

export type RevalidateHandlerOptions = {
  /** `revalidateTag` from `next/cache`, or any equivalent. */
  revalidateTag: (tag: string) => void | Promise<void>;
  /** Tags to drop. Defaults to the single shared tag. */
  tags?: readonly string[];
  /** `revalidatePath` from `next/cache`, when the app caches whole routes. */
  revalidatePath?: (path: string) => void | Promise<void>;
  /** Routes to drop alongside the tags. Empty by default. */
  paths?: readonly string[];
};

export type RevalidateResult = {
  ok: boolean;
  revalidated?: { tags: string[]; paths: string[] };
  error?: "method_not_allowed" | "invalid";
};

function json(body: RevalidateResult, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Build the route handler for `app/api/snabbsajt/revalidate/route.ts`.
 *
 * ```ts
 * import { revalidateTag } from "next/cache";
 * import { createRevalidateHandler } from "@snabbsajt/site-kit";
 *
 * export const POST = createRevalidateHandler({ revalidateTag });
 * ```
 */
export function createRevalidateHandler(
  options: RevalidateHandlerOptions,
): (request: Request) => Promise<Response> {
  const tags = options.tags?.length ? [...options.tags] : [SNABBSAJT_CACHE_TAG];
  const paths = options.paths ? [...options.paths] : [];
  return async function handleRevalidate(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }
    let body: Partial<RevalidateRequestBody> | null = null;
    try {
      body = (await request.json()) as Partial<RevalidateRequestBody>;
    } catch {
      return json({ ok: false, error: "invalid" }, 400);
    }
    if (!body || body.source !== "snabbsajt") {
      return json({ ok: false, error: "invalid" }, 400);
    }
    for (const tag of tags) await options.revalidateTag(tag);
    if (options.revalidatePath) {
      for (const path of paths) await options.revalidatePath(path);
    }
    return json({ ok: true, revalidated: { tags, paths } }, 200);
  };
}
