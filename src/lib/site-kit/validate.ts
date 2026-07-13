// ---------------------------------------------------------------------------
// Site Kit — offline validation for an agent/dev-authored site package.
//
// A "site package" is a PortableSiteV1 payload (the exact format
// `portability.exportSite` emits and `portability.importSite` /
// `importSiteBundle` consume) plus its asset/font blobs. This module lets a
// coding agent (Claude Code, Codex, …) validate a hand-built package BEFORE
// upload, with readable, path-addressed errors — instead of discovering
// problems as a rolled-back Convex transaction or silently-dropped refs.
//
// It deliberately reuses the REAL validators (`portableSiteV1`,
// `sectionContent`, `checkCaps`, `isValidVariant`, `collectAssetIds`) so it
// cannot drift from what the import actually enforces. Two gaps remain by
// design, and are re-checked server-side on import: image byte/dimension
// screening (needs the real bytes) and plan/site caps of the target workspace.
//
// Pure: no fs/network. The CLI wrapper (`scripts/site-kit.ts`) does the I/O.
// ---------------------------------------------------------------------------

import { validate, ValidationError } from "convex-helpers/validators";
import {
  portableSiteV1,
  type PortableSiteV1,
} from "../../convex/model/portable";
import { sectionContent } from "../../convex/model/sections";
import { checkCaps } from "../portability/caps";
import { collectAssetIds } from "../portability/assets";
import { isValidVariant } from "../sections/registry";
import type { SectionType } from "../../convex/model/sections";
import { LOCALES } from "../../convex/model/business";
import { validateRedirectMap } from "../site/redirects";

const NEWS_SEGMENT = "news";

export type SiteKitIssue = {
  level: "error" | "warning";
  /** JSON-path-ish locator, e.g. `sections[3].content.items[0].title`. */
  path: string;
  message: string;
};

export type SiteKitReport = {
  /** True when there are no `error`-level issues (warnings allowed). */
  ok: boolean;
  issues: SiteKitIssue[];
};

/** exportIds/tmpIds become zip entry names — keep them filename/URL-safe. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function err(issues: SiteKitIssue[], path: string, message: string): void {
  issues.push({ level: "error", path, message });
}
function warn(issues: SiteKitIssue[], path: string, message: string): void {
  issues.push({ level: "warning", path, message });
}

function checkUnique(
  issues: SiteKitIssue[],
  ids: readonly string[],
  pathPrefix: string,
  what: string,
): Set<string> {
  const seen = new Set<string>();
  ids.forEach((id, i) => {
    if (seen.has(id)) err(issues, `${pathPrefix}[${i}]`, `duplicate ${what} "${id}"`);
    seen.add(id);
  });
  return seen;
}

/**
 * Validate a parsed site package. `assetFileNames`, when given (dir/zip mode),
 * is the set of blob file names present under `assets/` — each declared asset
 * must have a matching `<exportId>.<ext>` file.
 */
