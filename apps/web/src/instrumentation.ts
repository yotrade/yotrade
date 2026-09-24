/** Runs once when a server instance starts. Background work lives here, on the Node.js runtime only. */
export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") {
    return;
  }
  const { startLiquidator } = await import("./server/liquidator.ts");
  startLiquidator();
}
