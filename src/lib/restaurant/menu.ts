// Pure restaurant-menu draft model shared by the owner UI and Convex.

export const RESTAURANT_MENU_LIMITS = {
  menus: 4,
  categories: 24,
  items: 120,
  priceOptionsPerItem: 4,
} as const;

// Convex documents cap at 1 MiB. Leave ample room for field names, ids,
// timestamps and encoding overhead around the owner-authored menu payload.
export const RESTAURANT_MENU_MAX_UTF8_BYTES = 750_000;

export const RESTAURANT_MENU_TEXT_LIMITS = {
  id: 96,
  menuName: 120,
  categoryName: 120,
  itemName: 160,
  itemDescription: 2_000,
  priceText: 80,
  priceOptionLabel: 80,
} as const;

export type RestaurantMenuPriceOption = {
  id: string;
  label: string;
  priceText: string;
};

export type RestaurantMenuItem = {
  id: string;
  name: string;
  description?: string;
  priceText?: string;
  priceOptions: RestaurantMenuPriceOption[];
  temporarilyUnavailable?: true;
};

export type RestaurantMenuCategory = {
  id: string;
  name: string;
  items: RestaurantMenuItem[];
};

export type RestaurantMenu = {
  id: string;
  name: string;
  categories: RestaurantMenuCategory[];
};

export type RestaurantMenuDraft = { menus: RestaurantMenu[] };

export type RestaurantMenuEditError =
  | "invalid_id"
  | "invalid_text"
  | "duplicate_id"
  | "not_found"
  | "bad_index"
  | "menu_limit"
  | "category_limit"
  | "item_limit"
  | "price_option_limit"
  | "draft_too_large";

export type RestaurantMenuEditResult =
  | { ok: true; draft: RestaurantMenuDraft }
  | { ok: false; reason: RestaurantMenuEditError };

export type RestaurantMenuItemPatch = Partial<
  Pick<
    RestaurantMenuItem,
    "name" | "description" | "priceText" | "priceOptions" | "temporarilyUnavailable"
  >
>;

export type RestaurantMenuPriceOptionPatch = Partial<
  Pick<RestaurantMenuPriceOption, "label" | "priceText">
>;

const ok = (draft: RestaurantMenuDraft): RestaurantMenuEditResult => ({
  ok: true,
  draft,
});
const fail = (reason: RestaurantMenuEditError): RestaurantMenuEditResult => ({
  ok: false,
  reason,
});

/** Trim only edges and cap by Unicode code point; interior owner text stays exact. */
const text = (value: string, max: number) =>
  Array.from(value.trim()).slice(0, max).join("");
const required = (value: string, max: number) => text(value, max) || null;
const optional = (value: string | undefined, max: number) =>
  value === undefined ? undefined : text(value, max) || undefined;
const cleanId = (value: string) => required(value, RESTAURANT_MENU_TEXT_LIMITS.id);

/** Validate caps and stable ids, returning a safely bounded owner-authored draft. */
export function sanitizeRestaurantMenuDraft(
  source: RestaurantMenuDraft,
): RestaurantMenuEditResult {
  if (source.menus.length > RESTAURANT_MENU_LIMITS.menus) {
    return fail("menu_limit");
  }
  const ids = {
    menu: new Set<string>(),
    category: new Set<string>(),
    item: new Set<string>(),
    option: new Set<string>(),
  };
  let categoryCount = 0;
  let itemCount = 0;
  const menus: RestaurantMenu[] = [];

  for (const menu of source.menus) {
    const menuId = cleanId(menu.id);
    const menuName = required(menu.name, RESTAURANT_MENU_TEXT_LIMITS.menuName);
    if (!menuId) return fail("invalid_id");
    if (!menuName) return fail("invalid_text");
    if (ids.menu.has(menuId)) return fail("duplicate_id");
    ids.menu.add(menuId);
    const categories: RestaurantMenuCategory[] = [];

    for (const category of menu.categories) {
      categoryCount += 1;
      if (categoryCount > RESTAURANT_MENU_LIMITS.categories) {
        return fail("category_limit");
      }
      const categoryId = cleanId(category.id);
      const categoryName = required(
        category.name,
        RESTAURANT_MENU_TEXT_LIMITS.categoryName,
      );
      if (!categoryId) return fail("invalid_id");
      if (!categoryName) return fail("invalid_text");
      if (ids.category.has(categoryId)) return fail("duplicate_id");
      ids.category.add(categoryId);
      const items: RestaurantMenuItem[] = [];

      for (const item of category.items) {
        itemCount += 1;
        if (itemCount > RESTAURANT_MENU_LIMITS.items) return fail("item_limit");
        if (item.priceOptions.length > RESTAURANT_MENU_LIMITS.priceOptionsPerItem) {
          return fail("price_option_limit");
        }
        const itemId = cleanId(item.id);
        const itemName = required(item.name, RESTAURANT_MENU_TEXT_LIMITS.itemName);
        if (!itemId) return fail("invalid_id");
        if (!itemName) return fail("invalid_text");
        if (ids.item.has(itemId)) return fail("duplicate_id");
        ids.item.add(itemId);
        const priceOptions: RestaurantMenuPriceOption[] = [];

        for (const option of item.priceOptions) {
          const optionId = cleanId(option.id);
          const label = required(
            option.label,
            RESTAURANT_MENU_TEXT_LIMITS.priceOptionLabel,
          );
          const priceText = required(
            option.priceText,
            RESTAURANT_MENU_TEXT_LIMITS.priceText,
          );
          if (!optionId) return fail("invalid_id");
          if (!label || !priceText) return fail("invalid_text");
          if (ids.option.has(optionId)) return fail("duplicate_id");
          ids.option.add(optionId);
          priceOptions.push({ id: optionId, label, priceText });
        }
        const description = optional(
          item.description,
          RESTAURANT_MENU_TEXT_LIMITS.itemDescription,
        );
        const priceText = optional(
          item.priceText,
          RESTAURANT_MENU_TEXT_LIMITS.priceText,
        );
        items.push({
          id: itemId,
          name: itemName,
          ...(description ? { description } : {}),
          ...(priceText ? { priceText } : {}),
          priceOptions,
          ...(item.temporarilyUnavailable
            ? { temporarilyUnavailable: true as const }
            : {}),
        });
      }
      categories.push({ id: categoryId, name: categoryName, items });
    }
    menus.push({ id: menuId, name: menuName, categories });
  }
  const draft = { menus };
  if (
    new TextEncoder().encode(JSON.stringify(draft)).byteLength >
    RESTAURANT_MENU_MAX_UTF8_BYTES
  ) {
    return fail("draft_too_large");
  }
  return ok(draft);
}

