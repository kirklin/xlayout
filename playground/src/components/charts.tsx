import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";
import { cn } from "~/lib/cn";

export interface Series {
  name: string;
  values: readonly number[];
  /** Background class for bars, markers and legend swatches. */
  fill: string;
  /** Text class whose color strokes the line. */
  stroke?: string;
  dashed?: boolean;
}

interface TooltipRow {
  name: string;
  value: string;
  fill: string;
}

/** Places a tooltip beside the span from `start` to `end` percent across a chart, on the side with more room. */
function beside(start: number, end: number): React.CSSProperties {
  return start + end < 100 ? { left: `calc(${end}% + 8px)` } : { right: `calc(${100 - start}% + 8px)` };
}

function ChartTooltip({ label, rows, style }: { label: string; rows: TooltipRow[]; style: React.CSSProperties }): React.ReactNode {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 grid min-w-32 gap-1.5 rounded-lg border border-zinc-200/70 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      style={style}
    >
      <div className="font-medium">{label}</div>
      <div className="grid gap-1.5">
        {rows.map(row => (
          <div key={row.name} className="flex items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-[2px]", row.fill)} />
            <span className="flex-1 text-zinc-500 dark:text-zinc-400">{row.name}</span>
            <span className="font-mono font-medium tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ series }: { series: readonly Series[] }): React.ReactNode {
  return (
    <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
      {series.map(entry => (
        <span key={entry.name} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={cn("size-2 rounded-[2px]", entry.fill)} />
          {entry.name}
        </span>
      ))}
    </div>
  );
}

/** The change of a figure over the last period, as a percentage. */
export function Trend({ change, className }: { change: number; className?: string }): React.ReactNode {
  const Icon: LucideIcon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 px-1.5 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:border-zinc-800 dark:text-zinc-300", className)}>
      <Icon className="size-3" />
      {`${change >= 0 ? "+" : "−"}${Math.abs(change)}%`}
    </span>
  );
}

function GridLines(): React.ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      {["top", "upper", "lower", "bottom"].map(line => <div key={line} className="border-t border-zinc-100 dark:border-zinc-800/80" />)}
    </div>
  );
}

