import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import {
  Upload, FileText, BarChart3, Table, Download, Copy, RefreshCw,
  Satellite, ChevronUp, ChevronDown, AlertCircle, CheckCircle,
  Sparkles, FlaskConical, Waves, Thermometer, Wind, Leaf,
  Layers, TrendingUp, Hash, X, Info,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/data-lab")({
  component: DataLabPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type DataFormat = "csv" | "json" | "xml" | "tsv" | "plain" | "unknown";
type ViewMode = "table" | "stats" | "chart" | "quality" | "converted";
type ChartType = "bar" | "line" | "area" | "scatter";

interface ParsedData {
  headers: string[];
  rows: Record<string, string | number>[];
  rawFormat: DataFormat;
  numericColumns: string[];
  textColumns: string[];
}

interface ColumnStats {
  col: string;
  count: number;
  missing: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  q1: number;
  q3: number;
}

// ─── Research domain templates ────────────────────────────────────────────────
const TEMPLATES: { id: string; label: string; icon: React.ReactNode; desc: string; data: string }[] = [
  {
    id: "remote_sensing",
    label: "Remote Sensing",
    icon: <Satellite className="h-4 w-4" />,
    desc: "NDVI, NDWI, reflectance bands",
    data: `Band,Red,NIR,Green,Blue,SWIR,NDVI,NDWI
Pixel_001,0.08,0.42,0.10,0.05,0.15,0.68,0.61
Pixel_002,0.12,0.35,0.13,0.07,0.22,0.49,0.45
Pixel_003,0.21,0.22,0.18,0.10,0.30,0.02,0.10
Pixel_004,0.04,0.58,0.08,0.04,0.10,0.87,0.76
Pixel_005,0.15,0.30,0.16,0.09,0.25,0.33,0.30
Pixel_006,0.35,0.18,0.25,0.14,0.42,-0.32,-0.17
Pixel_007,0.06,0.50,0.09,0.05,0.12,0.79,0.70
Pixel_008,0.18,0.26,0.17,0.08,0.28,0.18,0.21`,
  },
  {
    id: "climate",
    label: "Climate Science",
    icon: <Thermometer className="h-4 w-4" />,
    desc: "Temperature, precipitation, humidity",
    data: `Month,Temp_C,Precip_mm,Humidity_pct,Wind_ms,CO2_ppm,Solar_Wm2
Jan,2.3,45.2,78,4.1,418.2,82
Feb,3.1,38.7,74,4.5,419.0,112
Mar,7.8,52.4,69,4.8,418.5,168
Apr,12.4,61.3,65,4.2,417.8,218
May,17.1,48.9,60,3.9,416.2,265
Jun,21.3,35.6,55,3.5,414.8,288
Jul,23.8,28.4,52,3.2,413.9,272
Aug,23.1,31.2,54,3.4,414.5,242
Sep,18.6,47.8,62,4.0,415.8,192
Oct,13.2,68.4,70,4.6,417.3,138
Nov,7.4,58.9,76,4.9,418.8,88
Dec,3.6,51.3,80,4.7,419.5,68`,
  },
  {
    id: "ocean",
    label: "Oceanography",
    icon: <Waves className="h-4 w-4" />,
    desc: "SST, salinity, chlorophyll, depth",
    data: `Station,Lat,Lon,Depth_m,SST_C,Salinity_psu,Chlorophyll_mgl,DO_mgl,pH
STN_01,45.2,-30.1,0,18.4,35.2,0.42,8.1,8.2
STN_01,45.2,-30.1,50,16.1,35.5,0.18,7.8,8.1
STN_01,45.2,-30.1,100,12.3,35.8,0.08,7.2,8.0
STN_02,43.8,-32.5,0,19.2,34.8,0.65,8.3,8.3
STN_02,43.8,-32.5,50,15.8,35.2,0.22,7.5,8.1
STN_03,46.5,-28.3,0,17.6,35.6,0.38,8.0,8.2
STN_03,46.5,-28.3,200,8.4,36.1,0.02,6.8,7.9`,
  },
  {
    id: "atmosphere",
    label: "Atmospheric",
    icon: <Wind className="h-4 w-4" />,
    desc: "Air quality, aerosols, ozone",
    data: `Date,PM25_ugm3,PM10_ugm3,NO2_ppb,O3_ppb,CO_ppm,SO2_ppb,AQI
2024-01-01,12.4,28.3,18.2,42.1,0.82,3.1,52
2024-01-02,18.7,42.1,24.8,38.5,1.12,4.8,68
2024-01-03,35.2,78.4,42.3,28.4,1.85,8.2,112
2024-01-04,28.6,62.7,35.1,31.2,1.54,6.4,94
2024-01-05,8.3,19.4,12.4,51.8,0.62,2.1,38
2024-01-06,14.2,31.8,20.6,44.2,0.94,3.7,58
2024-01-07,22.8,51.3,28.4,36.8,1.28,5.2,78`,
  },
  {
    id: "ecology",
    label: "Ecology",
    icon: <Leaf className="h-4 w-4" />,
    desc: "Species counts, biodiversity indices",
    data: `Plot,Area_ha,Species_count,Shannon_H,Biomass_tha,Canopy_pct,Soil_C_pct,LAI
P01,1.0,42,3.42,186.4,85,3.8,5.2
P02,1.0,38,3.18,164.2,78,3.4,4.8
P03,1.0,55,3.71,212.8,92,4.2,6.1
P04,1.0,29,2.94,128.6,65,2.9,3.9
P05,1.0,61,3.88,248.4,95,4.8,6.8
P06,1.0,33,3.05,142.8,70,3.1,4.2
P07,1.0,47,3.54,198.2,88,4.0,5.6
P08,1.0,22,2.61,98.4,52,2.4,3.2`,
  },
  {
    id: "geology",
    label: "Geology",
    icon: <Layers className="h-4 w-4" />,
    desc: "Seismic, mineral, soil composition",
    data: `Sample,SiO2_pct,Al2O3_pct,Fe2O3_pct,CaO_pct,MgO_pct,Na2O_pct,K2O_pct,Depth_m
S001,68.4,14.2,3.8,2.1,1.4,3.2,2.8,0
S002,62.1,16.8,5.4,3.8,2.1,2.8,3.1,10
S003,55.8,18.4,7.2,5.4,3.2,2.4,2.6,20
S004,72.6,12.8,2.4,1.2,0.8,3.8,3.4,0
S005,58.3,17.6,6.1,4.6,2.8,2.6,2.9,15
S006,64.2,15.4,4.6,3.1,1.8,3.0,3.0,5`,
  },
];

// ─── Parsers ──────────────────────────────────────────────────────────────────
function detectFormat(raw: string): DataFormat {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("<")) return "xml";
  if (trimmed.includes("\t") && !trimmed.includes(",")) return "tsv";
  if (trimmed.includes(",")) return "csv";
  if (/^[\d\s.\-eE+]+$/.test(trimmed)) return "plain";
  return "unknown";
}

