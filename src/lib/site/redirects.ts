// ---------------------------------------------------------------------------
// Site-relative URL redirects - the concrete mechanism behind the "keep your
// Google ranking" promise on /migrate. When a business moves to (or restructures
// on) SnabbSajt, an old URL Google already indexed must not 404: it 308s to the
// current page. These pure helpers normalise + match paths and are shared by the
// Convex mutations (that store redirects), the publish snapshot, and the public
// route (that serves them) so all three agree on what a path "is".
// ---------------------------------------------------------------------------

/** A materialised redirect as it lives in the published snapshot. */
export type SnapshotRedirect = { from: string; to: string };
export type PortableRedirect = { fromPath: string; toPath: string };

export type RedirectValidationCode =
  | "REDIRECT_EMPTY_FROM"
  | "REDIRECT_SELF_LOOP"
  | "REDIRECT_FROM_RESERVED"
  | "REDIRECT_FROM_LOCALE_PREFIXED"
  | "REDIRECT_FROM_IS_PAGE"
  | "REDIRECT_TARGET_MISSING"
  | "REDIRECT_DUPLICATE_SOURCE"
  | "REDIRECT_CYCLE";

export type RedirectValidationIssue = {
  index: number;
  field: "fromPath" | "toPath";
  code: RedirectValidationCode;
};

/**
 * Normalise a user- or system-supplied path to the canonical site-relative form
 * we store and compare: no origin, no query/hash, no leading/trailing slashes,
 * collapsed inner slashes, lowercase. A full URL (someone pastes their old Wix
 * address) is reduced to its pathname. The home path normalises to "".
 */
export function normalizeRedirectPath(input: string | undefined | null): string {
  let s = (input ?? "").trim();
  if (s === "") return "";
  // If a full URL was pasted, keep only its path.
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch {
      // leave as-is; the slash/percent handling below still applies
    }
  }
  // Drop query string / hash fragment.
  s = s.split(/[?#]/)[0];
  // Trim + collapse slashes, lowercase for case-insensitive matching.
  s = s.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
  return s.toLowerCase();
}

/**
 * Find the final destination for a requested path among a snapshot's redirects,
 * or null if none matches. Both sides are normalised so "/About-Us/" and
 * "about-us" match.
 *
 * Resolution follows the chain: if A→B and B→C both exist, requesting A returns
 * C directly (one 308 instead of the browser hopping A→B→C). A `visited` set
 * caps the walk so a self-loop (x→x), a 2-cycle (A→B, B→A) or any longer cycle
 * can never hang here or bounce the browser forever - a cyclic path resolves to
 * null and the public route 404s instead of looping.
 */
export function matchRedirect(
  redirects: readonly SnapshotRedirect[] | undefined,
  requestedPath: string | undefined | null,
): string | null {
  if (!redirects || redirects.length === 0) return null;
  const start = normalizeRedirectPath(requestedPath);
  // Index by normalised `from` so chain resolution is O(1) per hop. A later
  // duplicate `from` (shouldn't happen - stored uniquely) simply wins.
  const byFrom = new Map<string, string>();
  for (const r of redirects) {
    byFrom.set(normalizeRedirectPath(r.from), normalizeRedirectPath(r.to));
  }
  const first = byFrom.get(start);
  if (first === undefined) return null; // requested path is not a redirect source
  const visited = new Set<string>([start]);
  let cur = first;
  while (true) {
    if (cur === start || visited.has(cur)) return null; // cycle → no redirect
    const next = byFrom.get(cur);
    if (next === undefined) return cur; // terminal: a real destination
    visited.add(cur);
    cur = next;
  }
}

/**
 * Would adding `from → to` create a redirect cycle among `existing`? Walks the
 * chain starting at the proposed `to` (as if it were itself a `from`); if it
 * ever arrives back at `from`, the new edge closes a loop and must be rejected.
 * The edge being replaced (an upsert onto the same `from`) is ignored so
 * re-pointing an existing redirect never false-positives. All paths are
 * normalised before comparison.
 */
export function redirectWouldCycle(
  existing: readonly SnapshotRedirect[],
  from: string,
  to: string,
): boolean {
  const src = normalizeRedirectPath(from);
  const byFrom = new Map<string, string>();
  for (const r of existing) {
    const f = normalizeRedirectPath(r.from);
    if (f === src) continue; // the edge we're upserting doesn't count against us
    byFrom.set(f, normalizeRedirectPath(r.to));
  }
  let cur = normalizeRedirectPath(to);
  const visited = new Set<string>();
  while (true) {
    if (cur === src) return true; // chain loops back to `from` → cycle
    if (visited.has(cur)) return false; // a pre-existing loop that excludes `from`
    visited.add(cur);
    const next = byFrom.get(cur);
    if (next === undefined) return false; // chain ends at a real page → no cycle
    cur = next;
  }
}

/**
 * Validate and normalize a complete redirect graph. Redirect chains are valid
 * only when they terminate at a real route in `targetPaths`; source paths may
 * never shadow a live route. This pure boundary is shared by offline Site Kit
 * validation and the transactional Convex upsert boundary.
 */
export function validateRedirectMap(
  redirects: readonly PortableRedirect[],
  options: {
    livePaths: ReadonlySet<string>;
    targetPaths?: ReadonlySet<string>;
    locales: readonly string[];
    reservedPaths: readonly string[];
  },
): { redirects: PortableRedirect[]; issues: RedirectValidationIssue[] } {
  const normalized = redirects.map((redirect) => ({
    fromPath: normalizeRedirectPath(redirect.fromPath),
    toPath: normalizeRedirectPath(redirect.toPath),
  }));
  const targetPaths = options.targetPaths ?? options.livePaths;
  const issues: RedirectValidationIssue[] = [];
  const firstSourceIndex = new Map<string, number>();

  normalized.forEach((redirect, index) => {
    const { fromPath, toPath } = redirect;
    if (fromPath === "") {
      issues.push({ index, field: "fromPath", code: "REDIRECT_EMPTY_FROM" });
    } else if (fromPath === toPath) {
      issues.push({ index, field: "toPath", code: "REDIRECT_SELF_LOOP" });
    }
    if (options.reservedPaths.includes(fromPath) || options.locales.includes(fromPath)) {
      issues.push({ index, field: "fromPath", code: "REDIRECT_FROM_RESERVED" });
    }
    const firstSegment = fromPath.split("/")[0];
    if (fromPath.includes("/") && options.locales.includes(firstSegment)) {
      issues.push({ index, field: "fromPath", code: "REDIRECT_FROM_LOCALE_PREFIXED" });
    }
    if (options.livePaths.has(fromPath)) {
      issues.push({ index, field: "fromPath", code: "REDIRECT_FROM_IS_PAGE" });
    }
    if (firstSourceIndex.has(fromPath)) {
      issues.push({ index, field: "fromPath", code: "REDIRECT_DUPLICATE_SOURCE" });
    } else {
      firstSourceIndex.set(fromPath, index);
    }
  });

  const bySource = new Map(normalized.map((redirect) => [redirect.fromPath, redirect.toPath]));
  normalized.forEach((redirect, index) => {
    const visited = new Set<string>([redirect.fromPath]);
    let current = redirect.toPath;
    while (bySource.has(current)) {
      if (visited.has(current)) {
        issues.push({ index, field: "toPath", code: "REDIRECT_CYCLE" });
        return;
      }
      visited.add(current);
      current = bySource.get(current)!;
    }
    if (!targetPaths.has(current)) {
      issues.push({ index, field: "toPath", code: "REDIRECT_TARGET_MISSING" });
    }
  });

  return { redirects: normalized, issues };
}
