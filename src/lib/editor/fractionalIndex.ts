import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

// ---------------------------------------------------------------------------
// Ordering keys for sections/pages. We store an `order` string and sort
// lexicographically. Moving an item is a single-row write (key between its new
// neighbours); inserting N initial items gets N evenly-spaced keys.
// Backed by the well-tested `fractional-indexing` package.
// ---------------------------------------------------------------------------

/** A key strictly between `a` and `b` (either may be null for ends). */
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

/** N evenly-spaced keys between `a` and `b` (either may be null). */
export function keysBetween(
  a: string | null,
  b: string | null,
  n: number,
): string[] {
  if (n <= 0) return [];
  return generateNKeysBetween(a, b, n);
}

/** N initial keys (e.g. when generating a page's sections). */
export function initialKeys(n: number): string[] {
  return keysBetween(null, null, n);
}

/** True when `value` is a key the ordering library can safely extend. */
export function isValidOrderKey(value: string): boolean {
  try {
    generateKeyBetween(value, null);
    return true;
  } catch {
    return false;
  }
}
