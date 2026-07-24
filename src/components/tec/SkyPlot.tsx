/**
 * SkyPlot — polar plot of GNSS satellite positions.
 * Radius maps elevation (90° at center → 0° at rim).
 * Angle maps azimuth (0° = North, clockwise, per GNSS convention).
 * Points colored by PRN; optionally sized by |sTEC|.
 */
import { useMemo } from "react";
import type { TECRecord } from "@/lib/tec/parser";
import { STATION_COLORS } from "@/lib/tec/calculations";

interface Props {
  records: TECRecord[];
  /** Max points to render for performance. */
  maxPoints?: number;
  /** Show radial elevation rings. */
  showRings?: boolean;
}

export function SkyPlot({ records, maxPoints = 4000, showRings = true }: Props) {
  const { pts, prnList, hasData } = useMemo(() => {
    const filtered = records.filter(
      (r) => Number.isFinite(r.elevation) && Number.isFinite(r.azimuth) && r.elevation > 0 && r.elevation <= 90,
    );
    const stride = Math.max(1, Math.floor(filtered.length / maxPoints));
    const sample = filtered.filter((_, i) => i % stride === 0);
    const prnSet = new Set<string>();
    sample.forEach((r) => prnSet.add(r.prn));
    return { pts: sample, prnList: [...prnSet].sort(), hasData: filtered.length > 0 };
  }, [records, maxPoints]);

  const prnColor = useMemo(() => {
    const map: Record<string, string> = {};
    prnList.forEach((p, i) => (map[p] = STATION_COLORS[i % STATION_COLORS.length]));
    return map;
  }, [prnList]);

  const size = 480;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 30;

  // Elevation → radius (0° at rim, 90° at center)
  const elToR = (el: number) => R * (1 - Math.max(0, Math.min(90, el)) / 90);
  // GNSS az: 0 = North (up), clockwise → SVG needs (az - 90) in radians, y-inverted
  const project = (el: number, az: number) => {
    const r = elToR(el);
    const th = ((az - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) };
  };

  if (!hasData) {
    return (
      <div className="glass rounded-2xl border border-border/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No elevation/azimuth data — sky plot requires <code>elevation</code> and <code>azimuth</code> columns.
        </p>
      </div>
    );
  }

  const rings = [0, 30, 60];
  const cardinals = [
    { label: "N", az: 0 },
    { label: "E", az: 90 },
    { label: "S", az: 180 },
    { label: "W", az: 270 },
  ];

  return (
    <div className="glass rounded-2xl border border-border/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Sky Plot — Satellite Elevation × Azimuth</h3>
        <span className="text-xs text-muted-foreground">
          {pts.length.toLocaleString()} pts · {prnList.length} PRNs
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
        <div className="flex justify-center">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Rings */}
            {showRings && rings.map((el) => (
              <circle
                key={el}
                cx={cx}
                cy={cy}
                r={elToR(el)}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray={el === 0 ? "none" : "3 3"}
              />
            ))}
            {/* Cardinal cross */}
            <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="rgba(255,255,255,0.05)" />
            <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="rgba(255,255,255,0.05)" />
            {/* Elevation labels */}
            {showRings && rings.map((el) => (
              <text key={`t${el}`} x={cx + 4} y={cy - elToR(el) - 2} fontSize={9} fill="var(--muted-foreground)">
                {el}°
              </text>
            ))}
            {/* Cardinal labels */}
            {cardinals.map((c) => {
              const p = project(0, c.az);
              const dx = c.label === "E" ? 8 : c.label === "W" ? -14 : c.label === "N" ? -3 : -3;
              const dy = c.label === "N" ? -8 : c.label === "S" ? 16 : 4;
              return (
                <text key={c.label} x={p.x + dx} y={p.y + dy} fontSize={11} fontWeight={600} fill="var(--foreground)">
                  {c.label}
                </text>
              );
            })}
            {/* Data points */}
            {pts.map((r, i) => {
              const p = project(r.elevation, r.azimuth);
              return (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={1.8}
                  fill={prnColor[r.prn] ?? "#6ec6f5"}
                  fillOpacity={0.75}
                />
              );
            })}
          </svg>
        </div>
        {/* Legend */}
        <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border/40 bg-card/40 p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">PRN Legend</p>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] lg:grid-cols-1">
            {prnList.slice(0, 40).map((prn) => (
              <div key={prn} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: prnColor[prn] }} />
                <span className="font-mono">{prn}</span>
              </div>
            ))}
            {prnList.length > 40 && (
              <p className="col-span-2 pt-1 text-muted-foreground lg:col-span-1">+{prnList.length - 40} more…</p>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Center = zenith (90° elevation). Rim = horizon (0°). Azimuth measured clockwise from North.
      </p>
    </div>
  );
}