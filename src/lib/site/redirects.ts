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

export function normalizeRedirectPath(input: string | undefined | null): string {
  let value = (input ?? "").trim();
  if (value === "") return "";
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      // Continue with the inert string. The validator never fetches it.
    }
  }
  value = value.split(/[?#]/)[0];
  return value.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/").toLowerCase();
}

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
    if (fromPath === "") issues.push({ index, field: "fromPath", code: "REDIRECT_EMPTY_FROM" });
    else if (fromPath === toPath) issues.push({ index, field: "toPath", code: "REDIRECT_SELF_LOOP" });
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
