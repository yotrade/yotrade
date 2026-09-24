const COLORS = ["#6e54ff", "#ffd166", "#7ce7a3", "#85e6ff", "#ff8fb1"];

/**
 * Falling paper, purely decorative. `once` plays a single burst (the phone), otherwise it keeps falling (the
 * big screen). Reduced motion turns the animation off in the stylesheet.
 */
export function Confetti({ pieces = 60, once = false }: { pieces?: number; once?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: pieces }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of decorative pieces
          key={i}
          className="absolute top-[-5%] block h-3 w-2 animate-confetti rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 12) * (once ? 0.12 : 0.35)}s`,
            animationDuration: `${(once ? 2.5 : 4) + (i % 5) * 0.4}s`,
            animationIterationCount: once ? 1 : "infinite",
            animationFillMode: "forwards",
          }}
        />
      ))}
    </div>
  );
}
