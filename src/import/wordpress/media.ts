import type { WxrDocument, WxrItem } from "./model";

export type WxrMediaIndex = {
  attachments: Map<string, WxrItem>;
  missingFeaturedMedia: Array<{ itemSourceId: string; mediaSourceId: string }>;
};

export function indexWxrMedia(document: WxrDocument): WxrMediaIndex {
  const attachments = new Map(
    document.items
      .filter((item) => item.type === "attachment")
      .map((item) => [item.sourceId, item]),
  );
  const missingFeaturedMedia = document.items.flatMap((item) => {
    const mediaSourceId = item.featuredMediaSourceId;
    return mediaSourceId && !attachments.has(mediaSourceId)
      ? [{ itemSourceId: item.sourceId, mediaSourceId }]
      : [];
  });
  return { attachments, missingFeaturedMedia };
}
