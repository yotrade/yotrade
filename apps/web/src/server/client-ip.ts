/**
 * The caller's address as the proxy in front saw it. nginx sets X-Real-IP to the connection's own address and
 * appends that same address to X-Forwarded-For, so the last entry there is the fallback; the first entry is
 * whatever the caller wrote. Either can still be forged by a caller who reaches the app without the proxy,
 * which is why the drip's per-address and global caps never depend on it.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return real || forwarded || "unknown";
}
