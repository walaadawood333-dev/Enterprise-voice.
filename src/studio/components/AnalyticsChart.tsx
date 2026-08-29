import { useMemo, type ReactNode } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Panel, PanelHeader } from "./primitives";

/** Registered once for the module — react-chartjs-2 creates and destroys each instance. */
let registered = false;
function ensureRegistered() {
  if (registered) return;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Filler,
    Tooltip,
    Legend
  );
  registered = true;
}

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const INK = "#000000";
const MONO = '"Saira Condensed", sans-serif';
const BODY = '"Cairo", sans-serif';
const PALETTE = ["rgba(0,0,0,0.85)", "rgba(0,0,0,0.38)", "rgba(0,0,0,0.16)"];

export interface ChartSeries {
  labels: string[];
  datasets: { label: string; data: number[]; color?: string }[];
}

export type ChartKind = "line" | "bar" | "doughnut" | "performance";

const axes = (unit: string) => ({
  x: {
    grid: { display: false },
    border: { color: "rgba(0,0,0,0.08)" },
    ticks: { color: "rgba(0,0,0,0.45)", font: { family: MONO, size: 11 } },
  },
  y: {
    beginAtZero: true,
    grid: { color: "rgba(0,0,0,0.06)" },
    border: { display: false },
    ticks: {
      color: "rgba(0,0,0,0.45)",
      precision: 0,
      maxTicksLimit: 5,
      font: { family: MONO, size: 11 },
      callback: (value: string | number) => `${value}${unit === " " ? "" : ` ${unit}`}`,
    },
  },
});

const pluginsFor = (unit: string) =>
  ({
    legend: {
      display: true,
      position: "bottom",
      align: "start",
      labels: {
        usePointStyle: true,
        boxWidth: 8,
        boxHeight: 8,
        color: "rgba(0,0,0,0.55)",
        padding: 14,
        font: { family: MONO, size: 12, weight: 600 },
      },
    },
    tooltip: {
      backgroundColor: INK,
      padding: 10,
      cornerRadius: 12,
      displayColors: false,
      titleFont: { family: MONO, size: 12, weight: 700 },
      bodyFont: { family: BODY, size: 12 },
      callbacks: {
        label: (item: { dataset?: { label?: string }; parsed?: { y?: number }; label?: string; formattedValue?: string }) =>
          `${item.dataset?.label ? `${item.dataset.label}: ` : `${item.label}: `}${item.formattedValue ?? item.parsed?.y ?? 0} ${unit}`.trim(),
      },
    },
  }) as unknown as ChartOptions<"line">["plugins"];

export function AnalyticsChart({
  kind,
  title,
  eyebrow,
  caption,
  aside,
  series,
  unit = "",
  height = "h-[236px] sm:h-[268px]",
}: {
  kind: ChartKind;
  title: string;
  eyebrow?: string;
  caption?: string;
  aside?: ReactNode;
  series: ChartSeries;
  /** Appended to axis ticks and tooltips, e.g. "min". */
  unit?: string;
  height?: string;
}) {
  ensureRegistered();

  const labels = series.labels;
  const tickUnit = unit ? ` ${unit}` : "";

  const lineData = useMemo<ChartData<"line">>(
    () => ({
      labels,
      datasets: series.datasets.map((set, index) => ({
        label: set.label,
        data: set.data,
        borderColor: set.color ?? PALETTE[index % PALETTE.length],
        backgroundColor: "rgba(0,0,0,0.05)",
        borderWidth: 2,
        fill: true,
        tension: 0.32,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: set.color ?? INK,
      })),
    }),
    [labels, series]
  );

  const barData = useMemo<ChartData<"bar">>(
    () => ({
      labels,
      datasets: series.datasets.map((set, index) => ({
        label: set.label,
        data: set.data,
        backgroundColor: set.color ?? PALETTE[index % PALETTE.length],
        borderRadius: 6,
        borderSkipped: false as const,
        maxBarThickness: kind === "performance" ? 18 : 34,
      })),
    }),
    [labels, series, kind]
  );

  const doughnutData = useMemo<ChartData<"doughnut">>(
    () => ({
      labels,
      datasets: [
        {
          data: series.datasets[0]?.data ?? [],
          backgroundColor: PALETTE,
          borderColor: "#ffffff",
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    }),
    [labels, series]
  );

  const animation = reduced() ? (false as const) : ({ duration: 420 } as const);
  const common = { responsive: true, maintainAspectRatio: false, animation } as const;

  return (
    <Panel as="article" className="flex flex-col gap-4">
      <PanelHeader title={title} eyebrow={eyebrow} aside={aside} />
      <div className={`relative w-full ${height}`}>
        {kind === "doughnut" ? (
          <Doughnut
            data={doughnutData}
            options={{
              ...common,
              cutout: "66%",
              plugins: pluginsFor(tickUnit.trim() ? `${tickUnit.trim()} sessions` : "sessions"),
            } as ChartOptions<"doughnut">}
          />
        ) : kind === "bar" || kind === "performance" ? (
          <Bar
            data={barData}
            options={
              {
                ...common,
                indexAxis: kind === "performance" ? ("y" as const) : ("x" as const),
                interaction: { mode: "index", intersect: false },
                plugins:
                  kind === "performance"
                    ? ({ ...(pluginsFor(unit) as object), legend: { display: false } } as never)
                    : pluginsFor(unit),
                scales: axes(kind === "performance" ? "" : unit),
              } as ChartOptions<"bar">
            }
          />
        ) : (
          <Line
            data={lineData}
            options={
              {
                ...common,
                interaction: { mode: "index", intersect: false },
                plugins: pluginsFor(unit),
                scales: axes(unit),
              } as ChartOptions<"line">
            }
          />
        )}
      </div>
      {caption ? <p className="text-[11px] leading-relaxed text-black/40">{caption}</p> : null}
    </Panel>
  );
}
