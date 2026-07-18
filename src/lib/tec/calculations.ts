/**
 * GPS / TEC scientific calculations
 * ROTI, ROT, ΔTEC, quiet-day baseline, statistics, storm detection
 */

import type { TECRecord } from "./parser";

export interface EpochBin {
  epoch: string;         // ISO string rounded to bin size
  timestamp: number;
  station: string;
  medianTEC: number;
  meanTEC: number;
  maxTEC: number;
  minTEC: number;
  satCount: number;
  deltaTEC: number;
  roti: number;
  rot: number;
  stdDev: number;
  completeness: number;
}

export interface RotiBin {
  epoch: string;
  timestamp: number;
  station: string;
  prn: string;
  roti: number;
  rot: number;
}

export interface StormPhase {
  start: number;
  end: number;
  phase: "pre-storm" | "main" | "recovery";
  label: string;
}

// ─── Statistics helpers ───────────────────────────────────────────────────────
export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

export function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

export function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (s.length - 1));
  return s[idx];
}

// ─── Time binning ─────────────────────────────────────────────────────────────
export function binRecords(
  records: TECRecord[],
  binMinutes = 15
): Map<string, Map<string, TECRecord[]>> {
  const bins = new Map<string, Map<string, TECRecord[]>>();
  const binMs = binMinutes * 60 * 1000;

  for (const r of records) {
    const binTs = Math.floor(r.timestamp / binMs) * binMs;
    const binKey = new Date(binTs).toISOString();
    const stationKey = r.station;

    if (!bins.has(binKey)) bins.set(binKey, new Map());
    const stMap = bins.get(binKey)!;
    if (!stMap.has(stationKey)) stMap.set(stationKey, []);
    stMap.get(stationKey)!.push(r);
  }
  return bins;
}

// ─── Quiet-day baseline (median of all data as proxy) ────────────────────────
export function computeQuietDayBaseline(
  records: TECRecord[],
  station: string
): Map<number, number> {
  // Group by hour-of-day to get a typical daily pattern
  const byHour = new Map<number, number[]>();
  for (const r of records) {
    if (r.station !== station) continue;
    const hour = new Date(r.timestamp).getUTCHours();
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour)!.push(r.vTEC);
  }
  const baseline = new Map<number, number>();
  for (const [hour, vals] of byHour) {
    baseline.set(hour, median(vals));
  }
  return baseline;
}

// ─── Epoch-level statistics ───────────────────────────────────────────────────
export function computeEpochBins(
  records: TECRecord[],
  binMinutes = 15
): EpochBin[] {
  const bins = binRecords(records, binMinutes);
  const quietBaselines = new Map<string, Map<number, number>>();
  const stations = [...new Set(records.map(r => r.station))];
  for (const st of stations) {
    quietBaselines.set(st, computeQuietDayBaseline(records, st));
  }

  const result: EpochBin[] = [];
  const binMs = binMinutes * 60 * 1000;

  for (const [epoch, stMap] of bins) {
    const ts = new Date(epoch).getTime();
    for (const [station, recs] of stMap) {
      const tecs = recs.map(r => r.vTEC).filter(v => v > 0);
      if (!tecs.length) continue;

      const hour = new Date(ts).getUTCHours();
      const baseline = quietBaselines.get(station)?.get(hour) ?? median(tecs);
      const med = median(tecs);

      result.push({
        epoch,
        timestamp: ts,
        station,
        medianTEC: med,
        meanTEC: mean(tecs),
        maxTEC: Math.max(...tecs),
        minTEC: Math.min(...tecs),
        satCount: new Set(recs.map(r => r.prn)).size,
        deltaTEC: med - baseline,
        roti: 0,  // filled below
        rot: 0,
        stdDev: stdDev(tecs),
        completeness: tecs.length / recs.length,
      });
    }
  }

  result.sort((a, b) => a.timestamp - b.timestamp || a.station.localeCompare(b.station));

  // ─── ROT / ROTI (per station) ─────────────────────────────────────────────
  const stationEpochs = new Map<string, EpochBin[]>();
  for (const bin of result) {
    if (!stationEpochs.has(bin.station)) stationEpochs.set(bin.station, []);
    stationEpochs.get(bin.station)!.push(bin);
  }

  for (const [, epochs] of stationEpochs) {
    epochs.sort((a, b) => a.timestamp - b.timestamp);
    const dtMin = binMinutes;
    const rots: number[] = [];
    for (let i = 1; i < epochs.length; i++) {
      const dtActual = (epochs[i].timestamp - epochs[i - 1].timestamp) / 60000;
      if (dtActual > binMinutes * 3) { rots.push(NaN); continue; }
      const rot = (epochs[i].medianTEC - epochs[i - 1].medianTEC) / dtMin;
      rots.push(rot);
      epochs[i].rot = rot;
    }

    // ROTI = RMS of ROT over 5-sample window
    for (let i = 0; i < epochs.length; i++) {
      const window = rots.slice(Math.max(0, i - 2), i + 3).filter(v => !isNaN(v));
      if (window.length > 1) {
        epochs[i].roti = Math.sqrt(mean(window.map(v => v * v)) - mean(window) ** 2);
      }
    }
  }

  return result;
}

