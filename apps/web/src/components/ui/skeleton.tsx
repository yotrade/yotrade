import type { HTMLAttributes } from "react";

/** A block shaped like the content it stands for. Size comes from `className`, and so can the radius. */
export function Skeleton({ className = "" }: { className?: string }) {
  // Two radius utilities on one element resolve by stylesheet order, not by intent: apply only one.
  const radius = className.includes("rounded") ? "" : "rounded-lg";
  return <span aria-hidden className={`block animate-pulse bg-well ${radius} ${className}`} />;
}

/** Wraps skeletons so assistive tech hears one "Loading" instead of a pile of empty boxes. */
export function Loading({
  label,
  className = "",
  children,
}: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return (
    <div role="status" aria-busy className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** The list row every screen uses: 40 px icon, two lines, a value on the right. */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface-raised p-4">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-2/5" />
      </div>
      <Skeleton className="h-4 w-14" />
    </div>
  );
}

export function RowsSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <Loading label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders that never reorder
        <RowSkeleton key={index} />
      ))}
    </Loading>
  );
}
