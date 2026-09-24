import { MARKET_SLUGS } from "./markets.ts";
import { PERPS_MARKETS } from "./perps-markets.ts";
import { roomId } from "./room-code.ts";

const ID = /^[1-9]\d{0,18}$/;
const SLUGS = new Set([...Object.keys(MARKET_SLUGS), ...Object.keys(PERPS_MARKETS)]);

/**
 * False for a tournament or room link that cannot point at anything: a malformed id, a room code that fails
 * its checksum, a market we do not list. Those get a real 404 before any rendering. A well-formed id that the
 * indexer has not seen stays with the page: a tournament created a second ago is not indexed yet.
 */
export function isPossibleRoute(pathname: string): boolean {
  const [, head, first, section, slug] = pathname.split("/");
  if (head === "r") {
    return first !== undefined && roomId(decodeURIComponent(first)) !== null;
  }
  if (head !== "t" || first === undefined) {
    return true;
  }
  if (!ID.test(first)) {
    return false;
  }
  return !(section === "trade" && slug !== undefined && !SLUGS.has(slug));
}
