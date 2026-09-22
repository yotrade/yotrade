import { type Address, verifyMessage } from "viem";

import { uploadMessage } from "@/lib/logo-url.ts";

/** After the browser has cropped and shrunk it, a logo is a few tens of kilobytes. */
export const MAX_UPLOAD_BYTES = 300_000;
const SIGNATURE_WINDOW_MS = 5 * 60_000;
const PER_ADDRESS_PER_HOUR = 5;
const GLOBAL_PER_HOUR = 100;
const HOUR_MS = 3_600_000;

export class UploadError extends Error {
  override readonly name = "UploadError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The file's own first bytes decide its type; the browser's claim is not trusted. */
export function sniffImage(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return "image/png";
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return "image/gif";
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export interface LogoStore {
  /** Stores the bytes at `key` and returns the public https URL. */
  put(key: string, body: Uint8Array, contentType: string): Promise<string>;
}

export interface UploadDeps {
  readonly store: LogoStore;
  readonly now?: () => number;
  readonly verify?: typeof verifyMessage;
  readonly hash?: (bytes: Uint8Array) => Promise<string>;
}

export interface UploadRequest {
  readonly address: Address;
  readonly issuedAt: number;
  readonly signature: `0x${string}`;
  readonly bytes: Uint8Array;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Accepts a logo from a host who proved control of their account, at a pace nobody can turn into a bill.
 * ponytail: limits are per instance. Fine for one server; a shared store if there are many.
 */
export function createLogoUploader({
  store,
  now = Date.now,
  verify = verifyMessage,
  hash = sha256,
}: UploadDeps) {
  const perAddress = new Map<string, number[]>();
  let global: number[] = [];

  function prune(times: number[], at: number): number[] {
    return times.filter((time) => at - time < HOUR_MS);
  }

  return async function upload(request: UploadRequest): Promise<string> {
    const at = now();
    if (Math.abs(at - request.issuedAt) > SIGNATURE_WINDOW_MS) {
      throw new UploadError(401, "Upload request expired");
    }
    const message = uploadMessage(request.address, request.issuedAt);
    // A malformed signature throws inside the recovery; it is as bad as a wrong one.
    const valid = await verify({
      address: request.address,
      message,
      signature: request.signature,
    }).catch(() => false);
    if (!valid) {
      throw new UploadError(401, "Bad upload signature");
    }
    if (request.bytes.byteLength === 0 || request.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new UploadError(413, "Logo must be under 300 KB");
    }
    const contentType = sniffImage(request.bytes);
    if (!contentType) {
      throw new UploadError(415, "Not an image");
    }

    const key = request.address.toLowerCase();
    const mine = prune(perAddress.get(key) ?? [], at);
    global = prune(global, at);
    if (mine.length >= PER_ADDRESS_PER_HOUR || global.length >= GLOBAL_PER_HOUR) {
      throw new UploadError(429, "Too many uploads, try again later");
    }
    mine.push(at);
    perAddress.set(key, mine);
    global.push(at);

    const extension = contentType.split("/")[1] ?? "bin";
    const name = `logos/${key}/${(await hash(request.bytes)).slice(0, 16)}.${extension}`;
    return store.put(name, request.bytes, contentType);
  };
}