// ─── Per-PRN ROTI ─────────────────────────────────────────────────────────────
export function computePrnRoti(records: TECRecord[], binMinutes = 5): RotiBin[] {
  // Group by station+prn
  const groups = new Map<string, TECRecord[]>();
  for (const r of records) {
    const key = `${r.station}|${r.prn}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const result: RotiBin[] = [];
  const binMs = binMinutes * 60 * 1000;

  for (const [key, recs] of groups) {
    const [station, prn] = key.split("|");
    recs.sort((a, b) => a.timestamp - b.timestamp);

    // Bin
    const binned = new Map<number, number[]>();
    for (const r of recs) {
      const bts = Math.floor(r.timestamp / binMs) * binMs;
      if (!binned.has(bts)) binned.set(bts, []);
      binned.get(bts)!.push(r.sTEC);
    }

    const sorted = [...binned.entries()].sort((a, b) => a[0] - b[0]);
    const rots: number[] = [];
    const epochs: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const dt = (sorted[i][0] - sorted[i - 1][0]) / 60000;
      if (dt > binMinutes * 3) continue;
      const rot = (median(sorted[i][1]) - median(sorted[i - 1][1])) / dt;
      rots.push(rot);
      epochs.push(sorted[i][0]);
    }

    for (let i = 0; i < rots.length; i++) {
      const window = rots.slice(Math.max(0, i - 2), i + 3);
      const roti = window.length > 1
        ? Math.sqrt(mean(window.map(v => v * v)) - mean(window) ** 2)
        : Math.abs(rots[i]);

      result.push({
        epoch: new Date(epochs[i]).toISOString(),
        timestamp: epochs[i],
        station,
        prn,
        roti,
        rot: rots[i],
      });
    }
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Storm phase detection (from TEC anomaly) ─────────────────────────────────
export function detectStormPhases(bins: EpochBin[]): StormPhase[] {
  if (!bins.length) return [];

  const phases: StormPhase[] = [];
  const ONSET_THRESHOLD = 3;      // TECU above quiet
  const MAIN_THRESHOLD  = -3;     // TECU below quiet (negative phase)

  let inStorm = false;
  let stormStart = 0;
  let phase: StormPhase["phase"] = "pre-storm";

  for (let i = 0; i < bins.length; i++) {
    const dt = bins[i].deltaTEC;

    if (!inStorm && Math.abs(dt) > ONSET_THRESHOLD) {
      // Storm onset
      inStorm = true;
      stormStart = bins[i].timestamp;
      phase = dt > 0 ? "main" : "main";
      phases.push({ start: stormStart, end: stormStart, phase: "pre-storm", label: "Pre-storm" });
    }

    if (inStorm) {
      if (dt < MAIN_THRESHOLD) {
        phase = "main";
      } else if (Math.abs(dt) < 1 && i > 0) {
        // Recovering
        if (phase === "main") {
          phases.push({ start: stormStart, end: bins[i].timestamp, phase: "main", label: "Main Phase" });
          stormStart = bins[i].timestamp;
          phase = "recovery";
        }
      }
    }

    // End of data
    if (i === bins.length - 1 && inStorm) {
      phases.push({ start: stormStart, end: bins[i].timestamp, phase, label: phase === "main" ? "Main Phase" : "Recovery" });
    }
  }

  return phases;
}

// ─── Per-station time series (for multi-line chart) ───────────────────────────
export interface StationSeries {
  station: string;
  data: { timestamp: number; epoch: string; medianTEC: number; deltaTEC: number; roti: number; satCount: number }[];
}

export function buildStationSeries(bins: EpochBin[], stations: string[]): StationSeries[] {
  return stations.map(station => ({
    station,
    data: bins
      .filter(b => b.station === station)
      .map(b => ({
        timestamp: b.timestamp,
        epoch: b.epoch,
        medianTEC: +b.medianTEC.toFixed(3),
        deltaTEC: +b.deltaTEC.toFixed(3),
        roti: +b.roti.toFixed(4),
        satCount: b.satCount,
      })),
  }));
}

// ─── Heatmap data ─────────────────────────────────────────────────────────────
export interface HeatCell {
  timeSlot: number;    // hour 0-23
  lat: number;
  tec: number;
}

export function buildHeatmap(records: TECRecord[]): HeatCell[] {
  const cells = new Map<string, number[]>();
  for (const r of records) {
    const hour = new Date(r.timestamp).getUTCHours();
    const latBin = Math.round(r.lat / 5) * 5;
    const key = `${hour}|${latBin}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(r.vTEC);
  }
  return [...cells.entries()].map(([key, vals]) => {
    const [h, lat] = key.split("|").map(Number);
    return { timeSlot: h, lat, tec: +median(vals).toFixed(2) };
  });
}

// ─── Color scale ──────────────────────────────────────────────────────────────
export function tecToColor(tec: number, min = 0, max = 80): string {
  const t = Math.max(0, Math.min(1, (tec - min) / (max - min || 1)));
  // Viridis-like: dark blue → teal → green → yellow → orange → red
  const stops = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
    [253, 127, 37],
    [220, 50, 50],
  ];
  const idx = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const frac = t * (stops.length - 1) - idx;
  const c = stops[idx].map((v, i) => Math.round(v + frac * (stops[idx + 1][i] - v)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ─── Station colors (for multi-line chart) ────────────────────────────────────
export const STATION_COLORS = [
  "#4fc3f7", "#81c784", "#ffb74d", "#f06292", "#ce93d8",
  "#80deea", "#fff176", "#ff8a65", "#a5d6a7", "#90caf9",
];
