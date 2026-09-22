import Link from "next/link";

import { Icon } from "@/components/ui/icon.tsx";

/** A dead link still lands inside the app, with a way back. */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-10 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-accent-soft">
        <Icon name="info" size={28} />
      </span>
      <h1 className="text-xl font-bold leading-[26px] tracking-tight">Nothing here</h1>
      <p className="max-w-64 text-sm font-medium leading-5 text-ink-muted">
        That page does not exist, or the tournament it pointed to was never created.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-mono text-[15px] font-semibold text-accent-ink shadow-button transition duration-200 hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
      >
        Back to home
      </Link>
    </main>
  );
}
