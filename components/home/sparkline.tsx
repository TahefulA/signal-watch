interface SparklineProps {
  values: number[];
  className?: string;
}

/** Thirty-day trend, scaled to its own range so small moves stay visible. */
export function Sparkline({ values, className = "" }: SparklineProps) {
  const width = 96;
  const height = 28;
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 4) + 2;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = values[values.length - 1] > values[0];
  const last = points.split(" ").at(-1)?.split(",") ?? ["0", "0"];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={rising ? "#DC2626" : "#A1A1AA"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={rising ? "#DC2626" : "#A1A1AA"} />
    </svg>
  );
}
