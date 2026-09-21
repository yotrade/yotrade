# @yotrade/plugin-mera

Passkey identity for a YoTrade runtime, built on [Mera](https://mera.category.xyz). One ceremony, no seed phrase, nothing stored.

```ts
import { createRuntime } from "@yotrade/core/plugin";
import { mera } from "@yotrade/plugin-mera/plugin";
import { monadTestnet } from "viem/chains";

const runtime = createRuntime({
  chain: monadTestnet,
  plugins: [mera({ rp: { id: location.hostname, name: "YoTrade" } })],
});

const me = await runtime.mera.signIn();        // one biometric prompt
me.wallet;                                      // main account, signs without prompting
me.tournamentWallet(7n);                        // isolated trading account for tournament 7
const vault = await me.vault();                 // AES-256-GCM for private data
me.end();                                       // wipe keys
```

## How keys are derived

A single WebAuthn PRF evaluation with a fixed salt gives 32 bytes of entropy. HKDF-SHA256 with domain-separated labels (`yotrade/v1/account`, `…/tournament/<chainId>/<id>`, `…/vault`) turns it into independent keys. One prompt covers every key, and a fresh device holding the passkey rebuilds all of them.

The PRF salt and the account derivation are pinned by test vectors: changing either would move every user to a new address.

## Testing without an authenticator

Pass a `source` that returns the PRF output:

```ts
mera({ rp, source: { register: fake, signIn: fake } });
```
