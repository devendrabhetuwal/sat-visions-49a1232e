import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { MLPanel, type MLResults } from "@/components/techlab/MLPanel";
import { ExportPanel, type ExportFormat } from "@/components/techlab/ExportPanel";
import {
  Upload, FileText, BarChart3, Table, Download, Copy, RefreshCw,
  Satellite, ChevronUp, ChevronDown, AlertCircle, CheckCircle,
  Sparkles, FlaskConical, Layers, TrendingUp, Hash, X, Info,
  ExternalLink, Settings, Filter, Zap, Globe, Database, Play, Code,
  Plus, Trash2, Eye, EyeOff, ArrowUpDown, Sigma, GitBranch,
  Activity, Maximize2, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell,
  ReferenceLine, Brush,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/data-lab")({
  component: DataLabPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type PageTab = "sources" | "clean" | "profile" | "visualize" | "ml" | "export";
type DataFormat = "csv" | "json" | "tsv" | "plain" | "unknown";
type ViewMode = "table" | "stats" | "export";
type ChartKind = "timeseries" | "multiline" | "scatter" | "histogram" | "bar" | "altitude" | "contour" | "tmd" | "iri" | "nrlmsise";

interface ParsedData {
  headers: string[];
  rows: Record<string, string | number>[];
  rawFormat: DataFormat;
  numericColumns: string[];
  textColumns: string[];
  hiddenColumns: Set<string>;
  columnAliases: Record<string, string>;
}

interface ColumnStats {
  col: string; count: number; missing: number; missingPct: number;
  min: number; max: number; mean: number; median: number;
  stdDev: number; q1: number; q3: number; skewness: number;
}

interface CleanOp {
  id: string;
  label: string;
  applied: boolean;
}

// ─── Data sources ─────────────────────────────────────────────────────────────
const SOURCES = [
  {
    id: "spdf", name: "NASA SPDF", full: "Space Physics Data Facility",
    icon: "🛰️", color: "#6ec6f5", url: "https://spdf.gsfc.nasa.gov",
    desc: "Primary NASA archive for heliospheric, magnetospheric & solar wind data. OMNI dataset, Kp/Dst/AE indices, multi-mission plasma data.",
    formats: ["CDF", "ASCII", "CSV"],
    params: ["Solar wind speed/density/pressure", "IMF Bz", "Kp, Dst, AE indices", "Particle fluxes"],
    sample: `Year,DOY,Hour,Bz_nT,Vsw_km_s,Nsw_cm3,Kp,Dst_nT\n2023,001,00,-3.2,425.1,6.8,2,-18\n2023,001,01,-1.1,412.3,7.1,2,-15\n2023,001,02,2.4,398.7,5.9,1,-12\n2023,001,03,4.8,385.2,5.2,1,-10\n2023,001,04,1.2,402.6,6.4,2,-14\n2023,001,05,-5.6,441.8,8.3,3,-22\n2023,001,06,-2.8,418.3,7.0,2,-16\n2023,001,07,3.1,395.1,5.6,1,-11\n2023,001,08,-7.2,462.4,9.1,4,-28\n2023,001,09,-9.8,478.2,10.4,5,-42\n2023,001,10,-12.1,501.3,11.8,6,-58\n2023,001,11,-14.4,518.7,13.2,7,-74`,
  },
  {
    id: "earthdata", name: "NASA Earthdata", full: "NASA Earthdata Search",
    icon: "🌍", color: "#34d399", url: "https://earthdata.nasa.gov",
    desc: "Central portal for NASA Earth-observing data. Atmosphere, ocean, land, cryosphere. MODIS, VIIRS, MERRA-2, AIRS, MLS.",
    formats: ["HDF5", "NetCDF-4", "HDF-EOS", "GeoTIFF"],
    params: ["Total electron content (TEC)", "Column ozone", "Aerosol optical depth", "Sea surface temperature"],
    sample: `Lat,Lon,TEC_TECU,O3_DU,AOD_550nm,SST_K\n45.0,-90.0,22.3,312.4,0.12,285.6\n45.0,-85.0,21.8,315.1,0.09,286.1\n40.0,-90.0,24.1,308.7,0.15,290.3\n40.0,-85.0,23.6,310.2,0.11,291.0\n35.0,-90.0,26.8,302.1,0.18,295.7\n35.0,-85.0,25.4,305.8,0.14,296.2\n30.0,-90.0,29.2,298.4,0.22,299.8\n30.0,-85.0,28.1,301.3,0.19,300.5\n25.0,-90.0,32.1,294.7,0.26,304.1\n25.0,-85.0,31.4,296.9,0.23,304.8`,
  },
  {
    id: "cdaweb", name: "CDAWeb", full: "Coordinated Data Analysis Web",
    icon: "⚡", color: "#f59e0b", url: "https://cdaweb.gsfc.nasa.gov",
    desc: "NASA GSFC interface for in-situ space physics from 200+ missions: MMS, Van Allen Probes, ACE, Wind, STEREO, Cluster.",
    formats: ["CDF", "ASCII", "CSV"],
    params: ["Magnetic field vectors (B_GSM)", "Electron/ion density & temperature", "Electric fields", "Pitch-angle distributions"],
    sample: `Epoch_UTC,Bx_GSM,By_GSM,Bz_GSM,Ne_cm3,Te_eV,Vx_km_s\n2023-01-01T00:00:00,-8.2,3.1,-5.4,8.3,2840,-412\n2023-01-01T00:00:04,-8.5,3.4,-5.1,8.6,2910,-415\n2023-01-01T00:00:08,-8.1,3.0,-5.6,8.1,2780,-409\n2023-01-01T00:00:12,-7.9,2.8,-5.8,7.9,2720,-405\n2023-01-01T00:00:16,-8.3,3.2,-5.3,8.4,2860,-413\n2023-01-01T00:00:20,-8.6,3.5,-5.0,8.8,2960,-418\n2023-01-01T00:00:24,-9.1,3.8,-4.7,9.2,3080,-422\n2023-01-01T00:00:28,-9.4,4.1,-4.4,9.5,3150,-426`,
  },
  {
    id: "icon", name: "ICON", full: "Ionospheric Connection Explorer",
    icon: "🔭", color: "#a78bfa", url: "https://icon.ssl.berkeley.edu",
    desc: "NASA ICON satellite (2019–present): ionospheric winds, plasma density, ion temps at 575 km using MIGHTI, EUV, FUV, IVM.",
    formats: ["NetCDF-4", "CDF"],
    params: ["Thermospheric wind (zonal/meridional)", "O+ density", "Ion temperature", "630 nm airglow"],
    sample: `Altitude_km,Lon_deg,Lat_deg,Uz_m_s,Umer_m_s,O_plus_cm3,Ti_K\n200,-90,10,12.3,-45.2,210000,1240\n220,-90,10,18.7,-52.1,180000,1310\n240,-90,10,24.1,-58.4,140000,1390\n260,-90,10,29.8,-63.7,100000,1480\n280,-90,10,35.2,-68.9,72000,1580\n300,-90,10,40.6,-73.2,48000,1690\n320,-90,10,45.8,-77.4,31000,1810\n340,-90,10,50.1,-80.6,19000,1940`,
  },
  {
    id: "swarm", name: "ESA Swarm", full: "ESA Swarm Mission",
    icon: "🧲", color: "#f87171", url: "https://earth.esa.int/eogateway/missions/swarm",
    desc: "ESA constellation of 3 satellites at 430–530 km. Earth's magnetic field, electron density, plasma irregularities, field-aligned currents since 2013.",
    formats: ["CDF", "NetCDF", "ASCII"],
    params: ["Total field F (nT)", "Vector B (NEC frame)", "Electron density Ne", "Plasma bubble index"],
    sample: `Timestamp,Latitude,Longitude,Radius_km,F_nT,Bx_NEC,By_NEC,Bz_NEC,Ne_cm3\n2023-06-01T00:00:00,52.3,10.2,6841.2,48924.3,-21340.1,1823.4,42980.2,42000\n2023-06-01T00:00:02,52.1,10.4,6841.3,48926.1,-21342.8,1821.7,42983.5,43000\n2023-06-01T00:00:04,51.9,10.6,6841.4,48928.4,-21345.2,1819.3,42986.8,41000\n2023-06-01T00:00:06,51.7,10.8,6841.5,48930.7,-21347.5,1817.0,42990.1,44000\n2023-06-01T00:00:08,51.5,11.0,6841.6,48932.9,-21349.8,1814.8,42993.3,40000\n2023-06-01T00:00:10,51.3,11.2,6841.7,48935.2,-21352.0,1812.5,42996.6,45000`,
  },
  {
    id: "ncei", name: "NOAA NCEI", full: "National Centers for Environmental Information",
    icon: "🌡️", color: "#60a5fa", url: "https://www.ncei.noaa.gov",
    desc: "NOAA's primary climate & geomagnetic archive. Geomagnetic observatory data (IAGA-2002), solar indices (F10.7, SSN), magnetic storm catalogs.",
    formats: ["IAGA-2002", "CSV", "ASCII", "JSON"],
    params: ["H, D, Z, F components (nT)", "F10.7 solar flux (sfu)", "Sunspot number", "Geomagnetic Kp, ap"],
    sample: `Date,H_nT,D_deg,Z_nT,F_nT,F10p7_sfu,SSN,ap\n2023-01-01,20412.3,-2.41,42398.1,47182.4,148.2,78,12\n2023-01-02,20408.7,-2.39,42401.5,47180.1,149.8,82,15\n2023-01-03,20415.1,-2.43,42394.2,47184.7,147.6,76,9\n2023-01-04,20421.8,-2.45,42387.4,47188.2,152.3,91,18\n2023-01-05,20398.4,-2.37,42412.8,47174.6,143.1,68,24\n2023-01-06,20385.2,-2.34,42428.3,47163.9,138.7,55,36\n2023-01-07,20374.1,-2.31,42441.7,47154.2,135.2,48,42`,
  },
  {
    id: "madrigal", name: "Madrigal", full: "Madrigal Database",
    icon: "📡", color: "#fb923c", url: "https://cedar.openmadrigal.org",
    desc: "Global incoherent scatter radar (ISR) network. Plasma parameters: electron density, electron/ion temperature, plasma drift velocity.",
    formats: ["HDF5", "ASCII (Madrigal)", "NetCDF"],
    params: ["Electron density Ne (m⁻³)", "Electron temperature Te (K)", "Ion temperature Ti (K)", "Line-of-sight velocity (m/s)"],
    sample: `UT_hour,Alt_km,Ne_m3,Te_K,Ti_K,Vlos_m_s\n0.0,100,42000000000,1840,1120,-32.4\n0.0,120,87000000000,2140,1280,-28.1\n0.0,150,120000000000,2680,1450,-18.6\n0.0,200,98000000000,3100,1620,-12.3\n0.0,250,64000000000,3560,1780,-8.4\n0.0,300,38000000000,4020,1940,-5.2\n0.0,350,20000000000,4480,2100,-3.1\n0.0,400,9500000000,4920,2260,-1.8`,
  },
];

// ─── Fill values (space physics standards) ────────────────────────────────────
const FILL_VALUES = [-9999, -9999.9, 99999, 99999.9, 999999, 9.9692e36, 1e31, -1e31, -999, -999.9];

// ─── Parsers ──────────────────────────────────────────────────────────────────
function detectFormat(raw: string): DataFormat {
  const t = raw.trim();
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (t.includes("\t") && !t.includes(",")) return "tsv";
  if (t.includes(",")) return "csv";
  if (/^[\d\s.\-eE+]+$/.test(t)) return "plain";
  return "unknown";
}

function parseCSV(raw: string, sep = ","): ParsedData {
  const lines = raw.trim().split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("%") && !l.trim().startsWith("!"));
  if (lines.length < 2) throw new Error("Need at least a header row and one data row.");
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ""));
  const rows = lines.slice(1).map(line => {
    const cells = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      const val = cells[i] ?? "";
      const num = parseFloat(val);
      row[h] = !isNaN(num) && val !== "" && val !== "NaN" ? num : val;
    });
    return row;
  });
  const numericColumns = headers.filter(h => rows.filter(r => typeof r[h] === "number").length > rows.length * 0.5);
  const textColumns = headers.filter(h => !numericColumns.includes(h));
  return { headers, rows, rawFormat: "csv", numericColumns, textColumns, hiddenColumns: new Set(), columnAliases: {} };
}

