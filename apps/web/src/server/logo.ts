import { isIP } from "node:net";

import { isLogoUrl } from "@/lib/logo-url.ts";

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;
const TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export class LogoError extends Error {
  override readonly name = "LogoError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Loopback, link-local, private and carrier ranges, v4 and v4-mapped v6. A logo host is a public host. */
export function isPublicAddress(address: string): boolean {
  const v4 = address.replace(/^::ffff:/i, "");
  if (isIP(v4) === 4) {
    const [a = 0, b = 0] = v4.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  return !(v6 === "::1" || v6 === "::" || /^(fc|fd|fe[89ab])/.test(v6));
}

export interface LogoDeps {
  readonly fetch?: typeof fetch;
  /** Every address a host resolves to. */
  readonly resolve?: (hostname: string) => Promise<string[]>;
  /** Substrings of links that must not be served, for the day a host puts up something that has to go. */
  readonly blocklist?: readonly string[];
}

export interface Logo {
  readonly body: ArrayBuffer;
  readonly contentType: string;
}

/**
 * Fetches a tournament logo on the viewer's behalf: the viewer's address never reaches the host's server,
 * and the host's server cannot serve anything but a small image. Each redirect is checked like the first hop.
 */
export function createLogoProxy(deps: LogoDeps = {}) {
  const request = deps.fetch ?? fetch;
  const resolve =
    deps.resolve ??
    (async (hostname: string) => {
      const { lookup } = await import("node:dns/promises");
      return (await lookup(hostname, { all: true })).map((entry) => entry.address);
    });

  async function assertPublic(url: URL): Promise<void> {
    const addresses = await resolve(url.hostname).catch(() => []);
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      throw new LogoError(400, "Logo host is not public");
    }
  }

  /** One hop: either the image, or where to go next. */
  async function hop(url: URL): Promise<Logo | URL> {
    await assertPublic(url);
    const response = await request(url, {
      redirect: "manual",
      headers: { accept: "image/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const next = location ? new URL(location, url) : null;
      if (next?.protocol !== "https:") {
        throw new LogoError(502, "Bad redirect");
      }
      return next;
    }
    if (!response.ok) {
      throw new LogoError(502, `Logo host answered ${response.status}`);
    }
    return read(response);
  }

  async function read(response: Response): Promise<Logo> {
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    if (!TYPES.has(contentType)) {
      throw new LogoError(415, "Not an image");
    }
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
      throw new LogoError(413, "Image too large");
    }
    return { body: await readCapped(response, MAX_BYTES), contentType };
  }

  return async function get(link: string): Promise<Logo> {
    if (!isLogoUrl(link)) {
      throw new LogoError(400, "Not a logo link");
    }
    if (deps.blocklist?.some((part) => part !== "" && link.includes(part))) {
      throw new LogoError(404, "Logo hidden");
    }
    let url = new URL(link);
    for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
      const result = await hop(url);
      if (!(result instanceof URL)) {
        return result;
      }
      url = result;
    }
    throw new LogoError(502, "Too many redirects");
  };
}

/**
 * The body, read chunk by chunk and abandoned as soon as it passes `max` bytes. A header can lie or be missing
 * (chunked), so only counting what arrives keeps an endless response from filling memory.
 */
export async function readCapped(response: Response, max: number): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    return new ArrayBuffer(0);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new LogoError(413, "Image too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}