const finish = (draft: RestaurantMenuDraft | null) =>
  draft ? sanitizeRestaurantMenuDraft(draft) : fail("not_found");

function withMenu(
  draft: RestaurantMenuDraft,
  menuId: string,
  update: (menu: RestaurantMenu) => RestaurantMenu,
): RestaurantMenuDraft | null {
  const index = draft.menus.findIndex((menu) => menu.id === menuId);
  if (index < 0) return null;
  const menus = [...draft.menus];
  menus[index] = update(menus[index]);
  return { menus };
}

function withCategory(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  update: (category: RestaurantMenuCategory) => RestaurantMenuCategory,
): RestaurantMenuDraft | null {
  const menu = draft.menus.find((entry) => entry.id === menuId);
  if (!menu?.categories.some((category) => category.id === categoryId)) return null;
  return withMenu(draft, menuId, (entry) => ({
    ...entry,
    categories: entry.categories.map((category) =>
      category.id === categoryId ? update(category) : category,
    ),
  }));
}

function findItem(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
) {
  return draft.menus
    .find((menu) => menu.id === menuId)
    ?.categories.find((category) => category.id === categoryId)
    ?.items.find((item) => item.id === itemId);
}

function moved<T>(values: readonly T[], from: number, to: number): T[] | null {
  if (from < 0 || from >= values.length || to < 0 || to >= values.length) return null;
  const next = [...values];
  const [value] = next.splice(from, 1);
  next.splice(to, 0, value);
  return next;
}

export const addRestaurantMenu = (
  draft: RestaurantMenuDraft,
  menu: RestaurantMenu,
) => finish({ menus: [...draft.menus, menu] });

export const editRestaurantMenu = (
  draft: RestaurantMenuDraft,
  menuId: string,
  name: string,
) => finish(withMenu(draft, menuId, (menu) => ({ ...menu, name })));

export function removeRestaurantMenu(draft: RestaurantMenuDraft, menuId: string) {
  if (!draft.menus.some((menu) => menu.id === menuId)) return fail("not_found");
  return finish({ menus: draft.menus.filter((menu) => menu.id !== menuId) });
}

export function moveRestaurantMenu(
  draft: RestaurantMenuDraft,
  menuId: string,
  toIndex: number,
) {
  const from = draft.menus.findIndex((menu) => menu.id === menuId);
  if (from < 0) return fail("not_found");
  const menus = moved(draft.menus, from, toIndex);
  return menus ? finish({ menus }) : fail("bad_index");
}

export const addRestaurantMenuCategory = (
  draft: RestaurantMenuDraft,
  menuId: string,
  category: RestaurantMenuCategory,
) =>
  finish(
    withMenu(draft, menuId, (menu) => ({
      ...menu,
      categories: [...menu.categories, category],
    })),
  );

export const editRestaurantMenuCategory = (
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  name: string,
) =>
  finish(
    withCategory(draft, menuId, categoryId, (category) => ({
      ...category,
      name,
    })),
  );

