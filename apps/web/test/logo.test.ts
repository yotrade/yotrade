import { describe, expect, test } from "bun:test";

import { isLogoUrl } from "@/lib/logo-url.ts";
import { createLogoProxy, isPublicAddress, LogoError } from "@/server/logo.ts";

const PNG = "https://cdn.example.com/logo.png";

function host(routes: Record<string, () => Response>, addresses: Record<string, string[]> = {}) {
  const calls: string[] = [];
  const fetcher = ((input: URL | string) => {
    const url = String(input);
    calls.push(url);
    return Promise.resolve(routes[url]?.() ?? new Response("nope", { status: 404 }));
  }) as typeof fetch;
  const resolve = (hostname: string) => Promise.resolve(addresses[hostname] ?? ["93.184.216.34"]);
  return { calls, proxy: createLogoProxy({ fetch: fetcher, resolve }) };
}

const image = (type = "image/png", size = 10) =>
  new Response(new Uint8Array(size), { headers: { "content-type": type } });

describe("logo links", () => {
  test("only https links to a named public host, without credentials or a query", () => {
    expect(isLogoUrl(PNG)).toBe(true);
    for (const bad of [
      "http://cdn.example.com/logo.png",
      "https://user:pw@cdn.example.com/logo.png",
      "https://cdn.example.com/logo.png?x=1",
      "https://127.0.0.1/logo.png",
      "https://[::1]/logo.png",
      "https://localhost/logo.png",
      "https://intranet.local/logo.png",
      "https://cdn.example.com/lo go.png",
      `https://cdn.example.com/${"a".repeat(200)}`,
      "javascript:alert(1)",
    ]) {
      expect(isLogoUrl(bad)).toBe(false);
    }
  });

  test("private and special addresses are not public", () => {
    const inside = ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.5", "192.168.1.1"];
    for (const ip of [...inside, "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
  });
});

describe("logo proxy", () => {
  test("serves a small image from a public host", async () => {
    const { proxy } = host({ [PNG]: () => image() });
    const logo = await proxy(PNG);
    expect(logo.contentType).toBe("image/png");
    expect(logo.body.byteLength).toBe(10);
  });

  test("refuses hosts that resolve to private addresses, on the first hop and after a redirect", async () => {
    const inside = host({ [PNG]: () => image() }, { "cdn.example.com": ["10.0.0.5"] });
    await expect(inside.proxy(PNG)).rejects.toBeInstanceOf(LogoError);
    expect(inside.calls).toEqual([]);

    const redirect = () =>
      new Response(null, { status: 302, headers: { location: "https://meta.internal.example/x" } });
    const hop = host(
      { [PNG]: redirect },
      { "cdn.example.com": ["93.184.216.34"], "meta.internal.example": ["169.254.169.254"] },
    );
    await expect(hop.proxy(PNG)).rejects.toBeInstanceOf(LogoError);
    expect(hop.calls).toEqual([PNG]);
  });

  test("follows a public https redirect but never a downgrade", async () => {
    const to = (location: string) => () =>
      new Response(null, { status: 301, headers: { location } });
    const ok = host({
      [PNG]: to("https://cdn.example.com/v2.png"),
      "https://cdn.example.com/v2.png": () => image("image/webp"),
    });
    expect((await ok.proxy(PNG)).contentType).toBe("image/webp");

    const down = host({ [PNG]: to("http://cdn.example.com/v2.png") });
    await expect(down.proxy(PNG)).rejects.toThrow("Bad redirect");
  });

  test("rejects non-images, oversized images and blocked links", async () => {
    const html = host({ [PNG]: () => image("text/html") });
    await expect(html.proxy(PNG)).rejects.toMatchObject({ status: 415 });
    const big = host({ [PNG]: () => image("image/png", 1_000_001) });
    await expect(big.proxy(PNG)).rejects.toMatchObject({ status: 413 });
    const blocked = createLogoProxy({ blocklist: ["cdn.example.com"] });
    await expect(blocked(PNG)).rejects.toMatchObject({ status: 404 });
    await expect(blocked("http://x")).rejects.toMatchObject({ status: 400 });
  });
});
