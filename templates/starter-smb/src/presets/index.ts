import type { SiteDefinition } from "@snabbsajt/site-kit";
import { consultant } from "./consultant";
import { salon } from "./salon";
import { cleaning } from "./cleaning";
import { clinic } from "./clinic";
import { restaurant } from "./restaurant";
import { fitness } from "./fitness";

/**
 * Every starter preset. Each is a full SnabbSajt site with a vertical-fitting
 * theme (palette + font pair) and copy. Pick one with the
 * `NEXT_PUBLIC_SNABBSAJT_PRESET` env var (see `../site.ts`), or copy one into a
 * new file as your own starting point.
 */
export const PRESETS = {
  consultant,
  salon,
  cleaning,
  clinic,
  restaurant,
  fitness,
} satisfies Record<string, SiteDefinition>;

export type PresetKey = keyof typeof PRESETS;
export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];
