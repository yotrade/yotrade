const NONCE_LENGTH = 12;

export interface Sealed {
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
}

export interface Vault {
  seal(plaintext: Uint8Array): Promise<Sealed>;
  /** Rejects when the data was tampered with or sealed under another passkey. */
  open(sealed: Sealed): Promise<Uint8Array>;
}

/** AES-256-GCM over Web Crypto. The key never leaves the `CryptoKey` handle and is not extractable. */
export async function createVault(key: Uint8Array): Promise<Vault> {
  if (key.length !== 32) {
    throw new RangeError("Vault key must be 32 bytes");
  }
  const cryptoKey = await crypto.subtle.importKey("raw", key.slice(), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

  return {
    async seal(plaintext) {
      const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        cryptoKey,
        plaintext.slice(),
      );
      return { nonce, ciphertext: new Uint8Array(ciphertext) };
    },

    async open({ nonce, ciphertext }) {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce.slice() },
        cryptoKey,
        ciphertext.slice(),
      );
      return new Uint8Array(plaintext);
    },
  };
}