function parseCSV(raw: string, sep = ","): ParsedData {
  const lines = raw.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Need at least a header row and one data row.");
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      const val = cells[i] ?? "";
      const num = parseFloat(val);
      row[h] = !isNaN(num) && val !== "" ? num : val;
    });
    return row;
  });
  const numericColumns = headers.filter((h) => rows.some((r) => typeof r[h] === "number"));
  const textColumns = headers.filter((h) => !numericColumns.includes(h));
  return { headers, rows, rawFormat: "csv", numericColumns, textColumns };
}

function parseJSON(raw: string): ParsedData {
  const obj = JSON.parse(raw);
  const arr: Record<string, unknown>[] = Array.isArray(obj) ? obj : obj.data ?? obj.results ?? obj.records ?? [obj];
  if (!arr.length) throw new Error("JSON contains no records.");
  const headers = Object.keys(arr[0]);
  const rows = arr.map((item) => {
    const row: Record<string, string | number> = {};
    headers.forEach((h) => {
      const v = item[h];
      row[h] = typeof v === "number" ? v : String(v ?? "");
    });
    return row;
  });
  const numericColumns = headers.filter((h) => rows.some((r) => typeof r[h] === "number"));
  const textColumns = headers.filter((h) => !numericColumns.includes(h));
  return { headers, rows, rawFormat: "json", numericColumns, textColumns };
}

