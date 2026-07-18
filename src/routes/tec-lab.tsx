import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Upload, Satellite, FlaskConical, BarChart3, Activity, Map as MapIcon,
  Layers, TrendingUp, AlertCircle, CheckCircle, Download, Copy,
  ChevronLeft, ChevronRight, Info, RefreshCw, FileText,
  Thermometer, Zap, Globe, Filter, X, Eye,
} from "lucide-react";
import {
  ComposedChart, LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ReferenceArea, ResponsiveContainer, Scatter, ScatterChart,
} from "recharts";
import { toast } from "sonner";
import { parseFile } from "@/lib/tec/parser";
import type { ParseResult, TECRecord } from "@/lib/tec/parser";
import {
  computeEpochBins, buildStationSeries, detectStormPhases,
  buildHeatmap, tecToColor, STATION_COLORS,
  computePrnRoti, mean, median, stdDev, type EpochBin,
} from "@/lib/tec/calculations";

export const Route = createFileRoute("/tec-lab")({
  component: TECLabPage,
});

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
    // Storm onset at ~8 UT
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

// ─── Types & constants ────────────────────────────────────────────────────────
type ViewMode = "tec" | "dual" | "delta" | "roti" | "slant" | "heatmap" | "map" | "summary";

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "tec",     label: "Multi-Station TEC",   icon: <TrendingUp className="h-4 w-4" />,  desc: "Median TEC comparison" },
  { id: "dual",    label: "Sat Count + sTEC",     icon: <BarChart3 className="h-4 w-4" />,   desc: "Dual-axis tracking" },
  { id: "delta",   label: "ΔTEC Perturbation",    icon: <Activity className="h-4 w-4" />,    desc: "TEC − quiet baseline" },
  { id: "roti",    label: "ROTI",                 icon: <Zap className="h-4 w-4" />,         desc: "Rate of TEC index" },
  { id: "slant",   label: "Slant TEC",            icon: <Layers className="h-4 w-4" />,      desc: "Per-satellite sTEC" },
  { id: "heatmap", label: "Daily Heatmap",        icon: <Thermometer className="h-4 w-4" />, desc: "Lat × Time × TEC" },
  { id: "map",     label: "World Map",            icon: <Globe className="h-4 w-4" />,       desc: "Station locations" },
  { id: "summary", label: "Summary",              icon: <Eye className="h-4 w-4" />,         desc: "Stats dashboard" },
];

