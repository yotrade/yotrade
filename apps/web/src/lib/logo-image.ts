import type { MeraWallet } from "@yotrade/plugin-mera/plugin";

import { uploadMessage } from "./logo-url.ts";

/** Big enough for a 56 px circle at 3x, small enough to upload in a blink. */
const SIZE = 256;

/** Crops the picked image to a centred square and shrinks it, in the browser, before anything is uploaded. */
export async function prepareLogo(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable");
  }
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  );
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))),
      "image/webp",
      0.9,
    );
  });
}

/** Signs the upload with the host's main account and returns the public URL of the stored logo. */
export async function uploadLogo(wallet: MeraWallet, file: File): Promise<string> {
  const blob = await prepareLogo(file);
  const issuedAt = Date.now();
  const address = wallet.account.address;
  const signature = await wallet.signMessage({ message: uploadMessage(address, issuedAt) });
  const form = new FormData();
  form.set("file", blob, "logo.webp");
  form.set("address", address);
  form.set("issuedAt", String(issuedAt));
  form.set("signature", signature);
  const response = await fetch("/api/logo/upload", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!(response.ok && body.url)) {
    throw new Error(body.error ?? "Upload failed, try again");
  }
  return body.url;
}
