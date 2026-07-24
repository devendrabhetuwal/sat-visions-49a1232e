import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Upload, Satellite, FlaskConical, BarChart3, Activity, Map as MapIcon,
  Layers, TrendingUp, AlertCircle, CheckCircle, Download, Copy,
  ChevronLeft, ChevronRight, Info, RefreshCw, FileText,
  Thermometer, Zap, Globe, Filter, X, Eye, Plus, Play, Trash2,
  Loader2, Cpu,
} from "lucide-react";
import {
  ComposedChart, LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ReferenceArea, ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { parseFile, mergeParseResults } from "@/lib/tec/parser";
import type { ParseResult, TECRecord } from "@/lib/tec/parser";
import { runEngine } from "@/lib/tec/engine";
import type { EngineResult } from "@/lib/tec/engine";
import { EnginePanel } from "@/components/tec/EnginePanel";
import { SkyPlot } from "@/components/tec/SkyPlot";
import { GroundTrack } from "@/components/tec/GroundTrack";
import {
  computeEpochBins, buildStationSeries, detectStormPhases,
  buildHeatmap, tecToColor, STATION_COLORS,
  computePrnRoti, mean, median, stdDev, type EpochBin,
} from "@/lib/tec/calculations";

export const Route = createFileRoute("/tec-lab")({
  component: TECLabPage,
});

// ─── Binary format detection & API upload ────────────────────────────────────
const RINEX_EXTS  = new Set([".rnx",".obs",".nav",".o",".n",".g",".l",".p",".21o",".22o",".23o",".24o",".25o",".21n",".22n",".23n",".24n"]);
const HDF5_EXTS   = new Set([".h5",".hdf5",".hdf",".he5"]);
const NETCDF_EXTS = new Set([".nc",".cdf",".nc4",".netcdf"]);

function getBinaryFormat(filename: string): "rinex" | "hdf5" | "netcdf" | null {
  const ext = "." + filename.split(".").pop()!.toLowerCase();
  if (RINEX_EXTS.has(ext))  return "rinex";
  if (HDF5_EXTS.has(ext))   return "hdf5";
  if (NETCDF_EXTS.has(ext)) return "netcdf";
  return null;
}

async function uploadToPythonParser(file: File, fmt: "rinex" | "hdf5" | "netcdf", onProgress: (p: number) => void): Promise<string> {
  onProgress(15);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/py/parse/${fmt}`, { method: "POST", body: form });
  onProgress(75);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `Server error ${res.status}`);
  }
  const json = await res.json();
  onProgress(95);
  return json.csv as string;
}

// ─── Demo data generator ─────────────────────────────────────────────────────
function generateDemoData(): string {
  const stations = ["PIMO", "HYDE", "HNLC", "CHUR", "YELL"];
  const stationLats: Record<string, number> = { PIMO: 14.6, HYDE: 17.4, HNLC: 21.3, CHUR: 58.7, YELL: 62.5 };
  const stationLons: Record<string, number> = { PIMO: 121.1, HYDE: 78.5, HNLC: -157.9, CHUR: -94.1, YELL: -135.0 };
  const prns = ["G01","G03","G05","G08","G10","G14","G17","G19","G22","G28"];
  const rows = ["datetime,station,prn,lat,lon,elevation,azimuth,sTEC,vTEC"];
  const base = new Date("2024-11-05T00:00:00Z");
  for (let m = 0; m < 1440; m += 15) {
    const ts = new Date(base.getTime() + m * 60000);
    const iso = ts.toISOString();
    const hour = ts.getUTCHours() + ts.getUTCMinutes() / 60;
    const stormFactor = hour >= 8 && hour <= 20 ? 1 + 0.8 * Math.sin((hour - 8) * Math.PI / 12) : 1;
    for (const sta of stations) {
      const baseTEC = 15 + 25 * Math.sin((hour - 6) * Math.PI / 12) * (stationLats[sta] > 50 ? 0.6 : 1);
      const activePrns = prns.slice(0, 4 + Math.floor(4 * Math.sin(hour * Math.PI / 12)));
      for (const prn of activePrns) {
        const elev = 20 + 60 * Math.random();
        const az = Math.random() * 360;
        const noise = (Math.random() - 0.5) * 2;
        const sTEC = Math.max(1, baseTEC * stormFactor + noise) * (0.8 + 0.4 * (elev / 90));
        const mfInv = Math.cos((Math.asin(6371 * Math.cos(elev * Math.PI / 180) / (6371 + 450))));
        const vTEC = Math.max(1, sTEC * mfInv);
        rows.push(`${iso},${sta},${prn},${stationLats[sta]},${stationLons[sta]},${elev.toFixed(1)},${az.toFixed(1)},${sTEC.toFixed(2)},${vTEC.toFixed(2)}`);
      }
    }
  }
  return rows.join("\n");
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewMode = "tec" | "dual" | "delta" | "roti" | "slant" | "heatmap" | "map" | "skyplot" | "groundtrack" | "summary" | "engine";
type FileStatus = "pending" | "processing" | "done" | "error";

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  shortLabel: string;   // e.g. "CHUR" extracted from filename
  status: FileStatus;
  result?: ParseResult;
  error?: string;
}

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "tec",     label: "Multi-Station TEC",  icon: <TrendingUp className="h-4 w-4" />,  desc: "Median TEC comparison" },
  { id: "dual",    label: "Sat Count + sTEC",    icon: <BarChart3 className="h-4 w-4" />,   desc: "Dual-axis tracking" },
  { id: "delta",   label: "ΔTEC Perturbation",   icon: <Activity className="h-4 w-4" />,    desc: "TEC − quiet baseline" },
  { id: "roti",    label: "ROTI",                icon: <Zap className="h-4 w-4" />,         desc: "Rate of TEC index" },
  { id: "slant",   label: "Slant TEC",           icon: <Layers className="h-4 w-4" />,      desc: "Per-satellite sTEC" },
  { id: "heatmap", label: "Daily Heatmap",       icon: <Thermometer className="h-4 w-4" />, desc: "Lat × Time × TEC" },
  { id: "map",     label: "World Map",           icon: <Globe className="h-4 w-4" />,       desc: "Station locations" },
  { id: "skyplot", label: "Sky Plot",            icon: <Satellite className="h-4 w-4" />,   desc: "Polar elevation × azimuth" },
  { id: "groundtrack", label: "Ground Track",    icon: <MapIcon className="h-4 w-4" />,     desc: "Satellite IPP tracks" },
  { id: "summary", label: "Summary",             icon: <Eye className="h-4 w-4" />,         desc: "Stats dashboard" },
  { id: "engine",  label: "⚡ Engine",            icon: <Cpu className="h-4 w-4" />,         desc: "Advanced signal-processing analysis" },
];

const CHART_STYLE = {
  cartesian: { stroke: "rgba(255,255,255,0.06)", strokeDasharray: "3 3" },
  axis: { style: { fontSize: 10, fill: "var(--muted-foreground)" } },
  tooltip: { contentStyle: { background: "hsl(222 47% 10%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11, color: "#e2e8f0" } },
};

const fmt2 = (n: number) => (isNaN(n) ? "—" : n.toFixed(2));
const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
};
const fmtEpoch = (ts: number | string) => {
  const d = new Date(typeof ts === "string" ? ts : ts);
  return isNaN(d.getTime()) ? String(ts) : fmtTime(d.getTime());
};

function downloadCSV(data: object[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(","), ...data.map(r => keys.map(k => (r as Record<string, unknown>)[k]).join(","))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = filename; a.click();
}

function shortLabel(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[^A-Z0-9]/gi, "_").toUpperCase().slice(0, 8) || "FILE";
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function TECTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CHART_STYLE.tooltip.contentStyle} className="rounded-lg p-2 shadow-xl">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-mono font-semibold">{fmt2(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function TECLabPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [parsed, setParsed]               = useState<ParseResult | null>(null);
  const [isAnalysing, setIsAnalysing]     = useState(false);
  const [view, setView]                   = useState<ViewMode>("tec");
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [isDragging, setIsDragging]       = useState(false);
  const [selectedStations, setSelectedStations] = useState<string[]>([]);
  const [elevFilter, setElevFilter]       = useState(0);
  const [binMinutes, setBinMinutes]       = useState(15);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Computed data ──────────────────────────────────────────────────────────
  const filteredRecords = useMemo<TECRecord[]>(() => {
    if (!parsed) return [];
    let recs = parsed.records;
    if (selectedStations.length) recs = recs.filter(r => selectedStations.includes(r.station));
    if (elevFilter > 0) recs = recs.filter(r => r.elevation >= elevFilter);
    return recs;
  }, [parsed, selectedStations, elevFilter]);

  const epochBins     = useMemo(() => computeEpochBins(filteredRecords, binMinutes), [filteredRecords, binMinutes]);
  const stationSeries = useMemo(() => {
    const stations = selectedStations.length ? selectedStations : (parsed?.stations ?? []);
    return buildStationSeries(epochBins, stations.slice(0, 10));
  }, [epochBins, selectedStations, parsed]);
  const stormPhases = useMemo(() => detectStormPhases(epochBins), [epochBins]);
  const heatData    = useMemo(() => buildHeatmap(filteredRecords), [filteredRecords]);
  const prnRoti     = useMemo(() => computePrnRoti(filteredRecords, 5), [filteredRecords]);

  const dualData = useMemo(() => {
    if (!stationSeries.length) return [];
    const primary = stationSeries[0]?.data ?? [];
    return primary.map(d => ({ epoch: fmtEpoch(d.timestamp), timestamp: d.timestamp, medianTEC: d.medianTEC, satCount: d.satCount }));
  }, [stationSeries]);

  const deltaData = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const s of stationSeries) {
      for (const d of s.data) {
        if (!map.has(d.timestamp)) map.set(d.timestamp, { timestamp: d.timestamp });
        map.get(d.timestamp)![s.station] = d.deltaTEC;
      }
    }
    return [...map.values()].sort((a, b) => a.timestamp - b.timestamp).map(r => ({ ...r, epoch: fmtEpoch(r.timestamp) }));
  }, [stationSeries]);

  const rotiData = useMemo(() => {
    const primary = stationSeries[0]?.data ?? [];
    return primary.map(d => ({ epoch: fmtEpoch(d.timestamp), timestamp: d.timestamp, roti: d.roti }));
  }, [stationSeries]);

  const slantData = useMemo(() => {
    const sta = selectedStations[0] ?? parsed?.stations[0];
    if (!sta) return { data: [], prns: [] as string[] };
    const prns = [...new Set(filteredRecords.filter(r => r.station === sta).map(r => r.prn))].sort().slice(0, 8);
    const binMs = binMinutes * 60000;
    const map = new Map<number, Record<string, number>>();
    for (const r of filteredRecords) {
      if (r.station !== sta || !prns.includes(r.prn)) continue;
      const bts = Math.floor(r.timestamp / binMs) * binMs;
      if (!map.has(bts)) map.set(bts, { timestamp: bts });
      const entry = map.get(bts)!;
      entry[r.prn] = entry[r.prn] !== undefined ? (entry[r.prn] + r.sTEC) / 2 : r.sTEC;
    }
    const data = [...map.values()].sort((a, b) => a.timestamp - b.timestamp).map(r => ({ ...r, epoch: fmtEpoch(r.timestamp) }));
    return { data, prns };
  }, [filteredRecords, selectedStations, parsed, binMinutes]);

  const globalStats = useMemo(() => {
    const tecs = filteredRecords.map(r => r.vTEC).filter(v => v > 0 && isFinite(v));
    return {
      count: filteredRecords.length,
      stations: [...new Set(filteredRecords.map(r => r.station))].length,
      prns: [...new Set(filteredRecords.map(r => r.prn))].length,
      meanTEC: mean(tecs), medianTEC: median(tecs),
      maxTEC: tecs.length ? Math.max(...tecs) : 0,
      minTEC: tecs.length ? Math.min(...tecs) : 0,
      stdDevTEC: stdDev(tecs),
    };
  }, [filteredRecords]);

  const stationLocations = useMemo(() => {
    const map = new Map<string, { lats: number[]; lons: number[]; tecs: number[] }>();
    for (const r of filteredRecords) {
      if (!r.lat || !r.lon) continue;
      if (!map.has(r.station)) map.set(r.station, { lats: [], lons: [], tecs: [] });
      const e = map.get(r.station)!;
      e.lats.push(r.lat); e.lons.push(r.lon); e.tecs.push(r.vTEC);
    }
    return [...map.entries()].map(([sta, d]) => ({ station: sta, lat: mean(d.lats), lon: mean(d.lons), medTEC: median(d.tecs) }));
  }, [filteredRecords]);

  // ─── Engine ─────────────────────────────────────────────────────────────────
  const engineResult = useMemo<EngineResult | null>(() => {
    if (!parsed || filteredRecords.length < 4) return null;
    // Build primary TEC time-series (first station, sorted by time)
    const primary = stationSeries[0];
    if (!primary || primary.data.length < 4) return null;
    const sorted  = [...primary.data].sort((a, b) => a.timestamp - b.timestamp);
    const values     = sorted.map(d => d.medianTEC);
    const timestamps = sorted.map(d => d.timestamp);
    // Build station matrix for PCA [nTime × nStations]
    const allTimestamps = [...new Set(stationSeries.flatMap(s => s.data.map(d => d.timestamp)))].sort((a, b) => a - b);
    const stationMatrix: number[][] = allTimestamps.map(ts =>
      stationSeries.map(s => s.data.find(d => d.timestamp === ts)?.medianTEC ?? 0)
    );
    const sampleIntervalSec = binMinutes * 60;
    return runEngine(values, timestamps, sampleIntervalSec, stationMatrix);
  }, [parsed, filteredRecords, stationSeries, binMinutes]);

  // ─── Leaflet lazy-load ──────────────────────────────────────────────────────
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: React.ComponentType<Record<string, unknown>>;
    TileLayer: React.ComponentType<Record<string, unknown>>;
    CircleMarker: React.ComponentType<Record<string, unknown>>;
    Polyline: React.ComponentType<Record<string, unknown>>;
    Popup: React.ComponentType<Record<string, unknown>>;
  } | null>(null);

  useEffect(() => {
    import("react-leaflet").then(m => {
      setMapComponents({
        MapContainer:   m.MapContainer   as unknown as React.ComponentType<Record<string, unknown>>,
        TileLayer:      m.TileLayer      as unknown as React.ComponentType<Record<string, unknown>>,
        CircleMarker:   m.CircleMarker   as unknown as React.ComponentType<Record<string, unknown>>,
        Polyline:       m.Polyline       as unknown as React.ComponentType<Record<string, unknown>>,
        Popup:          m.Popup          as unknown as React.ComponentType<Record<string, unknown>>,
      });
    });
  }, []);

  // ─── File handling ──────────────────────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    const newEntries: UploadedFile[] = Array.from(files).map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      name: f.name,
      shortLabel: shortLabel(f.name),
      status: "pending",
    }));
    setUploadedFiles(prev => {
      // Avoid exact filename duplicates
      const existing = new Set(prev.map(e => e.name));
      return [...prev, ...newEntries.filter(e => !existing.has(e.name))];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // ─── Create Analysis: parse all pending files then merge ───────────────────
  const createAnalysis = useCallback(async () => {
    const pending = uploadedFiles.filter(f => f.status === "pending" || f.status === "error");
    if (!pending.length && uploadedFiles.length === 0) return;

    setIsAnalysing(true);

    // Process each file
    const updated = [...uploadedFiles];

    for (let i = 0; i < updated.length; i++) {
      const entry = updated[i];
      if (entry.status === "done") continue;

      updated[i] = { ...entry, status: "processing" };
      setUploadedFiles([...updated]);

      try {
        let text = "";
        const binaryFmt = getBinaryFormat(entry.file.name);

        if (binaryFmt) {
          text = await uploadToPythonParser(entry.file, binaryFmt, () => {});
        } else {
          text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error("File read error"));
            reader.readAsText(entry.file);
          });
        }

        const result = parseFile(text, entry.file.name);
        updated[i] = { ...entry, status: "done", result };
        setUploadedFiles([...updated]);
      } catch (err) {
        updated[i] = { ...entry, status: "error", error: err instanceof Error ? err.message : "Parse error" };
        setUploadedFiles([...updated]);
      }
    }

    // Merge all successful results
    const done = updated.filter(f => f.status === "done" && f.result);
    if (done.length === 0) {
      toast.error("No files parsed successfully — check file format");
      setIsAnalysing(false);
      return;
    }

    const results   = done.map(f => f.result!);
    const labels    = done.map(f => f.shortLabel);
    const merged    = results.length === 1 ? results[0] : mergeParseResults(results, labels);

    if (merged.records.length === 0 && merged.ionexMaps.length === 0) {
      toast.error(merged.warnings[0] ?? "No TEC records found — check column names");
    } else {
      toast.success(`Analysis ready: ${merged.records.length.toLocaleString()} records · ${merged.stations.length} station(s) · ${merged.prns.length} PRN(s)`);
    }

    setParsed(merged);
    setSelectedStations([]);
    setView("tec");
    setIsAnalysing(false);
  }, [uploadedFiles]);

  // ─── Demo loader ────────────────────────────────────────────────────────────
  const loadDemo = () => {
    const csv  = generateDemoData();
    const blob = new Blob([csv], { type: "text/csv" });
    const file = new File([blob], "demo_tec_2024-11-05.csv", { type: "text/csv" });
    const entry: UploadedFile = {
      id: "demo", file, name: file.name, shortLabel: "DEMO", status: "done",
      result: parseFile(csv, file.name),
    };
    setUploadedFiles([entry]);
    const result = entry.result!;
    setParsed(result);
    setSelectedStations([]);
    setView("tec");
    toast.success(`Demo loaded: ${result.records.length.toLocaleString()} records from ${result.stations.length} stations`);
  };

  // ─── Drag over entire sidebar ────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const pendingCount = uploadedFiles.filter(f => f.status === "pending" || f.status === "error").length;
  const doneCount    = uploadedFiles.filter(f => f.status === "done").length;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--background)" }}>
      {/* Nav */}
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-full items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Satellite className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold hidden sm:block" style={{ fontFamily: "Space Grotesk" }}>
              SatVision <span className="text-gradient">AI</span>
            </span>
          </Link>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <span className="text-sm font-semibold">GPS TEC Analysis Platform</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={loadDemo}
              className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:text-primary transition-colors">
              <FlaskConical className="h-3.5 w-3.5" /> Load Demo
            </button>
            <Link to="/dashboard" className="glass rounded-lg px-3 py-1.5 text-xs font-medium">Dashboard</Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative flex flex-col border-r transition-all duration-300 ${isDragging ? "border-primary bg-primary/5" : "border-border/40 bg-card/30 backdrop-blur"} ${sidebarOpen ? "w-72 min-w-72" : "w-10 min-w-10"} overflow-hidden`}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-md">
            {sidebarOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>

          {sidebarOpen && (
            <div className="flex h-full flex-col gap-0 overflow-y-auto p-4 pb-6">

              {/* ── Upload dropzone ─────────────────────────────────────── */}
              <div className="mb-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upload Dataset</p>

                {/* Drop zone */}
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed py-4 text-center transition-all ${isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <p className="text-xs font-medium">Drop files or click to add</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">CSV · TXT · IONEX · RINEX · HDF5 · NetCDF<br />Multiple files supported · Max 100 MB each</p>
                  <input ref={fileRef} type="file" multiple
                    accept=".csv,.txt,.dat,.ionex,.rnx,.obs,.nav,.o,.n,.h5,.hdf5,.hdf,.nc,.nc4,.cdf"
                    className="hidden"
                    onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
                </div>

                {/* File list */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {uploadedFiles.map(f => (
                      <div key={f.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors
                        ${f.status === "done" ? "bg-green-500/10 border border-green-500/20"
                          : f.status === "error" ? "bg-red-500/10 border border-red-500/20"
                          : f.status === "processing" ? "bg-primary/10 border border-primary/20"
                          : "bg-muted/15 border border-border/30"}`}>
                        {/* Status icon */}
                        <span className="shrink-0">
                          {f.status === "done"       && <CheckCircle className="h-3.5 w-3.5 text-green-400" />}
                          {f.status === "error"      && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                          {f.status === "processing" && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
                          {f.status === "pending"    && <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium text-foreground/80">{f.name}</p>
                          {f.status === "done" && f.result && (
                            <p className="text-[10px] text-green-400">
                              {f.result.records.length.toLocaleString()} records · {f.result.stations.length} sta
                            </p>
                          )}
                          {f.status === "error" && (
                            <p className="text-[10px] text-red-400 truncate">{f.error}</p>
                          )}
                          {f.status === "pending" && (
                            <p className="text-[10px] text-muted-foreground">Ready to analyse</p>
                          )}
                        </div>
                        <button onClick={() => removeFile(f.id)}
                          className="shrink-0 rounded p-0.5 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Create Analysis button */}
                {uploadedFiles.length > 0 && (
                  <button
                    onClick={createAnalysis}
                    disabled={isAnalysing}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
                    style={{ background: "var(--gradient-primary)" }}>
                    {isAnalysing
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</>
                      : <><Play className="h-4 w-4" /> Create Analysis
                        {pendingCount > 0 && <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">{pendingCount} new</span>}
                      </>}
                  </button>
                )}

                {/* No files — show demo shortcut */}
                {uploadedFiles.length === 0 && (
                  <button onClick={loadDemo}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
                    <FlaskConical className="h-3.5 w-3.5" /> Try demo dataset
                  </button>
                )}
              </div>

              {/* ── Extraction report ───────────────────────────────────── */}
              {parsed && (
                <>
                  <div className="border-t border-border/30 pt-3 mt-1">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extraction Report</p>
                      {doneCount > 1 && (
                        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">{doneCount} files merged</span>
                      )}
                    </div>
                    <div className="glass space-y-1.5 rounded-xl p-3 text-xs">
                      <SidebarKV label="Format"         value={parsed.format.toUpperCase()} />
                      <SidebarKV label="Valid records"  value={parsed.records.length.toLocaleString()} />
                      <SidebarKV label="Stations"       value={parsed.stations.length.toString()} />
                      <SidebarKV label="Satellites (PRN)" value={parsed.prns.length.toString()} />
                      {parsed.extractionReport.tecRange[1] > 0 && (
                        <SidebarKV label="TEC range"
                          value={`${fmt2(parsed.extractionReport.tecRange[0])}–${fmt2(parsed.extractionReport.tecRange[1])} TECU`} />
                      )}
                      <SidebarKV label="Time span"
                        value={parsed.extractionReport.timeRange[0] !== "—"
                          ? new Date(parsed.extractionReport.timeRange[0]).toUTCString().slice(5, 16)
                          : "—"} />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Quality score</span>
                        <span className={`font-semibold ${parsed.extractionReport.qualityScore >= 70 ? "text-green-400" : parsed.extractionReport.qualityScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                          {parsed.extractionReport.qualityScore}/100
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {parsed.warnings.filter(w => !w.includes("[")).slice(0, 4).length > 0 && (
                    <div className="mt-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs space-y-1">
                      {parsed.warnings.filter(w => !w.includes("[")).slice(0, 4).map((w, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-yellow-300">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Filters */}
                  <div className="mt-3 border-t border-border/30 pt-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Filter className="h-3 w-3" /> Filters
                    </p>

                    <div className="mb-3">
                      <p className="mb-1 text-[10px] text-muted-foreground">Stations ({parsed.stations.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {parsed.stations.map((sta, si) => (
                          <button key={sta} onClick={() => setSelectedStations(prev =>
                            prev.includes(sta) ? prev.filter(s => s !== sta) : [...prev, sta])}
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${selectedStations.includes(sta) ? "text-white" : "glass text-muted-foreground"}`}
                            style={selectedStations.includes(sta) ? { background: STATION_COLORS[si % STATION_COLORS.length] } : {}}>
                            {sta}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>Min elevation cutoff</span><span className="text-primary">{elevFilter}°</span>
                      </p>
                      <input type="range" min={0} max={45} step={5} value={elevFilter}
                        onChange={e => setElevFilter(Number(e.target.value))}
                        className="w-full accent-primary" />
                    </div>

                    <div>
                      <p className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>Time bin</span><span className="text-primary">{binMinutes} min</span>
                      </p>
                      <input type="range" min={5} max={60} step={5} value={binMinutes}
                        onChange={e => setBinMinutes(Number(e.target.value))}
                        className="w-full accent-primary" />
                    </div>
                  </div>

                  {/* Detected columns */}
                  {Object.keys(parsed.extractionReport.detectedColumns).length > 0 && (
                    <div className="mt-3 border-t border-border/30 pt-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detected Columns</p>
                      <div className="glass space-y-1 rounded-xl p-3 text-xs">
                        {Object.entries(parsed.extractionReport.detectedColumns).map(([key, raw]) => (
                          <SidebarKV key={key} label={key} value={raw} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {!parsed ? (
            <EmptyState
              onLoadDemo={loadDemo}
              onUpload={() => fileRef.current?.click()}
              hasFiles={uploadedFiles.length > 0}
              onCreateAnalysis={createAnalysis}
              isAnalysing={isAnalysing} />
          ) : (
            <>
              {/* View tabs */}
              <div className="border-b border-border/40 bg-card/20 px-4">
                <div className="flex gap-1 overflow-x-auto pb-0 pt-2 scrollbar-none">
                  {VIEWS.map(v => (
                    <button key={v.id} onClick={() => setView(v.id)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition whitespace-nowrap ${view === v.id ? "border-b-2 border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart area */}
              <div className="flex-1 overflow-y-auto p-4">
                <ChartHeader view={view} bins={epochBins} onExport={() => {
                  const data = view === "tec"    ? stationSeries.flatMap(s => s.data.map(d => ({ station: s.station, ...d })))
                    : view === "delta"  ? deltaData
                    : view === "roti"   ? rotiData
                    : view === "engine" ? (engineResult
                        ? engineResult.anomalies.map((a, i) => ({ index: i, value: a.value, score: a.score, isAnomaly: a.isAnomaly }))
                        : [])
                    : filteredRecords.slice(0, 5000);
                  downloadCSV(data, `satvision_${view}_${Date.now()}.csv`);
                }} />

                {/* Multi-Station TEC */}
                {view === "tec" && (
                  <div className="glass rounded-2xl border border-border/40 p-5">
                    <ChartTitle title="Multi-Station Median TEC Comparison" unit="TECU" />
                    <ResponsiveContainer width="100%" height={380}>
                      <LineChart data={buildMergedTimeline(stationSeries)}>
                        <CartesianGrid {...CHART_STYLE.cartesian} />
                        <XAxis dataKey="epoch" tick={CHART_STYLE.axis} interval="preserveStartEnd" />
                        <YAxis tick={CHART_STYLE.axis} label={{ value: "TEC (TECU)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                        <Tooltip content={<TECTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {stormPhases.map((p, i) => (
                          <ReferenceArea key={i} x1={fmtEpoch(p.start)} x2={fmtEpoch(p.end)}
                            fill={p.phase === "main" ? "rgba(239,68,68,0.08)" : "rgba(251,146,60,0.06)"} />
                        ))}
                        {stationSeries.map((s, i) => (
                          <Line key={s.station} type="monotone" data={s.data.map(d => ({ ...d, epoch: fmtEpoch(d.timestamp) }))}
                            dataKey="medianTEC" name={s.station} stroke={STATION_COLORS[i % STATION_COLORS.length]}
                            strokeWidth={1.8} dot={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                    {stormPhases.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {stormPhases.map((p, i) => (
                          <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.phase === "main" ? "bg-red-500/20 text-red-300" : p.phase === "recovery" ? "bg-orange-500/20 text-orange-300" : "bg-blue-500/20 text-blue-300"}`}>
                            {p.label}: {fmtEpoch(p.start)}–{fmtEpoch(p.end)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sat Count + sTEC */}
                {view === "dual" && (
                  <div className="glass rounded-2xl border border-border/40 p-5">
                    <ChartTitle title="GPS Satellite Tracking Count + Median sTEC" unit="" />
                    <p className="mb-3 text-xs text-muted-foreground">Blue line = Median sTEC (TECU) · Yellow bars = Satellite count per epoch</p>
                    <ResponsiveContainer width="100%" height={380}>
                      <ComposedChart data={dualData}>
                        <CartesianGrid {...CHART_STYLE.cartesian} />
                        <XAxis dataKey="epoch" tick={CHART_STYLE.axis} interval="preserveStartEnd" />
                        <YAxis yAxisId="tec" tick={CHART_STYLE.axis} label={{ value: "sTEC (TECU)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#4fc3f7" } }} />
                        <YAxis yAxisId="count" orientation="right" tick={CHART_STYLE.axis} label={{ value: "Sat Count", angle: 90, position: "insideRight", style: { fontSize: 10, fill: "#ffd54f" } }} />
                        <Tooltip contentStyle={CHART_STYLE.tooltip.contentStyle} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="count" dataKey="satCount" name="Sat Count" fill="#ffd54f" opacity={0.7} radius={[2,2,0,0]} />
                        <Line yAxisId="tec" type="monotone" dataKey="medianTEC" name="Median sTEC" stroke="#4fc3f7" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ΔTEC */}
                {view === "delta" && (
                  <div className="glass rounded-2xl border border-border/40 p-5">
                    <ChartTitle title="ΔTEC Perturbation (TEC − Quiet-Day Baseline)" unit="TECU" />
                    <p className="mb-3 text-xs text-muted-foreground">Positive = ionospheric enhancement · Negative = depletion</p>
                    <ResponsiveContainer width="100%" height={380}>
                      <ComposedChart data={deltaData}>
                        <CartesianGrid {...CHART_STYLE.cartesian} />
                        <XAxis dataKey="epoch" tick={CHART_STYLE.axis} interval="preserveStartEnd" />
                        <YAxis tick={CHART_STYLE.axis} label={{ value: "ΔTEC (TECU)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                        <Tooltip content={<TECTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
                        {stormPhases.map((p, i) => (
                          <ReferenceArea key={i} x1={fmtEpoch(p.start)} x2={fmtEpoch(p.end)}
                            fill={p.phase === "main" ? "rgba(239,68,68,0.08)" : "rgba(251,146,60,0.06)"} />
                        ))}
                        {stationSeries.map((s, i) => (
                          <Line key={s.station} type="monotone" data={s.data.map(d => ({ ...d, epoch: fmtEpoch(d.timestamp) }))}
                            dataKey="deltaTEC" name={`Δ${s.station}`} stroke={STATION_COLORS[i % STATION_COLORS.length]}
                            strokeWidth={1.5} dot={false} connectNulls />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ROTI */}
                {view === "roti" && (
                  <div className="glass rounded-2xl border border-border/40 p-5">
                    <ChartTitle title="ROTI — Rate of TEC Index" unit="TECU/min" />
                    <p className="mb-3 text-xs text-muted-foreground">ROTI &gt; 0.5 TECU/min indicates ionospheric irregularities</p>
                    <ResponsiveContainer width="100%" height={380}>
                      <ComposedChart data={rotiData}>
                        <CartesianGrid {...CHART_STYLE.cartesian} />
                        <XAxis dataKey="epoch" tick={CHART_STYLE.axis} interval="preserveStartEnd" />
                        <YAxis tick={CHART_STYLE.axis} label={{ value: "ROTI (TECU/min)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                        <Tooltip contentStyle={CHART_STYLE.tooltip.contentStyle} />
                        <ReferenceLine y={0.5} stroke="#f87171" strokeDasharray="5 5" label={{ value: "Threshold 0.5", fill: "#f87171", fontSize: 10 }} />
                        {stormPhases.map((p, i) => (
                          <ReferenceArea key={i} x1={fmtEpoch(p.start)} x2={fmtEpoch(p.end)}
                            fill={p.phase === "main" ? "rgba(239,68,68,0.1)" : "rgba(251,146,60,0.06)"} />
                        ))}
                        <Bar dataKey="roti" name="ROTI" fill="#a78bfa" radius={[2,2,0,0]} opacity={0.85} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {[
                        { label: "Mean ROTI",      value: fmt2(mean(rotiData.map(d => d.roti))) },
                        { label: "Max ROTI",       value: fmt2(Math.max(...rotiData.map(d => d.roti), 0)) },
                        { label: "> 0.5 TECU/min", value: `${rotiData.filter(d => d.roti > 0.5).length} epochs` },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl bg-muted/10 p-3 text-center">
                          <div className="text-xs text-muted-foreground">{s.label}</div>
                          <div className="font-mono text-sm font-bold text-primary">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Slant TEC */}
                {view === "slant" && (
                  <div className="glass rounded-2xl border border-border/40 p-5">
                    <ChartTitle title={`Slant TEC — ${selectedStations[0] ?? parsed.stations[0] ?? "Station"}`} unit="TECU" />
                    <p className="mb-3 text-xs text-muted-foreground">Each line represents one tracked GPS satellite (PRN)</p>
                    <ResponsiveContainer width="100%" height={380}>
                      <LineChart data={slantData.data}>
                        <CartesianGrid {...CHART_STYLE.cartesian} />
                        <XAxis dataKey="epoch" tick={CHART_STYLE.axis} interval="preserveStartEnd" />
                        <YAxis tick={CHART_STYLE.axis} label={{ value: "sTEC (TECU)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                        <Tooltip contentStyle={CHART_STYLE.tooltip.contentStyle} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {slantData.prns.map((prn, i) => (
                          <Line key={prn} type="monotone" dataKey={prn} name={prn}
                            stroke={STATION_COLORS[i % STATION_COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Heatmap */}
                {view === "heatmap" && <HeatmapView data={heatData} />}

                {/* Sky Plot */}
                {view === "skyplot" && <SkyPlot records={filteredRecords} />}

                {/* Ground Track */}
                {view === "groundtrack" && (
                  <GroundTrack records={filteredRecords} map={MapComponents} />
                )}

                {/* World Map */}
                {view === "map" && (
                  <div className="glass rounded-2xl border border-border/40 overflow-hidden relative" style={{ height: 480 }}>
                    {MapComponents ? (
                      <MapComponents.MapContainer center={[20, 0]} zoom={2} style={{ height: "100%", width: "100%", background: "#0d1117" }} attributionControl={false}>
                        <MapComponents.TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap &copy; CARTO' />
                        {stationLocations.map((s) => (
                          <MapComponents.CircleMarker key={s.station} center={[s.lat, s.lon]} radius={10}
                            pathOptions={{ color: "#4fc3f7", fillColor: "#4fc3f7", fillOpacity: 0.8, weight: 2 }}>
                            <MapComponents.Popup>
                              <div className="text-xs">
                                <p className="font-bold">{s.station}</p>
                                <p>Lat: {s.lat.toFixed(2)}° | Lon: {s.lon.toFixed(2)}°</p>
                                <p>Median TEC: {fmt2(s.medTEC)} TECU</p>
                              </div>
                            </MapComponents.Popup>
                          </MapComponents.CircleMarker>
                        ))}
                      </MapComponents.MapContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <RefreshCw className="animate-spin h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    {stationLocations.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-xs text-muted-foreground bg-card/80 rounded-lg px-4 py-2">No station coordinates in dataset</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Summary */}
                {view === "summary" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "Total Records", value: globalStats.count.toLocaleString(), unit: "" },
                        { label: "Stations",      value: globalStats.stations,               unit: "" },
                        { label: "Median TEC",    value: fmt2(globalStats.medianTEC),        unit: "TECU" },
                        { label: "Max TEC",       value: fmt2(globalStats.maxTEC),           unit: "TECU" },
                        { label: "Mean TEC",      value: fmt2(globalStats.meanTEC),          unit: "TECU" },
                        { label: "Min TEC",       value: fmt2(globalStats.minTEC),           unit: "TECU" },
                        { label: "Std Dev",       value: fmt2(globalStats.stdDevTEC),        unit: "TECU" },
                        { label: "PRNs tracked",  value: globalStats.prns,                   unit: "" },
                      ].map(s => (
                        <div key={s.label} className="glass rounded-xl border border-border/30 p-4 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                          <div className="mt-1 text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>{s.value}</div>
                          {s.unit && <div className="text-[10px] text-primary">{s.unit}</div>}
                        </div>
                      ))}
                    </div>

                    <div className="glass rounded-2xl border border-border/40 p-4">
                      <p className="mb-3 text-sm font-semibold">TEC Overview</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={stationSeries[0]?.data.map(d => ({ epoch: fmtEpoch(d.timestamp), tec: d.medianTEC })) ?? []}>
                          <defs><linearGradient id="summaryGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4fc3f7" stopOpacity={0.3} /><stop offset="95%" stopColor="#4fc3f7" stopOpacity={0} />
                          </linearGradient></defs>
                          <CartesianGrid {...CHART_STYLE.cartesian} />
                          <XAxis dataKey="epoch" tick={CHART_STYLE.axis} interval="preserveStartEnd" />
                          <YAxis tick={CHART_STYLE.axis} />
                          <Tooltip contentStyle={CHART_STYLE.tooltip.contentStyle} />
                          <Area type="monotone" dataKey="tec" name="Median TEC" stroke="#4fc3f7" fill="url(#summaryGrad)" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="glass overflow-hidden rounded-2xl border border-border/40">
                      <table className="w-full text-xs">
                        <thead className="border-b border-border/40 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <tr>{["Station","Records","PRNs","Median TEC","Max TEC","Min TEC","Std Dev","Lat","Lon"].map(h => (
                            <th key={h} className="px-3 py-2 text-left">{h}</th>))}</tr>
                        </thead>
                        <tbody>
                          {(parsed?.stations ?? []).map((sta, si) => {
                            const stRecs = filteredRecords.filter(r => r.station === sta);
                            const tecs = stRecs.map(r => r.vTEC).filter(v => v > 0 && isFinite(v));
                            const loc = stationLocations.find(s => s.station === sta);
                            return (
                              <tr key={sta} className="border-b border-border/20 hover:bg-muted/10">
                                <td className="px-3 py-2 font-semibold" style={{ color: STATION_COLORS[si % STATION_COLORS.length] }}>{sta}</td>
                                <td className="px-3 py-2 font-mono">{stRecs.length.toLocaleString()}</td>
                                <td className="px-3 py-2 font-mono">{new Set(stRecs.map(r => r.prn)).size}</td>
                                <td className="px-3 py-2 font-mono">{fmt2(median(tecs))}</td>
                                <td className="px-3 py-2 font-mono">{tecs.length ? fmt2(Math.max(...tecs)) : "—"}</td>
                                <td className="px-3 py-2 font-mono">{tecs.length ? fmt2(Math.min(...tecs)) : "—"}</td>
                                <td className="px-3 py-2 font-mono">{fmt2(stdDev(tecs))}</td>
                                <td className="px-3 py-2 font-mono">{loc ? loc.lat.toFixed(2) : "—"}</td>
                                <td className="px-3 py-2 font-mono">{loc ? loc.lon.toFixed(2) : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Engine ─────────────────────────────────────────── */}
                {view === "engine" && (
                  engineResult ? (
                    <EnginePanel
                      result={engineResult}
                      rawValues={(stationSeries[0]?.data ?? []).sort((a, b) => a.timestamp - b.timestamp).map(d => d.medianTEC)}
                      timestamps={(stationSeries[0]?.data ?? []).sort((a, b) => a.timestamp - b.timestamp).map(d => d.timestamp)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                        <Cpu className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Engine needs more data</p>
                        <p className="mt-1 text-xs text-muted-foreground">Upload a dataset with at least 4 time-binned records and run Create Analysis.</p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SidebarKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold text-right max-w-[140px] truncate" title={value}>{value}</span>
    </div>
  );
}

function ChartTitle({ title, unit }: { title: string; unit: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold" style={{ fontFamily: "Space Grotesk" }}>{title}</h2>
      {unit && <p className="text-xs text-muted-foreground">Unit: {unit}</p>}
    </div>
  );
}

function ChartHeader({ view, bins, onExport }: { view: ViewMode; bins: EpochBin[]; onExport: () => void }) {
  const desc = VIEWS.find(v => v.id === view)?.desc ?? "";
  return (
    <div className="mb-4 flex items-center justify-between">
      <p className="text-xs text-muted-foreground">{desc} · {bins.length} epoch bins</p>
      <button onClick={onExport}
        className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:text-primary transition-colors">
        <Download className="h-3.5 w-3.5" /> Export CSV
      </button>
    </div>
  );
}

function EmptyState({ onLoadDemo, onUpload, hasFiles, onCreateAnalysis, isAnalysing }: {
  onLoadDemo: () => void; onUpload: () => void;
  hasFiles: boolean; onCreateAnalysis: () => void; isAnalysing: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center overflow-y-auto">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: "var(--gradient-primary)" }}>
        <Satellite className="h-10 w-10 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>GPS TEC Analysis Platform</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Upload one or more GPS/GNSS datasets, then click <strong>Create Analysis</strong> to generate all charts instantly.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs text-muted-foreground max-w-xl">
        {["Auto column detection", "Multi-station analysis", "ROTI + ΔTEC computation", "Storm phase detection",
          "8 interactive charts", "IONEX map parsing", "Multiple file merge", "CSV/PNG export"].map(f => (
          <div key={f} className="glass flex items-center gap-1.5 rounded-xl px-3 py-2">
            <CheckCircle className="h-3 w-3 shrink-0 text-green-400" /> {f}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 justify-center">
        <button onClick={onUpload}
          className="flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 shadow-lg"
          style={{ background: "var(--gradient-primary)" }}>
          <Upload className="h-4 w-4" /> Upload Your File
        </button>
        {hasFiles && (
          <button onClick={onCreateAnalysis} disabled={isAnalysing}
            className="flex items-center gap-2 rounded-full border border-primary px-7 py-3 text-sm font-semibold text-primary hover:bg-primary/10 transition disabled:opacity-60">
            {isAnalysing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</> : <><Play className="h-4 w-4" /> Create Analysis</>}
          </button>
        )}
        <button onClick={onLoadDemo}
          className="glass flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium hover:text-primary transition-colors">
          <FlaskConical className="h-4 w-4" /> Load Demo Dataset
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        <Info className="inline h-3.5 w-3.5 mr-1" />
        CSV · TXT · IONEX · RINEX · HDF5 · NetCDF · Upload multiple files to compare stations side-by-side
      </p>

      <div className="w-full max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">All supported formats</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { fmt: "CSV / TSV",  ext: ".csv  .tsv  .dat", tag: "Browser", desc: "Any delimiter, auto-detected headers. Works with RTKLIB, TEQC, and custom GNSS loggers." },
            { fmt: "Plain text", ext: ".txt  .dat",        tag: "Browser", desc: "Space/tab-separated columns. Comment lines starting with #, %, or ! are skipped." },
            { fmt: "IONEX",      ext: ".ionex",            tag: "Browser", desc: "IGS global TEC maps. All versions with EXPONENT scaling parsed natively." },
            { fmt: "RINEX Obs",  ext: ".rnx  .obs  .##o", tag: "Python",  desc: "GPS/GNSS observation files. TEC computed from dual-frequency pseudoranges." },
            { fmt: "RINEX Nav",  ext: ".nav  .##n  .##g",  tag: "Python",  desc: "Navigation/broadcast ephemeris files parsed via georinex." },
            { fmt: "HDF5",       ext: ".h5  .hdf5  .hdf",  tag: "Python",  desc: "Scientific data containers. TEC variables auto-detected by name pattern." },
            { fmt: "NetCDF",     ext: ".nc  .nc4  .cdf",   tag: "Python",  desc: "Atmospheric and space-weather datasets. xarray-powered TEC extraction." },
          ].map(f => {
            const isPython = f.tag === "Python";
            return (
              <div key={f.fmt} className={`glass flex items-start gap-3 rounded-xl border p-3 text-left ${isPython ? "border-primary/20 bg-primary/5" : "border-green-500/20 bg-green-500/5"}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${isPython ? "bg-primary/20 text-primary" : "bg-green-500/20 text-green-400"}`}>
                  {isPython ? "PY" : "JS"}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {f.fmt} <span className="font-mono text-[10px] text-muted-foreground ml-1">{f.ext}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
function HeatmapView({ data }: { data: { timeSlot: number; lat: number; tec: number }[] }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const lats = [...new Set(data.map(d => d.lat))].sort((a, b) => b - a);
  const tecMap = new Map(data.map(d => [`${d.timeSlot}|${d.lat}`, d.tec]));
  const maxTEC = Math.max(...data.map(d => d.tec), 1);

  if (!data.length) return (
    <div className="glass flex h-64 items-center justify-center rounded-2xl border border-border/40">
      <p className="text-sm text-muted-foreground">No latitude data — dataset needs lat/lon columns for heatmap</p>
    </div>
  );

  return (
    <div className="glass rounded-2xl border border-border/40 p-5">
      <ChartTitle title="Daily TEC Heatmap (Latitude × UTC Hour)" unit="TECU" />
      <div className="overflow-x-auto">
        <div style={{ display: "grid", gridTemplateColumns: `60px repeat(24, minmax(24px, 1fr))`, gap: 2 }}>
          <div className="text-[9px] text-muted-foreground text-right pr-1 pb-1">Lat</div>
          {hours.map(h => <div key={h} className="text-[9px] text-center text-muted-foreground">{h}</div>)}
          {lats.map(lat => (
            <>
              <div key={`lat-${lat}`} className="text-[9px] text-right pr-1 text-muted-foreground self-center">{lat}°</div>
              {hours.map(h => {
                const tec = tecMap.get(`${h}|${lat}`);
                return (
                  <div key={`${lat}-${h}`} title={tec !== undefined ? `${lat}° ${h}:00 — ${tec.toFixed(1)} TECU` : "No data"}
                    className="rounded-sm" style={{
                      height: 18,
                      background: tec !== undefined ? tecToColor(tec, 0, maxTEC) : "rgba(255,255,255,0.03)",
                      opacity: tec !== undefined ? 1 : 0.3,
                    }} />
                );
              })}
            </>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">0 TECU</span>
          <div className="h-3 flex-1 rounded-full" style={{ background: "linear-gradient(to right, rgb(68,1,84), rgb(59,82,139), rgb(33,145,140), rgb(94,201,98), rgb(253,231,37), rgb(253,127,37), rgb(220,50,50))" }} />
          <span className="text-[10px] text-muted-foreground">{maxTEC.toFixed(0)} TECU</span>
        </div>
      </div>
    </div>
  );
}

// ─── Build merged timeline ────────────────────────────────────────────────────
function buildMergedTimeline(series: { station: string; data: { timestamp: number; medianTEC: number }[] }[]) {
  const tsSet = new Set<number>();
  for (const s of series) for (const d of s.data) tsSet.add(d.timestamp);
  const timestamps = [...tsSet].sort((a, b) => a - b);
  return timestamps.map(ts => {
    const row: Record<string, unknown> = { epoch: fmtEpoch(ts), timestamp: ts };
    for (const s of series) {
      const match = s.data.find(d => d.timestamp === ts);
      if (match) row[s.station] = match.medianTEC;
    }
    return row;
  });
}
