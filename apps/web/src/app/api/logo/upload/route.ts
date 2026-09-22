import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isAddress, isHex } from "viem";

import { parseServerEnv } from "@/lib/server-env.ts";
import { createLogoUploader, type LogoStore, UploadError } from "@/server/logo-upload.ts";

let uploader: ReturnType<typeof createLogoUploader> | null | undefined;

function createStore(token: string): LogoStore {
  return {
    async put(key, body, contentType) {
      const blob = await put(key, new Blob([body as BlobPart], { type: contentType }), {
        access: "public",
        contentType,
        token,
        // The key already carries the content hash, so the same logo is one file.
        addRandomSuffix: false,
      });
      return blob.url;
    },
  };
}

/** `POST` multipart: `file`, `address`, `issuedAt`, `signature`. Answers `{ url }`. */
export async function POST(request: Request) {
  if (uploader === undefined) {
    const token = parseServerEnv({
      BLOB_READ_WRITE_TOKEN: process.env["BLOB_READ_WRITE_TOKEN"],
    }).BLOB_READ_WRITE_TOKEN;
    uploader = token ? createLogoUploader({ store: createStore(token) }) : null;
  }
  if (!uploader) {
    return NextResponse.json({ error: "Uploads are not configured" }, { status: 503 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const address = String(form?.get("address") ?? "");
  const issuedAt = Number(form?.get("issuedAt") ?? Number.NaN);
  const signature = String(form?.get("signature") ?? "");
  if (
    !(file instanceof Blob && isAddress(address) && Number.isFinite(issuedAt) && isHex(signature))
  ) {
    return NextResponse.json(
      { error: "Expected file, address, issuedAt and signature" },
      { status: 400 },
    );
  }
  try {
    const url = await uploader({
      address,
      issuedAt,
      signature,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({ url });
  } catch (cause) {
    const status = cause instanceof UploadError ? cause.status : 502;
    const error = cause instanceof UploadError ? cause.message : "Upload failed, try again";
    return NextResponse.json({ error }, { status });
  }
}

/** Tells the client whether the picker should show at all. */
export function GET() {
  const token = parseServerEnv({
    BLOB_READ_WRITE_TOKEN: process.env["BLOB_READ_WRITE_TOKEN"],
  }).BLOB_READ_WRITE_TOKEN;
  return NextResponse.json({ enabled: Boolean(token) });
}
