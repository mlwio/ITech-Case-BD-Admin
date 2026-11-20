import { encodeCode39 } from "@/lib/couriers/barcode";
import { cn } from "@/lib/utils";

interface BarcodeProps {
  value: string;
  /** Rendered height in pixels. */
  height?: number;
  /** Show the human-readable value under the bars. */
  showValue?: boolean;
  className?: string;
}

/**
 * Scannable Code 39 barcode rendered as inline SVG — no client JS, no deps.
 * The quiet zone is baked into the viewBox so scanners have white margin.
 */
export function Barcode({ value, height = 54, showValue = true, className }: BarcodeProps) {
  const { bars, width } = encodeCode39(value);
  const quiet = 10;
  const totalWidth = width + quiet * 2;

  return (
    <div className={cn("w-full", className)}>
      <svg
        role="img"
        aria-label={`Barcode ${value}`}
        viewBox={`0 0 ${totalWidth} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
      >
        <rect x={0} y={0} width={totalWidth} height={height} fill="#ffffff" />
        {bars.map((bar, index) => (
          <rect
            key={index}
            x={bar.x + quiet}
            y={0}
            width={bar.width}
            height={height}
            fill="#000000"
          />
        ))}
      </svg>
      {showValue && (
        <p className="mt-0.5 text-center font-mono text-[11px] tracking-[0.3em]">{value}</p>
      )}
    </div>
  );
}
