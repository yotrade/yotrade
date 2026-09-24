"use client";

import { type ReactNode, useEffect, useRef } from "react";

interface Props {
  readonly open: boolean;
  readonly label: string;
  onClose(): void;
  /** While true, Escape and the backdrop do nothing: an order in flight must stay on screen to report back. */
  readonly locked?: boolean;
  readonly children: ReactNode;
}

/** Kit bottom sheet on a native dialog: 32 px corners, grab handle, slide-up, Escape and backdrop to close. */
export function Sheet({ open, label, onClose, locked = false, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
    }
    if (!open && element?.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      // Escape fires `cancel` first; cancelling it keeps the dialog open.
      onCancel={(event) => locked && event.preventDefault()}
      onClick={(event) => !locked && event.target === dialog.current && onClose()}
      onKeyDown={(event) => !locked && event.key === "Escape" && onClose()}
      aria-label={label}
      className="m-0 mx-auto mt-auto w-full max-w-md animate-sheet rounded-t-[32px] bg-surface p-0 text-ink backdrop:bg-[#52525b]/60"
    >
      <div className="flex flex-col gap-6 px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-2.5">
        <span aria-hidden className="mx-auto h-[5px] w-[25px] rounded-full bg-[#d4d4d8]" />
        {children}
      </div>
    </dialog>
  );
}

export function SheetRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-3">
      <span className="flex items-center gap-3 text-sm font-semibold tracking-tight">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink-muted">
        {children}
      </span>
    </div>
  );
}