export function removeRestaurantMenuCategory(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
) {
  const menu = draft.menus.find((entry) => entry.id === menuId);
  if (!menu?.categories.some((category) => category.id === categoryId)) {
    return fail("not_found");
  }
  return finish(
    withMenu(draft, menuId, (entry) => ({
      ...entry,
      categories: entry.categories.filter((category) => category.id !== categoryId),
    })),
  );
}

export function moveRestaurantMenuCategory(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  toIndex: number,
) {
  const menu = draft.menus.find((entry) => entry.id === menuId);
  if (!menu) return fail("not_found");
  const from = menu.categories.findIndex((category) => category.id === categoryId);
  if (from < 0) return fail("not_found");
  const categories = moved(menu.categories, from, toIndex);
  return categories
    ? finish(withMenu(draft, menuId, (entry) => ({ ...entry, categories })))
    : fail("bad_index");
}

export const addRestaurantMenuItem = (
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  item: RestaurantMenuItem,
) =>
  finish(
    withCategory(draft, menuId, categoryId, (category) => ({
      ...category,
      items: [...category.items, item],
    })),
  );

export function editRestaurantMenuItem(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
  patch: RestaurantMenuItemPatch,
): RestaurantMenuEditResult {
  if (!findItem(draft, menuId, categoryId, itemId)) return fail("not_found");
  return finish(
    withCategory(draft, menuId, categoryId, (category) => {
      return {
        ...category,
        items: category.items.map((item) =>
          item.id === itemId ? { ...item, ...patch, id: item.id } : item,
        ),
      };
    }),
  );
}

export function removeRestaurantMenuItem(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
) {
  if (!findItem(draft, menuId, categoryId, itemId)) return fail("not_found");
  return finish(
    withCategory(draft, menuId, categoryId, (entry) => ({
      ...entry,
      items: entry.items.filter((item) => item.id !== itemId),
    })),
  );
}

export function moveRestaurantMenuItem(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
  toIndex: number,
) {
  const category = draft.menus
    .find((menu) => menu.id === menuId)
    ?.categories.find((entry) => entry.id === categoryId);
  if (!category) return fail("not_found");
  const from = category.items.findIndex((item) => item.id === itemId);
  if (from < 0) return fail("not_found");
  const items = moved(category.items, from, toIndex);
  return items
    ? finish(
        withCategory(draft, menuId, categoryId, (entry) => ({
          ...entry,
          items,
        })),
      )
    : fail("bad_index");
}

export function addRestaurantMenuPriceOption(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
  option: RestaurantMenuPriceOption,
) {
  const item = findItem(draft, menuId, categoryId, itemId);
  if (!item) return fail("not_found");
  return editRestaurantMenuItem(draft, menuId, categoryId, itemId, {
    priceOptions: [...item.priceOptions, option],
  });
}

export function editRestaurantMenuPriceOption(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
  optionId: string,
  patch: RestaurantMenuPriceOptionPatch,
) {
  const item = findItem(draft, menuId, categoryId, itemId);
  if (!item?.priceOptions.some((option) => option.id === optionId)) {
    return fail("not_found");
  }
  return editRestaurantMenuItem(draft, menuId, categoryId, itemId, {
    priceOptions: item.priceOptions.map((option) =>
      option.id === optionId ? { ...option, ...patch, id: option.id } : option,
    ),
  });
}

export function removeRestaurantMenuPriceOption(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
  optionId: string,
) {
  const item = findItem(draft, menuId, categoryId, itemId);
  if (!item?.priceOptions.some((option) => option.id === optionId)) {
    return fail("not_found");
  }
  return editRestaurantMenuItem(draft, menuId, categoryId, itemId, {
    priceOptions: item.priceOptions.filter((option) => option.id !== optionId),
  });
}

export function moveRestaurantMenuPriceOption(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
  optionId: string,
  toIndex: number,
) {
  const item = findItem(draft, menuId, categoryId, itemId);
  if (!item) return fail("not_found");
  const from = item.priceOptions.findIndex((option) => option.id === optionId);
  if (from < 0) return fail("not_found");
  const priceOptions = moved(item.priceOptions, from, toIndex);
  return priceOptions
    ? editRestaurantMenuItem(draft, menuId, categoryId, itemId, {
        priceOptions,
      })
    : fail("bad_index");
}

export function toggleRestaurantMenuItemUnavailable(
  draft: RestaurantMenuDraft,
  menuId: string,
  categoryId: string,
  itemId: string,
) {
  const item = findItem(draft, menuId, categoryId, itemId);
  if (!item) return fail("not_found");
  return editRestaurantMenuItem(draft, menuId, categoryId, itemId, {
    temporarilyUnavailable: item.temporarilyUnavailable ? undefined : true,
  });
}
