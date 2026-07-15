import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Upload,
  Loader2,
  Trash2,
  Plus,
  Layers,
  Share2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { loadGeoTiff, computeIndex, downloadJson } from "@/lib/geotiff-utils";
import { createTimeseriesShare } from "@/lib/timeseries-shares.functions";
import {
  TimeseriesResults,
  type IndexKey,
  type Scene,
} from "@/components/timeseries/TimeseriesResults";

export const Route = createFileRoute("/_authenticated/timeseries")({
  head: () => ({
    meta: [
      { title: "Time-Series Comparison — SatVision AI" },
      {
        name: "description",
        content:
          "Plot NDVI, NDWI, and NDBI statistics across multiple acquisition dates and highlight changes over time.",
      },
    ],
  }),
  component: TimeSeriesPage,
});

type Stats = { min: number; mean: number; max: number };
type Acquisition = Scene & { file: File };

function statsFrom(r: { min: number; max: number; mean: number }): Stats {
  return { min: r.min, mean: r.mean, max: r.max };
}

function TimeSeriesPage() {
  const [items, setItems] = useState<Acquisition[]>([]);
  const [loading, setLoading] = useState(false);
  const [red, setRed] = useState(0);
  const [green, setGreen] = useState(1);
  const [nir, setNir] = useState(3);
  const [swir, setSwir] = useState(5);
  const [pendingDate, setPendingDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [activeIndex, setActiveIndex] = useState<IndexKey>("ndvi");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const createShare = useServerFn(createTimeseriesShare);

  const addAcquisition = async (file: File) => {
    setLoading(true);
    try {
      const loaded = await loadGeoTiff(file);
      const bands = loaded.meta.samplesPerPixel;
      if (bands < 4) {
        toast.error(
          `${file.name}: needs ≥ 4 bands (Red/Green/NIR/SWIR), found ${bands}`
        );
        return;
      }
      const [redR, greenR, nirR, swirR] = (await loaded.image.readRasters({
        samples: [
          Math.min(red, bands - 1),
          Math.min(green, bands - 1),
          Math.min(nir, bands - 1),
          Math.min(swir, bands - 1),
        ],
      })) as unknown as Float32Array[];

      const ndvi = computeIndex(nirR, redR);
      const ndwi = computeIndex(greenR, nirR);
      const ndbi = computeIndex(swirR, nirR);

      setItems((prev) =>
        [
          ...prev,
          {
            id: `${file.name}-${Date.now()}`,
            file,
            fileName: file.name,
            date: pendingDate,
            bands,
            ndvi: statsFrom(ndvi),
            ndwi: statsFrom(ndwi),
            ndbi: statsFrom(ndbi),
            bbox: loaded.meta.bbox,
            bboxLatLng: loaded.meta.bboxLatLng,
            epsg: loaded.meta.epsg,
          },
        ].sort((a, b) => a.date.localeCompare(b.date))
      );
      toast.success(`Added ${file.name} — ${pendingDate}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load scene");
    } finally {
      setLoading(false);
    }
  };

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const round = (n: number) => (isFinite(n) ? Number(n.toFixed(6)) : null);

  const handleShare = async () => {
    if (items.length === 0) return;
    setSharing(true);
    try {
      const res = await createShare({
        data: {
          title: `Time-series — ${items[0].date} → ${items[items.length - 1].date}`,
          payload: {
            version: 1,
            bandMapping: { red, green, nir, swir },
            activeIndex,
            scenes: items.map((it) => ({
              id: it.id,
              fileName: it.fileName,
              date: it.date,
              bands: it.bands,
              ndvi: it.ndvi,
              ndwi: it.ndwi,
              ndbi: it.ndbi,
              bbox: it.bbox,
              bboxLatLng: it.bboxLatLng,
              epsg: it.epsg ?? null,
            })),
          },
        },
      });
      const url = `${window.location.origin}/share/timeseries/${res.id}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        toast.success("Share link copied to clipboard");
      } catch {
        toast.success("Share link created");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setSharing(false);
    }
  };

  const exportCsv = () => {
    if (items.length === 0) return;
    const headers = [
      "date","file","bands",
      "ndvi_min","ndvi_mean","ndvi_max",
      "ndwi_min","ndwi_mean","ndwi_max",
      "ndbi_min","ndbi_mean","ndbi_max",
      "ndvi_delta","ndwi_delta","ndbi_delta",
      "bbox_minx","bbox_miny","bbox_maxx","bbox_maxy","epsg",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmt = (v: unknown) =>
      typeof v === "number" && isFinite(v) ? Number(v.toFixed(6)) : v;
    const rows = items.map((it, i) => {
      const prev = items[i - 1];
      const d = (k: IndexKey) => (prev ? it[k].mean - prev[k].mean : "");
      return [
        it.date, it.fileName, it.bands,
        it.ndvi.min, it.ndvi.mean, it.ndvi.max,
        it.ndwi.min, it.ndwi.mean, it.ndwi.max,
        it.ndbi.min, it.ndbi.mean, it.ndbi.max,
        d("ndvi"), d("ndwi"), d("ndbi"),
        it.bbox[0], it.bbox[1], it.bbox[2], it.bbox[3],
        it.epsg ?? "",
      ].map(fmt).map(esc).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `satvision-timeseries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const exportGeoJSON = () => {
    if (items.length === 0) return;
    const features = items.map((it, i) => {
      const prev = items[i - 1];
      const bb = it.bboxLatLng ?? it.bbox;
      const [minX, minY, maxX, maxY] = bb;
      const ring = [
        [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY],
      ];
      return {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [ring] },
        properties: {
          date: it.date,
          file: it.fileName,
          bands: it.bands,
          epsg: it.epsg ?? null,
          crs: it.bboxLatLng ? "EPSG:4326" : `EPSG:${it.epsg ?? "unknown"}`,
          ndvi_min: round(it.ndvi.min),
          ndvi_mean: round(it.ndvi.mean),
          ndvi_max: round(it.ndvi.max),
          ndwi_min: round(it.ndwi.min),
          ndwi_mean: round(it.ndwi.mean),
          ndwi_max: round(it.ndwi.max),
          ndbi_min: round(it.ndbi.min),
          ndbi_mean: round(it.ndbi.mean),
          ndbi_max: round(it.ndbi.max),
          ndvi_delta: prev ? round(it.ndvi.mean - prev.ndvi.mean) : null,
          ndwi_delta: prev ? round(it.ndwi.mean - prev.ndwi.mean) : null,
          ndbi_delta: prev ? round(it.ndbi.mean - prev.ndbi.mean) : null,
        },
      };
    });
    const fc = {
      type: "FeatureCollection" as const,
      metadata: {
        generator: "SatVision AI",
        exported_at: new Date().toISOString(),
        scene_count: items.length,
      },
      features,
    };
    downloadJson(
      fc,
      `satvision-timeseries-${new Date().toISOString().slice(0, 10)}.geojson`
    );
    toast.success("GeoJSON exported");
  };

  const chartData = useMemo(
    () =>
      items.map((it) => ({
        date: it.date,
        NDVI: Number(it.ndvi.mean.toFixed(4)),
        NDWI: Number(it.ndwi.mean.toFixed(4)),
        NDBI: Number(it.ndbi.mean.toFixed(4)),
        ndviMin: Number(it.ndvi.min.toFixed(4)),
        ndviMax: Number(it.ndvi.max.toFixed(4)),
        ndwiMin: Number(it.ndwi.min.toFixed(4)),
        ndwiMax: Number(it.ndwi.max.toFixed(4)),
        ndbiMin: Number(it.ndbi.min.toFixed(4)),
        ndbiMax: Number(it.ndbi.max.toFixed(4)),
      })),
    [items]
  );

  const changes = useMemo(() => {
    const compute = (key: IndexKey) => {
      const vals = items.map((it) => it[key].mean);
      if (vals.length < 2) return null;
      const first = vals[0];
      const last = vals[vals.length - 1];
      const delta = last - first;
      const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : null;
      let maxJumpIdx = -1;
      let maxJump = 0;
      for (let i = 1; i < vals.length; i++) {
        const d = Math.abs(vals[i] - vals[i - 1]);
        if (d > maxJump) {
          maxJump = d;
          maxJumpIdx = i;
        }
      }
      return {
        first,
        last,
        delta,
        pct,
        maxJump,
        maxJumpFrom: maxJumpIdx > 0 ? items[maxJumpIdx - 1].date : null,
        maxJumpTo: maxJumpIdx > 0 ? items[maxJumpIdx].date : null,
      };
    };
    return {
      ndvi: compute("ndvi"),
      ndwi: compute("ndwi"),
      ndbi: compute("ndbi"),
    };
  }, [items]);

  const highlightedJump = changes[activeIndex];

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to workspace
          </Link>
          <h1
            className="text-sm font-bold"
            style={{ fontFamily: "Space Grotesk" }}
          >
            Time-Series <span className="text-gradient">Comparison</span>
          </h1>
          <div className="w-24" />
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] p-6">
        {/* Uploader */}
        <section className="glass mb-6 rounded-2xl p-5">
          <div className="grid gap-4 md:grid-cols-[auto_1fr_auto]">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Acquisition date
              </label>
              <input
                type="date"
                value={pendingDate}
                onChange={(e) => setPendingDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary md:w-52"
              />
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Upload className="h-3 w-3" /> Add GeoTIFF for this date
              </label>
              <label className="block cursor-pointer rounded-xl border-2 border-dashed border-border p-4 text-center transition-all hover:border-primary hover:bg-primary/5">
                <input
                  type="file"
                  className="hidden"
                  accept=".tif,.tiff"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) addAcquisition(f);
                    e.target.value = "";
                  }}
                />
                {loading ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    <Plus className="mr-1 inline h-3 w-3" />
                    Drop or click — multi-band GeoTIFF (Red/Green/NIR/SWIR)
                  </p>
                )}
              </label>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3 w-3" /> Band mapping (applied to next
              upload)
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Red", red, setRed],
                ["Green", green, setGreen],
                ["NIR", nir, setNir],
                ["SWIR", swir, setSwir],
              ].map(([label, val, set]) => (
                <label key={label as string} className="block text-xs">
                  <span className="text-muted-foreground">
                    {label as string}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={val as number}
                    onChange={(e) =>
                      (set as (n: number) => void)(Number(e.target.value))
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 font-mono"
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        {items.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Add two or more scenes with different acquisition dates to compare
            index trajectories over time.
          </div>
        ) : (
          <>
            {/* Change summary */}
            <section className="mb-6 grid gap-4 md:grid-cols-3">
              {(Object.keys(INDEX_META) as IndexKey[]).map((key) => (
                <ChangeCard
                  key={key}
                  index={key}
                  active={activeIndex === key}
                  onClick={() => setActiveIndex(key)}
                  change={changes[key]}
                />
              ))}
            </section>

            {/* Chart */}
            <section className="glass mb-6 rounded-2xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2
                    className="text-lg font-bold"
                    style={{ fontFamily: "Space Grotesk" }}
                  >
                    Mean index over time
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Highlighting the largest change in{" "}
                    <span
                      className="font-semibold"
                      style={{ color: INDEX_META[activeIndex].color }}
                    >
                      {INDEX_META[activeIndex].label}
                    </span>
                  </p>
                </div>
                <div className="flex gap-1">
                  {(Object.keys(INDEX_META) as IndexKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => setActiveIndex(key)}
                      className={`rounded-full px-3 py-1 text-xs transition ${
                        activeIndex === key
                          ? "bg-primary text-primary-foreground"
                          : "glass hover:bg-white/5"
                      }`}
                    >
                      {INDEX_META[key].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.08)"
                    />
                    <XAxis
                      dataKey="date"
                      stroke="rgba(255,255,255,0.6)"
                      fontSize={11}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.6)"
                      fontSize={11}
                      domain={[-1, 1]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(15,15,25,0.95)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {highlightedJump?.maxJumpTo && (
                      <ReferenceLine
                        x={highlightedJump.maxJumpTo}
                        stroke={INDEX_META[activeIndex].color}
                        strokeDasharray="4 4"
                        label={{
                          value: "Δ max",
                          position: "top",
                          fill: INDEX_META[activeIndex].color,
                          fontSize: 10,
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="NDVI"
                      stroke={INDEX_META.ndvi.color}
                      strokeWidth={activeIndex === "ndvi" ? 3 : 1.5}
                      opacity={activeIndex === "ndvi" ? 1 : 0.35}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="NDWI"
                      stroke={INDEX_META.ndwi.color}
                      strokeWidth={activeIndex === "ndwi" ? 3 : 1.5}
                      opacity={activeIndex === "ndwi" ? 1 : 0.35}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="NDBI"
                      stroke={INDEX_META.ndbi.color}
                      strokeWidth={activeIndex === "ndbi" ? 3 : 1.5}
                      opacity={activeIndex === "ndbi" ? 1 : 0.35}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Scene table */}
            <section className="glass rounded-2xl p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3
                  className="text-sm font-bold uppercase tracking-wider text-muted-foreground"
                  style={{ fontFamily: "Space Grotesk" }}
                >
                  Scenes ({items.length})
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={exportCsv}
                    className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium hover:bg-white/5"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
                  </button>
                  <button
                    onClick={exportGeoJSON}
                    className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium hover:bg-white/5"
                  >
                    <FileJson className="h-3.5 w-3.5" /> Export GeoJSON
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border/40">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">File</th>
                      <th className="px-3 py-2 text-right">NDVI μ</th>
                      <th className="px-3 py-2 text-right">NDWI μ</th>
                      <th className="px-3 py-2 text-right">NDBI μ</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => {
                      const prev = items[i - 1];
                      const delta = prev
                        ? it[activeIndex].mean - prev[activeIndex].mean
                        : 0;
                      return (
                        <tr
                          key={it.id}
                          className="border-b border-border/20 last:border-none"
                        >
                          <td className="px-3 py-2 font-mono">{it.date}</td>
                          <td className="px-3 py-2 truncate">
                            <span className="font-mono">{it.fileName}</span>
                            <span className="ml-2 text-muted-foreground">
                              {it.bands}b
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {it.ndvi.mean.toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {it.ndwi.mean.toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {it.ndbi.mean.toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {prev && (
                              <span
                                className={`mr-3 inline-flex items-center gap-1 font-mono ${
                                  delta > 0.02
                                    ? "text-emerald-400"
                                    : delta < -0.02
                                      ? "text-rose-400"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {delta > 0.02 ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : delta < -0.02 ? (
                                  <TrendingDown className="h-3 w-3" />
                                ) : (
                                  <Minus className="h-3 w-3" />
                                )}
                                {(delta >= 0 ? "+" : "") + delta.toFixed(3)}
                              </span>
                            )}
                            <button
                              onClick={() => removeItem(it.id)}
                              className="text-muted-foreground hover:text-rose-400"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ChangeCard({
  index,
  active,
  onClick,
  change,
}: {
  index: IndexKey;
  active: boolean;
  onClick: () => void;
  change:
    | {
        first: number;
        last: number;
        delta: number;
        pct: number | null;
        maxJump: number;
        maxJumpFrom: string | null;
        maxJumpTo: string | null;
      }
    | null;
}) {
  const meta = INDEX_META[index];
  const trend = change
    ? change.delta > 0.02
      ? "up"
      : change.delta < -0.02
        ? "down"
        : "flat"
    : "flat";
  const Icon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const color =
    trend === "up"
      ? "text-emerald-400"
      : trend === "down"
        ? "text-rose-400"
        : "text-muted-foreground";

  return (
    <button
      onClick={onClick}
      className={`glass rounded-2xl p-4 text-left transition ${
        active ? "ring-2 ring-primary" : "hover:bg-white/5"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div
            className="text-sm font-bold"
            style={{ fontFamily: "Space Grotesk", color: meta.color }}
          >
            {meta.label}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {meta.subtitle}
          </div>
        </div>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>

      {change ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${color}`}>
              {(change.delta >= 0 ? "+" : "") + change.delta.toFixed(3)}
            </span>
            {change.pct !== null && (
              <span className="text-xs text-muted-foreground">
                ({(change.pct >= 0 ? "+" : "") + change.pct.toFixed(1)}%)
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {change.first.toFixed(3)} → {change.last.toFixed(3)}
          </div>
          {change.maxJumpFrom && change.maxJumpTo && change.maxJump > 0 && (
            <div className="mt-2 rounded-lg bg-black/30 px-2 py-1 text-[10px] text-muted-foreground">
              Largest step: <span className="font-mono">{change.maxJump.toFixed(3)}</span>{" "}
              between {change.maxJumpFrom} → {change.maxJumpTo}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Add ≥ 2 scenes to see change.
        </p>
      )}
    </button>
  );
}