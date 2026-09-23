import { encode } from "uqr";

/** A QR code as crisp SVG, one rect per dark module: scales to any projector without blur. */
export function QrCode({
  value,
  size = 240,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const { data, size: modules } = encode(value, { border: 2, ecc: "M" });
  const cells: string[] = [];
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) {
        cells.push(`M${x} ${y}h1v1h-1z`);
      }
    });
  });
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      className="rounded-2xl bg-white"
    >
      <path d={cells.join("")} fill="#0e091c" />
    </svg>
  );
}
