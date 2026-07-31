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

// The reserved URL segment for the news/blog feature. Published posts live at
// `/<locale?>/news/<slug>` and the index at `/<locale?>/news`. Shared by the
// public router (parsePublicRoute), the sitemap and the editor link builders so
// the path can never drift between them.
export const NEWS_SEGMENT = "news";

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
} {
  return lang === "sv"
    ? {
        index: "Nyheter",
        empty: "Inga nyheter än.",
        back: "Alla nyheter",
        prev: "Föregående",
        next: "Nästa",
      }
    : lang === "pl"
      ? {
          index: "Aktualności",
          empty: "Brak aktualności.",
          back: "Wszystkie aktualności",
          prev: "Poprzedni",
          next: "Następny",
        }
      : {
          index: "News",
          empty: "No news yet.",
          back: "All news",
          prev: "Previous",
          next: "Next",
        };
}
