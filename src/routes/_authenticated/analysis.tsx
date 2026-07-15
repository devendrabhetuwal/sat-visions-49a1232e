import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, Loader2, Calendar, Layers, Sprout, Droplets, Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  loadGeoTiff,
  computeIndex,
  renderIndexToDataURL,
  type LoadedTiff,
} from "@/lib/geotiff-utils";

export const Route = createFileRoute("/_authenticated/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis Results — SatVision AI" },
      { name: "description", content: "Compare NDVI, NDWI, and NDBI indices side-by-side with selectable bands and observation date." },
    ],
  }),
  component: AnalysisPage,
});

type IndexResult = {
  min: number;
  max: number;
  mean: number;
  count: number;
  histogram: number[];
  preview: string;
};

type Results = {
  ndvi: IndexResult;
  ndwi: IndexResult;
  ndbi: IndexResult;
};

const today = () => new Date().toISOString().slice(0, 10);

function AnalysisPage() {
  const [tiff, setTiff] = useState<LoadedTiff | null>(null);
  const [fileName, setFileName] = useState("");
  const [date, setDate] = useState<string>(today());
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [red, setRed] = useState(0);
  const [green, setGreen] = useState(1);
  const [nir, setNir] = useState(3);
  const [swir, setSwir] = useState(5);
  const [results, setResults] = useState<Results | null>(null);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setResults(null);
    try {
      const loaded = await loadGeoTiff(file);
      setTiff(loaded);
      setFileName(file.name);
      const bands = loaded.meta.samplesPerPixel;
      if (bands > 1) {
        setRed(0);
        setGreen(Math.min(bands - 1, 1));
        setNir(Math.min(bands - 1, 3));
        setSwir(Math.min(bands - 1, 5));
      }
      toast.success(`Loaded ${file.name} — ${bands} band(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read GeoTIFF");
    } finally {
      setLoading(false);
    }
  };

  const compute = async () => {
    if (!tiff) return;
    const bands = tiff.meta.samplesPerPixel;
    if (bands < 4) {
      toast.error("Need at least 4 bands (Red / Green / NIR / SWIR) to compute all indices");
      return;
    }
    setComputing(true);
    try {
      const [redR, greenR, nirR, swirR] = (await tiff.image.readRasters({
        samples: [red, green, nir, swir],
      })) as unknown as Float32Array[];
      const w = tiff.meta.width;
      const h = tiff.meta.height;

      // NDVI = (NIR - RED)/(NIR + RED)
      const ndvi = computeIndex(nirR, redR);
      // NDWI = (GREEN - NIR)/(GREEN + NIR)
      const ndwi = computeIndex(greenR, nirR);
      // NDBI = (SWIR - NIR)/(SWIR + NIR)
      const ndbi = computeIndex(swirR, nirR);

      setResults({
        ndvi: { ...toResult(ndvi), preview: renderIndexToDataURL(ndvi.data, w, h, "ndvi") },
        ndwi: { ...toResult(ndwi), preview: renderIndexToDataURL(ndwi.data, w, h, "ndwi") },
        ndbi: { ...toResult(ndbi), preview: renderIndexToDataURL(ndbi.data, w, h, "gray") },
      });
      toast.success("Indices computed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Compute failed");
    } finally {
      setComputing(false);
    }
  };

  const meta = tiff?.meta;
  const bandCount = meta?.samplesPerPixel ?? 0;

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <Link to="/_authenticated/dashboard" className="flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to workspace
          </Link>
          <h1 className="text-sm font-bold" style={{ fontFamily: "Space Grotesk" }}>
            Analysis <span className="text-gradient">Results</span>
          </h1>
          <div className="w-24" />
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] p-6">
        {/* Controls */}
        <section className="glass mb-6 rounded-2xl p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Upload className="h-3 w-3" /> Dataset
              </label>
              <label className="block cursor-pointer rounded-xl border-2 border-dashed border-border p-4 text-center transition-all hover:border-primary hover:bg-primary/5">
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
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                ) : fileName ? (
                  <p className="text-xs">
                    <span className="font-mono">{fileName}</span>{" "}
                    <span className="text-muted-foreground">— {bandCount} band(s), {meta?.width}×{meta?.height}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Drop a multi-band GeoTIFF (needs Red / Green / NIR / SWIR)</p>
                )}
              </label>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Calendar className="h-3 w-3" /> Observation date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary md:w-52"
              />
            </div>
          </div>

          {meta && bandCount > 1 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Layers className="h-3 w-3" /> Band selection
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Red", red, setRed],
                  ["Green", green, setGreen],
                  ["NIR", nir, setNir],
                  ["SWIR", swir, setSwir],
                ].map(([label, val, set]) => (
                  <label key={label as string} className="block text-xs">
                    <span className="text-muted-foreground">{label as string}</span>
                    <input
                      type="number"
                      min={0}
                      max={bandCount - 1}
                      value={val as number}
                      onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 font-mono"
                    />
                  </label>
                ))}
              </div>
              <button
                onClick={compute}
                disabled={computing}
                className="mt-4 flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}
              >
                {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Compute NDVI · NDWI · NDBI
              </button>
            </div>
          )}
        </section>

        {/* Cards */}
        {results ? (
          <section className="grid gap-5 lg:grid-cols-3">
            <IndexCard
              title="NDVI"
              subtitle="Vegetation health"
              formula="(NIR − RED) / (NIR + RED)"
              icon={<Sprout className="h-4 w-4" />}
              accent="from-emerald-400/30 to-lime-400/10"
              result={results.ndvi}
              date={date}
              interpret={interpretNdvi}
            />
            <IndexCard
              title="NDWI"
              subtitle="Surface water"
              formula="(GREEN − NIR) / (GREEN + NIR)"
              icon={<Droplets className="h-4 w-4" />}
              accent="from-sky-400/30 to-blue-500/10"
              result={results.ndwi}
              date={date}
              interpret={interpretNdwi}
            />
            <IndexCard
              title="NDBI"
              subtitle="Built-up area"
              formula="(SWIR − NIR) / (SWIR + NIR)"
              icon={<Building2 className="h-4 w-4" />}
              accent="from-amber-400/30 to-orange-500/10"
              result={results.ndbi}
              date={date}
              interpret={interpretNdbi}
            />
          </section>
        ) : (
          <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Upload a multi-band GeoTIFF and pick bands to see NDVI, NDWI, and NDBI results side-by-side.
          </div>
        )}
      </div>
    </div>
  );
}

function toResult(r: { min: number; max: number; mean: number; count: number; histogram: number[] }) {
  return { min: r.min, max: r.max, mean: r.mean, count: r.count, histogram: r.histogram };
}

function IndexCard({
  title,
  subtitle,
  formula,
  icon,
  accent,
  result,
  date,
  interpret,
}: {
  title: string;
  subtitle: string;
  formula: string;
  icon: React.ReactNode;
  accent: string;
  result: IndexResult;
  date: string;
  interpret: (mean: number) => string;
}) {
  const maxBin = Math.max(1, ...result.histogram);
  return (
    <article className={`glass overflow-hidden rounded-2xl bg-gradient-to-br ${accent}`}>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/30 text-primary">{icon}</span>
            <div>
              <h3 className="text-base font-bold" style={{ fontFamily: "Space Grotesk" }}>{title}</h3>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground">{date}</span>
        </div>

        <img
          src={result.preview}
          alt={`${title} preview`}
          className="mb-3 h-32 w-full rounded-lg border border-border/60 object-cover"
        />

        <p className="mb-3 rounded-lg bg-black/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">{formula}</p>

        <dl className="grid grid-cols-3 gap-2 text-center text-[11px]">
          <Stat label="Min" v={result.min} />
          <Stat label="Mean" v={result.mean} />
          <Stat label="Max" v={result.max} />
        </dl>

        <div className="mt-3">
          <div className="mb-1 flex items-end justify-between text-[10px] text-muted-foreground">
            <span>-1</span><span>Distribution</span><span>+1</span>
          </div>
          <div className="flex h-10 items-end gap-[2px] rounded-lg bg-black/30 p-1">
            {result.histogram.map((v, i) => (
              <div key={i} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${(v / maxBin) * 100}%` }} />
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">{interpret(result.mean)}</p>
      </div>
    </article>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-lg bg-black/25 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-xs">{isFinite(v) ? v.toFixed(3) : "—"}</div>
    </div>
  );
}

function interpretNdvi(mean: number): string {
  if (mean > 0.6) return "Dense, healthy vegetation dominates the scene.";
  if (mean > 0.3) return "Moderate vegetation — mixed cover or growing season.";
  if (mean > 0.1) return "Sparse vegetation, bare soil, or dry canopy.";
  return "Little to no live vegetation detected.";
}

function interpretNdwi(mean: number): string {
  if (mean > 0.2) return "Significant surface water present.";
  if (mean > 0) return "Some moisture — wetlands or damp soils likely.";
  return "Predominantly dry surface.";
}

function interpretNdbi(mean: number): string {
  if (mean > 0.1) return "Strong built-up / impervious signal — likely urban area.";
  if (mean > 0) return "Mixed urban and natural cover.";
  return "Low built-up signal — mostly natural cover.";
}
