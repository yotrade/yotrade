"use client";

import { useQuery } from "@tanstack/react-query";
import type { MeraWallet } from "@yotrade/plugin-mera/plugin";
import { useRef, useState } from "react";

import { uploadLogo } from "@/lib/logo-image.ts";
import { isLogoUrl } from "@/lib/logo-url.ts";
import { Field } from "./ui/field.tsx";
import { TournamentLogo } from "./ui/tournament-logo.tsx";

interface Props {
  readonly wallet: MeraWallet;
  /** The link the form will store: what was uploaded, or what was pasted. */
  readonly value: string;
  readonly error?: string | undefined;
  onChange(next: string): void;
  onStatus(ok: boolean | undefined): void;
}

const BUTTON =
  "rounded-lg bg-accent-soft px-2.5 py-1.5 font-mono text-xs font-bold text-accent transition duration-200 hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";

/** Pick a file when uploads are set up, paste a link otherwise. Either way the result is one https link. */
export function LogoPicker({ wallet, value, error, onChange, onStatus }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [pasting, setPasting] = useState(false);
  const uploads = useQuery({
    queryKey: ["logo-uploads"],
    queryFn: async () => {
      const response = await fetch("/api/logo/upload");
      return response.ok ? ((await response.json()) as { enabled: boolean }).enabled : false;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  const canUpload = uploads.data === true;
  const link = value.trim();
  let status = "Square works best. Cropped and shrunk on your device.";
  if (busy) {
    status = "Uploading…";
  } else if (link) {
    status = "Looks good";
  }

  async function pick(file: File | undefined) {
    if (!file) {
      return;
    }
    setBusy(true);
    setFailure(undefined);
    onStatus(undefined);
    try {
      onChange(await uploadLogo(wallet, file));
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Upload failed, try again");
    } finally {
      setBusy(false);
      if (input.current) {
        input.current.value = "";
      }
    }
  }

  if (!canUpload || pasting) {
    return (
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Field
            label="Logo link (optional)"
            placeholder="https://your.community/logo.png"
            inputMode="url"
            autoComplete="off"
            value={value}
            onChange={(event) => {
              onStatus(undefined);
              onChange(event.target.value);
            }}
            hint="A square PNG, JPG or SVG on any https site. Shown on cards and the tournament page."
            {...(error ? { error } : {})}
          />
        </div>
        {/* Level with the input, not with the hint under it. */}
        <div className="mt-[30px]">
          <TournamentLogo
            key={link}
            image={isLogoUrl(link) ? link : undefined}
            size={56}
            onStatus={onStatus}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold tracking-tight">Logo (optional)</p>
      <div className="flex items-center gap-3 rounded-[18px] bg-well p-1">
        <div className="flex flex-1 items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 shadow-row">
          <TournamentLogo
            key={link}
            image={isLogoUrl(link) ? link : undefined}
            size={44}
            onStatus={onStatus}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-medium text-ink-muted">{status}</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className={BUTTON}
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {link ? "Replace" : "Choose image"}
              </button>
              {link ? (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => {
                    onChange("");
                    onStatus(undefined);
                  }}
                >
                  Remove
                </button>
              ) : (
                <button type="button" className={BUTTON} onClick={() => setPasting(true)}>
                  Paste a link
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Choose a logo image"
        className="sr-only"
        onChange={(event) => pick(event.target.files?.[0])}
      />
      {failure || error ? (
        <p role="alert" className="text-[13px] font-medium text-down">
          {failure ?? error}
        </p>
      ) : null}
    </div>
  );
}
