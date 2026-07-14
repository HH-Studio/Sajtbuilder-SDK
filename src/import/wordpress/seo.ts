import type { WxrSeo } from "./model";

const SEO_KEYS = {
  _yoast_wpseo_title: "title",
  _yoast_wpseo_metadesc: "description",
  _yoast_wpseo_canonical: "canonical",
  rank_math_title: "title",
  rank_math_description: "description",
  rank_math_canonical_url: "canonical",
} as const;

export function extractWxrSeo(metadata: Readonly<Record<string, string>>): WxrSeo | undefined {
  const seo: WxrSeo = {};
  for (const [key, target] of Object.entries(SEO_KEYS)) {
    const value = metadata[key]?.trim();
    if (value && seo[target] === undefined) seo[target] = value;
  }
  return Object.keys(seo).length > 0 ? seo : undefined;
}