function parseRaw(raw: string): ParsedData {
  const fmt = detectFormat(raw);
  if (fmt === "tsv") return { ...parseCSV(raw, "\t"), rawFormat: "tsv" };
  if (fmt === "json") {
    const obj = JSON.parse(raw);
    const arr = Array.isArray(obj) ? obj : [obj];
    const headers = Object.keys(arr[0]);
    const rows = arr.map((item: Record<string, unknown>) => {
      const row: Record<string, string | number> = {};
      headers.forEach(h => { const v = item[h]; row[h] = typeof v === "number" ? v : String(v ?? ""); });
      return row;
    });
    const numericColumns = headers.filter(h => rows.some(r => typeof r[h] === "number"));
    return { headers, rows, rawFormat: "json", numericColumns, textColumns: headers.filter(h => !numericColumns.includes(h)), hiddenColumns: new Set(), columnAliases: {} };
  }
  return parseCSV(raw, ",");
}

// ─── Statistics ────────────────────────────────────────────────────────────────
function getNumericVals(data: ParsedData, col: string): number[] {
  return data.rows.map(r => r[col]).filter((v): v is number => typeof v === "number" && isFinite(v));
}

function computeStats(data: ParsedData): ColumnStats[] {
  return data.numericColumns.map(col => {
    const vals = getNumericVals(data, col).sort((a, b) => a - b);
    const n = vals.length;
    const missing = data.rows.length - n;
    if (!n) return { col, count: 0, missing, missingPct: 100, min: 0, max: 0, mean: 0, median: 0, stdDev: 0, q1: 0, q3: 0, skewness: 0 };
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (vals[n / 2 - 1] + vals[n / 2]) / 2 : vals[Math.floor(n / 2)];
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const skewness = stdDev > 0 ? vals.reduce((s, v) => s + ((v - mean) / stdDev) ** 3, 0) / n : 0;
    return {
      col, count: n, missing, missingPct: (missing / data.rows.length) * 100,
      min: vals[0], max: vals[n - 1], mean, median, stdDev,
      q1: vals[Math.floor(n * 0.25)], q3: vals[Math.floor(n * 0.75)], skewness,
    };
  });
}

function computeCorrelation(data: ParsedData): { cols: string[]; matrix: number[][] } {
  const cols = data.numericColumns.slice(0, 12);
  const series = cols.map(c => getNumericVals(data, c));
  const matrix = cols.map((_, i) => cols.map((_, j) => {
    const a = series[i], b = series[j];
    const n = Math.min(a.length, b.length);
    if (n < 3) return 0;
    const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let k = 0; k < n; k++) {
      num += (a[k] - meanA) * (b[k] - meanB);
      da += (a[k] - meanA) ** 2;
      db += (b[k] - meanB) ** 2;
    }
    return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
  }));
  return { cols, matrix };
}

function computeHistogram(vals: number[], bins = 20): { bin: number; count: number; pct: number }[] {
  if (!vals.length) return [];
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = range / bins;
  const counts = Array(bins).fill(0);
  for (const v of vals) {
    const i = Math.min(bins - 1, Math.floor((v - min) / w));
    counts[i]++;
  }
  return counts.map((count, i) => ({ bin: +(min + i * w).toPrecision(4), count, pct: (count / vals.length) * 100 }));
}

// ─── Cleaning operations ───────────────────────────────────────────────────────
function removeFillValues(data: ParsedData, custom?: number): ParsedData {
  const fills = custom !== undefined ? [...FILL_VALUES, custom] : FILL_VALUES;
  const rows = data.rows
    .map(row => {
      const r: Record<string, string | number> = {};
      for (const h of data.headers) {
        const v = row[h];
        r[h] = typeof v === "number" && fills.some(f => Math.abs(v - f) < Math.abs(f) * 1e-4 + 1e-6) ? NaN : v;
      }
      return r;
    })
    .filter(row => !Object.values(row).every(v => typeof v === "number" && isNaN(v as number)));
  return { ...data, rows };
}

function removeOutliers(data: ParsedData, sigma: number): ParsedData {
  const rows = [...data.rows];
  for (const col of data.numericColumns) {
    const vals = rows.map(r => r[col]).filter((v): v is number => typeof v === "number" && isFinite(v));
    if (!vals.length) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    if (std === 0) continue;
    for (const row of rows) {
      const v = row[col];
      if (typeof v === "number" && Math.abs(v - mean) > sigma * std) row[col] = NaN;
    }
  }
  return { ...data, rows };
}

function smoothMovingAverage(data: ParsedData, col: string, window: number): ParsedData {
  const half = Math.floor(window / 2);
  const rows = data.rows.map((_, i, arr) => {
    const r = { ...arr[i] };
    const vals: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      const v = arr[j][col];
      if (typeof v === "number" && isFinite(v)) vals.push(v);
    }
    r[col] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : r[col];
    return r;
  });
  return { ...data, rows };
}

function normalizeColumn(data: ParsedData, col: string, mode: "minmax" | "zscore"): ParsedData {
  const vals = getNumericVals(data, col);
  if (!vals.length) return data;
  const min = Math.min(...vals), max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
  const rows = data.rows.map(row => {
    const v = row[col];
    if (typeof v !== "number" || !isFinite(v)) return row;
    const norm = mode === "minmax" ? (v - min) / (max - min || 1) : (v - mean) / std;
    return { ...row, [col]: +norm.toFixed(6) };
  });
  return { ...data, rows };
}

function logTransform(data: ParsedData, col: string): ParsedData {
  const rows = data.rows.map(row => {
    const v = row[col];
    if (typeof v !== "number" || !isFinite(v) || v <= 0) return row;
    return { ...row, [col]: +Math.log10(v).toFixed(6) };
  });
  return { ...data, rows };
}

function interpolateMissing(data: ParsedData, col: string): ParsedData {
  const rows = [...data.rows.map(r => ({ ...r }))];
  for (let i = 1; i < rows.length - 1; i++) {
    const v = rows[i][col];
    if (typeof v !== "number" || !isNaN(v as number)) continue;
    let lo = i - 1, hi = i + 1;
    while (lo >= 0 && (typeof rows[lo][col] !== "number" || isNaN(rows[lo][col] as number))) lo--;
    while (hi < rows.length && (typeof rows[hi][col] !== "number" || isNaN(rows[hi][col] as number))) hi++;
    if (lo >= 0 && hi < rows.length) {
      const vlo = rows[lo][col] as number, vhi = rows[hi][col] as number;
      rows[i][col] = +(vlo + (vhi - vlo) * (i - lo) / (hi - lo)).toFixed(6);
    }
  }
  return { ...data, rows };
}

function filterByFlag(data: ParsedData, flagCol: string, maxVal: number): ParsedData {
  if (!flagCol || !data.headers.includes(flagCol)) return data;
  return { ...data, rows: data.rows.filter(r => { const v = r[flagCol]; return typeof v === "number" ? v <= maxVal : true; }) };
}

function removeDuplicates(data: ParsedData, keyCol: string): ParsedData {
  if (!keyCol) return data;
  const seen = new Set<string>();
  return { ...data, rows: data.rows.filter(r => { const k = String(r[keyCol] ?? ""); if (seen.has(k)) return false; seen.add(k); return true; }) };
}

