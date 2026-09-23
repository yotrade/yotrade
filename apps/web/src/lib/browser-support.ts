/**
 * In-app browsers that cannot show a passkey prompt or cannot hand its result back. The link must be opened
 * in the system browser instead. User-agent sniffing is the only signal there is; the patterns are the ones
 * each app stamps on itself.
 */
const WEBVIEWS = [
  /FBAN|FBAV/, // Facebook, Messenger
  /Instagram/,
  /Twitter|TwitterAndroid|X\/\d/i,
  /Line\//,
  /Discord/,
  /Snapchat/,
  /; ?wv\)/, // Android WebView
];

export type PasskeySupport =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "webview" | "no-webauthn" };

/** Whether this browser can run a passkey ceremony at all, decided before the first tap. */
export function passkeySupport(input: {
  readonly userAgent: string;
  readonly hasWebAuthn: boolean;
}): PasskeySupport {
  if (WEBVIEWS.some((pattern) => pattern.test(input.userAgent))) {
    return { ok: false, reason: "webview" };
  }
  if (!input.hasWebAuthn) {
    return { ok: false, reason: "no-webauthn" };
  }
  return { ok: true };
}
