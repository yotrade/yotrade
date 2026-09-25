/** Every link and line the landing page shows, in one place. The app is the source of truth for the product. */
export const APP_URL = "https://app.yotrade.xyz";

export const LINKS = {
  app: APP_URL,
  host: `${APP_URL}/new`,
  arena: `${APP_URL}/arena`,
  repo: "https://github.com/yotrade/yotrade",
} as const;

export const META = {
  title: "YoTrade · Trading tournaments for your community",
  description:
    "Host a trading tournament for your community in three taps. Players join with one passkey, trade real Kuru order books or up to 100x futures at Pyth prices, and the contract pays the winners. Live on Monad.",
} as const;

export const NAV: readonly { readonly label: string; readonly href: string }[] = [
  { label: "Meet", href: "#meet" },
  { label: "Modes", href: "#modes" },
  { label: "Arena", href: LINKS.arena },
  { label: "GitHub", href: LINKS.repo },
];

/** A name set in its own face, the way the template sets its brand marquee. */
export interface Wordmark {
  readonly name: string;
  readonly style: string;
}

/** What YoTrade is built with, each in a different face. Built with, not funded by. */
export const STACK: readonly Wordmark[] = [
  {
    name: "Monad",
    style:
      "font-family: Georgia, serif; font-weight: 700; letter-spacing: -0.02em; font-size: 15px",
  },
  {
    name: "Kuru",
    style:
      "font-family: Arial, sans-serif; font-weight: 900; letter-spacing: 0.08em; font-size: 13px; text-transform: uppercase",
  },
  {
    name: "Pyth",
    style:
      "font-family: 'Trebuchet MS', sans-serif; font-weight: 600; letter-spacing: 0.01em; font-size: 15px; font-style: italic",
  },
  {
    name: "Mera",
    style:
      "font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: 0.12em; font-size: 13px; text-transform: uppercase",
  },
  {
    name: "Envio",
    style:
      "font-family: Palatino, 'Book Antiqua', serif; font-weight: 400; letter-spacing: -0.01em; font-size: 16px",
  },
  {
    name: "Kimi",
    style:
      "font-family: Impact, 'Arial Narrow', sans-serif; font-weight: 400; letter-spacing: 0.04em; font-size: 14px",
  },
  {
    name: "Alchemy",
    style:
      "font-family: Verdana, sans-serif; font-weight: 700; letter-spacing: -0.03em; font-size: 13px",
  },
];

/** The same names, larger, for the "built on" row. */
export const BUILT_ON: readonly Wordmark[] = [
  {
    name: "Monad",
    style:
      "font-family: 'Times New Roman', serif; font-weight: 400; letter-spacing: 0.02em; font-size: 16px",
  },
  {
    name: "KURU",
    style:
      "font-family: 'Arial Black', sans-serif; font-weight: 900; letter-spacing: 0.08em; font-size: 16px",
  },
  {
    name: "PYTH",
    style:
      "font-family: Impact, sans-serif; font-weight: 700; letter-spacing: 0.05em; font-size: 18px",
  },
  {
    name: "Mera",
    style:
      "font-family: Georgia, serif; font-weight: 600; letter-spacing: -0.02em; font-size: 17px",
  },
  {
    name: "Envio",
    style:
      "font-family: Helvetica, sans-serif; font-weight: 700; letter-spacing: -0.01em; font-size: 15px",
  },
  {
    name: "Kimi",
    style:
      "font-family: Verdana, sans-serif; font-weight: 700; letter-spacing: 0.06em; font-size: 14px; text-transform: uppercase",
  },
  {
    name: "ALCHEMY",
    style:
      "font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: 0.18em; font-size: 14px",
  },
];

export interface Mode {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly body: string;
  readonly shot: string;
  readonly alt: string;
}

export const MODES: readonly Mode[] = [
  {
    id: "spot",
    label: "Spot",
    title: "Spot on Kuru",
    body: "Real order books on Monad. Everyone starts with the same test capital, every order shows its price impact first, and the score counts only what happened inside the window.",
    shot: "/shots/markets.jpg",
    alt: "Spot markets in the app: price, move and chart for each token",
  },
  {
    id: "futures",
    label: "Futures",
    title: "Futures up to 100x",
    body: "Long or short BTC, ETH and SOL at signed Pyth prices, from the same virtual $10,000. Accounts under margin are liquidated within 30 seconds, and getting out never waits for the oracle.",
    shot: "/shots/futures.jpg",
    alt: "A Bitcoin perpetual in the app with a candle chart and Long and Short buttons",
  },
  {
    id: "rooms",
    label: "Rooms",
    title: "Community nights",
    body: "A six-character code and a QR on the big screen, a lobby that fills as phones scan, a podium with confetti at the end. Private rooms take an invite the contract checks on every join.",
    shot: "/shots/board.jpg",
    alt: "A tournament in the app with its prize pool, game code and podium",
  },
];