function addDerivedColumn(data: ParsedData, name: string, expr: string): ParsedData {
  const headers = [...data.headers, name];
  const rows = data.rows.map(row => {
    let val: number = NaN;
    try {
      // Build a safe scope from row values
      const scope = Object.fromEntries(
        data.headers.map(h => [h.replace(/[^a-zA-Z0-9_]/g, "_"), row[h]])
      );
      const fn = new Function(...Object.keys(scope), `"use strict"; return (${expr});`);
      const result = fn(...Object.values(scope));
      if (typeof result === "number" && isFinite(result)) val = +result.toFixed(6);
    } catch { /* keep NaN */ }
    return { ...row, [name]: val };
  });
  const numericColumns = [...data.numericColumns, name];
  return { headers, rows, rawFormat: data.rawFormat, numericColumns, textColumns: data.textColumns, hiddenColumns: data.hiddenColumns, columnAliases: data.columnAliases };
}

function dropColumn(data: ParsedData, col: string): ParsedData {
  return {
    ...data,
    headers: data.headers.filter(h => h !== col),
    rows: data.rows.map(r => { const { [col]: _, ...rest } = r; return rest; }),
    numericColumns: data.numericColumns.filter(h => h !== col),
    textColumns: data.textColumns.filter(h => h !== col),
  };
}

// ─── Export helpers ────────────────────────────────────────────────────────────
function toCSV(data: ParsedData): string {
  const vis = data.headers.filter(h => !data.hiddenColumns.has(h));
  return [vis.join(","), ...data.rows.map(r => vis.map(h => { const v = r[h]; return typeof v === "number" && isNaN(v) ? "" : JSON.stringify(v ?? ""); }).join(","))].join("\n");
}
function toJSON(data: ParsedData): string { return JSON.stringify(data.rows, null, 2); }
function toTSV(data: ParsedData): string {
  const vis = data.headers.filter(h => !data.hiddenColumns.has(h));
  return [vis.join("\t"), ...data.rows.map(r => vis.map(h => r[h] ?? "").join("\t"))].join("\n");
}
function downloadFile(content: string, filename: string, mime: string) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([content], { type: mime })), download: filename });
  a.click();
}
const fmt4 = (n: number) => isNaN(n) ? "—" : Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0) ? n.toExponential(3) : +n.toFixed(4) === Math.round(n) ? String(Math.round(n)) : n.toFixed(4);

// ─── Color helpers ────────────────────────────────────────────────────────────
function corrColor(r: number): string {
  const t = (r + 1) / 2;
  if (t < 0.5) { const u = t * 2; return `rgb(${Math.round(50 + u * 100)},${Math.round(100 + u * 50)},${Math.round(200 - u * 50)})`; }
  const u = (t - 0.5) * 2;
  return `rgb(${Math.round(150 + u * 80)},${Math.round(150 - u * 80)},${Math.round(150 - u * 100)})`;
}
function valToColor(v: number, min: number, max: number): string {
  const t = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  return `rgb(${Math.round(68 + t * 187)},${Math.round(1 + t * 220)},${Math.round(84 + (t < 0.5 ? t * 172 : (1 - t) * 172))})`;
}

// ─── Python snippets ───────────────────────────────────────────────────────────
const PYTHON: Record<ChartKind, string> = {
  timeseries: `import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
# df["time"] = pd.to_datetime(df["time"])  # parse datetime if needed

fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(df.index, df.iloc[:, 1], lw=1.5, color="#6ec6f5", label=df.columns[1])
ax.set_xlabel("Index / Time"); ax.set_ylabel(df.columns[1])
ax.set_title("Time Series"); ax.legend(); ax.grid(alpha=0.25)
plt.tight_layout(); plt.savefig("timeseries.png", dpi=150)`,

  multiline: `import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
cols = df.select_dtypes("number").columns[:5]   # first 5 numeric cols

fig, axes = plt.subplots(len(cols), 1, figsize=(14, 2.5*len(cols)), sharex=True)
colors = ["#6ec6f5","#a78bfa","#34d399","#f59e0b","#f87171"]
for i, col in enumerate(cols):
    axes[i].plot(df.index, df[col], lw=1.2, color=colors[i % len(colors)])
    axes[i].set_ylabel(col, fontsize=9); axes[i].grid(alpha=0.2)
plt.suptitle("Multi-panel Time Series", y=1.01)
plt.tight_layout(); plt.savefig("multiline.png", dpi=150)`,

  scatter: `import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
x_col, y_col = df.columns[0], df.columns[1]  # adjust as needed

fig, ax = plt.subplots(figsize=(8, 6))
sc = ax.scatter(df[x_col], df[y_col], c=df.index, cmap="viridis", s=18, alpha=0.7)
plt.colorbar(sc, ax=ax, label="Index")
ax.set_xlabel(x_col); ax.set_ylabel(y_col)
ax.set_title(f"Scatter: {x_col} vs {y_col}"); ax.grid(alpha=0.25)
plt.tight_layout(); plt.savefig("scatter.png", dpi=150)`,

  histogram: `import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

df = pd.read_csv("your_data.csv")
cols = df.select_dtypes("number").columns[:6]

fig, axes = plt.subplots(2, 3, figsize=(14, 8))
axes = axes.ravel()
for i, col in enumerate(cols):
    vals = df[col].dropna()
    axes[i].hist(vals, bins=30, color="#6ec6f5", edgecolor="white", alpha=0.85)
    axes[i].axvline(vals.mean(), color="#f87171", lw=1.5, ls="--", label=f"mean={vals.mean():.3g}")
    axes[i].set_title(col, fontsize=10); axes[i].legend(fontsize=8)
for j in range(i+1, len(axes)): axes[j].set_visible(False)
plt.tight_layout(); plt.savefig("histograms.png", dpi=150)`,

  bar: `import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
x_col = df.columns[0]
y_cols = df.select_dtypes("number").columns[:3]

fig, ax = plt.subplots(figsize=(12, 5))
x = range(len(df))
w = 0.8 / len(y_cols)
colors = ["#6ec6f5","#a78bfa","#34d399"]
for i, col in enumerate(y_cols):
    ax.bar([xi + i*w for xi in x], df[col], width=w, label=col, color=colors[i % 3], alpha=0.85)
ax.set_xticks(range(len(df))); ax.set_xticklabels(df[x_col], rotation=45, ha="right")
ax.legend(); ax.set_title("Bar Chart"); ax.grid(axis="y", alpha=0.25)
plt.tight_layout(); plt.savefig("bar.png", dpi=150)`,

  altitude: `import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
alt_col = next((c for c in df.columns if "alt" in c.lower() or "km" in c.lower()), df.columns[0])
val_cols = [c for c in df.select_dtypes("number").columns if c != alt_col][:3]

fig, axes = plt.subplots(1, len(val_cols), figsize=(4*len(val_cols), 8), sharey=True)
if len(val_cols) == 1: axes = [axes]
colors = ["#a78bfa","#6ec6f5","#34d399"]
for i, col in enumerate(val_cols):
    axes[i].plot(df[col], df[alt_col], lw=2, color=colors[i])
    axes[i].set_xlabel(col); axes[i].grid(alpha=0.25)
axes[0].set_ylabel(f"{alt_col}")
plt.suptitle("Vertical / Altitude Profiles"); plt.tight_layout()
plt.savefig("altitude.png", dpi=150)`,

  contour: `import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.interpolate import griddata

df = pd.read_csv("your_data.csv")
x_col, y_col = "Lon", "Lat"   # adjust
val_col = df.select_dtypes("number").columns[0]

xi = np.linspace(df[x_col].min(), df[x_col].max(), 200)
yi = np.linspace(df[y_col].min(), df[y_col].max(), 200)
XI, YI = np.meshgrid(xi, yi)
ZI = griddata((df[x_col], df[y_col]), df[val_col], (XI, YI), method="linear")

fig, ax = plt.subplots(figsize=(12, 6))
c = ax.contourf(XI, YI, ZI, levels=30, cmap="viridis")
plt.colorbar(c, ax=ax, label=val_col)
ax.set_xlabel(x_col); ax.set_ylabel(y_col)
ax.set_title(f"Gridded Contour Map — {val_col}")
plt.tight_layout(); plt.savefig("contour.png", dpi=150)`,

  tmd: `import pandas as pd, numpy as np
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
# Expects columns: time/index, altitude_km, density_kg_m3

fig, ax = plt.subplots(figsize=(12, 5))
sc = ax.scatter(df.index, df.get("altitude_km", df.iloc[:,0]),
                c=np.log10(df.get("density_kg_m3", df.select_dtypes("number").iloc[:,0]) + 1e-30),
                cmap="plasma", s=10)
plt.colorbar(sc, ax=ax, label="log₁₀(ρ  kg/m³)")
ax.set_xlabel("Index"); ax.set_ylabel("Altitude (km)")
ax.set_title("Thermospheric Mass Density")
plt.tight_layout(); plt.savefig("tmd.png", dpi=150)`,

  iri: `# pip install iricore
import iricore, numpy as np, matplotlib.pyplot as plt

alts = np.arange(100, 600, 10)
result = iricore.iri(2023, 180, 12.0, 45.0, 10.0, alts)

fig, axes = plt.subplots(1, 3, figsize=(14, 8), sharey=True)
axes[0].plot(result.ne / 1e6, alts, lw=2, color="#6ec6f5"); axes[0].set_xlabel("Ne (cm⁻³)"); axes[0].set_ylabel("Alt (km)")
axes[1].plot(result.te, alts, lw=2, color="#f59e0b"); axes[1].set_xlabel("Te (K)")
axes[2].plot(result.ti, alts, lw=2, color="#34d399"); axes[2].set_xlabel("Ti (K)")
for ax in axes: ax.grid(alpha=0.3)
fig.suptitle("IRI-2016 Profiles"); plt.tight_layout(); plt.savefig("iri.png", dpi=150)`,

  nrlmsise: `# pip install nrlmsise00
from nrlmsise00 import msise_flat
import numpy as np, matplotlib.pyplot as plt

alts = np.arange(100, 800, 5)
rho, T = zip(*[(msise_flat(2023,1,0.,a,45.,0.,150,150,4)[5],
                msise_flat(2023,1,0.,a,45.,0.,150,150,4)[10]) for a in alts])

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 8), sharey=True)
ax1.semilogx(rho, alts, lw=2, color="#f87171"); ax1.set_xlabel("ρ (kg/m³)"); ax1.set_ylabel("Alt (km)")
ax2.plot(T, alts, lw=2, color="#60a5fa"); ax2.set_xlabel("T (K)")
for ax in [ax1,ax2]: ax.grid(alpha=0.3)
plt.suptitle("NRLMSISE-00"); plt.tight_layout(); plt.savefig("nrlmsise.png", dpi=150)`,
};

