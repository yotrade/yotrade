const WAD = 10n ** 18n;

/** USD 1e18 as a number for display. Precision beyond a double is invisible at these magnitudes. */
export const usdNumber = (value: bigint) => Number(value / 10n ** 10n) / 1e8;

export function usd(value: bigint, digits = 2): string {
  return usdNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function signedUsd(value: bigint): string {
  return `${value < 0n ? "−" : "+"}$${usd(value < 0n ? -value : value)}`;
}

/** Base units 1e18 with up to four decimals and no trailing zeros. */
export function size(value: bigint): string {
  const magnitude = value < 0n ? -value : value;
  return (Number((magnitude * 10_000n) / WAD) / 10_000).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}

export const leverage = (x100: bigint | null) => (x100 === null ? "—" : `${(Number(x100) / 100).toFixed(1)}x`);
