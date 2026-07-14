import type { FormEvidence } from "./html/dom";

export const BOOKING_PROVIDER_HOSTS = {
  calendly: ["calendly.com"],
  calcom: ["cal.com"],
  microsoft: ["outlook.office365.com", "outlook.office.com", "bookings.office.com", "book.ms"],
  google: ["calendar.google.com", "calendar.app.google"],
  acuity: ["acuityscheduling.com"],
  setmore: ["setmore.com", "booking.setmore.com"],
  simplybook: ["simplybook.me", "simplybook.it", "simplybook.asia"],
  bokadirekt: ["bokadirekt.se"],
} as const;

export type SupportedBookingProvider = keyof typeof BOOKING_PROVIDER_HOSTS;

export function detectSupportedBookingProvider(value: string): SupportedBookingProvider | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const [provider, hosts] of Object.entries(BOOKING_PROVIDER_HOSTS)) {
      if (hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) {
        return provider as SupportedBookingProvider;
      }
    }
  } catch {
    // Invalid evidence never becomes a native replacement.
  }
  return null;
}

export type NativeFormField = {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select";
  required: boolean;
};

const FIELD_TYPES: Record<string, NativeFormField["type"] | undefined> = {
  text: "text",
  email: "email",
  tel: "phone",
  phone: "phone",
  textarea: "textarea",
  select: "select",
};

function formRecipient(action: string | undefined): string | null {
  if (!action) return null;
  try {
    const url = new URL(action);
    if (url.protocol !== "mailto:") return null;
    const recipient = decodeURIComponent(url.pathname).trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ? recipient : null;
  } catch {
    return null;
  }
}

/** Convert only facts explicitly present in inert form evidence. */
export function nativeFormReplacement(form: FormEvidence): {
  recipient: string;
  fields: NativeFormField[];
} | null {
  const recipient = formRecipient(form.action);
  if (!recipient || form.method !== "post" || form.fields.length === 0) return null;
  const fields: NativeFormField[] = [];
  const keys = new Set<string>();
  for (const field of form.fields) {
    const key = field.name?.trim();
    const type = FIELD_TYPES[field.type.toLowerCase()];
    if (!key || !type || type === "select") return null;
    const sanitized = key.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
    if (!sanitized || keys.has(sanitized)) return null;
    keys.add(sanitized);
    fields.push({
      key: sanitized,
      label: field.label?.trim() || key,
      type,
      required: field.required === true,
    });
  }
  return { recipient, fields };
}
