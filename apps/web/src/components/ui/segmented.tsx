/** Kit segmented control: a grey well, the selected segment white with a hairline shadow. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange(next: T): void;
  label: string;
}) {
  return (
    <fieldset className="flex gap-1 rounded-[18px] bg-well p-1">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={`flex-1 whitespace-nowrap font-mono font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-accent min-h-10 rounded-2xl px-2 text-[13px] ${option === value ? "bg-surface text-ink shadow-row" : "text-ink-muted hover:text-ink"}`}
        >
          {option}
        </button>
      ))}
    </fieldset>
  );
}