const CHART_STYLE = {
  cartesian: { stroke: "rgba(255,255,255,0.06)", strokeDasharray: "3 3" },
  axis: { style: { fontSize: 10, fill: "var(--muted-foreground)" } },
  tooltip: { contentStyle: { background: "hsl(222 47% 10%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11, color: "#e2e8f0" } },
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const fmt2 = (n: number) => (isNaN(n) ? "—" : n.toFixed(2));
const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const fmtEpoch = (ts: number | string) => {
  const d = new Date(typeof ts === "string" ? ts : ts);
  return isNaN(d.getTime()) ? String(ts) : fmtTime(d.getTime());
};

function downloadCSV(data: object[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(","), ...data.map(r => keys.map(k => (r as Record<string, unknown>)[k]).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
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
  const [rawText, setRawText] = useState("");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<ViewMode>("tec");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedStations, setSelectedStations] = useState<string[]>([]);
  const [selectedPrns, setSelectedPrns] = useState<string[]>([]);
  const [elevFilter, setElevFilter] = useState(0);
  const [binMinutes, setBinMinutes] = useState(15);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Computed data ──────────────────────────────────────────────────────────
  const filteredRecords = useMemo<TECRecord[]>(() => {
    if (!parsed) return [];
    let recs = parsed.records;
    if (selectedStations.length) recs = recs.filter(r => selectedStations.includes(r.station));
    if (selectedPrns.length) recs = recs.filter(r => selectedPrns.includes(r.prn));
    if (elevFilter > 0) recs = recs.filter(r => r.elevation >= elevFilter);
    return recs;
  }, [parsed, selectedStations, selectedPrns, elevFilter]);

  const epochBins = useMemo(() => computeEpochBins(filteredRecords, binMinutes), [filteredRecords, binMinutes]);
  const stationSeries = useMemo(() => {
    const stations = selectedStations.length ? selectedStations : (parsed?.stations ?? []);
    return buildStationSeries(epochBins, stations.slice(0, 10));
  }, [epochBins, selectedStations, parsed]);
  const stormPhases = useMemo(() => detectStormPhases(epochBins), [epochBins]);
  const heatData = useMemo(() => buildHeatmap(filteredRecords), [filteredRecords]);
  const prnRoti = useMemo(() => computePrnRoti(filteredRecords, 5), [filteredRecords]);

  // Chart data for dual-axis view
  const dualData = useMemo(() => {
    if (!stationSeries.length) return [];
    const primary = stationSeries[0]?.data ?? [];
    return primary.map(d => ({
      epoch: fmtEpoch(d.timestamp),
      timestamp: d.timestamp,
      medianTEC: d.medianTEC,
      satCount: d.satCount,
    }));
  }, [stationSeries]);

  // ΔTEC data (all stations merged)
  const deltaData = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const s of stationSeries) {
      for (const d of s.data) {
        if (!map.has(d.timestamp)) map.set(d.timestamp, { timestamp: d.timestamp });
        map.get(d.timestamp)![s.station] = d.deltaTEC;
      }
    }
    return [...map.values()].sort((a, b) => a.timestamp - b.timestamp).map(r => ({
      ...r, epoch: fmtEpoch(r.timestamp),
    }));
  }, [stationSeries]);

  // ROTI data (first station)
  const rotiData = useMemo(() => {
    const primary = stationSeries[0]?.data ?? [];
    return primary.map(d => ({ epoch: fmtEpoch(d.timestamp), timestamp: d.timestamp, roti: d.roti }));
  }, [stationSeries]);

  // Slant TEC per PRN (for first station, limited PRNs)
  const slantData = useMemo(() => {
    const sta = selectedStations[0] ?? parsed?.stations[0];
    if (!sta) return { data: [], prns: [] as string[] };
    const prns = [...new Set(filteredRecords.filter(r => r.station === sta).map(r => r.prn))].sort().slice(0, 8);
    const binMs = binMinutes * 60000;
    const map = new Map<number, Record<string, number>>();
    for (const r of filteredRecords) {
      if (r.station !== sta) continue;
      if (!prns.includes(r.prn)) continue;
      const bts = Math.floor(r.timestamp / binMs) * binMs;
      if (!map.has(bts)) map.set(bts, { timestamp: bts });
      const entry = map.get(bts)!;
      if (!entry[r.prn]) entry[r.prn] = r.sTEC;
      else entry[r.prn] = (entry[r.prn] + r.sTEC) / 2;
    }
    const data = [...map.values()].sort((a, b) => a.timestamp - b.timestamp).map(r => ({
      ...r, epoch: fmtEpoch(r.timestamp),
    }));
    return { data, prns };
  }, [filteredRecords, selectedStations, parsed, binMinutes]);

  // Stats
  const globalStats = useMemo(() => {
    const tecs = filteredRecords.map(r => r.vTEC).filter(v => v > 0);
    return {
      count: filteredRecords.length,
      stations: [...new Set(filteredRecords.map(r => r.station))].length,
      prns: [...new Set(filteredRecords.map(r => r.prn))].length,
      meanTEC: mean(tecs),
      medianTEC: median(tecs),
      maxTEC: tecs.length ? Math.max(...tecs) : 0,
      minTEC: tecs.length ? Math.min(...tecs) : 0,
      stdDevTEC: stdDev(tecs),
    };
  }, [filteredRecords]);

  // ─── File processing ────────────────────────────────────────────────────────
  const processText = useCallback((text: string, fname: string) => {
    setIsProcessing(true); setProgress(10);
    setTimeout(() => { setProgress(40); }, 100);
    setTimeout(() => {
      try {
        const result = parseFile(text, fname);
        setProgress(80);
        setParsed(result);
        setSelectedStations([]);
        setSelectedPrns([]);
        setTimeout(() => { setProgress(100); setIsProcessing(false); }, 200);
        if (result.records.length > 0 || result.ionexMaps.length > 0) {
          toast.success(`Loaded ${result.records.length.toLocaleString()} records from ${result.stations.length} station(s)`);
        } else {
          toast.error(result.warnings[0] ?? "No records found — check file format");
        }
      } catch (e) {
        setIsProcessing(false); setProgress(0);
        toast.error(e instanceof Error ? e.message : "Parse error");
      }
    }, 200);
  }, []);

  const handleFile = useCallback((file: File) => {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setRawText(text);
      processText(text, file.name);
    };
    reader.readAsText(file);
  }, [processText]);

  const loadDemo = () => {
    const csv = generateDemoData();
    setRawText(csv); setFilename("demo_tec_2024-11-05.csv");
    processText(csv, "demo_tec_2024-11-05.csv");
  };

  // ─── World map (lazy-loaded to avoid SSR issues) ────────────────────────────
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: React.ComponentType<Record<string, unknown>>;
    TileLayer: React.ComponentType<Record<string, unknown>>;
    CircleMarker: React.ComponentType<Record<string, unknown>>;
    Popup: React.ComponentType<Record<string, unknown>>;
  } | null>(null);

  useEffect(() => {
    import("react-leaflet").then(m => {
      setMapComponents({
        MapContainer: m.MapContainer as unknown as React.ComponentType<Record<string, unknown>>,
        TileLayer: m.TileLayer as unknown as React.ComponentType<Record<string, unknown>>,
        CircleMarker: m.CircleMarker as unknown as React.ComponentType<Record<string, unknown>>,
        Popup: m.Popup as unknown as React.ComponentType<Record<string, unknown>>,
      });
    });
  }, []);

  // Station lat/lon summary
  const stationLocations = useMemo(() => {
    const map = new Map<string, { lats: number[]; lons: number[]; tecs: number[] }>();
    for (const r of filteredRecords) {
      if (!r.lat || !r.lon) continue;
      if (!map.has(r.station)) map.set(r.station, { lats: [], lons: [], tecs: [] });
      const e = map.get(r.station)!;
      e.lats.push(r.lat); e.lons.push(r.lon); e.tecs.push(r.vTEC);
    }
    return [...map.entries()].map(([sta, d]) => ({
      station: sta,
      lat: mean(d.lats), lon: mean(d.lons),
      medTEC: median(d.tecs),
    }));
  }, [filteredRecords]);

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
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className={`relative flex flex-col border-r border-border/40 bg-card/30 backdrop-blur transition-all duration-300 ${sidebarOpen ? "w-72 min-w-72" : "w-10 min-w-10"} overflow-hidden`}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-md"
          >
            {sidebarOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>

          {sidebarOpen && (
            <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
              {/* Upload */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upload Dataset</p>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onClick={() => fileRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed py-5 text-center transition-all ${isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
                >
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <p className="text-xs font-medium">Drop or click to upload</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">CSV · TXT · DAT · IONEX<br />Max 50 MB</p>
                  <input ref={fileRef} type="file" accept=".csv,.txt,.dat,.ionex,.rnx,.zip" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                </div>

                {/* Progress */}
                {isProcessing && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                      <span>Processing…</span><span>{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${progress}%`, background: "var(--gradient-primary)" }} />
                    </div>
                  </div>
                )}

                {filename && !isProcessing && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate text-muted-foreground">{filename}</span>
                  </div>
                )}
              </div>

              {parsed && (
                <>
                  {/* Extraction Report */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extraction Report</p>
                    <div className="glass space-y-1.5 rounded-xl p-3 text-xs">
                      <SidebarKV label="Format" value={parsed.format.toUpperCase()} />
                      <SidebarKV label="Valid records" value={parsed.records.length.toLocaleString()} />
                      <SidebarKV label="Stations" value={parsed.stations.length.toString()} />
                      <SidebarKV label="Satellites (PRN)" value={parsed.prns.length.toString()} />
                      {parsed.extractionReport.tecRange[1] > 0 && (
                        <SidebarKV label="TEC range" value={`${fmt2(parsed.extractionReport.tecRange[0])}–${fmt2(parsed.extractionReport.tecRange[1])} TECU`} />
                      )}
                      <SidebarKV label="Time span" value={parsed.extractionReport.timeRange[0] !== "—"
                        ? `${new Date(parsed.extractionReport.timeRange[0]).toUTCString().slice(5, 16)}` : "—"} />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Quality score</span>
                        <span className={`font-semibold ${parsed.extractionReport.qualityScore >= 70 ? "text-green-400" : parsed.extractionReport.qualityScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                          {parsed.extractionReport.qualityScore}/100
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {parsed.warnings.length > 0 && (
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs space-y-1">
                      {parsed.warnings.slice(0, 4).map((w, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-yellow-300">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Filters */}
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Filter className="h-3 w-3" /> Filters
                    </p>

                    {/* Station filter */}
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

                    {/* Elevation filter */}
                    <div className="mb-3">
                      <p className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>Min elevation cutoff</span><span className="text-primary">{elevFilter}°</span>
                      </p>
                      <input type="range" min={0} max={45} step={5} value={elevFilter}
                        onChange={e => setElevFilter(Number(e.target.value))}
                        className="w-full accent-primary" />
                    </div>

                    {/* Bin size */}
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
                    <div>
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

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {!parsed ? (
            <EmptyState onLoadDemo={loadDemo} />
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
                  const data = view === "tec" ? stationSeries.flatMap(s => s.data.map(d => ({ station: s.station, ...d })))
                    : view === "delta" ? deltaData : view === "roti" ? rotiData : filteredRecords.slice(0, 5000);
                  downloadCSV(data, `satvision_${view}_${Date.now()}.csv`);
                }} />

                {/* ── View 1: Multi-Station TEC ───────────────────────── */}
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

                {/* ── View 2: Dual-axis Sat Count + sTEC ─────────────── */}
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
                        <Bar yAxisId="count" dataKey="satCount" name="Sat Count" fill="#ffd54f" opacity={0.7} radius={[2, 2, 0, 0]} />
                        <Line yAxisId="tec" type="monotone" dataKey="medianTEC" name="Median sTEC" stroke="#4fc3f7" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── View 3: ΔTEC Perturbation ───────────────────────── */}
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

                {/* ── View 4: ROTI ────────────────────────────────────── */}
                {view === "roti" && (
                  <div className="glass rounded-2xl border border-border/40 p-5">
                    <ChartTitle title="ROTI — Rate of TEC Index" unit="TECU/min" />
                    <p className="mb-3 text-xs text-muted-foreground">ROTI &gt; 0.5 TECU/min indicates ionospheric irregularities. Red dashed line = threshold.</p>
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
                        <Bar dataKey="roti" name="ROTI" fill="#a78bfa" radius={[2, 2, 0, 0]} opacity={0.85} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {[
                        { label: "Mean ROTI", value: fmt2(mean(rotiData.map(d => d.roti))) },
                        { label: "Max ROTI", value: fmt2(Math.max(...rotiData.map(d => d.roti), 0)) },
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

                {/* ── View 5: Slant TEC per PRN ───────────────────────── */}
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

                {/* ── View 6: Heatmap ─────────────────────────────────── */}
                {view === "heatmap" && <HeatmapView data={heatData} />}

                {/* ── View 7: World Map ────────────────────────────────── */}
                {view === "map" && (
                  <div className="glass rounded-2xl border border-border/40 overflow-hidden" style={{ height: 480 }}>
                    {MapComponents ? (
                      <MapComponents.MapContainer
                        center={[20, 0]} zoom={2} style={{ height: "100%", width: "100%", background: "#0d1117" }}
                        attributionControl={false}
                      >
                        <MapComponents.TileLayer
                          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                          attribution='&copy; OpenStreetMap &copy; CARTO'
                        />
                        {stationLocations.map((s) => (
                          <MapComponents.CircleMarker
                            key={s.station}
                            center={[s.lat, s.lon]}
                            radius={10}
                            pathOptions={{ color: "#4fc3f7", fillColor: "#4fc3f7", fillOpacity: 0.8, weight: 2 }}
                          >
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
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-xs text-muted-foreground bg-card/80 rounded-lg px-4 py-2">No station coordinates found in dataset</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── View 8: Summary ─────────────────────────────────── */}
                {view === "summary" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "Total Records", value: globalStats.count.toLocaleString(), unit: "" },
                        { label: "Stations", value: globalStats.stations, unit: "" },
                        { label: "Median TEC", value: fmt2(globalStats.medianTEC), unit: "TECU" },
                        { label: "Max TEC", value: fmt2(globalStats.maxTEC), unit: "TECU" },
                        { label: "Mean TEC", value: fmt2(globalStats.meanTEC), unit: "TECU" },
                        { label: "Min TEC", value: fmt2(globalStats.minTEC), unit: "TECU" },
                        { label: "Std Dev", value: fmt2(globalStats.stdDevTEC), unit: "TECU" },
                        { label: "PRNs tracked", value: globalStats.prns, unit: "" },
                      ].map(s => (
                        <div key={s.label} className="glass rounded-xl border border-border/30 p-4 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                          <div className="mt-1 text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>{s.value}</div>
                          {s.unit && <div className="text-[10px] text-primary">{s.unit}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Mini TEC chart */}
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

                    {/* Station breakdown table */}
                    <div className="glass overflow-hidden rounded-2xl border border-border/40">
                      <table className="w-full text-xs">
                        <thead className="border-b border-border/40 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            {["Station", "Records", "PRNs", "Median TEC", "Max TEC", "Min TEC", "Std Dev", "Lat", "Lon"].map(h => (
                              <th key={h} className="px-3 py-2 text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(parsed?.stations ?? []).map((sta, si) => {
                            const stRecs = filteredRecords.filter(r => r.station === sta);
                            const tecs = stRecs.map(r => r.vTEC).filter(v => v > 0);
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

function EmptyState({ onLoadDemo }: { onLoadDemo: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: "var(--gradient-primary)" }}>
        <Satellite className="h-10 w-10 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>GPS TEC Analysis Platform</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Upload your GPS/GNSS dataset to begin. Supports CSV, TXT, DAT, and IONEX formats with automatic column detection.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs text-muted-foreground max-w-xl">
        {["Auto column detection", "Multi-station analysis", "ROTI + ΔTEC computation", "Storm phase detection",
          "8 interactive charts", "IONEX map parsing", "Publication-quality output", "CSV/PNG export"].map(f => (
          <div key={f} className="glass flex items-center gap-1.5 rounded-xl px-3 py-2">
            <CheckCircle className="h-3 w-3 shrink-0 text-green-400" /> {f}
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={onLoadDemo}
          className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
          style={{ background: "var(--gradient-primary)" }}>
          <FlaskConical className="h-4 w-4" /> Load Demo Dataset
        </button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground self-center">
          <Info className="h-3.5 w-3.5" /> Or use the sidebar to upload your file
        </p>
      </div>
      <div className="max-w-lg rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-xs text-yellow-200">
        <p className="font-semibold mb-1">Supported in browser: CSV · TXT · DAT · IONEX</p>
        <p className="text-yellow-300/80">RINEX binary, HDF5 (.h5), and NetCDF (.nc) require the Python backend (FastAPI + georinex/h5py/netCDF4). Upload CSV exports from those formats for browser processing.</p>
      </div>
    </div>
  );
}

// ─── Heatmap view ─────────────────────────────────────────────────────────────
function HeatmapView({ data }: { data: { timeSlot: number; lat: number; tec: number }[] }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const lats = [...new Set(data.map(d => d.lat))].sort((a, b) => b - a);
  const tecMap = new Map(data.map(d => [`${d.timeSlot}|${d.lat}`, d.tec]));
  const maxTEC = Math.max(...data.map(d => d.tec), 1);

  if (!data.length) {
    return (
      <div className="glass flex h-64 items-center justify-center rounded-2xl border border-border/40">
        <p className="text-sm text-muted-foreground">No latitude data — dataset needs lat/lon columns for heatmap</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl border border-border/40 p-5">
      <ChartTitle title="Daily TEC Heatmap (Latitude × UTC Hour)" unit="TECU" />
      <div className="overflow-x-auto">
        <div style={{ display: "grid", gridTemplateColumns: `60px repeat(24, minmax(24px, 1fr))`, gap: 2 }}>
          <div className="text-[9px] text-muted-foreground text-right pr-1 pb-1">Lat</div>
          {hours.map(h => (
            <div key={h} className="text-[9px] text-center text-muted-foreground">{h}</div>
          ))}
          {lats.map(lat => (
            <>
              <div key={`lat-${lat}`} className="text-[9px] text-right pr-1 text-muted-foreground self-center">{lat}°</div>
              {hours.map(h => {
                const tec = tecMap.get(`${h}|${lat}`);
                return (
                  <div key={`${lat}-${h}`} title={tec !== undefined ? `${lat}° ${h}:00 UTC — ${tec.toFixed(1)} TECU` : "No data"}
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
        {/* Color scale legend */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">0 TECU</span>
          <div className="h-3 flex-1 rounded-full" style={{
            background: "linear-gradient(to right, rgb(68,1,84), rgb(59,82,139), rgb(33,145,140), rgb(94,201,98), rgb(253,231,37), rgb(253,127,37), rgb(220,50,50))"
          }} />
          <span className="text-[10px] text-muted-foreground">{maxTEC.toFixed(0)} TECU</span>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
