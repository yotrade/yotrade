import type { PrfResult, SessionStore } from "@yotrade/plugin-mera/plugin";
import { bytesToHex, hexToBytes, type Hex } from "viem";

const KEY = "yotrade.session";

/**
 * Keeps the signed-in identity for this browser tab. `sessionStorage` is per tab and gone when it closes, so a
 * reload skips the passkey prompt while nothing reaches durable storage or another tab.
 */
export const tabSession: SessionStore = {
  load() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) {
        return null;
      }
      const { credentialId, prf } = JSON.parse(raw) as { credentialId: string; prf: Hex };
      return { credentialId, prfOutput: hexToBytes(prf) };
    } catch {
      return null;
    }
  },
  save(result: PrfResult) {
    try {
      sessionStorage.setItem(
        KEY,
        JSON.stringify({ credentialId: result.credentialId, prf: bytesToHex(result.prfOutput) }),
      );
    } catch {
      // Private windows may refuse: the next load asks for the passkey again.
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
