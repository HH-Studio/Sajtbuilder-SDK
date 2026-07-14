import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";

export type SafeFetchErrorCode =
  | "UNSAFE_DESTINATION"
  | "DNS_FAILURE"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "BYTE_LIMIT"
  | "REDIRECT_LIMIT";

export class SafeFetchError extends Error {
  constructor(
    readonly code: SafeFetchErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SafeFetchError";
  }
}

export interface SafeDnsAnswer {
  address: string;
  family: 4 | 6;
}

export type SafeFetchResolver = (
  hostname: string,
  signal: AbortSignal,
) => Promise<SafeDnsAnswer[]>;

export interface SafeTransportRequest {
  protocol: "http:" | "https:";
  hostname: string;
  address: string;
  port: number;
  path: string;
  serverName: string;
  headers: Readonly<Record<string, string>>;
  signal: AbortSignal;
}

export interface SafeTransportResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: AsyncIterable<Uint8Array>;
  dispose?: () => void;
}

export type SafeFetchTransport = (
  request: SafeTransportRequest,
) => Promise<SafeTransportResponse>;

export interface SafeFetchOptions {
  resolver?: SafeFetchResolver;
  transport?: SafeFetchTransport;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Optional crawl boundary. Redirects outside this exact origin are rejected before connecting. */
  allowedOrigin?: string;
}

