export class EmptyBookError extends Error {
  override readonly name = "EmptyBookError";
  constructor(market: string) {
    super(`${market} has no two-sided liquidity; a swap would succeed onchain and fill nothing`);
  }
}

export class NoKuruAccountError extends Error {
  override readonly name = "NoKuruAccountError";
  constructor(address: string) {
    super(`${address} has no Kuru account yet; deposit first`);
  }
}

export class TransactionRevertedError extends Error {
  override readonly name = "TransactionRevertedError";
  constructor(hash: string) {
    super(`Transaction ${hash} reverted`);
  }
}