// ─── Chart config ──────────────────────────────────────────────────────────────
const CHART_TABS: { id: ChartKind; label: string; icon: string; desc: string }[] = [
  { id: "timeseries", label: "Time Series",     icon: "📈", desc: "Single parameter vs index/time" },
  { id: "multiline",  label: "Multi-panel",      icon: "📊", desc: "All numeric columns in stacked panels" },
  { id: "scatter",    label: "Scatter",          icon: "🔵", desc: "X vs Y with optional color" },
  { id: "histogram",  label: "Histogram",        icon: "📉", desc: "Value distribution with normal fit" },
  { id: "bar",        label: "Bar Chart",        icon: "🟦", desc: "Categorical or grouped bar" },
  { id: "altitude",   label: "Altitude Profile", icon: "🔺", desc: "Parameter vs altitude (rotated)" },
  { id: "contour",    label: "Contour Grid",     icon: "🌐", desc: "Spatial 2-D colour map" },
  { id: "tmd",        label: "Mass Density",     icon: "⚛️", desc: "Thermospheric density scatter" },
  { id: "iri",        label: "IRI Model",        icon: "🌀", desc: "IRI-2016 Python output" },
  { id: "nrlmsise",   label: "NRLMSISE-00",      icon: "🌫️", desc: "Neutral atmosphere model" },
];

const PANEL_COLORS = ["#6ec6f5", "#a78bfa", "#34d399", "#f59e0b", "#f87171", "#60a5fa", "#fb923c", "#e879f9"];

