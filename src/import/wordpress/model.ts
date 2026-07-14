export type WxrAuthor = {
  id: string;
  login?: string;
  displayName?: string;
};

export type WxrTerm = {
  id: string;
  taxonomy: "category" | "tag" | "nav_menu" | string;
  slug: string;
  name: string;
};

export type WxrItemTerm = {
  taxonomy: string;
  slug: string;
  name: string;
};

export type WxrSeo = {
  title?: string;
  description?: string;
  canonical?: string;
};

export type WxrItem = {
  sourceId: string;
  type: string;
  status: string;
  title: string;
  slug: string;
  link?: string;
  content: string;
  excerpt?: string;
  creator?: string;
  parentSourceId?: string;
  menuOrder?: number;
  publishedAt?: string;
  attachmentUrl?: string;
  featuredMediaSourceId?: string;
  terms: WxrItemTerm[];
  metadata: Record<string, string>;
  seo?: WxrSeo;
};

export type WxrDocument = {
  version: string;
  title: string;
  siteUrl: string;
  blogUrl: string;
  authors: WxrAuthor[];
  terms: WxrTerm[];
  items: WxrItem[];
};

export type WxrLimits = {
  maxBytes: number;
  maxDepth: number;
  maxElements: number;
  maxTextNodeBytes: number;
  maxItems: number;
  maxTerms: number;
  maxAuthors: number;
  maxAttachments: number;
  maxMetadataPerItem: number;
};

export const DEFAULT_WXR_LIMITS: WxrLimits = {
  maxBytes: 16 * 1024 * 1024,
  maxDepth: 64,
  maxElements: 250_000,
  maxTextNodeBytes: 2 * 1024 * 1024,
  maxItems: 5_000,
  maxTerms: 5_000,
  maxAuthors: 500,
  maxAttachments: 2_000,
  maxMetadataPerItem: 500,
};
