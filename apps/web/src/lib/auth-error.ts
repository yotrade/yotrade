/** Turns a passkey failure into copy a person can act on. Matches Mera's stable error codes structurally. */
export function describeAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

  if (code === "PRF_UNAVAILABLE") {
    return "This passkey provider cannot derive keys. Try your phone, iCloud Keychain or Google Password Manager.";
  }
  if (code === "PASSKEY_OPERATION_FAILED") {
    return "The passkey prompt was closed or is not available in this browser. Try again.";
  }
  return "Something went wrong. Try again.";
}
