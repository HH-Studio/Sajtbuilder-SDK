import { PRESETS, type PresetKey } from "./presets";

/**
 * The active site. Pick a starter preset with an env var:
 *
 *   NEXT_PUBLIC_SNABBSAJT_PRESET=salon npm run dev
 *   NEXT_PUBLIC_SNABBSAJT_PRESET=salon npm run build:snabbsajt
 *
 * Available: consultant (default), salon, cleaning, clinic, restaurant, fitness.
 *
 * To build your own site, copy the closest preset from `src/presets/` into a new
 * file, edit the content, and point this at it. Everything downstream — the
 * Next.js pages and the SnabbSajt bundle — reads `site` from here.
 */
const requested = process.env.NEXT_PUBLIC_SNABBSAJT_PRESET as PresetKey | undefined;
export const site = (requested && PRESETS[requested]) || PRESETS.consultant;
