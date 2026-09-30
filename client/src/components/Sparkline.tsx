export interface SparklinePoint {
  date: string;
  closeUsd: number;
}

/**
 * Inline SVG price line for a holdings row. Hand-rolled rather than recharts:
 * one chart per holding means a dozen chart instances, and a polyline is all
 * this needs. Hidden entirely below two points — a single price is not a trend.
 */
export function Sparkline({ points, color, label }: { points: SparklinePoint[]; color: string; label: string }) {
  if (points.length < 2) return null;
  const width = 96;
  const height = 28;
  const values = points.map((point) => point.closeUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const y = (value: number) => height - 2 - ((value - min) / span) * (height - 4);
  const line = points.map((point, index) => `${(index * step).toFixed(2)},${y(point.closeUsd).toFixed(2)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const change = ((last - first) / first) * 100;

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} เปลี่ยนแปลง ${change >= 0 ? "+" : ""}${change.toFixed(1)}% ใน ${points.length} วันที่มีราคา`}
    >
      <title>{`${label}: ${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}</title>
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