function parsePlain(raw: string): ParsedData {
  const numbers = raw.trim().split(/[\s,;\n]+/).map(Number).filter((n) => !isNaN(n));
  if (!numbers.length) throw new Error("No numeric values found.");
  const rows = numbers.map((v, i) => ({ Index: i + 1, Value: v }));
  return { headers: ["Index", "Value"], rows, rawFormat: "plain", numericColumns: ["Value"], textColumns: ["Index"] };
}

function parseXML(raw: string): ParsedData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "text/xml");
  const items = Array.from(doc.querySelectorAll("item, record, row, entry, data")).slice(0, 500);
  if (!items.length) {
    // Try all children of root
    const root = doc.documentElement;
    const children = Array.from(root.children);
    if (!children.length) throw new Error("No parseable elements found in XML.");
    const rows = children.map((el, i) => {
      const row: Record<string, string | number> = { _index: i + 1 };
      Array.from(el.children).forEach((child) => {
        const num = parseFloat(child.textContent ?? "");
        row[child.tagName] = !isNaN(num) ? num : (child.textContent ?? "");
      });
      Array.from(el.attributes).forEach((attr) => {
        row[`@${attr.name}`] = attr.value;
      });
      return row;
    });
    const headers = Object.keys(rows[0]);
    const numericColumns = headers.filter((h) => rows.some((r) => typeof r[h] === "number"));
    return { headers, rows, rawFormat: "xml", numericColumns, textColumns: headers.filter((h) => !numericColumns.includes(h)) };
  }
  const headers = new Set<string>();
  const rows = items.map((el) => {
    const row: Record<string, string | number> = {};
    Array.from(el.children).forEach((child) => { headers.add(child.tagName); });
    Array.from(el.attributes).forEach((attr) => { headers.add(`@${attr.name}`); });
    return row;
  });
  // Fill rows
  const hdArr = Array.from(headers);
  items.forEach((el, i) => {
    Array.from(el.children).forEach((child) => {
      const num = parseFloat(child.textContent ?? "");
      rows[i][child.tagName] = !isNaN(num) ? num : (child.textContent ?? "");
    });
    Array.from(el.attributes).forEach((attr) => { rows[i][`@${attr.name}`] = attr.value; });
  });
  const numericColumns = hdArr.filter((h) => rows.some((r) => typeof r[h] === "number"));
  return { headers: hdArr, rows, rawFormat: "xml", numericColumns, textColumns: hdArr.filter((h) => !numericColumns.includes(h)) };
}

function parseRaw(raw: string): ParsedData {
  const fmt = detectFormat(raw);
  if (fmt === "json") return parseJSON(raw);
  if (fmt === "xml") return parseXML(raw);
  if (fmt === "tsv") return parseCSV(raw, "\t");
  if (fmt === "plain") return parsePlain(raw);
  return parseCSV(raw, ",");
}

// ─── Statistics ───────────────────────────────────────────────────────────────
function computeStats(data: ParsedData): ColumnStats[] {
  return data.numericColumns.map((col) => {
    const vals = data.rows
      .map((r) => r[col])
      .filter((v): v is number => typeof v === "number" && !isNaN(v))
      .sort((a, b) => a - b);
    const n = vals.length;
    const missing = data.rows.length - n;
    if (!n) return { col, count: 0, missing, min: 0, max: 0, mean: 0, median: 0, stdDev: 0, q1: 0, q3: 0 };
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (vals[n / 2 - 1] + vals[n / 2]) / 2 : vals[Math.floor(n / 2)];
    const stdDev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    const q1 = vals[Math.floor(n * 0.25)];
    const q3 = vals[Math.floor(n * 0.75)];
    return { col, count: n, missing, min: vals[0], max: vals[n - 1], mean, median, stdDev, q1, q3 };
  });
}

