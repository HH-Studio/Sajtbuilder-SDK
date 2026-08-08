import { v, type Infer } from "convex/values";
import {
  RESTAURANT_MENU_LIMITS,
  sanitizeRestaurantMenuDraft,
  type RestaurantMenuDraft,
  type RestaurantMenuEditResult,
} from "../../lib/restaurant/menu";

export const restaurantMenuPriceOptionValidator = v.object({
  id: v.string(),
  label: v.string(),
  priceText: v.string(),
});
export type RestaurantMenuPriceOptionValue = Infer<
  typeof restaurantMenuPriceOptionValidator
>;

export const restaurantMenuItemValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  priceText: v.optional(v.string()),
  priceOptions: v.array(restaurantMenuPriceOptionValidator),
  temporarilyUnavailable: v.optional(v.literal(true)),
});
export type RestaurantMenuItemValue = Infer<typeof restaurantMenuItemValidator>;

export const restaurantMenuCategoryValidator = v.object({
  id: v.string(),
  name: v.string(),
  items: v.array(restaurantMenuItemValidator),
});
export type RestaurantMenuCategoryValue = Infer<
  typeof restaurantMenuCategoryValidator
>;

export const restaurantMenuValidator = v.object({
  id: v.string(),
  name: v.string(),
  categories: v.array(restaurantMenuCategoryValidator),
});
export type RestaurantMenuValue = Infer<typeof restaurantMenuValidator>;

export const restaurantMenuDraftValidator = v.object({
  menus: v.array(restaurantMenuValidator),
});
export type RestaurantMenuDraftValue = Infer<typeof restaurantMenuDraftValidator>;

/** Fields stored together in the single website-scoped restaurant-menu draft. */
export const restaurantMenuStoredContentValidator = restaurantMenuDraftValidator;
export type RestaurantMenuStoredContent = Infer<
  typeof restaurantMenuStoredContentValidator
>;

/** The storage layer shares the same caps and normalization as owner editing. */
export const RESTAURANT_MENU_STORAGE_LIMITS = RESTAURANT_MENU_LIMITS;

export function sanitizeRestaurantMenuForStorage(
  source: RestaurantMenuDraftValue,
): RestaurantMenuEditResult {
  return sanitizeRestaurantMenuDraft(source satisfies RestaurantMenuDraft);
}
