/** Every link and line the landing page shows, in one place. The app is the source of truth for the product. */
export const APP_URL = "https://app.yotrade.xyz";
export const REPO_URL = "https://github.com/yotrade/yotrade";

export const LINKS = {
  app: APP_URL,
  host: `${APP_URL}/new`,
  arena: `${APP_URL}/arena`,
  repo: REPO_URL,
} as const;

export const META = {
  title: "YoTrade · Trading tournaments for your community",
  description:
    "Host a trading tournament for your community in three taps. Players join with a passkey, trade real Kuru order books or up to 100x futures at Pyth prices, and the contract pays the winners. Live on Monad.",
} as const;

export interface Step {
  readonly n: string;
  readonly title: string;
  readonly body: string;
}

export const STEPS: readonly Step[] = [
  {
    n: "01",
    title: "Host a room",
    body: "Name it, set a prize, pick Spot or Futures. The prize is escrowed in a contract the moment you create it.",
  },
  {
    n: "02",
    title: "Put it on the big screen",
    body: "A six-character code and a QR code, like a quiz night. Phones scan, one passkey prompt, and they are in the lobby.",
  },
  {
    n: "03",
    title: "Everyone trades",
    body: "Real Kuru order books, or long and short up to 100x at signed Pyth prices. The board moves with every fill.",
  },
  {
    n: "04",
    title: "Podium and payout",
    body: "When the clock hits zero the score freezes, anyone can finalize, and the contract pays the winners. Run it back next week.",
  },
];

export interface Feature {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
  /** Wide tiles take two columns on large screens. */
  readonly wide?: boolean;
}

export const FEATURES: readonly Feature[] = [
  {
    icon: "face-scan",
    title: "One passkey, no wallet",
    body: "No seed phrase, no extension, no faucet to find. Gas and test funds arrive on their own, and a fresh trading account is derived for every game.",
    wide: true,
  },
  {
    icon: "swap",
    title: "Real order books",
    body: "Spot games route every order through Kuru's onchain book on Monad, with price-impact and slippage guards.",
  },
  {
    icon: "timer",
    title: "Futures up to 100x",
    body: "BTC, ETH and SOL perpetuals at Pyth prices, liquidated every 30 seconds when an account falls under margin.",
  },
  {
    icon: "wallet",
    title: "Prize in escrow",
    body: "The pool sits in a contract from the start. Winners claim from it directly after a short review window.",
  },
  {
    icon: "magic-wand",
    title: "Kimi on the mic",
    body: "Live commentary on the standings in eight languages, from Bahasa Indonesia to Korean, ready for the group chat.",
  },
  {
    icon: "qr",
    title: "Private rooms",
    body: "An invite code derived from the host's passkey, checked by the contract on every join. Leaked? Rotate it.",
  },
  {
    icon: "share",
    title: "Built to come back",
    body: "Players share a result card, hosts tap Run it back, and next week's game is filled in.",
    wide: true,
  },
];

export const FAIRNESS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: "Everyone starts equal",
    body: "Standardized capital on Spot, the same virtual $10,000 on Futures. Money added after joining counts as capital, never as return.",
  },
  {
    title: "The score freezes at the bell",
    body: "Positions are rebuilt from fills inside the window and marked at the last price traded by the end. Selling after the bell changes nothing.",
  },
  {
    title: "Anyone can recompute it",
    body: "Scores come from public onchain data. Anyone can trigger finalize; winners are computed, never chosen.",
  },
  {
    title: "Contracts you can read",
    body: "Upgradeable Solidity with 100% test coverage, invariant tests and a clean Slither run, verified on Sourcify.",
  },
];

export const STACK: readonly {
  readonly name: string;
  readonly role: string;
  readonly logo?: string;
}[] = [
  { name: "Monad", role: "Settlement in under a second", logo: "/brands/monad.png" },
  { name: "Kuru", role: "Onchain spot order books", logo: "/brands/kuru.png" },
  { name: "Pyth", role: "Signed futures prices" },
  { name: "Mera", role: "Passkeys and derived keys" },
  { name: "Envio", role: "Indexed tournaments and fills" },
  { name: "Kimi", role: "Live commentary" },
];

export const TICKER: readonly string[] = [
  "Spot on Kuru",
  "Futures up to 100x",
  "One passkey",
  "Prize in escrow",
  "Kimi commentary in 8 languages",
  "Room codes and QR",
  "Scores anyone can recompute",
  "Live on Monad testnet",
];