// ─── Export helpers ───────────────────────────────────────────────────────────
function toCSV(data: ParsedData): string {
  const header = data.headers.join(",");
  const rows = data.rows.map((r) => data.headers.map((h) => JSON.stringify(r[h] ?? "")).join(","));
  return [header, ...rows].join("\n");
}

function toMarkdownTable(data: ParsedData): string {
  const sep = data.headers.map(() => "---").join(" | ");
  const header = data.headers.join(" | ");
  const rows = data.rows.map((r) => data.headers.map((h) => String(r[h] ?? "")).join(" | "));
  return [`| ${header} |`, `| ${sep} |`, ...rows.map((r) => `| ${r} |`)].join("\n");
}

function toJSON(data: ParsedData): string {
  return JSON.stringify(data.rows, null, 2);
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmt(n: number): string {
  return isNaN(n) ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(4);
}

// ─── Main page ────────────────────────────────────────────────────────────────
function DataLabPage() {
  const [rawInput, setRawInput] = useState("");
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [stats, setStats] = useState<ColumnStats[]>([]);
  const [view, setView] = useState<ViewMode>("table");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [chartX, setChartX] = useState("");
  const [chartY, setChartY] = useState("");
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const process = useCallback((text: string) => {
    setParseError("");
    try {
      const result = parseRaw(text);
      const s = computeStats(result);
      setParsed(result);
      setStats(s);
      setChartX(result.headers[0] ?? "");
      setChartY(result.numericColumns[0] ?? "");
      setView("table");
      toast.success(`Parsed ${result.rows.length} rows × ${result.headers.length} columns`);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse data");
      setParsed(null);
    }
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawInput(text);
      process(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const sortedRows = parsed
    ? [...parsed.rows].sort((a, b) => {
        if (!sortCol) return 0;
        const av = a[sortCol]; const bv = b[sortCol];
        if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      })
    : [];

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const chartData = sortedRows.slice(0, 100).map((r) => ({ x: r[chartX], [chartY]: r[chartY] }));

  const qualityIssues = parsed
    ? stats.filter((s) => s.missing > 0).length
    : 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Nav */}
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Satellite className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: "Space Grotesk" }}>
              SatVision <span className="text-gradient">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">Data Lab</span>
            <Link to="/dashboard" className="glass rounded-full px-4 py-1.5 text-xs font-medium">Dashboard</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <FlaskConical className="h-3.5 w-3.5" /> Research Data Lab
          </div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
            Raw → <span className="text-gradient">Readable</span>
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Paste or upload any raw research data — CSV, JSON, XML, plain numbers — and instantly convert it into
            tables, statistics, and charts. Supports all major scientific domains.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* ── Left panel ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Upload / drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-6 transition-all ${
                isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-white/2"
              }`}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">Drop file or click to upload</p>
              <p className="text-xs text-muted-foreground">CSV · JSON · XML · TSV · TXT</p>
              <input ref={fileRef} type="file" accept=".csv,.json,.xml,.tsv,.txt" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>

            {/* Paste area */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Or paste raw data</label>
              <textarea
                rows={10}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={"Month,Temp,Precip\nJan,2.3,45.2\nFeb,3.1,38.7\n..."}
                className="w-full rounded-xl border border-border bg-input px-4 py-3 font-mono text-xs outline-none focus:border-primary"
                style={{ resize: "vertical", color: "var(--foreground)" }}
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {parseError}
              </div>
            )}

            <button
              onClick={() => process(rawInput)}
              disabled={!rawInput.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-4 w-4" /> Convert & Analyze
            </button>

            {/* Templates */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Research domain templates</p>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setRawInput(t.data); process(t.data); }}
                    className="glass flex flex-col items-start gap-1 rounded-xl p-3 text-left transition-all hover:bg-white/5"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      {t.icon} {t.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Format info */}
            <div className="glass rounded-xl border border-border/40 p-4 text-xs space-y-2">
              <p className="font-semibold flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-primary" /> Supported formats</p>
              {[
                ["CSV / TSV", "Comma or tab-separated values with headers"],
                ["JSON", "Array of objects or {data:[...]} wrapper"],
                ["XML", "Element-based records with child tags"],
                ["Plain numbers", "Space/newline separated values"],
              ].map(([fmt, desc]) => (
                <div key={fmt}>
                  <span className="font-mono font-semibold text-primary">{fmt}</span>
                  <span className="text-muted-foreground"> — {desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right panel ────────────────────────────────────────────────── */}
          <div>
            {!parsed ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center">
                <FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No data loaded yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Upload a file, paste data, or try a template</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="glass rounded-full px-3 py-1 text-xs">
                    <span className="font-semibold">{parsed.rows.length}</span> rows
                  </span>
                  <span className="glass rounded-full px-3 py-1 text-xs">
                    <span className="font-semibold">{parsed.headers.length}</span> columns
                  </span>
                  <span className="glass rounded-full px-3 py-1 text-xs">
                    <span className="font-semibold">{parsed.numericColumns.length}</span> numeric
                  </span>
                  <span className="glass rounded-full px-3 py-1 text-xs uppercase font-mono">
                    {parsed.rawFormat}
                  </span>
                  {qualityIssues > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-3 py-1 text-xs text-yellow-400">
                      <AlertCircle className="h-3 w-3" /> {qualityIssues} cols with missing values
                    </span>
                  )}
                  {qualityIssues === 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400">
                      <CheckCircle className="h-3 w-3" /> No missing values
                    </span>
                  )}
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => downloadFile(toCSV(parsed), "data.csv", "text/csv")}
                      className="glass flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs hover:text-primary">
                      <Download className="h-3.5 w-3.5" /> CSV
                    </button>
                    <button onClick={() => downloadFile(toJSON(parsed), "data.json", "application/json")}
                      className="glass flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs hover:text-primary">
                      <Download className="h-3.5 w-3.5" /> JSON
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(toMarkdownTable(parsed)); toast.success("Markdown table copied!"); }}
                      className="glass flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs hover:text-primary">
                      <Copy className="h-3.5 w-3.5" /> Markdown
                    </button>
                  </div>
                </div>

                {/* View tabs */}
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: "table", label: "Table", icon: <Table className="h-3.5 w-3.5" /> },
                    { id: "stats", label: "Statistics", icon: <Hash className="h-3.5 w-3.5" /> },
                    { id: "chart", label: "Chart", icon: <BarChart3 className="h-3.5 w-3.5" /> },
                    { id: "quality", label: "Data Quality", icon: <CheckCircle className="h-3.5 w-3.5" /> },
                    { id: "converted", label: "All Formats", icon: <RefreshCw className="h-3.5 w-3.5" /> },
                  ] as { id: ViewMode; label: string; icon: React.ReactNode }[]).map((v) => (
                    <button key={v.id} onClick={() => setView(v.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                        view === v.id ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"
                      }`}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>

                {/* ── Table view ───────────────────────────────────────────── */}
                {view === "table" && (
                  <div className="glass overflow-hidden rounded-xl border border-border/40">
                    <div className="max-h-[520px] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 border-b border-border/40 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left text-muted-foreground/50">#</th>
                            {parsed.headers.map((h) => (
                              <th key={h} className="px-3 py-2 text-left cursor-pointer hover:text-foreground select-none"
                                onClick={() => toggleSort(h)}>
                                <span className="flex items-center gap-1">
                                  {h}
                                  {sortCol === h ? (
                                    sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                  ) : <ChevronUp className="h-3 w-3 opacity-20" />}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRows.slice(0, 500).map((row, i) => (
                            <tr key={i} className="border-b border-border/20 hover:bg-white/2">
                              <td className="px-3 py-2 text-xs text-muted-foreground/50">{i + 1}</td>
                              {parsed.headers.map((h) => (
                                <td key={h} className="px-3 py-2 text-xs">
                                  {typeof row[h] === "number" ? (
                                    <span className="font-mono text-primary/90">{fmt(row[h] as number)}</span>
                                  ) : (
                                    <span>{String(row[h] ?? "")}</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsed.rows.length > 500 && (
                        <p className="p-3 text-center text-xs text-muted-foreground">Showing first 500 of {parsed.rows.length} rows</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Statistics view ──────────────────────────────────────── */}
                {view === "stats" && (
                  <div className="space-y-3">
                    {stats.length === 0 && (
                      <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">No numeric columns found.</div>
                    )}
                    {stats.map((s) => (
                      <div key={s.col} className="glass rounded-xl border border-border/40 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="font-semibold text-sm">{s.col}</h3>
                          <span className="text-xs text-muted-foreground">{s.count} values · {s.missing} missing</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                          {[
                            { label: "Min", val: s.min },
                            { label: "Q1", val: s.q1 },
                            { label: "Median", val: s.median },
                            { label: "Mean", val: s.mean },
                            { label: "Q3", val: s.q3 },
                            { label: "Max", val: s.max },
                            { label: "Std Dev", val: s.stdDev },
                            { label: "Range", val: s.max - s.min },
                          ].map(({ label, val }) => (
                            <div key={label} className="rounded-lg bg-muted/10 p-2 text-center">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                              <div className="mt-0.5 font-mono text-xs font-semibold">{fmt(val)}</div>
                            </div>
                          ))}
                        </div>
                        {/* Mini range bar */}
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/20">
                          <div className="h-full rounded-full" style={{
                            background: "var(--gradient-primary)",
                            marginLeft: `${((s.q1 - s.min) / (s.max - s.min || 1)) * 100}%`,
                            width: `${((s.q3 - s.q1) / (s.max - s.min || 1)) * 100}%`,
                          }} />
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                          <span>{fmt(s.min)}</span><span className="text-primary">IQR: {fmt(s.q3 - s.q1)}</span><span>{fmt(s.max)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Chart view ───────────────────────────────────────────── */}
                {view === "chart" && (
                  <div className="glass rounded-xl border border-border/40 p-5">
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Chart type</label>
                        <div className="flex gap-1">
                          {(["bar", "line", "area", "scatter"] as ChartType[]).map((t) => (
                            <button key={t} onClick={() => setChartType(t)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${chartType === t ? "bg-primary/20 text-primary" : "glass text-muted-foreground"}`}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">X axis</label>
                        <select value={chartX} onChange={(e) => setChartX(e.target.value)}
                          className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none">
                          {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Y axis</label>
                        <select value={chartY} onChange={(e) => setChartY(e.target.value)}
                          className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none">
                          {parsed.numericColumns.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>

                    <ResponsiveContainer width="100%" height={320}>
                      {chartType === "bar" ? (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                          <Bar dataKey={chartY} fill="url(#chartGrad)" radius={[4, 4, 0, 0]} />
                          <defs><linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6ec6f5" /><stop offset="100%" stopColor="#a78bfa" />
                          </linearGradient></defs>
                        </BarChart>
                      ) : chartType === "line" ? (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                          <Line type="monotone" dataKey={chartY} stroke="#6ec6f5" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      ) : chartType === "area" ? (
                        <AreaChart data={chartData}>
                          <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6ec6f5" stopOpacity={0.3} /><stop offset="95%" stopColor="#6ec6f5" stopOpacity={0} />
                          </linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                          <Area type="monotone" dataKey={chartY} stroke="#6ec6f5" fill="url(#areaGrad)" strokeWidth={2} />
                        </AreaChart>
                      ) : (
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="x" name={chartX} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <YAxis dataKey={chartY} name={chartY} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} cursor={{ strokeDasharray: "3 3" }} />
                          <Scatter data={chartData} fill="#6ec6f5" />
                        </ScatterChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── Data quality view ────────────────────────────────────── */}
                {view === "quality" && (
                  <div className="space-y-3">
                    <div className="glass grid grid-cols-2 gap-3 rounded-xl border border-border/40 p-4 sm:grid-cols-4">
                      <Kpi label="Total Rows" value={parsed.rows.length} />
                      <Kpi label="Total Columns" value={parsed.headers.length} />
                      <Kpi label="Numeric Cols" value={parsed.numericColumns.length} />
                      <Kpi label="Text Cols" value={parsed.textColumns.length} />
                    </div>
                    <div className="glass overflow-hidden rounded-xl border border-border/40">
                      <table className="w-full text-sm">
                        <thead className="border-b border-border/40 bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2 text-left">Column</th>
                            <th className="px-4 py-2 text-left">Type</th>
                            <th className="px-4 py-2 text-right">Count</th>
                            <th className="px-4 py-2 text-right">Missing</th>
                            <th className="px-4 py-2 text-right">Complete %</th>
                            <th className="px-4 py-2 text-right">Min</th>
                            <th className="px-4 py-2 text-right">Max</th>
                            <th className="px-4 py-2 text-right">Mean</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsed.headers.map((h) => {
                            const s = stats.find((st) => st.col === h);
                            const isNum = parsed.numericColumns.includes(h);
                            const pct = s ? ((s.count / parsed.rows.length) * 100).toFixed(1) : "100.0";
                            return (
                              <tr key={h} className="border-b border-border/20 hover:bg-muted/10">
                                <td className="px-4 py-2 font-medium">{h}</td>
                                <td className="px-4 py-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${isNum ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"}`}>
                                    {isNum ? "numeric" : "text"}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-xs font-mono">{s?.count ?? parsed.rows.length}</td>
                                <td className="px-4 py-2 text-right text-xs font-mono">
                                  <span className={s?.missing ? "text-yellow-400" : "text-green-400"}>{s?.missing ?? 0}</span>
                                </td>
                                <td className="px-4 py-2 text-right text-xs font-mono">
                                  <span className={Number(pct) < 90 ? "text-yellow-400" : "text-green-400"}>{pct}%</span>
                                </td>
                                <td className="px-4 py-2 text-right text-xs font-mono text-muted-foreground">{s ? fmt(s.min) : "—"}</td>
                                <td className="px-4 py-2 text-right text-xs font-mono text-muted-foreground">{s ? fmt(s.max) : "—"}</td>
                                <td className="px-4 py-2 text-right text-xs font-mono text-muted-foreground">{s ? fmt(s.mean) : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── All formats view ─────────────────────────────────────── */}
                {view === "converted" && (
                  <div className="space-y-4">
                    {[
                      { label: "CSV", lang: "csv", content: toCSV(parsed), file: "data.csv", mime: "text/csv" },
                      { label: "JSON", lang: "json", content: toJSON(parsed), file: "data.json", mime: "application/json" },
                      { label: "Markdown Table", lang: "markdown", content: toMarkdownTable(parsed), file: "data.md", mime: "text/markdown" },
                    ].map(({ label, lang, content, file, mime }) => (
                      <div key={label} className="glass rounded-xl border border-border/40 overflow-hidden">
                        <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-primary">{label}</span>
                          <div className="flex gap-2">
                            <button onClick={() => { navigator.clipboard.writeText(content); toast.success(`${label} copied!`); }}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-primary">
                              <Copy className="h-3 w-3" /> Copy
                            </button>
                            <button onClick={() => downloadFile(content, file, mime)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-primary">
                              <Download className="h-3 w-3" /> Download
                            </button>
                          </div>
                        </div>
                        <pre className="max-h-48 overflow-auto p-4 font-mono text-[11px] text-muted-foreground">
                          {content.slice(0, 3000)}{content.length > 3000 ? "\n…(truncated)" : ""}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
