import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadGeoTiff, computeIndex, renderIndexToDataURL, type LoadedTiff } from "@/lib/geotiff-utils";
import { GeoMap } from "@/components/dashboard/GeoMap";
import { AIChat } from "@/components/dashboard/AIChat";
import { Satellite, Upload, LogOut, Loader2, Layers, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Stats = { min: number; max: number; mean: number; count: number; histogram: number[] };

function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tiff, setTiff] = useState<LoadedTiff | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [indexType, setIndexType] = useState<"raw" | "ndvi" | "ndwi">("raw");
  const [stats, setStats] = useState<Stats | null>(null);
  const [basemap, setBasemap] = useState<"satellite" | "streets" | "terrain">("satellite");
  const [redBandIdx, setRedBandIdx] = useState(0);
  const [nirBandIdx, setNirBandIdx] = useState(1);
  const [greenBandIdx, setGreenBandIdx] = useState(1);
  const [fileName, setFileName] = useState<string>("");

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

  const computeAndRender = async (kind: "ndvi" | "ndwi") => {
    if (!tiff) return;
    setLoading(true);
    try {
      const bands = kind === "ndvi" ? [nirBandIdx, redBandIdx] : [greenBandIdx, nirBandIdx];
      const raster = (await tiff.image.readRasters({ samples: bands })) as unknown as (Float32Array | Uint16Array | Int16Array)[];
      const { data, min, max, mean, count, histogram } = computeIndex(raster[0], raster[1]);
      const url = renderIndexToDataURL(data, tiff.meta.width, tiff.meta.height, kind);
      setOverlayUrl(url);
      setStats({ min, max, mean, count, histogram });
      setIndexType(kind);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to compute ${kind.toUpperCase()}`);
    } finally {
      setLoading(false);
    }
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
          <button
            onClick={signOut}
            className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-white/5"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
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
                <Layers className="h-3 w-3" /> Analysis
              </h3>
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-muted-foreground">Red band</span>
                    <input type="number" min={0} max={meta.samplesPerPixel - 1} value={redBandIdx}
                      onChange={(e) => setRedBandIdx(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-border bg-input px-2 py-1 font-mono" />
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">NIR band</span>
                    <input type="number" min={0} max={meta.samplesPerPixel - 1} value={nirBandIdx}
                      onChange={(e) => setNirBandIdx(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-border bg-input px-2 py-1 font-mono" />
                  </label>
                  <label className="col-span-2 block">
                    <span className="text-muted-foreground">Green band (NDWI)</span>
                    <input type="number" min={0} max={meta.samplesPerPixel - 1} value={greenBandIdx}
                      onChange={(e) => setGreenBandIdx(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-border bg-input px-2 py-1 font-mono" />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button onClick={() => computeAndRender("ndvi")}
                    disabled={loading}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground transition-all hover:glow disabled:opacity-50"
                    style={{ background: "var(--gradient-primary)" }}>
                    Compute NDVI
                  </button>
                  <button onClick={() => computeAndRender("ndwi")}
                    disabled={loading}
                    className="glass rounded-lg px-3 py-2 text-xs font-semibold transition-all hover:bg-white/5 disabled:opacity-50">
                    Compute NDWI
                  </button>
                </div>
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
    </div>
  );
}