/** The smallest round number at or above `value`, for the top of an axis that starts at zero. */
function axisTop(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

interface ChartProps {
  labels: readonly string[];
  series: readonly Series[];
  format?: (value: number) => string;
}

function tooltipRows(series: readonly Series[], index: number, format: (value: number) => string): TooltipRow[] {
  return series.map(entry => ({ name: entry.name, value: format(entry.values[index]!), fill: entry.fill }));
}

export function BarChart({ labels, series, format = String }: ChartProps): React.ReactNode {
  const [active, setActive] = React.useState<number | null>(null);
  const top = axisTop(Math.max(...series.flatMap(entry => entry.values)));
  const span = 100 / labels.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1" onPointerLeave={() => setActive(null)}>
        <GridLines />
        <div className="absolute inset-0 flex">
          {labels.map((label, index) => (
            <div key={label} className="relative flex flex-1 justify-center" onPointerEnter={() => setActive(index)}>
              {active === index && <div className="absolute inset-y-0 inset-x-[6%] rounded-md bg-zinc-100/80 dark:bg-zinc-800/60" />}
              <div className="relative flex h-full w-3/4 items-end justify-center gap-1">
                {series.map(entry => (
                  <div
                    key={entry.name}
                    className={cn("max-w-7 flex-1 rounded-sm", entry.fill)}
                    style={{ height: `${(entry.values[index]! / top) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {active !== null && <ChartTooltip label={labels[active]!} rows={tooltipRows(series, active, format)} style={beside(active * span, (active + 1) * span)} />}
      </div>
      <div className="flex pt-2.5">
        {labels.map(label => <span key={label} className="flex-1 text-center text-xs text-zinc-500 dark:text-zinc-400">{label}</span>)}
      </div>
    </div>
  );
}

/** Points of a series inside a 100 by 100 box, `low` at the bottom and `high` at the top. */
function plot(values: readonly number[], low: number, high: number): [number, number][] {
  return values.map((value, index) => [(index / (values.length - 1)) * 100, 100 - ((value - low) / (high - low)) * 100]);
}

/** A smooth path through the points, as a Catmull-Rom spline drawn with cubic Béziers. */
function curve(points: readonly [number, number][]): string {
  return points.map(([x, y], index) => {
    if (index === 0) {
      return `M${x},${y}`;
    }
    const [x0, y0] = points[index - 1]!;
    const [xp, yp] = points[index - 2] ?? points[index - 1]!;
    const [xn, yn] = points[index + 1] ?? [x, y];
    return `C${x0 + (x - xp) / 6},${y0 + (y - yp) / 6} ${x - (xn - x0) / 6},${y - (yn - y0) / 6} ${x},${y}`;
  }).join(" ");
}

/** A filled trend line without axes that stretches to its box. */
export function AreaChart({ values }: { values: readonly number[] }): React.ReactNode {
  const gradientId = React.useId();
  const low = Math.min(...values);
  const high = Math.max(...values);
  // A margin below the lowest point keeps the fill from running flat along the bottom.
  const line = curve(plot(values, low - (high - low) * 0.4, high));
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full overflow-visible text-blue-600 dark:text-blue-500" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L100,100 L0,100 Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface Spark {
  label: string;
  value: number;
}

/** Thin bars for a short history, the latest in the strong color. */
export function SparkBars({ sparks }: { sparks: readonly Spark[] }): React.ReactNode {
  const top = Math.max(...sparks.map(spark => spark.value));
  return (
    <div className="flex size-full items-end gap-1">
      {sparks.map((spark, index) => (
        <div
          key={spark.label}
          title={`${spark.label}: ${spark.value}%`}
          className={cn("flex-1 rounded-[3px]", index === sparks.length - 1 ? "bg-blue-600 dark:bg-blue-500" : "bg-blue-200 dark:bg-blue-900/70")}
          style={{ height: `${(spark.value / top) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function LineChart({ labels, series, format = String }: ChartProps): React.ReactNode {
  const [active, setActive] = React.useState<number | null>(null);
  const top = axisTop(Math.max(...series.flatMap(entry => entry.values)));
  const plotted = series.map(entry => plot(entry.values, 0, top));
  const pick = (event: React.PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    setActive(Math.round(((event.clientX - rect.left) / rect.width) * (labels.length - 1)));
  };
  const x = active === null ? 0 : (active / (labels.length - 1)) * 100;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1" onPointerMove={pick} onPointerLeave={() => setActive(null)}>
        <GridLines />
        {active !== null && <div className="absolute inset-y-0 border-s border-zinc-200 dark:border-zinc-700" style={{ left: `${x}%` }} />}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {series.map((entry, index) => (
            <path
              key={entry.name}
              d={curve(plotted[index]!)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={entry.dashed ? "4 4" : undefined}
              vectorEffect="non-scaling-stroke"
              className={entry.stroke}
            />
          ))}
        </svg>
        {active !== null && (
          <>
            {series.map((entry, index) => (
              <span
                key={entry.name}
                className={cn("absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-white dark:ring-zinc-900", entry.fill)}
                style={{ left: `${x}%`, top: `${plotted[index]![active]![1]}%` }}
              />
            ))}
            <ChartTooltip label={labels[active]!} rows={tooltipRows(series, active, format)} style={beside(x, x)} />
          </>
        )}
      </div>
      <div className="flex justify-between pt-2.5">
        {labels.map(label => <span key={label} className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>)}
      </div>
    </div>
  );
}

export interface Share {
  name: string;
  value: number;
}

/** Shares of a whole, largest first, each as a bar with its name inside. */
export function BarList({ shares }: { shares: readonly Share[] }): React.ReactNode {
  const top = Math.max(...shares.map(share => share.value));
  return (
    <ul className="flex flex-col gap-1.5">
      {shares.map(share => (
        <li key={share.name} className="flex items-center gap-3">
          <div className="relative h-7 min-w-0 flex-1">
            <div className="absolute inset-y-0 start-0 rounded-md bg-blue-100 dark:bg-blue-950/70" style={{ width: `${(share.value / top) * 100}%` }} />
            <span className="relative flex h-full items-center truncate px-2 text-sm">{share.name}</span>
          </div>
          <span className="w-9 shrink-0 text-end font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">{`${share.value}%`}</span>
        </li>
      ))}
    </ul>
  );
}

/** A ring filled to `value` out of 100, with the figure in its middle. */
export function Ring({ value, caption }: { value: number; caption: string }): React.ReactNode {
  const circumference = 2 * Math.PI * 42;
  return (
    <div className="relative aspect-square h-full max-w-full">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-blue-100 dark:stroke-blue-950/70" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
          className="stroke-blue-600 dark:stroke-blue-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{`${value}%`}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{caption}</span>
      </div>
    </div>
  );
}