export interface SafeFetchResult {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  finalUrl: string;
  redirects: readonly string[];
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const defaultResolver: SafeFetchResolver = async (hostname) => {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  return answers.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
};

function defaultTransport(
  request: SafeTransportRequest,
): Promise<SafeTransportResponse> {
  return new Promise((resolve, reject) => {
    const client = request.protocol === "https:" ? https : http;
    const outgoing = client.request(
      {
        protocol: request.protocol,
        hostname: request.address,
        port: request.port,
        path: request.path,
        method: "GET",
        headers: request.headers,
        servername: request.serverName,
        signal: request.signal,
        agent: false,
      },
      (incoming) => {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) {
            headers[name.toLowerCase()] = Array.isArray(value)
              ? value.join(", ")
              : value;
          }
        }
        resolve({
          status: incoming.statusCode ?? 0,
          headers,
          body: incoming,
          dispose: () => incoming.destroy(),
        });
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}

function ipv4Number(address: string): number | undefined {
  if (isIP(address) !== 4) return undefined;
  return address
    .split(".")
    .reduce((value, octet) => value * 256 + Number(octet), 0) >>> 0;
}

function inIpv4Range(value: number, base: number, prefix: number): boolean {
  const shift = 32 - prefix;
  return (value >>> shift) === (base >>> shift);
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4Number(address);
  if (value === undefined) return false;
  // Keep the CIDR beside its numeric form so special-purpose exclusions remain
  // auditable. This includes the deprecated 6to4 relay anycast block.
  const blocked: ReadonlyArray<{
    base: number;
    prefix: number;
    cidr: string;
  }> = [
    { base: 0x00000000, prefix: 8, cidr: "0.0.0.0/8" },
    { base: 0x0a000000, prefix: 8, cidr: "10.0.0.0/8" },
    { base: 0x64400000, prefix: 10, cidr: "100.64.0.0/10" },
    { base: 0x7f000000, prefix: 8, cidr: "127.0.0.0/8" },
    { base: 0xa9fe0000, prefix: 16, cidr: "169.254.0.0/16" },
    { base: 0xac100000, prefix: 12, cidr: "172.16.0.0/12" },
    { base: 0xc0000000, prefix: 24, cidr: "192.0.0.0/24" },
    { base: 0xc0000200, prefix: 24, cidr: "192.0.2.0/24" },
    { base: 0xc0586300, prefix: 24, cidr: "192.88.99.0/24" },
    { base: 0xc0a80000, prefix: 16, cidr: "192.168.0.0/16" },
    { base: 0xc6120000, prefix: 15, cidr: "198.18.0.0/15" },
    { base: 0xc6336400, prefix: 24, cidr: "198.51.100.0/24" },
    { base: 0xcb007100, prefix: 24, cidr: "203.0.113.0/24" },
    { base: 0xe0000000, prefix: 4, cidr: "224.0.0.0/4" },
    { base: 0xf0000000, prefix: 4, cidr: "240.0.0.0/4" },
  ];
  return !blocked.some(({ base, prefix }) => inIpv4Range(value, base, prefix));
}

function parseIpv6(address: string): Uint8Array | undefined {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) !== 6) return undefined;
  const doubleColon = normalized.indexOf("::");
  const left = (doubleColon < 0 ? normalized : normalized.slice(0, doubleColon))
    .split(":")
    .filter(Boolean);
  const right = (doubleColon < 0 ? "" : normalized.slice(doubleColon + 2))
    .split(":")
    .filter(Boolean);
  const missing = 8 - left.length - right.length;
  if ((doubleColon < 0 && missing !== 0) || (doubleColon >= 0 && missing < 1)) {
    return undefined;
  }
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((group) => Number.parseInt(group, 16));
  if (groups.length !== 8 || groups.some((group) => !Number.isFinite(group))) {
    return undefined;
  }
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = group >>> 8;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

function hasIpv6Prefix(
  bytes: Uint8Array,
  prefix: readonly number[],
  bits: number,
): boolean {
  const wholeBytes = Math.floor(bits / 8);
  for (let index = 0; index < wholeBytes; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  const remaining = bits % 8;
  if (remaining === 0) return true;
  const mask = (0xff << (8 - remaining)) & 0xff;
  return (bytes[wholeBytes] & mask) === ((prefix[wholeBytes] ?? 0) & mask);
}

function isPublicIpv6(address: string): boolean {
  if (/^(?:0*:){2,}ffff:/i.test(address.split("%")[0])) return false;
  const bytes = parseIpv6(address);
  if (!bytes) return false;

  // IPv4-mapped IPv6 is always rejected, even when the embedded IPv4 is public.
  if (
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  ) {
    return false;
  }

  // Only global-unicast space is eligible. Exclude special/documentation blocks
  // that sit inside 2000::/3 and must never be treated as public destinations.
  if (!hasIpv6Prefix(bytes, [0x20], 3)) return false;
  const excluded: Array<[readonly number[], number]> = [
    [[0x20, 0x01, 0x00, 0x00], 23],
    [[0x20, 0x01, 0x0d, 0xb8], 32],
    [[0x20, 0x02], 16],
    [[0x3f, 0xff, 0x00], 20],
  ];
  return !excluded.some(([prefix, bits]) => hasIpv6Prefix(bytes, prefix, bits));
}

function isPublicAddress(address: string): boolean {
  return isPublicIpv4(address) || isPublicIpv6(address);
}

function unsafe(message: string): SafeFetchError {
  return new SafeFetchError("UNSAFE_DESTINATION", message);
}

function parseAndValidateUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw unsafe(`Invalid URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw unsafe(`Only http and https URLs are allowed: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw unsafe("URLs containing credentials are not allowed");
  }
  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "localhost.localdomain" ||
    hostname.endsWith(".localhost.localdomain")
  ) {
    throw unsafe(`Local hostname is not allowed: ${hostname}`);
  }
  if (!hostname) throw unsafe("URL hostname is required");
  return url;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

async function validatedAddress(
  url: URL,
  resolver: SafeFetchResolver,
  signal: AbortSignal,
): Promise<string> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw unsafe(`Address is not public: ${hostname}`);
    return hostname;
  }

  let answers: SafeDnsAnswer[];
  try {
    answers = await abortable(resolver(hostname, signal), signal);
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new SafeFetchError("DNS_FAILURE", `DNS lookup failed for ${hostname}`, {
      cause,
    });
  }
  if (answers.length === 0) {
    throw new SafeFetchError("DNS_FAILURE", `DNS returned no addresses for ${hostname}`);
  }
  for (const answer of answers) {
    if (
      (answer.family !== 4 && answer.family !== 6) ||
      isIP(answer.address) !== answer.family ||
      !isPublicAddress(answer.address)
    ) {
      throw unsafe(`DNS returned a non-public address for ${hostname}`);
    }
  }
  return answers[0].address;
}

