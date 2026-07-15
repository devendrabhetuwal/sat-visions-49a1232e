import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  loadGeoTiff,
  computeIndex,
  computeEVI,
  computeSAVI,
  computeNBR,
  computeCustom,
  renderIndexToDataURL,
  downloadDataUrl,
  downloadJson,
  type LoadedTiff,
} from "@/lib/geotiff-utils";
import { GeoMap } from "@/components/dashboard/GeoMap";
import { AIChat } from "@/components/dashboard/AIChat";
import { saveProject } from "@/lib/projects.functions";
import { generateAnalysisReport } from "@/lib/ai-report.functions";
import { Satellite, Upload, LogOut, Loader2, Layers, Info, Download, Save, FileText, FolderOpen, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Stats = { min: number; max: number; mean: number; count: number; histogram: number[] };
type IndexKind = "raw" | "ndvi" | "ndwi" | "evi" | "savi" | "nbr" | "custom";

function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tiff, setTiff] = useState<LoadedTiff | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [indexType, setIndexType] = useState<IndexKind>("raw");
  const [stats, setStats] = useState<Stats | null>(null);
  const [basemap, setBasemap] = useState<"satellite" | "streets" | "terrain">("satellite");
  const [redBandIdx, setRedBandIdx] = useState(0);
  const [nirBandIdx, setNirBandIdx] = useState(1);
  const [greenBandIdx, setGreenBandIdx] = useState(1);
  const [blueBandIdx, setBlueBandIdx] = useState(2);
  const [swirBandIdx, setSwirBandIdx] = useState(5);
  const [customExpr, setCustomExpr] = useState("(B3 - B2) / (B3 + B2)");
  const [fileName, setFileName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const saveFn = useServerFn(saveProject);
  const reportFn = useServerFn(generateAnalysisReport);

  const meta = tiff?.meta;

  const handleUpload = async (file: File) => {
    setLoading(true);
    setStats(null);
    setOverlayUrl(null);
    setIndexType("raw");
    try {
      const loaded = await loadGeoTiff(file);
      setTiff(loaded);
      setFileName(file.name);
      // Try to render raw single band as grayscale preview
      const raster = (await loaded.image.readRasters()) as unknown as (Float32Array | Uint16Array | Int16Array)[] & { width: number; height: number };
      const width = loaded.image.getWidth();
      const height = loaded.image.getHeight();
      const first = raster[0] as Float32Array | Uint16Array | Int16Array;
      // Normalize to Float32 in [-1,1] for renderer using min-max
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < first.length; i++) {
        const v = first[i] as number;
        if (isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
      }
      const norm = new Float32Array(first.length);
      const range = max - min || 1;
      for (let i = 0; i < first.length; i++) norm[i] = ((first[i] as number - min) / range) * 2 - 1;
      const url = renderIndexToDataURL(norm, width, height, "gray");
      setOverlayUrl(url);
      if (loaded.meta.samplesPerPixel > 1) {
        setRedBandIdx(0);
        setNirBandIdx(Math.min(loaded.meta.samplesPerPixel - 1, 3));
        setGreenBandIdx(Math.min(loaded.meta.samplesPerPixel - 1, 1));
      }
      toast.success(`Loaded ${file.name} — ${loaded.meta.width}×${loaded.meta.height}, ${loaded.meta.samplesPerPixel} band(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read GeoTIFF");
    } finally {
      setLoading(false);
    }
  };

  const computeAndRender = async (kind: Exclude<IndexKind, "raw">) => {
    if (!tiff) return;
    setLoading(true);
    try {
      let result: { data: Float32Array; min: number; max: number; mean: number; count: number; histogram: number[] };
      let colormap: "ndvi" | "ndwi" | "gray" = "ndvi";
      if (kind === "ndvi") {
        const [nir, red] = (await tiff.image.readRasters({ samples: [nirBandIdx, redBandIdx] })) as unknown as Float32Array[];
        result = computeIndex(nir, red); colormap = "ndvi";
      } else if (kind === "ndwi") {
        const [green, nir] = (await tiff.image.readRasters({ samples: [greenBandIdx, nirBandIdx] })) as unknown as Float32Array[];
        result = computeIndex(green, nir); colormap = "ndwi";
      } else if (kind === "evi") {
        const [nir, red, blue] = (await tiff.image.readRasters({ samples: [nirBandIdx, redBandIdx, blueBandIdx] })) as unknown as Float32Array[];
        result = computeEVI(nir, red, blue); colormap = "ndvi";
      } else if (kind === "savi") {
        const [nir, red] = (await tiff.image.readRasters({ samples: [nirBandIdx, redBandIdx] })) as unknown as Float32Array[];
        result = computeSAVI(nir, red); colormap = "ndvi";
      } else if (kind === "nbr") {
        const [nir, swir] = (await tiff.image.readRasters({ samples: [nirBandIdx, swirBandIdx] })) as unknown as Float32Array[];
        result = computeNBR(nir, swir); colormap = "ndwi";
      } else {
        // custom — read ALL bands referenced in expression
        const refs = Array.from(new Set(Array.from(customExpr.matchAll(/B(\d+)/g)).map((m) => Number(m[1]))));
        const rasters = (await tiff.image.readRasters({ samples: refs })) as unknown as Float32Array[];
        const bandMap: Float32Array[] = [];
        refs.forEach((r, i) => { bandMap[r] = rasters[i]; });
        result = computeCustom(bandMap, customExpr); colormap = "ndvi";
      }
      const { data, min, max, mean, count, histogram } = result;
      const url = renderIndexToDataURL(data, tiff.meta.width, tiff.meta.height, colormap);
      setOverlayUrl(url);
      setStats({ min, max, mean, count, histogram });
      setIndexType(kind);
      setReport(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to compute ${kind.toUpperCase()}`);
    } finally {
      setLoading(false);
    }
  };

  const exportPng = () => {
    if (!overlayUrl) return;
    downloadDataUrl(overlayUrl, `${fileName.replace(/\.[^.]+$/, "")}_${indexType}.png`);
  };

  const exportJson = () => {
    if (!meta) return;
    downloadJson(
      { file: fileName, meta, index: indexType, stats },
      `${fileName.replace(/\.[^.]+$/, "")}_${indexType}.json`,
    );
  };

  const handleSave = async () => {
    if (!tiff || !meta) return;
    setSaving(true);
    try {
      const row = await saveFn({
        data: {
          id: projectId,
          name: fileName || "Untitled dataset",
          file_name: fileName,
          width: meta.width,
          height: meta.height,
          bands: meta.samplesPerPixel,
          bbox: meta.bbox,
          epsg: meta.epsg ?? null,
          projected: meta.projected,
          last_index: indexType === "raw" ? null : indexType,
          last_stats: stats
            ? { min: stats.min, max: stats.max, mean: stats.mean, count: stats.count }
            : null,
          notes: null,
        },
      });
      setProjectId((row as { id: string } | null)?.id);
      toast.success("Project saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const generateReport = async () => {
    if (!datasetContext) return;
    setReportLoading(true);
    try {
      const { report: md } = await reportFn({
        data: {
          datasetContext,
          indexType: indexType === "raw" ? undefined : indexType,
          stats: stats ? { min: stats.min, max: stats.max, mean: stats.mean, count: stats.count } : undefined,
        },
      });
      setReport(md);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report failed");
    } finally {
      setReportLoading(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, `${(fileName || "report").replace(/\.[^.]+$/, "")}_report.md`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const datasetContext = useMemo(() => {
    if (!meta) return undefined;
    return [
      `File: ${fileName}`,
      `Dimensions: ${meta.width} × ${meta.height}`,
      `Bands: ${meta.samplesPerPixel}`,
      `BBox: [${meta.bbox.map((v) => v.toFixed(4)).join(", ")}]`,
      meta.epsg ? `EPSG: ${meta.epsg}` : "",
      meta.projected ? "Projected CRS" : "Geographic CRS",
      stats ? `${indexType.toUpperCase()} stats — min: ${stats.min.toFixed(3)}, max: ${stats.max.toFixed(3)}, mean: ${stats.mean.toFixed(3)}, valid pixels: ${stats.count}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [meta, fileName, stats, indexType]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg glow" style={{ background: "var(--gradient-primary)" }}>
              <Satellite className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: "Space Grotesk" }}>
              SatVision <span className="text-gradient">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/projects" className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-white/5">
              <FolderOpen className="h-3.5 w-3.5" /> Projects
            </Link>
            <Link to="/analysis" className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-white/5">
              <BarChart3 className="h-3.5 w-3.5" /> Analysis
            </Link>
            <Link to="/timeseries" className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-white/5">
              <BarChart3 className="h-3.5 w-3.5" /> Time-series
            </Link>
            <button
              onClick={signOut}
              className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-white/5"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_1fr_360px]">
        {/* Left: Upload + metadata */}
        <aside className="glass flex flex-col gap-4 rounded-2xl p-4">
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "Space Grotesk" }}>
              <Upload className="h-4 w-4 text-primary" /> Upload dataset
            </h2>
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-border p-6 text-center transition-all hover:border-primary hover:bg-primary/5">
              <input
                type="file"
                className="hidden"
                accept=".tif,.tiff"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              {loading ? (
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              ) : (
                <>
                  <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-xs font-medium">Drop GeoTIFF or click</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">.tif / .tiff</p>
                </>
              )}
            </label>
          </div>

          {meta && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Info className="h-3 w-3" /> Metadata
              </h3>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">File</dt><dd className="truncate font-mono">{fileName}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Dimensions</dt><dd className="font-mono">{meta.width}×{meta.height}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Bands</dt><dd className="font-mono">{meta.samplesPerPixel}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">CRS</dt><dd className="font-mono">{meta.epsg ? `EPSG:${meta.epsg}` : meta.projected ? "Projected" : "Geographic"}</dd></div>
                <div className="text-muted-foreground">BBox</div>
                <div className="rounded-lg bg-black/20 p-2 font-mono text-[10px]">
                  [{meta.bbox.map((v) => v.toFixed(3)).join(", ")}]
                </div>
              </dl>
            </div>
          )}

          {meta && meta.samplesPerPixel > 1 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Layers className="h-3 w-3" /> Bands
              </h3>
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Red", redBandIdx, setRedBandIdx],
                    ["NIR", nirBandIdx, setNirBandIdx],
                    ["Green", greenBandIdx, setGreenBandIdx],
                    ["Blue", blueBandIdx, setBlueBandIdx],
                    ["SWIR", swirBandIdx, setSwirBandIdx],
                  ].map(([label, val, set]) => (
                    <label key={label as string} className="block">
                      <span className="text-muted-foreground">{label as string}</span>
                      <input type="number" min={0} max={meta.samplesPerPixel - 1} value={val as number}
                        onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-border bg-input px-2 py-1 font-mono" />
                    </label>
                  ))}
                </div>

                <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indices</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(["ndvi", "ndwi", "evi", "savi", "nbr"] as const).map((k) => (
                    <button key={k} onClick={() => computeAndRender(k)} disabled={loading}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold uppercase transition-all disabled:opacity-50 ${
                        indexType === k ? "text-primary-foreground" : "glass hover:bg-white/5"
                      }`}
                      style={indexType === k ? { background: "var(--gradient-primary)" } : undefined}>
                      {k}
                    </button>
                  ))}
                </div>

                <div className="mt-2">
                  <span className="text-muted-foreground">Custom formula</span>
                  <input value={customExpr} onChange={(e) => setCustomExpr(e.target.value)}
                    placeholder="(B3 - B2) / (B3 + B2)"
                    className="mt-1 w-full rounded-lg border border-border bg-input px-2 py-1 font-mono text-[11px]" />
                  <button onClick={() => computeAndRender("custom")} disabled={loading}
                    className="mt-2 w-full rounded-lg px-2 py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                    style={{ background: "var(--gradient-primary)" }}>
                    Compute custom
                  </button>
                </div>
              </div>
            </div>
          )}

          {meta && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Session</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleSave} disabled={saving}
                  className="glass flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold hover:bg-white/5 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                </button>
                <button onClick={exportPng} disabled={!overlayUrl}
                  className="glass flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold hover:bg-white/5 disabled:opacity-50">
                  <Download className="h-3 w-3" /> PNG
                </button>
                <button onClick={exportJson}
                  className="glass flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold hover:bg-white/5">
                  <Download className="h-3 w-3" /> JSON
                </button>
                <button onClick={generateReport} disabled={reportLoading || !stats}
                  className="flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                  style={{ background: "var(--gradient-primary)" }}>
                  {reportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} Report
                </button>
              </div>
            </div>
          )}

          {stats && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {indexType.toUpperCase()} Statistics
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="glass rounded-lg p-2">
                  <div className="text-[10px] text-muted-foreground">Min</div>
                  <div className="font-mono text-xs">{stats.min.toFixed(2)}</div>
                </div>
                <div className="glass rounded-lg p-2">
                  <div className="text-[10px] text-muted-foreground">Mean</div>
                  <div className="font-mono text-xs text-primary">{stats.mean.toFixed(2)}</div>
                </div>
                <div className="glass rounded-lg p-2">
                  <div className="text-[10px] text-muted-foreground">Max</div>
                  <div className="font-mono text-xs">{stats.max.toFixed(2)}</div>
                </div>
              </div>
              {/* Histogram */}
              <div className="mt-3 flex h-16 items-end gap-0.5">
                {stats.histogram.map((h, i) => {
                  const maxH = Math.max(...stats.histogram);
                  const pct = maxH ? (h / maxH) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 rounded-t"
                      style={{ height: `${pct}%`, background: "var(--gradient-primary)", minHeight: 2 }}
                      title={`${((i / 20) * 2 - 1).toFixed(2)} to ${(((i + 1) / 20) * 2 - 1).toFixed(2)}: ${h}`}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>-1</span><span>0</span><span>+1</span>
              </div>
            </div>
          )}
        </aside>

        {/* Center: Map */}
        <main className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ fontFamily: "Space Grotesk" }}>
              {indexType === "raw" ? "Preview" : `${indexType.toUpperCase()} Overlay`}
            </h2>
            <div className="flex gap-1 rounded-full glass p-1 text-xs">
              {(["satellite", "terrain", "streets"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBasemap(b)}
                  className={`rounded-full px-3 py-1 capitalize transition-all ${
                    basemap === b ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={basemap === b ? { background: "var(--gradient-primary)" } : undefined}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl" style={{ height: "calc(100vh - 180px)", minHeight: 500 }}>
            <GeoMap bbox={meta?.bboxLatLng ?? null} overlayUrl={overlayUrl} basemap={basemap} />
          </div>
          {!meta && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Upload a GeoTIFF to see it geolocated on the map.
            </p>
          )}
        </main>

        {/* Right: AI Chat */}
        <aside className="glass rounded-2xl p-4" style={{ maxHeight: "calc(100vh - 100px)" }}>
          <AIChat datasetContext={datasetContext} />
        </aside>
      </div>

      {report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setReport(null)}>
          <div className="glass max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/40 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "Space Grotesk" }}>
                <FileText className="h-4 w-4 text-primary" /> AI Analysis Report
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={downloadReport} className="glass flex items-center gap-1 rounded-full px-3 py-1 text-xs">
                  <Download className="h-3 w-3" /> .md
                </button>
                <button onClick={() => setReport(null)} className="glass rounded-full p-1.5">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-foreground" style={{ fontFamily: "Inter" }}>{report}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