export function validateSitePackage(
  payload: unknown,
  opts?: {
    assetFileNames?: ReadonlySet<string>;
    fontFileNames?: ReadonlySet<string>;
  },
): SiteKitReport {
  const issues: SiteKitIssue[] = [];

  // 1. Envelope — the exact validator the Convex import boundary uses.
  try {
    validate(portableSiteV1, payload, { throw: true });
  } catch (e) {
    if (e instanceof ValidationError) {
      err(issues, e.path ?? "$", `${e.message}`);
      return { ok: false, issues };
    }
    throw e;
  }
  const site = payload as PortableSiteV1;

  // 2. Anti-abuse caps (same ceilings the import enforces).
  const cap = checkCaps({
    pages: site.pages,
    sections: site.sections,
    folders: site.folders,
    fonts: site.fonts,
    services: site.services,
    assets: site.assets,
    contentCollections: site.contentCollections,
    redirects: site.redirects,
  });
  if (cap) err(issues, cap === "too_many_redirects" ? "redirects" : "$", `payload exceeds import cap: ${cap}`);

  // 3. Id uniqueness + shape.
  const pageIds = checkUnique(issues, site.pages.map((p) => p.tmpId), "pages", "page tmpId");
  const folderIds = checkUnique(issues, site.folders.map((f) => f.tmpId), "folders", "folder tmpId");
  const fontIds = checkUnique(issues, site.fonts.map((f) => f.tmpId), "fonts", "font tmpId");
  checkUnique(
    issues,
    (site.services ?? []).map((s) => s.tmpId),
    "services",
    "service tmpId",
  );
  const collectionIds = checkUnique(
    issues,
    (site.contentCollections ?? []).map((c) => c.tmpId),
    "contentCollections",
    "collection tmpId",
  );
  const assetIds = checkUnique(issues, site.assets.map((a) => a.exportId), "assets", "asset exportId");
  site.assets.forEach((a, i) => {
    if (!SAFE_ID.test(a.exportId)) {
      err(issues, `assets[${i}].exportId`, `"${a.exportId}" must match ${SAFE_ID} (it becomes a file name)`);
    }
  });

  // 4. Slugs: unique; at most one home ("").
  const slugSeen = new Map<string, number>();
  site.pages.forEach((p, i) => {
    const prev = slugSeen.get(p.slug);
    if (prev !== undefined) err(issues, `pages[${i}].slug`, `duplicate slug "${p.slug}" (also pages[${prev}])`);
    slugSeen.set(p.slug, i);
  });
  const homeCount = site.pages.filter((p) => p.slug === "").length;
  if (site.pages.length > 0 && homeCount === 0) {
    warn(issues, "pages", 'no home page (slug "") — import will promote the lowest-order page to home');
  }

  const livePaths = new Set<string>(["", NEWS_SEGMENT]);
  for (const page of site.pages) {
    if (page.pageType === "post") livePaths.add(`${NEWS_SEGMENT}/${page.slug}`);
    else livePaths.add(page.slug);
  }
  const basePaths = [...livePaths];
  for (const locale of site.site.languages ?? [site.site.language]) {
    if (locale === site.site.language) continue;
    for (const path of basePaths) {
      livePaths.add(path === "" ? locale : `${locale}/${path}`);
    }
  }
  const redirectValidation = validateRedirectMap(site.redirects ?? [], {
    livePaths,
    targetPaths: livePaths,
    locales: LOCALES,
    reservedPaths: [NEWS_SEGMENT],
  });
  redirectValidation.issues.forEach((issue) =>
    err(issues, `redirects[${issue.index}].${issue.field}`, issue.code),
  );

  // 5. Cross-references.
  site.pages.forEach((p, i) => {
    if (p.folderTmpId !== undefined && !folderIds.has(p.folderTmpId)) {
      err(issues, `pages[${i}].folderTmpId`, `unknown folder "${p.folderTmpId}"`);
    }
    if (p.collectionTmpId !== undefined && !collectionIds.has(p.collectionTmpId)) {
      err(issues, `pages[${i}].collectionTmpId`, `unknown collection "${p.collectionTmpId}"`);
    }
    if (p.pageType === "post" && p.collectionTmpId === undefined) {
      warn(issues, `pages[${i}]`, "post without collectionTmpId is hidden in the Pages panel");
    }
  });
  site.folders.forEach((f, i) => {
    if (f.parentTmpId !== undefined && !folderIds.has(f.parentTmpId)) {
      err(issues, `folders[${i}].parentTmpId`, `unknown parent folder "${f.parentTmpId}"`);
    }
  });
  if (site.fontsAssignment) {
    for (const key of ["headingTmpId", "bodyTmpId"] as const) {
      const id = site.fontsAssignment[key];
      if (id !== undefined && !fontIds.has(id)) {
        err(issues, `fontsAssignment.${key}`, `unknown font "${id}"`);
      }
    }
  }
  site.fonts.forEach((f, i) => {
    if (f.source === "upload" && (!f.files || f.files.length === 0)) {
      err(issues, `fonts[${i}]`, 'source "upload" requires files[]');
    }
  });

  // 6. Sections: page ref, content union, type match, variant allow-list.
  site.sections.forEach((s, i) => {
    if (!pageIds.has(s.pageTmpId)) {
      err(issues, `sections[${i}].pageTmpId`, `unknown page "${s.pageTmpId}"`);
    }
    try {
      validate(sectionContent, s.content, { throw: true, _pathPrefix: `sections[${i}].content` });
    } catch (e) {
      if (e instanceof ValidationError) {
        err(issues, e.path ?? `sections[${i}].content`, e.message);
        return; // content shape unknown — skip dependent checks for this row
      }
      throw e;
    }
    const contentType = (s.content as { type: SectionType }).type;
    if (contentType !== s.type) {
      err(issues, `sections[${i}]`, `type "${s.type}" does not match content.type "${contentType}"`);
    } else if (!isValidVariant(s.type, s.variant)) {
      warn(issues, `sections[${i}].variant`, `unknown variant "${s.variant}" for "${s.type}" — import coerces it to the default`);
    }
    if (contentType === "hero" && "bgVideo" in (s.content as object)) {
      err(issues, `sections[${i}].content.bgVideo`, "self-hosted video is not portable in Site Kit v0.1");
    }
    if (contentType === "video") {
      const video = s.content as { provider: string; video?: unknown; poster?: unknown };
      if (video.provider === "upload" || video.video !== undefined || video.poster !== undefined) {
        err(issues, `sections[${i}].content`, "self-hosted video is not portable in Site Kit v0.1; use YouTube or Vimeo");
      }
    }
  });

  // 7. Asset references: every ref must resolve, or the import silently drops
  //    it (remapAssetRefs removes refs whose image is missing).
  const referenced = new Set<string>();
  const ref = (id: string | undefined, path: string) => {
    if (id === undefined) return;
    referenced.add(id);
    if (!assetIds.has(id)) err(issues, path, `references unknown asset "${id}" — the ref would be dropped on import`);
  };
  ref(site.site.logoAssetId, "site.logoAssetId");
  ref(site.site.faviconAssetId, "site.faviconAssetId");
  site.pages.forEach((p, i) => ref(p.featuredImage?.assetId, `pages[${i}].featuredImage.assetId`));
  site.sections.forEach((s, i) => {
    for (const id of collectAssetIds(s.content)) ref(id, `sections[${i}].content`);
  });
  site.assets.forEach((a, i) => {
    if (!referenced.has(a.exportId)) {
      warn(issues, `assets[${i}]`, `asset "${a.exportId}" is never referenced`);
    }
  });

  // 8. Dir/zip mode: every asset needs exactly one blob file (two candidates
  //    would make pack.ts pick one silently), and every uploaded font face
  //    needs its `<tmpId>__<index>.<ext>` file.
  if (opts?.assetFileNames) {
    site.assets.forEach((a, i) => {
      const matches = [...opts.assetFileNames!].filter((n) => n.startsWith(`${a.exportId}.`));
      if (matches.length === 0) {
        err(issues, `assets[${i}]`, `no assets/${a.exportId}.<ext> file in the package`);
      } else if (matches.length > 1) {
        err(issues, `assets[${i}]`, `ambiguous blobs for "${a.exportId}": ${matches.join(", ")} — keep exactly one`);
      }
    });
  }
  if (opts?.fontFileNames) {
    site.fonts.forEach((f, fi) => {
      if (f.source !== "upload" || !f.files) return;
      f.files.forEach((_, i) => {
        const key = `${f.tmpId}__${i}`;
        const matches = [...opts.fontFileNames!].filter((n) => n.startsWith(`${key}.`));
        if (matches.length === 0) {
          err(issues, `fonts[${fi}].files[${i}]`, `no fonts/${key}.<ext> file in the package`);
        } else if (matches.length > 1) {
          err(issues, `fonts[${fi}].files[${i}]`, `ambiguous blobs for "${key}": ${matches.join(", ")} — keep exactly one`);
        }
      });
    });
  }

  return { ok: !issues.some((i) => i.level === "error"), issues };
}
