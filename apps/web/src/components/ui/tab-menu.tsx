/** Kit tab menu: 18 px semibold labels side by side, the active one in ink, the rest muted. */
export function TabMenu<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly T[];
  value: T;
  onChange(next: T): void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === value}
          onClick={() => onChange(tab)}
          className={`text-lg font-semibold leading-6 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-accent ${tab === value ? "text-ink" : "text-ink-muted/70 hover:text-ink-muted"}`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