function positiveLimit(value: number, name: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new RangeError(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return value;
}

function safeHeaders(url: URL): Readonly<Record<string, string>> {
  const defaultPort = url.protocol === "https:" ? "443" : "80";
  const host = url.port && url.port !== defaultPort
    ? `${url.hostname}:${url.port}`
    : url.hostname;
  return Object.freeze({
    Accept: "text/html,application/xhtml+xml,text/css;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "identity",
    Connection: "close",
    Host: host,
    "User-Agent": "SnabbSajt-Importer/1.0",
  });
}

function header(
  headers: Readonly<Record<string, string>>,
  wanted: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === wanted.toLowerCase(),
  );
  return entry?.[1];
}

export async function safeFetch(
  input: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = positiveLimit(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
  const maxBytes = positiveLimit(options.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes");
  const maxRedirects = positiveLimit(
    options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    "maxRedirects",
    true,
  );
  const resolver = options.resolver ?? defaultResolver;
  const transport = options.transport ?? defaultTransport;
  const allowedOrigin = options.allowedOrigin === undefined
    ? undefined
    : parseAndValidateUrl(options.allowedOrigin).origin;
  const controller = new AbortController();
  const timeoutError = new SafeFetchError(
    "TIMEOUT",
    `Fetch exceeded ${timeoutMs}ms timeout`,
  );
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  timer.unref?.();

  const redirects: string[] = [];
  try {
    let current = parseAndValidateUrl(input);
    while (true) {
      if (allowedOrigin && current.origin !== allowedOrigin) {
        throw unsafe(`URL left the allowed origin ${allowedOrigin}: ${current.origin}`);
      }
      // Resolution happens for every request, including a same-host redirect.
      const address = await validatedAddress(current, resolver, controller.signal);
      const hostname = current.hostname.replace(/^\[|\]$/g, "");
      let response: SafeTransportResponse;
      try {
        response = await abortable(
          transport({
            protocol: current.protocol as "http:" | "https:",
            hostname,
            address,
            port: Number(current.port || (current.protocol === "https:" ? 443 : 80)),
            path: `${current.pathname}${current.search}`,
            serverName: hostname,
            headers: safeHeaders(current),
            signal: controller.signal,
          }),
          controller.signal,
        );
      } catch (cause) {
        if (controller.signal.aborted) throw controller.signal.reason;
        throw new SafeFetchError("HTTP_ERROR", `Request failed for ${current.href}`, {
          cause,
        });
      }
      try {
        const location = header(response.headers, "location");
        if (REDIRECT_STATUSES.has(response.status) && location !== undefined) {
          if (redirects.length >= maxRedirects) {
            throw new SafeFetchError(
              "REDIRECT_LIMIT",
              `Fetch exceeded ${maxRedirects} redirects`,
            );
          }
          let next: URL;
          try {
            next = new URL(location, current);
          } catch (cause) {
            throw new SafeFetchError("HTTP_ERROR", "Redirect contains an invalid URL", {
              cause,
            });
          }
          current = parseAndValidateUrl(next.href);
          redirects.push(current.href);
          continue;
        }

        const contentLength = header(response.headers, "content-length");
        if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
          throw new SafeFetchError("BYTE_LIMIT", `Response exceeds ${maxBytes} bytes`);
        }

        const chunks: Uint8Array[] = [];
        let byteLength = 0;
        const iterator = response.body[Symbol.asyncIterator]();
        try {
          while (true) {
            const next = await abortable(iterator.next(), controller.signal);
            if (next.done) break;
            const chunk = next.value;
            byteLength += chunk.byteLength;
            if (byteLength > maxBytes) {
              throw new SafeFetchError("BYTE_LIMIT", `Response exceeds ${maxBytes} bytes`);
            }
            chunks.push(chunk);
          }
        } catch (cause) {
          if (!controller.signal.aborted) await iterator.return?.();
          if (cause instanceof SafeFetchError) throw cause;
          if (controller.signal.aborted) throw controller.signal.reason;
          throw new SafeFetchError("HTTP_ERROR", "Failed while reading response body", {
            cause,
          });
        }
        const body = new Uint8Array(byteLength);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return {
          status: response.status,
          headers: response.headers,
          body,
          finalUrl: current.href,
          redirects,
        };
      } finally {
        // A response owns a socket/body resource even after a complete read.
        // Dispose once for every terminal path, including redirects and aborts.
        try {
          response.dispose?.();
        } catch {
          // Cleanup failures must not replace the import result or primary error.
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
