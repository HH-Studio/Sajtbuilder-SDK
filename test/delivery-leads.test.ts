/** `submitLead`, the SDK half of `POST /v1/sites/{id}/leads`.
 *
 *  Plan P0-2026-08-19 slice 2.5. The endpoint shipped without this helper, so
 *  every agency hand-rolled the POST and each one had to rediscover that a
 *  missing `consent` is a 400 on every single submission.
 */
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DELIVERY_BASE_URL, DeliveryError } from "../src/lib/delivery/client";
import { submitLead } from "../src/lib/delivery/leads";

const SITE_ID = "k17abcdefghijklmnopqrstuvwx";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function callOf(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

describe("submitLead", () => {
  it("posts the visitor's answers to the site's lead endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));

    await submitLead({
      siteId: SITE_ID,
      consent: true,
      fields: { Namn: "Anna", Telefon: "070-1234567", Nyhetsbrev: true },
      pageSlug: "kontakt",
      hp: "",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { url, init } = callOf(fetchMock);
    expect(url).toBe(`${DEFAULT_DELIVERY_BASE_URL}/v1/sites/${SITE_ID}/leads`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      consent: true,
      fields: { Namn: "Anna", Telefon: "070-1234567", Nyhetsbrev: true },
      sectionType: "contact",
      pageSlug: "kontakt",
      hp: "",
    });
  });

  it("refuses locally when the form never asked for consent", async () => {
    const fetchMock = vi.fn();

    await expect(
      submitLead({
        siteId: SITE_ID,
        consent: false,
        fields: { Namn: "Anna" },
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: "consent_required" });
    // The point of refusing here: the request never leaves, so a developer sees
    // the cause instead of a 400 with somebody else's error body.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the site when the id is wrong or the hemsida is not published", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, error: "not_found" }, 404));

    await expect(
      submitLead({
        siteId: SITE_ID,
        consent: true,
        fields: {},
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: "not_found", status: 404 });
  });

  it("tells a rate limit apart from a wiring mistake", async () => {
    const limited = vi.fn().mockResolvedValue(jsonResponse({ error: "rate_limited" }, 429));
    await expect(
      submitLead({ siteId: SITE_ID, consent: true, fields: {}, fetch: limited as unknown as typeof fetch }),
    ).rejects.toMatchObject({ reason: "rate_limited" });

    const rejected = vi.fn().mockResolvedValue(jsonResponse({ error: "invalid" }, 400));
    await expect(
      submitLead({ siteId: SITE_ID, consent: true, fields: {}, fetch: rejected as unknown as typeof fetch }),
    ).rejects.toMatchObject({ reason: "invalid" });
  });

  it("reports an unreachable host as a network failure, not a rejection", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const error = await submitLead({
      siteId: SITE_ID,
      consent: true,
      fields: {},
      baseUrl: "https://elsewhere.example/",
      fetch: fetchMock as unknown as typeof fetch,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DeliveryError);
    expect((error as DeliveryError).reason).toBe("network");
    // The trailing slash is trimmed, so the URL never doubles up.
    expect(callOf(fetchMock).url).toBe(`https://elsewhere.example/v1/sites/${SITE_ID}/leads`);
  });
});
