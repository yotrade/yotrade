"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { phaseAt } from "@yotrade/plugin-tournament/phase";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { buildMetadata } from "@/lib/create.ts";
import { tournamentMeta } from "@/lib/format.ts";
import { fundGas, GasError } from "@/lib/fund-gas.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useNow } from "@/lib/use-now.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { LogoPicker } from "./logo-picker.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

/** The host changes the name or logo. Visibility stays what it was: the invite is a separate switch. */
export function EditTournamentScreen({ id }: { id: string }) {
  const { identity } = useIdentity();
  const now = useNow();
  const { data, isPending } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => indexer.tournament(BigInt(id)),
  });

  let body = (
    <Loading label="Loading tournament" className="flex flex-col gap-4">
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </Loading>
  );
  if (!isPending) {
    const phase = data ? phaseAt(data, now) : "unknown";
    const host = data && identity && identity.wallet.account.address === data.organizer;
    body =
      host && (phase === "upcoming" || phase === "live") ? (
        <Editor id={id} organizer={identity} current={data.metadataURI} />
      ) : (
        <p role="alert" className="text-sm font-medium text-ink-muted">
          Only the host can change this, and only until the tournament ends.
        </p>
      );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <BackButton fallback={`/t/${id}`} />
        <h1 className="text-xl font-bold leading-[26px] tracking-tight">Edit tournament</h1>
      </header>
      {body}
    </main>
  );
}

interface EditorProps {
  readonly id: string;
  readonly organizer: NonNullable<ReturnType<typeof useIdentity>["identity"]>;
  readonly current: string;
}

function Editor({ id, organizer, current }: EditorProps) {
  const meta = tournamentMeta(BigInt(id), current);
  const { publicClient, tournament: manager } = useRuntime();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(meta.name);
  const [image, setImage] = useState(meta.image ?? "");
  const [logoOk, setLogoOk] = useState<boolean>();
  const [invalid, setInvalid] = useState<{ field: "name" | "image"; reason: string }>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const errorFor = (field: "name" | "image") =>
    invalid?.field === field ? { error: invalid.reason } : {};

  async function submit(event: FormEvent) {
    event.preventDefault();
    const built = buildMetadata({ name, visibility: meta.visibility, image });
    if (!built.ok) {
      setInvalid(built);
      return;
    }
    if (image.trim() !== "" && image.trim() !== meta.image && logoOk !== true) {
      setInvalid({
        field: "image",
        reason: "That image did not load. Check the link or clear it.",
      });
      return;
    }
    setInvalid(undefined);
    setFailure(undefined);
    setPending(true);
    try {
      const wallet = organizer.wallet;
      await fundGas(publicClient, wallet.account.address);
      await manager.setMetadata(wallet, BigInt(id), built.metadataURI);
      await queryClient.invalidateQueries({ queryKey: ["tournament"] });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      router.push(`/t/${id}`);
    } catch (cause) {
      console.error("setMetadata failed", cause);
      setFailure(
        cause instanceof GasError ? cause.message : "The change was not saved. Try again.",
      );
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <Field
        label="Name"
        maxLength={60}
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        {...errorFor("name")}
      />
      <LogoPicker
        wallet={organizer.wallet}
        value={image}
        error={errorFor("image").error}
        onChange={setImage}
        onStatus={setLogoOk}
      />
      {failure ? (
        <p role="alert" className="text-sm font-medium text-down">
          {failure}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        Save changes
      </Button>
    </form>
  );
}
