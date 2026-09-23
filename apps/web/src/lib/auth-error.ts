/** Turns a passkey failure into copy a person can act on. Matches Mera's stable error codes structurally. */
export function describeAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

  if (code === "PRF_UNAVAILABLE") {
    return "This passkey provider cannot derive keys. Try your phone, iCloud Keychain or Google Password Manager.";
  }
  const name = domErrorName(error);
  if (name === "SecurityError") {
    return "Passkeys are not set up for this address yet. Open the app at its real domain.";
  }
  if (name === "NotAllowedError") {
    return "The passkey prompt was dismissed or timed out. Try again and complete it.";
  }
  if (code === "PASSKEY_OPERATION_FAILED") {
    return "The passkey prompt was closed or is not available in this browser. Try again.";
  }
  return "Something went wrong. Try again.";
}

/** The WebAuthn DOMException behind a failure, when the wrapper kept it as `cause`. */
function domErrorName(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const name = "name" in current ? current.name : undefined;
    if (name === "SecurityError" || name === "NotAllowedError") {
      return name;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}
