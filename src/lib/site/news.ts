import type { Locale } from "../i18n";
import type { SnapshotPage } from "../../convex/model/snapshot";

/** Published posts from a site snapshot, newest-first by stable publication
 *  date. A post with no `publishedAt` (legacy / restored pre-`publishedAt`
 *  snapshots) sorts as the OLDEST - never the newest - and a slug tiebreaker
 *  keeps equal-date order deterministic across renders so the news index and
 *  the article prev/next nav never flicker or disagree. */
export function publishedPostsNewestFirst(
  pages: SnapshotPage[],
): SnapshotPage[] {
  return pages
    .filter((p) => p.pageType === "post")
    .sort((a, b) => {
      const byDate = (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
      return byDate !== 0 ? byDate : a.slug.localeCompare(b.slug);
    });
}

/** Draft posts that would be eligible for the next full publish. Held pages
 *  are deliberately absent from preview: showing a changed held article in the
 *  index would promise content the owner explicitly excluded. New drafts have
 *  no first-publish date and therefore sort behind already-live articles;
 *  slug is the deterministic tie-breaker in both groups. */
export function draftPostsNewestFirst<
  P extends {
    slug: string;
    pageType?: string;
    excludeFromPublish?: boolean;
    firstPublishedAt?: number;
  },
>(pages: readonly P[]): P[] {
  return pages
    .filter((page) => page.pageType === "post" && page.excludeFromPublish !== true)
    .sort((a, b) => {
      const byDate = (b.firstPublishedAt ?? 0) - (a.firstPublishedAt ?? 0);
      return byDate !== 0 ? byDate : a.slug.localeCompare(b.slug);
    });
}

// The reserved URL segment for the news/blog feature. Published posts live at
// `/<locale?>/news/<slug>` and the index at `/<locale?>/news`. Shared by the
// public router (parsePublicRoute), the sitemap and the editor link builders so
// the path can never drift between them.
export const NEWS_SEGMENT = "news";

export type DraftNewsRoute =
  | { kind: "news-index"; pageSlug: "" }
  | { kind: "post"; pageSlug: string };

/** Draft/share-preview equivalent of the public news route parser. Ordinary
 *  pages return null so the existing page/careers parser remains authoritative
 *  for every other path. */
export function parseDraftNewsRoute(path: readonly string[]): DraftNewsRoute | null {
  if (path[0] !== NEWS_SEGMENT) return null;
  if (path.length === 1) return { kind: "news-index", pageSlug: "" };
  if (path.length === 2 && path[1]) return { kind: "post", pageSlug: path[1] };
  return null;
}

/** Format a post's publication date for display. Always rendered in UTC so the
 *  server and client agree (no hydration drift) and the date is stable
 *  regardless of the viewer's timezone. */
export function formatPostDate(ms: number, lang: Locale): string {
  return new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : lang === "pl" ? "pl-PL" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

/** Plain-language public-site labels for the news pages (not admin i18n). */
export function newsLabels(lang: Locale): {
  index: string;
  empty: string;
  back: string;
  prev: string;
  next: string;
  read: string;
} {
  return lang === "sv"
    ? {
        index: "Nyheter",
        empty: "Inga nyheter än.",
        back: "Alla nyheter",
        prev: "Föregående",
        next: "Nästa",
        read: "Läs artikel",
      }
    : lang === "pl"
      ? {
          index: "Aktualności",
          empty: "Brak aktualności.",
          back: "Wszystkie aktualności",
          prev: "Poprzedni",
          next: "Następny",
          read: "Czytaj artykuł",
        }
      : {
          index: "News",
          empty: "No news yet.",
          back: "All news",
          prev: "Previous",
          next: "Next",
          read: "Read article",
        };
}
