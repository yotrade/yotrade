import { describe, expect, test } from "bun:test";

import { privateKeyToAccount } from "viem/accounts";

import { uploadMessage } from "@/lib/logo-url.ts";
import { createLogoUploader, sniffImage } from "@/server/logo-upload.ts";

const host = privateKeyToAccount(`0x${"11".repeat(32)}`);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function setup(now = 1_000_000_000_000) {
  const stored: { key: string; type: string }[] = [];
  const clock = { now };
  const upload = createLogoUploader({
    store: {
      put: (key, _body, type) => {
        stored.push({ key, type });
        return Promise.resolve(`https://blob.example/${key}`);
      },
    },
    now: () => clock.now,
  });
  const signed = async (bytes: Uint8Array, issuedAt = clock.now) => ({
    address: host.address,
    issuedAt,
    signature: await host.signMessage({ message: uploadMessage(host.address, issuedAt) }),
    bytes,
  });
  return { upload, stored, clock, signed };
}

describe("logo upload", () => {
  test("sniffs the real type from the bytes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBe("image/webp");
    expect(
      sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    ).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });

  test("a signed, small image is stored under the host's address and its hash", async () => {
    const { upload, stored, signed } = setup();
    const url = await upload(await signed(PNG));
    expect(url).toMatch(/^https:\/\/blob\.example\/logos\/0x[0-9a-f]{40}\/[0-9a-f]{16}\.png$/);
    expect(stored[0]?.type).toBe("image/png");
  });

  test("rejects a bad signature, someone else's signature, and an old one", async () => {
    const { upload, signed, clock } = setup();
    const good = await signed(PNG);
    await expect(upload({ ...good, signature: `0x${"ab".repeat(65)}` })).rejects.toMatchObject({
      status: 401,
    });
    const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
    await expect(upload({ ...good, address: other.address })).rejects.toMatchObject({
      status: 401,
    });
    const stale = await signed(PNG, clock.now - 6 * 60_000);
    await expect(upload(stale)).rejects.toMatchObject({ status: 401 });
  });

  test("rejects non-images and oversized files before touching the store", async () => {
    const { upload, stored, signed } = setup();
    await expect(upload(await signed(new TextEncoder().encode("hello")))).rejects.toMatchObject({
      status: 415,
    });
    await expect(upload(await signed(new Uint8Array(300_001)))).rejects.toMatchObject({
      status: 413,
    });
    expect(stored).toHaveLength(0);
  });

  test("five per hour per host, then 429, then room again an hour later", async () => {
    const { upload, signed, clock } = setup();
    for (let i = 0; i < 5; i += 1) {
      await upload(await signed(PNG));
    }
    await expect(upload(await signed(PNG))).rejects.toMatchObject({ status: 429 });
    clock.now += 3_600_001;
    await upload(await signed(PNG));
  });
});