// ─── Main page ────────────────────────────────────────────────────────────────
function DataLabPage() {
  const [pageTab, setPageTab]   = useState<PageTab>("sources");
  const [rawInput, setRawInput] = useState("");
  const [parsed, setParsed]     = useState<ParsedData | null>(null);
  const [cleaned, setCleaned]   = useState<ParsedData | null>(null);
  const [stats, setStats]       = useState<ColumnStats[]>([]);
  const [view, setView]         = useState<ViewMode>("table");
  const [sortCol, setSortCol]   = useState("");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("asc");
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Cleaning state
  const [fillCustom, setFillCustom]   = useState<number | "">("");
  const [sigmaThresh, setSigmaThresh] = useState(3);
  const [maCol, setMaCol]             = useState("");
  const [maWindow, setMaWindow]       = useState(5);
  const [normCol, setNormCol]         = useState("");
  const [normMode, setNormMode]       = useState<"minmax" | "zscore">("minmax");
  const [logCol, setLogCol]           = useState("");
  const [interpCol, setInterpCol]     = useState("");
  const [flagCol, setFlagCol]         = useState("");
  const [flagMax, setFlagMax]         = useState(1);
  const [dedupCol, setDedupCol]       = useState("");
  const [derivedName, setDerivedName] = useState("");
  const [derivedExpr, setDerivedExpr] = useState("");
  const [dropColSel, setDropColSel]   = useState("");
  const [cleanOps, setCleanOps]       = useState<CleanOp[]>([]);

  // ML state
  const [mlResults, setMlResults]   = useState<MLResults | null>(null);
  const [mlLoading, setMlLoading]   = useState(false);
  const [mlError, setMlError]       = useState("");
  const [mlTargetCol, setMlTargetCol] = useState("");

  // Export state
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  // Visualize state
  const [chartKind, setChartKind] = useState<ChartKind>("timeseries");
  const [chartX, setChartX]   = useState("");
  const [chartY, setChartY]   = useState("");
  const [chartY2, setChartY2] = useState("");
  const [chartColor, setChartColor] = useState("");
  const [chartAlt, setChartAlt] = useState("");
  const [logScaleX, setLogScaleX] = useState(false);
  const [logScaleY, setLogScaleY] = useState(false);
  const [histBins, setHistBins]   = useState(20);
  const [showPython, setShowPython] = useState(false);
  const [showMultiCols, setShowMultiCols] = useState<string[]>([]);

  const active = cleaned ?? parsed;

  // ─── Parse ──────────────────────────────────────────────────────────────────
  const process = useCallback((text: string) => {
    setParseError("");
    try {
      const result = parseRaw(text);
      setParsed(result);
      setCleaned(null);
      setStats(computeStats(result));
      setChartX(result.headers[0] ?? "");
      setChartY(result.numericColumns[0] ?? "");
      setChartY2(result.numericColumns[1] ?? "");
      setChartAlt(result.numericColumns.find(c => /alt|height|km/i.test(c)) ?? result.numericColumns[0] ?? "");
      setMaCol(result.numericColumns[0] ?? "");
      setNormCol(result.numericColumns[0] ?? "");
      setLogCol(result.numericColumns[0] ?? "");
      setInterpCol(result.numericColumns[0] ?? "");
      setFlagCol(result.headers.find(c => /flag|quality|qf/i.test(c)) ?? "");
      setDedupCol(result.headers[0] ?? "");
      setDropColSel(result.headers[0] ?? "");
      setShowMultiCols(result.numericColumns.slice(0, 4));
      setView("table");
      setCleanOps([]);
      toast.success(`Parsed ${result.rows.length.toLocaleString()} rows × ${result.headers.length} cols (${result.numericColumns.length} numeric)`);
    } catch (e) { setParseError(e instanceof Error ? e.message : "Failed to parse"); setParsed(null); }
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => { const t = e.target?.result as string; setRawInput(t); process(t); };
    reader.readAsText(file);
  };

  // ─── Clean ──────────────────────────────────────────────────────────────────
  const applyOp = (id: string, opFn: (d: ParsedData) => ParsedData, label: string) => {
    if (!parsed) return;
    const src = cleaned ?? parsed;
    const result = opFn(src);
    const removed = src.rows.length - result.rows.length;
    setCleaned(result);
    setStats(computeStats(result));
    setCleanOps(ops => [...ops, { id, label, applied: true }]);
    toast.success(`${label} applied${removed > 0 ? ` — ${removed} rows removed` : ""}, ${result.rows.length} remain`);
  };

  const resetCleaning = () => {
    setCleaned(null);
    setCleanOps([]);
    if (parsed) setStats(computeStats(parsed));
    toast("Reset to original data");
  };

  // ─── CSV helper ─────────────────────────────────────────────────────────────
  const parsedDataToCSV = (data: ParsedData): string => {
    const visibleCols = data.headers.filter(h => !data.hiddenColumns.has(h));
    const rows = data.rows.map(row =>
      visibleCols.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return "";
        const s = String(v);
        return (s.includes(",") || s.includes('"') || s.includes("\n"))
          ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    );
    return [visibleCols.join(","), ...rows].join("\n");
  };

  // ─── ML Analysis ────────────────────────────────────────────────────────────
  const runMLAnalysis = useCallback(async () => {
    if (!active) return;
    setMlLoading(true);
    setMlError("");
    setMlResults(null);
    try {
      const csv = parsedDataToCSV(active);
      const res = await fetch("/api/py/ml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv,
          filename: "data.csv",
          target_col: mlTargetCol || null,
          contamination: 0.05,
          n_clusters: 3,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt.slice(0, 300));
      }
      setMlResults(await res.json());
      setPageTab("ml");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ML analysis failed";
      setMlError(msg);
      toast.error("ML analysis failed");
    } finally {
      setMlLoading(false);
    }
  }, [active, mlTargetCol]);

  // ─── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!active) return;
    setExportLoading(format);
    try {
      const csv = parsedDataToCSV(active);
      if (format === "csv") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "techlab_data.csv"; a.click();
        URL.revokeObjectURL(url);
        toast.success("CSV downloaded");
        return;
      }
      const res = await fetch(`/api/py/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, filename: "techlab_data" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const exts: Record<string, string> = { excel: "xlsx", notebook: "ipynb", html: "html" };
      a.download = `techlab_data.${exts[format] ?? format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${format.charAt(0).toUpperCase() + format.slice(1)} exported`);
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setExportLoading(null);
    }
  }, [active]);

  // ─── Sort & filter ──────────────────────────────────────────────────────────
  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedRows = useMemo(() => {
    if (!active) return [];
    let rows = [...active.rows];
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    if (sortCol) rows.sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [active, sortCol, sortDir, searchFilter]);

  const visibleHeaders = useMemo(() => active?.headers.filter(h => !active.hiddenColumns.has(h)) ?? [], [active]);

  // ─── Chart data ─────────────────────────────────────────────────────────────
  const chartRows = sortedRows.slice(0, 500);
  const chartData = chartRows.map((r, i) => ({ x: r[chartX] ?? i, [chartY]: r[chartY], ...(chartY2 ? { [chartY2]: r[chartY2] } : {}), ...(chartColor ? { _color: r[chartColor] } : {}) }));
  const altData = chartRows.map(r => ({ alt: r[chartAlt] as number, val: r[chartY] as number, v2: chartY2 ? r[chartY2] as number : undefined })).filter(d => isFinite(d.alt) && isFinite(d.val));
  const histVals = getNumericVals(active ?? { headers: [], rows: [], rawFormat: "csv", numericColumns: [], textColumns: [], hiddenColumns: new Set(), columnAliases: {} }, chartY);
  const histData = computeHistogram(histVals, histBins);
  const corr = useMemo(() => active ? computeCorrelation(active) : null, [active]);

  const multiData = useMemo(() => {
    if (!active || !showMultiCols.length) return [];
    return chartRows.map((r, i) => {
      const row: Record<string, number | string> = { _i: i };
      for (const c of showMultiCols) row[c] = typeof r[c] === "number" ? r[c] as number : NaN;
      return row;
    });
  }, [chartRows, showMultiCols, active]);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Nav */}
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Satellite className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: "Space Grotesk" }}>SatVision <span className="text-gradient">AI</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-primary">
              <FlaskConical className="h-3.5 w-3.5" /> Space Data Lab
            </span>
            <Link to="/tec-lab" className="glass rounded-full px-3 py-1.5 text-xs font-medium hover:text-primary transition-colors">TEC Lab</Link>
            <Link to="/dashboard" className="glass rounded-full px-3 py-1.5 text-xs font-medium">Dashboard</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Database className="h-3.5 w-3.5" /> Space Physics Data Lab — Advanced Edition
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
            From Raw Data <span className="text-gradient">to Science</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            7 major space & atmospheric data repositories · advanced import & cleaning pipeline · statistical profiling · interactive visualization · Python export
          </p>
        </div>

        {/* Page tabs */}
        <div className="mb-6 flex gap-0 border-b border-border/40">
          {([
            { id: "sources"   as PageTab, label: "Data Sources",   icon: <Database className="h-3.5 w-3.5" /> },
            { id: "clean"     as PageTab, label: "Import & Clean", icon: <Settings className="h-3.5 w-3.5" /> },
            { id: "profile"   as PageTab, label: "Profile",        icon: <Sigma className="h-3.5 w-3.5" /> },
            { id: "visualize" as PageTab, label: "Visualize",       icon: <BarChart3 className="h-3.5 w-3.5" /> },
            { id: "ml"        as PageTab, label: "Machine Learning", icon: <Sparkles className="h-3.5 w-3.5" /> },
            { id: "export"    as PageTab, label: "Export",           icon: <Download className="h-3.5 w-3.5" /> },
          ]).map(t => (
            <button key={t.id} onClick={() => setPageTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${pageTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.icon} {t.label}
              {(t.id === "clean" || t.id === "profile" || t.id === "visualize") && active && (
                <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">{active.rows.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── SOURCES ─────────────────────────────────────────────────────────── */}
        {pageTab === "sources" && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">Click any portal link to open the data archive. Use <strong>Load Sample</strong> to import representative data directly into the pipeline.</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {SOURCES.map(src => (
                <div key={src.id} className="glass flex flex-col rounded-2xl border border-border/40 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{src.icon}</span>
                      <div>
                        <h3 className="font-bold" style={{ color: src.color, fontFamily: "Space Grotesk" }}>{src.name}</h3>
                        <p className="text-[10px] text-muted-foreground">{src.full}</p>
                      </div>
                    </div>
                    <a href={src.url} target="_blank" rel="noreferrer"
                      className="shrink-0 flex items-center gap-1 rounded-md glass px-2 py-1 text-[10px] hover:text-primary transition-colors">
                      <ExternalLink className="h-3 w-3" /> Portal
                    </a>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground leading-relaxed flex-1">{src.desc}</p>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {src.formats.map(f => <span key={f} className="rounded bg-muted/20 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{f}</span>)}
                  </div>
                  <div className="mb-4 space-y-1">
                    {src.params.map(p => (
                      <div key={p} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: src.color }} />{p}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setRawInput(src.sample); process(src.sample); setPageTab("clean"); }}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
                    style={{ background: "var(--gradient-primary)" }}>
                    <Play className="h-3.5 w-3.5" /> Load Sample Data
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── IMPORT & CLEAN ──────────────────────────────────────────────────── */}
        {pageTab === "clean" && (
          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            {/* Left panel */}
            <div className="space-y-4">
              {/* Upload */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-6 text-center transition-all ${isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-semibold">Drop file or click to upload</p>
                <p className="text-[11px] text-muted-foreground">CSV · TSV · JSON · ASCII · IAGA-2002</p>
                <input ref={fileRef} type="file" className="hidden"
                  accept=".csv,.tsv,.txt,.dat,.json,.asc"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </div>

              <textarea rows={6} value={rawInput} onChange={e => setRawInput(e.target.value)}
                placeholder="Or paste raw data here…"
                className="w-full rounded-xl border border-border bg-input px-4 py-3 font-mono text-xs outline-none focus:border-primary"
                style={{ resize: "vertical", color: "var(--foreground)" }} />

              {parseError && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {parseError}
                </div>
              )}

              <button onClick={() => process(rawInput)} disabled={!rawInput.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40 transition"
                style={{ background: "var(--gradient-primary)" }}>
                <Sparkles className="h-4 w-4" /> Parse Data
              </button>

              {/* ── Cleaning pipeline ── */}
              {parsed && (
                <div className="glass rounded-2xl border border-border/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5"><Filter className="h-3.5 w-3.5 text-primary" /> Cleaning Pipeline</h3>
                    {cleaned && <button onClick={resetCleaning} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">↺ Reset all</button>}
                  </div>

                  {/* Applied ops */}
                  {cleanOps.length > 0 && (
                    <div className="space-y-1">
                      {cleanOps.map((op, i) => (
                        <div key={i} className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-2 py-1 text-[10px] text-green-400">
                          <CheckCircle className="h-3 w-3 shrink-0" /> {op.label}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fill values */}
                  <CleanSection title="Remove Fill Values" hint="Space physics fills: −9999, 1e31, 9.97e36 …">
                    <div className="flex gap-2">
                      <input type="number" value={fillCustom} onChange={e => setFillCustom(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-24 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary" placeholder="Custom fill" />
                      <button onClick={() => applyOp("fill", d => removeFillValues(d, fillCustom !== "" ? fillCustom : undefined), "Remove fill values")}
                        className="flex-1 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition">Apply</button>
                    </div>
                  </CleanSection>

                  {/* Outlier removal */}
                  <CleanSection title="Remove Statistical Outliers" hint="Z-score threshold per column">
                    <div className="flex gap-2 items-center">
                      <span className="text-[10px] text-muted-foreground">±σ</span>
                      <input type="number" min={1} max={10} step={0.5} value={sigmaThresh} onChange={e => setSigmaThresh(Number(e.target.value))}
                        className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary" />
                      <button onClick={() => applyOp("outlier", d => removeOutliers(d, sigmaThresh), `Outliers ±${sigmaThresh}σ`)}
                        className="flex-1 rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition">Apply</button>
                    </div>
                  </CleanSection>

                  {/* Moving average */}
                  <CleanSection title="Smooth — Moving Average" hint="Centred window on selected column">
                    <div className="flex gap-2">
                      <select value={maCol} onChange={e => setMaCol(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        {parsed.numericColumns.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <input type="number" min={2} max={100} value={maWindow} onChange={e => setMaWindow(Number(e.target.value))}
                        className="w-12 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary" title="Window" />
                      <button onClick={() => applyOp("ma", d => smoothMovingAverage(d, maCol, maWindow), `MA(${maWindow}) on ${maCol}`)}
                        className="rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition">Apply</button>
                    </div>
                  </CleanSection>

                  {/* Normalize */}
                  <CleanSection title="Normalize Column" hint="Min-max → [0,1]  ·  Z-score → μ=0 σ=1">
                    <div className="flex gap-2">
                      <select value={normCol} onChange={e => setNormCol(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        {parsed.numericColumns.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <select value={normMode} onChange={e => setNormMode(e.target.value as "minmax" | "zscore")}
                        className="w-20 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        <option value="minmax">Min-max</option>
                        <option value="zscore">Z-score</option>
                      </select>
                      <button onClick={() => applyOp("norm", d => normalizeColumn(d, normCol, normMode), `Normalize ${normCol} (${normMode})`)}
                        className="rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition">Apply</button>
                    </div>
                  </CleanSection>

                  {/* Log transform */}
                  <CleanSection title="Log₁₀ Transform" hint="Replaces values with log₁₀(v) — requires v > 0">
                    <div className="flex gap-2">
                      <select value={logCol} onChange={e => setLogCol(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        {parsed.numericColumns.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <button onClick={() => applyOp("log", d => logTransform(d, logCol), `Log₁₀(${logCol})`)}
                        className="rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition">Apply</button>
                    </div>
                  </CleanSection>

                  {/* Interpolate */}
                  <CleanSection title="Interpolate Missing (Linear)" hint="Fills NaN gaps by linear interpolation">
                    <div className="flex gap-2">
                      <select value={interpCol} onChange={e => setInterpCol(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        {parsed.numericColumns.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <button onClick={() => applyOp("interp", d => interpolateMissing(d, interpCol), `Interpolate ${interpCol}`)}
                        className="rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition">Apply</button>
                    </div>
                  </CleanSection>

                  {/* Quality flag */}
                  <CleanSection title="Quality Flag Filter" hint="Keep rows where flag column ≤ threshold">
                    <div className="flex gap-2">
                      <select value={flagCol} onChange={e => setFlagCol(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        <option value="">— column —</option>
                        {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <input type="number" value={flagMax} onChange={e => setFlagMax(Number(e.target.value))}
                        className="w-12 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary" />
                      <button onClick={() => applyOp("flag", d => filterByFlag(d, flagCol, flagMax), `Flag filter ${flagCol}≤${flagMax}`)}
                        className="rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition">Apply</button>
                    </div>
                  </CleanSection>

                  {/* Deduplicate */}
                  <CleanSection title="Remove Duplicates" hint="Dedup by key column value">
                    <div className="flex gap-2">
                      <select value={dedupCol} onChange={e => setDedupCol(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <button onClick={() => applyOp("dedup", d => removeDuplicates(d, dedupCol), `Dedup by ${dedupCol}`)}
                        className="rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition">Apply</button>
                    </div>
                  </CleanSection>

                  {/* Derived column */}
                  <CleanSection title="Add Derived Column" hint="JS expression — use column names (spaces → _)">
                    <input value={derivedName} onChange={e => setDerivedName(e.target.value)}
                      placeholder="New column name" className="mb-1.5 w-full rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary" />
                    <div className="flex gap-2">
                      <input value={derivedExpr} onChange={e => setDerivedExpr(e.target.value)}
                        placeholder="e.g. Bz_nT * Vsw_km_s / 1000"
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 font-mono text-xs outline-none focus:border-primary" />
                      <button onClick={() => {
                        if (!derivedName.trim() || !derivedExpr.trim()) return;
                        applyOp("derived", d => addDerivedColumn(d, derivedName.trim(), derivedExpr.trim()), `Derived: ${derivedName}`);
                        setDerivedName(""); setDerivedExpr("");
                      }} className="rounded-lg bg-green-500/15 px-2 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/25 transition">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CleanSection>

                  {/* Drop column */}
                  <CleanSection title="Drop Column" hint="Permanently remove a column">
                    <div className="flex gap-2">
                      <select value={dropColSel} onChange={e => setDropColSel(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        {(cleaned ?? parsed).headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <button onClick={() => {
                        if (!dropColSel) return;
                        applyOp("drop", d => dropColumn(d, dropColSel), `Drop ${dropColSel}`);
                        setDropColSel("");
                      }} className="rounded-lg bg-red-500/15 px-2 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 transition">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CleanSection>

                  {/* Export */}
                  {active && (
                    <div className="flex gap-2 pt-1 border-t border-border/30">
                      {[
                        { label: "CSV", fn: () => downloadFile(toCSV(active), "cleaned.csv", "text/csv") },
                        { label: "TSV", fn: () => downloadFile(toTSV(active), "cleaned.tsv", "text/tab-separated-values") },
                        { label: "JSON", fn: () => downloadFile(toJSON(active), "cleaned.json", "application/json") },
                      ].map(({ label, fn }) => (
                        <button key={label} onClick={fn}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg glass py-2 text-xs font-medium hover:text-primary transition-colors">
                          <Download className="h-3 w-3" /> {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: data view */}
            <div>
              {!active ? (
                <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center gap-3">
                  <FileText className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No data loaded</p>
                  <p className="text-xs text-muted-foreground">Upload a file, paste data, or load a sample from the Sources tab</p>
                  <button onClick={() => setPageTab("sources")} className="mt-1 rounded-full bg-primary/20 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/30 transition">Browse Data Sources</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="glass rounded-full px-3 py-1 text-xs"><b>{active.rows.length.toLocaleString()}</b> rows</span>
                    <span className="glass rounded-full px-3 py-1 text-xs"><b>{active.headers.length}</b> columns</span>
                    <span className="glass rounded-full px-3 py-1 text-xs"><b>{active.numericColumns.length}</b> numeric</span>
                    {cleaned && <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400"><CheckCircle className="h-3 w-3" /> {cleanOps.length} ops applied</span>}
                    <div className="ml-auto flex gap-2">
                      <input value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
                        placeholder="Search rows…"
                        className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none focus:border-primary w-36" />
                      <button onClick={() => setPageTab("visualize")}
                        className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white"
                        style={{ background: "var(--gradient-primary)" }}>
                        <BarChart3 className="h-3.5 w-3.5" /> Visualize →
                      </button>
                    </div>
                  </div>

                  {/* View tabs */}
                  <div className="flex gap-2">
                    {([
                      { id: "table" as ViewMode, label: "Table", icon: <Table className="h-3.5 w-3.5" /> },
                      { id: "stats" as ViewMode, label: "Statistics", icon: <Hash className="h-3.5 w-3.5" /> },
                      { id: "export" as ViewMode, label: "Export", icon: <Download className="h-3.5 w-3.5" /> },
                    ]).map(v => (
                      <button key={v.id} onClick={() => setView(v.id)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${view === v.id ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"}`}>
                        {v.icon} {v.label}
                      </button>
                    ))}
                  </div>

                  {/* Table view */}
                  {view === "table" && (
                    <div className="glass overflow-hidden rounded-xl border border-border/40">
                      <div className="max-h-[560px] overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 border-b border-border/40 bg-card/80 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left opacity-40">#</th>
                              {visibleHeaders.map(h => (
                                <th key={h} className="cursor-pointer px-3 py-2 text-left hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort(h)}>
                                  <span className="flex items-center gap-1">
                                    <span className={active.numericColumns.includes(h) ? "text-primary/70" : ""}>{active.columnAliases[h] || h}</span>
                                    {sortCol === h ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedRows.slice(0, 1000).map((row, i) => (
                              <tr key={i} className="border-b border-border/15 hover:bg-white/2 transition-colors">
                                <td className="px-3 py-1.5 text-[10px] text-muted-foreground/40">{i + 1}</td>
                                {visibleHeaders.map(h => (
                                  <td key={h} className="px-3 py-1.5 text-xs whitespace-nowrap">
                                    {typeof row[h] === "number"
                                      ? isNaN(row[h] as number)
                                        ? <span className="text-muted-foreground/40">NaN</span>
                                        : <span className="font-mono text-primary/90">{fmt4(row[h] as number)}</span>
                                      : <span className="text-muted-foreground">{String(row[h] ?? "")}</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {sortedRows.length > 1000 && (
                        <div className="border-t border-border/30 px-4 py-2 text-center text-xs text-muted-foreground">
                          Showing 1,000 / {sortedRows.length.toLocaleString()} rows — export for full dataset
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats view */}
                  {view === "stats" && (
                    <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                      {stats.map(s => (
                        <div key={s.col} className="glass rounded-xl border border-border/40 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-semibold text-sm text-primary">{s.col}</h3>
                            <span className="text-xs text-muted-foreground">
                              {s.count} valid · <span className={s.missingPct > 10 ? "text-orange-400" : ""}>{s.missingPct.toFixed(1)}% missing</span>
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                            {[["Min", s.min], ["Q1", s.q1], ["Median", s.median], ["Mean", s.mean],
                              ["Q3", s.q3], ["Max", s.max], ["StdDev", s.stdDev], ["Skew", s.skewness]].map(([l, v]) => (
                              <div key={l as string} className="rounded-lg bg-muted/10 p-2 text-center">
                                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{l}</div>
                                <div className="mt-0.5 font-mono text-xs font-semibold">{fmt4(v as number)}</div>
                              </div>
                            ))}
                          </div>
                          {/* Mini bar showing value range */}
                          <div className="mt-3 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: "100%", background: "var(--gradient-primary)", opacity: 0.6 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Export view */}
                  {view === "export" && (
                    <div className="space-y-3">
                      {[
                        { label: "CSV", content: toCSV(active), file: "data.csv", mime: "text/csv" },
                        { label: "TSV", content: toTSV(active), file: "data.tsv", mime: "text/tab-separated-values" },
                        { label: "JSON", content: toJSON(active), file: "data.json", mime: "application/json" },
                      ].map(({ label, content, file, mime }) => (
                        <div key={label} className="glass rounded-xl border border-border/40 overflow-hidden">
                          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
                            <span className="text-xs font-semibold uppercase text-primary">{label}</span>
                            <div className="flex gap-2">
                              <button onClick={() => { navigator.clipboard.writeText(content); toast.success(`${label} copied!`); }}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-primary transition-colors"><Copy className="h-3 w-3" /> Copy</button>
                              <button onClick={() => downloadFile(content, file, mime)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-primary transition-colors"><Download className="h-3 w-3" /> Download</button>
                            </div>
                          </div>
                          <pre className="max-h-40 overflow-auto p-4 font-mono text-[11px] text-muted-foreground leading-relaxed">
                            {content.slice(0, 3000)}{content.length > 3000 ? "\n…" : ""}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PROFILE ──────────────────────────────────────────────────────────── */}
        {pageTab === "profile" && (
          !active ? (
            <EmptyTabPrompt label="Load data first" onGo={() => setPageTab("sources")} goLabel="Browse Sources" />
          ) : (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  { label: "Rows",          val: active.rows.length.toLocaleString() },
                  { label: "Columns",       val: active.headers.length },
                  { label: "Numeric cols",  val: active.numericColumns.length },
                  { label: "Text cols",     val: active.textColumns.length },
                  { label: "Missing vals",  val: `${stats.reduce((s, c) => s + c.missing, 0).toLocaleString()}` },
                  { label: "Format",        val: active.rawFormat.toUpperCase() },
                ].map(({ label, val }) => (
                  <div key={label} className="glass rounded-xl border border-border/40 p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                    <div className="mt-1 text-xl font-bold" style={{ fontFamily: "Space Grotesk" }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Distributions */}
              <div>
                <h2 className="mb-3 text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Column Distributions
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {active.numericColumns.slice(0, 12).map((col, ci) => {
                    const vals = getNumericVals(active, col);
                    const hist = computeHistogram(vals, 15);
                    const s = stats.find(x => x.col === col);
                    return (
                      <div key={col} className="glass rounded-xl border border-border/40 p-4">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-semibold" style={{ color: PANEL_COLORS[ci % PANEL_COLORS.length] }}>{col}</span>
                          <span className="text-[10px] text-muted-foreground">{vals.length} values · skew {s ? fmt4(s.skewness) : "—"}</span>
                        </div>
                        <ResponsiveContainer width="100%" height={100}>
                          <BarChart data={hist} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
                            <XAxis dataKey="bin" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                            <YAxis tick={false} />
                            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }}
                              formatter={((v: number, _n: string, item: { payload?: { bin?: number } }) => [`${v} (${item?.payload?.bin ?? ""})`, "Count"]) as never} />
                            <Bar dataKey="count" fill={PANEL_COLORS[ci % PANEL_COLORS.length]} radius={[2, 2, 0, 0]} opacity={0.85} />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                          <span>μ={s ? fmt4(s.mean) : "—"}</span>
                          <span>σ={s ? fmt4(s.stdDev) : "—"}</span>
                          <span>range [{s ? fmt4(s.min) : "—"}, {s ? fmt4(s.max) : "—"}]</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Box plots */}
              <div>
                <h2 className="mb-3 text-sm font-semibold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Box Plots (IQR)
                </h2>
                <div className="glass rounded-2xl border border-border/40 p-5 overflow-x-auto">
                  <div className="flex gap-5 min-w-max">
                    {active.numericColumns.slice(0, 12).map((col, ci) => {
                      const s = stats.find(x => x.col === col);
                      if (!s || s.count === 0) return null;
                      const range = s.max - s.min || 1;
                      const toY = (v: number) => ((s.max - v) / range) * 180;
                      return (
                        <div key={col} className="flex flex-col items-center gap-1" style={{ width: 56 }}>
                          <div className="relative" style={{ height: 180, width: 40 }}>
                            {/* Whisker top */}
                            <div className="absolute left-1/2 -translate-x-px bg-muted-foreground/50 w-0.5" style={{ top: toY(s.max), height: toY(s.q3) - toY(s.max) }} />
                            {/* Top whisker cap */}
                            <div className="absolute left-1/2 -translate-x-2 bg-muted-foreground/50 h-0.5 w-4" style={{ top: toY(s.max) }} />
                            {/* IQR box */}
                            <div className="absolute left-1/2 -translate-x-4 rounded w-8 border"
                              style={{ top: toY(s.q3), height: Math.max(2, toY(s.q1) - toY(s.q3)), background: PANEL_COLORS[ci % PANEL_COLORS.length] + "33", borderColor: PANEL_COLORS[ci % PANEL_COLORS.length] + "88" }} />
                            {/* Median line */}
                            <div className="absolute left-1/2 -translate-x-4 h-0.5 w-8" style={{ top: toY(s.median), background: PANEL_COLORS[ci % PANEL_COLORS.length] }} />
                            {/* Mean dot */}
                            <div className="absolute left-1/2 -translate-x-1 -translate-y-1 h-2 w-2 rounded-full bg-white/70" style={{ top: toY(s.mean) }} />
                            {/* Bottom whisker */}
                            <div className="absolute left-1/2 -translate-x-px bg-muted-foreground/50 w-0.5" style={{ top: toY(s.q1), height: toY(s.min) - toY(s.q1) }} />
                            <div className="absolute left-1/2 -translate-x-2 bg-muted-foreground/50 h-0.5 w-4" style={{ top: toY(s.min) }} />
                          </div>
                          <span className="text-[9px] text-muted-foreground text-center leading-tight max-w-[56px] break-words">{col}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">Box = IQR · Line = median · Dot = mean · Whiskers = min/max</p>
                </div>
              </div>

              {/* Correlation matrix */}
              {corr && corr.cols.length > 1 && (
                <div>
                  <h2 className="mb-3 text-sm font-semibold flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-primary" /> Correlation Matrix (Pearson r)
                  </h2>
                  <div className="glass rounded-2xl border border-border/40 p-5 overflow-x-auto">
                    <table className="text-[10px] border-separate border-spacing-0.5">
                      <thead>
                        <tr>
                          <th className="w-24" />
                          {corr.cols.map(c => <th key={c} className="px-1 py-1 text-muted-foreground font-normal truncate max-w-[70px]" style={{ maxWidth: 70 }}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {corr.cols.map((rowCol, i) => (
                          <tr key={rowCol}>
                            <td className="px-2 py-1 text-muted-foreground font-medium truncate max-w-[96px] text-right">{rowCol}</td>
                            {corr.matrix[i].map((r, j) => (
                              <td key={j} className="rounded text-center font-mono font-semibold" style={{
                                width: 58, height: 32,
                                background: corrColor(r),
                                color: Math.abs(r) > 0.5 ? "#fff" : "#aaa",
                              }}>
                                {i === j ? "1.00" : r.toFixed(2)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="h-3 w-20 rounded-sm" style={{ background: "linear-gradient(to right, rgb(50,100,200), #fff, rgb(230,70,50))" }} />
                        <span>−1 … 0 … +1</span>
                      </div>
                      <span>· {corr.cols.length} columns · up to 12 shown</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ── VISUALIZE ────────────────────────────────────────────────────────── */}
        {pageTab === "visualize" && (
          !active ? (
            <EmptyTabPrompt label="Load data first" onGo={() => setPageTab("sources")} goLabel="Browse Sources" />
          ) : (
            <div className="space-y-5">
              {/* Chart type selector */}
              <div className="flex flex-wrap gap-2">
                {CHART_TABS.map(t => (
                  <button key={t.id} onClick={() => setChartKind(t.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition whitespace-nowrap ${chartKind === t.id ? "bg-primary/20 text-primary border border-primary/30" : "glass text-muted-foreground hover:text-foreground"}`}>
                    <span>{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>

              {/* Controls bar */}
              <div className="glass flex flex-wrap items-end gap-4 rounded-xl border border-border/40 p-4">
                {(chartKind === "altitude" || chartKind === "iri" || chartKind === "nrlmsise" || chartKind === "tmd") ? (
                  <>
                    <AxisSelect label="Altitude column" value={chartAlt} cols={active.numericColumns} onChange={setChartAlt} />
                    <AxisSelect label="Parameter 1 (X)" value={chartY} cols={active.numericColumns} onChange={setChartY} />
                    <AxisSelect label="Parameter 2 (optional)" value={chartY2} cols={["", ...active.numericColumns.filter(h => h !== chartY)]} onChange={setChartY2} />
                  </>
                ) : chartKind === "multiline" ? (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-muted-foreground self-center">Columns:</span>
                    {active.numericColumns.map((c, ci) => (
                      <button key={c} onClick={() => setShowMultiCols(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${showMultiCols.includes(c) ? "text-white" : "glass text-muted-foreground"}`}
                        style={showMultiCols.includes(c) ? { background: PANEL_COLORS[ci % PANEL_COLORS.length] } : {}}>
                        {c}
                      </button>
                    ))}
                  </div>
                ) : chartKind === "histogram" ? (
                  <>
                    <AxisSelect label="Column" value={chartY} cols={active.numericColumns} onChange={setChartY} />
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Bins</label>
                      <input type="number" min={5} max={100} value={histBins} onChange={e => setHistBins(Number(e.target.value))}
                        className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary" />
                    </div>
                  </>
                ) : chartKind === "scatter" ? (
                  <>
                    <AxisSelect label="X axis" value={chartX} cols={active.headers} onChange={setChartX} />
                    <AxisSelect label="Y axis" value={chartY} cols={active.numericColumns} onChange={setChartY} />
                    <AxisSelect label="Color by (optional)" value={chartColor} cols={["", ...active.numericColumns.filter(h => h !== chartY)]} onChange={setChartColor} />
                  </>
                ) : (
                  <>
                    <AxisSelect label="X axis" value={chartX} cols={active.headers} onChange={setChartX} />
                    <AxisSelect label="Y axis (primary)" value={chartY} cols={active.numericColumns} onChange={setChartY} />
                    <AxisSelect label="Y axis 2 (optional)" value={chartY2} cols={["", ...active.numericColumns.filter(h => h !== chartY)]} onChange={setChartY2} />
                  </>
                )}

                {/* Log scale toggles */}
                {!["altitude", "iri", "nrlmsise", "tmd", "multiline", "histogram", "contour"].includes(chartKind) && (
                  <div className="flex gap-2 ml-auto">
                    {[["X", logScaleX, setLogScaleX] as const, ["Y", logScaleY, setLogScaleY] as const].map(([axis, val, set]) => (
                      <button key={axis} onClick={() => set(!val)}
                        className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${val ? "bg-primary/20 text-primary" : "glass text-muted-foreground"}`}>
                        log {axis}
                      </button>
                    ))}
                  </div>
                )}

                <button onClick={() => setShowPython(v => !v)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${showPython ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"}`}>
                  <Code className="h-3.5 w-3.5" /> Python
                </button>
              </div>

              {/* Python snippet */}
              {showPython && (
                <div className="glass rounded-xl border border-primary/30 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border/40 px-4 py-2 bg-primary/5">
                    <span className="text-xs font-semibold text-primary flex items-center gap-1.5"><Code className="h-3.5 w-3.5" /> Python equivalent — matplotlib + pandas</span>
                    <button onClick={() => { navigator.clipboard.writeText(PYTHON[chartKind]); toast.success("Code copied!"); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                  <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-green-400/90 bg-black/40">{PYTHON[chartKind]}</pre>
                </div>
              )}

              {/* Chart canvas */}
              <div className="glass rounded-2xl border border-border/40 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CHART_TABS.find(t => t.id === chartKind)?.icon}</span>
                    <div>
                      <h3 className="font-semibold text-sm">{CHART_TABS.find(t => t.id === chartKind)?.label}</h3>
                      <p className="text-[10px] text-muted-foreground">{CHART_TABS.find(t => t.id === chartKind)?.desc}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{Math.min(active.rows.length, 500).toLocaleString()} / {active.rows.length.toLocaleString()} points</span>
                </div>

                {/* TIME SERIES */}
                {chartKind === "timeseries" && (
                  <ResponsiveContainer width="100%" height={340}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6ec6f5" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6ec6f5" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} scale={logScaleX ? "log" : "auto"} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} scale={logScaleY ? "log" : "auto"} domain={logScaleY ? ["auto", "auto"] : undefined} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Brush dataKey="x" height={20} stroke="rgba(255,255,255,0.1)" fill="rgba(255,255,255,0.03)" travellerWidth={6} />
                      <Area type="monotone" dataKey={chartY} stroke="#6ec6f5" fill="url(#g1)" strokeWidth={2} dot={false} />
                      {chartY2 && <Area type="monotone" dataKey={chartY2} stroke="#a78bfa" fill="url(#g2)" strokeWidth={2} dot={false} />}
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                {/* MULTI-PANEL */}
                {chartKind === "multiline" && showMultiCols.length > 0 && (
                  <div className="space-y-3">
                    {showMultiCols.map((col, ci) => (
                      <div key={col}>
                        <p className="mb-1 text-[10px] font-semibold" style={{ color: PANEL_COLORS[ci % PANEL_COLORS.length] }}>{col}</p>
                        <ResponsiveContainer width="100%" height={90}>
                          <AreaChart data={multiData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id={`mg${ci}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={PANEL_COLORS[ci % PANEL_COLORS.length]} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={PANEL_COLORS[ci % PANEL_COLORS.length]} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="_i" hide />
                            <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10 }} />
                            <Area type="monotone" dataKey={col} stroke={PANEL_COLORS[ci % PANEL_COLORS.length]} fill={`url(#mg${ci})`} strokeWidth={1.5} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                  </div>
                )}

                {/* SCATTER */}
                {chartKind === "scatter" && (
                  <ResponsiveContainer width="100%" height={360}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="x" name={chartX} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} type="number" scale={logScaleX ? "log" : "auto"} domain={logScaleX ? ["auto", "auto"] : undefined} label={{ value: chartX, position: "insideBottom", offset: -5, style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                      <YAxis dataKey="y" name={chartY} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} scale={logScaleY ? "log" : "auto"} domain={logScaleY ? ["auto", "auto"] : undefined} label={{ value: chartY, angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: number, name: string) => [fmt4(v), name]} />
                      <Scatter
                        data={chartRows.map(r => ({ x: r[chartX], y: r[chartY], _c: chartColor ? r[chartColor] : 0 }))}
                        fill="#6ec6f5" opacity={0.75} r={3}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}

                {/* HISTOGRAM */}
                {chartKind === "histogram" && (
                  <div>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={histData} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="bin" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} label={{ value: chartY, position: "insideBottom", offset: -10, style: { fontSize: 11, fill: "var(--muted-foreground)" } }} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} scale={logScaleY ? "log" : "auto"} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                          formatter={((v: number, _n: string, item: { payload?: { bin?: number; pct?: number } }) => [`${v} (${item?.payload?.pct?.toFixed(1) ?? ""}%)`, "Count"]) as never} />
                        <Bar dataKey="count" fill="url(#histGrad)" radius={[3, 3, 0, 0]} />
                        <defs>
                          <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a78bfa" />
                            <stop offset="100%" stopColor="#6ec6f5" />
                          </linearGradient>
                        </defs>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {(() => {
                        const s = stats.find(x => x.col === chartY);
                        return s ? [["n", s.count], ["mean", fmt4(s.mean)], ["median", fmt4(s.median)], ["σ", fmt4(s.stdDev)], ["skew", fmt4(s.skewness)]].map(([l, v]) => (
                          <span key={l as string}><span className="text-muted-foreground/60">{l}:</span> <b>{v}</b></span>
                        )) : null;
                      })()}
                    </div>
                  </div>
                )}

                {/* BAR CHART */}
                {chartKind === "bar" && (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData.slice(0, 50)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} scale={logScaleY ? "log" : "auto"} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey={chartY} fill="#6ec6f5" radius={[3, 3, 0, 0]} opacity={0.9} />
                      {chartY2 && <Bar dataKey={chartY2} fill="#a78bfa" radius={[3, 3, 0, 0]} opacity={0.9} />}
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {/* ALTITUDE PROFILE */}
                {(chartKind === "altitude" || chartKind === "iri" || chartKind === "nrlmsise" || chartKind === "tmd") && (
                  <ResponsiveContainer width="100%" height={420}>
                    <LineChart data={altData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" dataKey="val" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} label={{ value: chartY, position: "insideBottom", offset: -5, style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                      <YAxis type="number" dataKey="alt" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} label={{ value: chartAlt, angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: number) => [fmt4(v), chartY]} labelFormatter={(l: number) => `${chartAlt}: ${fmt4(l)}`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="val" name={chartY} stroke="#a78bfa" strokeWidth={2.5} dot={false} />
                      {chartY2 && <Line type="monotone" dataKey="v2" name={chartY2} stroke="#6ec6f5" strokeWidth={2} dot={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {/* CONTOUR */}
                {chartKind === "contour" && (
                  <ContourGrid data={active} xCol={chartX} yCol={chartAlt || active.numericColumns[1] || ""} valCol={chartY} />
                )}
              </div>
            </div>
          )
        )}

        {/* ── MACHINE LEARNING ──────────────────────────────────────────────── */}
        {pageTab === "ml" && (
          !active ? (
            <EmptyTabPrompt label="Load data first" onGo={() => setPageTab("sources")} goLabel="Browse Sources" />
          ) : !mlResults && !mlLoading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24 text-center gap-5">
              <Sparkles className="h-14 w-14 text-muted-foreground/25" />
              <div>
                <p className="font-semibold text-lg">Machine Learning Analysis</p>
                <p className="text-sm text-muted-foreground mt-1">Anomaly detection · Clustering · Forecasting · Feature importance</p>
              </div>
              {active.numericColumns.length > 1 && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Target column for regression (optional)</label>
                  <select value={mlTargetCol} onChange={e => setMlTargetCol(e.target.value)}
                    className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none focus:border-primary">
                    <option value="">— none —</option>
                    {active.numericColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {mlError && (
                <p className="text-sm text-destructive max-w-md rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">{mlError}</p>
              )}
              <button onClick={runMLAnalysis} disabled={mlLoading}
                className="flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition disabled:opacity-50">
                <Sparkles className="h-4 w-4" /> Run ML Analysis
              </button>
            </div>
          ) : mlLoading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-5">
              <div className="h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div className="text-center">
                <p className="font-medium">Running ML pipeline…</p>
                <p className="text-xs text-muted-foreground mt-1">Anomaly detection · Clustering · Forecasting</p>
              </div>
            </div>
          ) : mlResults ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> ML Analysis Results
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mlResults.rows_analyzed?.toLocaleString()} rows analyzed
                  </p>
                </div>
                <button onClick={runMLAnalysis} disabled={mlLoading}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition">
                  <RefreshCw className="h-3 w-3" /> Re-run
                </button>
              </div>
              <MLPanel results={mlResults} />
            </div>
          ) : null
        )}

        {/* ── EXPORT ────────────────────────────────────────────────────────── */}
        {pageTab === "export" && (
          <ExportPanel hasData={!!active} exportLoading={exportLoading} onExport={handleExport} />
        )}

      </div>
    </div>
  );
}

// ─── Helper sub-components ─────────────────────────────────────────────────────
function CleanSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border/20 pt-2.5">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between text-xs font-medium hover:text-primary transition-colors">
        {title}
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] text-muted-foreground">{hint}</p>
          {children}
        </div>
      )}
    </div>
  );
}

function AxisSelect({ label, value, cols, onChange }: { label: string; value: string; cols: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none focus:border-primary">
        {cols.map(h => <option key={h} value={h}>{h || "— none —"}</option>)}
      </select>
    </div>
  );
}

function EmptyTabPrompt({ label, onGo, goLabel }: { label: string; onGo: () => void; goLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24 text-center gap-3">
      <FileText className="h-12 w-12 text-muted-foreground/30" />
      <p className="font-medium text-muted-foreground">{label}</p>
      <button onClick={onGo} className="rounded-full bg-primary/20 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/30 transition">{goLabel}</button>
    </div>
  );
}

// ─── Contour grid (canvas) ────────────────────────────────────────────────────
function ContourGrid({ data, xCol, yCol, valCol }: { data: ParsedData; xCol: string; yCol: string; valCol: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rows = data.rows.filter(r => typeof r[xCol] === "number" && typeof r[yCol] === "number" && typeof r[valCol] === "number" && isFinite(r[xCol] as number) && isFinite(r[yCol] as number));
    if (rows.length < 4) { ctx.fillStyle = "#888"; ctx.font = "13px Arial"; ctx.fillText("Not enough numeric 2D data", 20, 60); return; }
    const xs = rows.map(r => r[xCol] as number), ys = rows.map(r => r[yCol] as number), vs = rows.map(r => r[valCol] as number);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const vMin = Math.min(...vs), vMax = Math.max(...vs);
    const W = canvas.width, H = canvas.height, GRID = 80;
    const cellW = W / GRID, cellH = H / GRID;
    const grid = Array.from({ length: GRID }, (_, gy) =>
      Array.from({ length: GRID }, (_, gx) => {
        const tx = xMin + (gx / GRID) * (xMax - xMin), ty = yMin + (gy / GRID) * (yMax - yMin);
        let best = Infinity, bestV = vMin;
        for (let i = 0; i < rows.length; i++) {
          const d = ((xs[i] - tx) / (xMax - xMin + 1)) ** 2 + ((ys[i] - ty) / (yMax - yMin + 1)) ** 2;
          if (d < best) { best = d; bestV = vs[i]; }
        }
        return bestV;
      })
    );
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        ctx.fillStyle = valToColor(grid[gy][gx], vMin, vMax);
        ctx.fillRect(gx * cellW, (GRID - 1 - gy) * cellH, cellW + 1, cellH + 1);
      }
    }
    const barX = W - 28, barW = 16;
    for (let i = 0; i < H; i++) {
      ctx.fillStyle = valToColor(vMin + ((H - i) / H) * (vMax - vMin), vMin, vMax);
      ctx.fillRect(barX, i, barW, 2);
    }
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "10px monospace";
    ctx.fillText(fmt4(vMax), barX - 36, 12); ctx.fillText(fmt4(vMin), barX - 36, H - 4);
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "11px Arial";
    ctx.fillText(xCol, W / 2 - 20, H - 4);
    ctx.save(); ctx.translate(12, H / 2 + 20); ctx.rotate(-Math.PI / 2); ctx.fillText(yCol, 0, 0); ctx.restore();
  }, [data, xCol, yCol, valCol]);
  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} width={740} height={360} className="rounded-xl w-full" style={{ maxWidth: 740 }} />
      <p className="text-xs text-muted-foreground">Nearest-neighbour grid — X: {xCol} · Y: {yCol} · Value: {valCol}</p>
    </div>
  );
}
