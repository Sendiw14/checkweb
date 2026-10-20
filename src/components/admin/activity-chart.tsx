"use client";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "motion/react";
import { formatNumber } from "@/lib/utils";

export type SeriesPoint = { day: string; recognized: number; suspicious: number; invalid: number; flagged: number };

const SERIES = [
  { key: "recognized", label: "Recognized", color: "#2457C5" },
  { key: "suspicious", label: "Unusual pattern", color: "#B7791F" },
  { key: "flagged", label: "Revoked / recalled / on hold", color: "#475467" },
  { key: "invalid", label: "Code not found", color: "#B42318" },
] as const;

const short = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

export function ActivityChart({ data }: { data: SeriesPoint[] }) {
  const reduce = useReducedMotion();
  const total = data.reduce((n, d) => n + d.recognized + d.suspicious + d.invalid + d.flagged, 0);
  if (total === 0) {
    return <div className="grid h-64 place-items-center rounded-lg border border-dashed border-line bg-cloud text-small text-quiet">No customer checks in the last 14 days yet.</div>;
  }
  return (
    <div>
      <div role="img" aria-label={`Stacked bar chart of customer code checks per day for the last 14 days. ${formatNumber(total)} checks in total. A data table follows.`} className="h-72 w-full xl:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="#E4E7EC" />
            <XAxis dataKey="day" tickFormatter={short} tickLine={false} axisLine={{ stroke: "#E4E7EC" }} tick={{ fill: "#667085", fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#667085", fontSize: 12 }} width={44} />
            <Tooltip cursor={{ fill: "#F1F5F9" }} labelFormatter={(l) => short(String(l))} contentStyle={{ borderRadius: 10, border: "1px solid #E4E7EC", boxShadow: "0 12px 32px -8px rgb(23 43 77 / 0.18)", fontSize: 13 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            {SERIES.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={!reduce} animationDuration={500} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-small">
        <summary className="w-fit cursor-pointer rounded px-1 font-medium text-brand">View as a table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-small">
            <caption className="sr-only">Customer code checks per day, last 14 days</caption>
            <thead className="sticky top-0 bg-cloud text-caption uppercase tracking-wider text-quiet"><tr><th scope="col" className="px-3 py-2">Day (UTC)</th>{SERIES.map((s) => <th key={s.key} scope="col" className="px-3 py-2 text-right">{s.label}</th>)}</tr></thead>
            <tbody>{data.map((d) => <tr key={d.day} className="border-t border-line"><th scope="row" className="px-3 py-2 font-medium text-ink">{short(d.day)}</th>{SERIES.map((s) => <td key={s.key} className="tabular px-3 py-2 text-right">{formatNumber(d[s.key])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
