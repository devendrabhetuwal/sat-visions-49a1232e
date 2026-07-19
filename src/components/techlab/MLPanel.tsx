import { useState } from "react";
import { AlertTriangle, Brain, TrendingUp, GitBranch } from "lucide-react";
import {
  ScatterChart, Scatter, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, Cell,
} from "recharts";

const CLUSTER_COLORS = [
  "#6ec6f5", "#a78bfa", "#34d399", "#f59e0b",
  "#f87171", "#60a5fa", "#fb923c", "#e879f9",
];

interface IFResult { n_anomalies: number; anomaly_rate: number; all_scores: number[]; }
interface ZScoreResult { threshold: number; anomalies_by_column: Record<string, { count: number }>; total: number; }
interface KMeansResult {
  best_k: number; silhouette_score: number;
  inertias: number[]; k_range: number[];
  labels: number[];
  cluster_stats: Array<{ cluster: number; size: number }>;
}
interface DBSCANResult { n_clusters: number; n_noise: number; }
interface Proj2D { x: number[]; y: number[]; labels: number[]; }
interface ForecastResult {
  slope: number; r_squared: number; p_value: number;
  significant: boolean; trend: string;
  history_y: number[]; forecast_y: number[];
  forecast_lower: number[]; forecast_upper: number[];
  n_forecast: number;
}
interface RFResult {
  target: string; r2_score: number; mae: number; n_train: number; n_test: number;
  feature_importance: Array<{ feature: string; importance: number }>;
}

export interface MLResults {
  rows_analyzed?: number;
  anomalies?: { isolation_forest?: IFResult | { error: string }; zscore?: ZScoreResult };
  clustering?: {
    feature_columns: string[];
    kmeans?: KMeansResult | { error: string };
    dbscan?: DBSCANResult | { error: string };
    projection_2d?: Proj2D;
  };
  ml?: {
    forecasting?: Record<string, ForecastResult | { error: string }>;
    random_forest?: RFResult | { error: string };
  };
}

function isError(obj: unknown): obj is { error: string } {
  return typeof obj === "object" && obj !== null && "error" in obj;
}

export function MLPanel({ results }: { results: MLResults }) {
  const hasRF = results.ml?.random_forest && !isError(results.ml.random_forest);
  const [tab, setTab] = useState<"anomaly" | "cluster" | "forecast" | "rf">("anomaly");

  const tabs = [
    { id: "anomaly" as const,  label: "Anomaly Detection",   icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    { id: "cluster" as const,  label: "Clustering",          icon: <GitBranch className="h-3.5 w-3.5" /> },
    { id: "forecast" as const, label: "Forecasting",         icon: <TrendingUp className="h-3.5 w-3.5" /> },
    ...(hasRF ? [{ id: "rf" as const, label: "Feature Importance", icon: <Brain className="h-3.5 w-3.5" /> }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition ${
              tab === t.id
                ? "bg-primary/20 text-primary border border-primary/30"
                : "glass text-muted-foreground hover:text-foreground"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── ANOMALY ── */}
      {tab === "anomaly" && results.anomalies && (() => {
        const isoRaw = results.anomalies.isolation_forest;
        const iso = isoRaw && !isError(isoRaw) ? isoRaw as IFResult : null;
        const zs = results.anomalies.zscore;
        return (
          <div className="space-y-5">
            {iso && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Points",    val: iso.all_scores.length.toLocaleString(), color: "#6ec6f5" },
                  { label: "Anomalies",       val: iso.n_anomalies,                        color: "#f87171" },
                  { label: "Anomaly Rate",    val: `${(iso.anomaly_rate * 100).toFixed(1)}%`, color: "#f59e0b" },
                  { label: "Z-score Flags",   val: zs?.total ?? 0,                         color: "#a78bfa" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="glass rounded-xl border border-border/40 p-4 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                    <div className="mt-1 text-2xl font-bold" style={{ color, fontFamily: "Space Grotesk" }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {isoRaw && isError(isoRaw) && (
              <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                Isolation Forest error: {isoRaw.error}
              </p>
            )}

            {iso && (
              <div className="glass rounded-xl border border-border/40 p-5">
                <h3 className="text-sm font-semibold mb-1">Anomaly Score Distribution</h3>
                <p className="text-xs text-muted-foreground mb-4">Lower score = more anomalous. Isolation Forest assigns negative scores to anomalies.</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={(() => {
                    const scores = iso.all_scores;
                    const min = Math.min(...scores), max = Math.max(...scores);
                    const step = (max - min) / 30 || 0.01;
                    return Array.from({ length: 30 }, (_, i) => {
                      const lo = min + i * step, hi = lo + step;
                      return { bin: +(lo + step / 2).toFixed(3), count: scores.filter(s => s >= lo && s < hi).length };
                    });
                  })()} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="bin" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} tickFormatter={v => (+v).toFixed(2)} />
                    <YAxis tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10, borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#6ec6f5" radius={[2, 2, 0, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {zs && Object.keys(zs.anomalies_by_column).length > 0 && (
              <div className="glass rounded-xl border border-border/40 p-5">
                <h3 className="text-sm font-semibold mb-3">
                  Z-score Outliers by Column
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(threshold: {zs.threshold}σ)</span>
                </h3>
                <div className="space-y-2.5">
                  {Object.entries(zs.anomalies_by_column).map(([col, info]) => (
                    <div key={col} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-primary w-36 truncate flex-shrink-0">{col}</span>
                      <div className="flex-1 h-2 rounded-full bg-card overflow-hidden">
                        <div className="h-full rounded-full bg-red-500/70"
                          style={{ width: `${Math.min(100, (info.count / (iso?.all_scores.length ?? 1)) * 100 * 20)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-20 text-right flex-shrink-0">
                        {info.count} outlier{info.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── CLUSTERING ── */}
      {tab === "cluster" && results.clustering && (() => {
        const cl = results.clustering;
        const km = cl.kmeans && !isError(cl.kmeans) ? cl.kmeans as KMeansResult : null;
        const db = cl.dbscan && !isError(cl.dbscan) ? cl.dbscan as DBSCANResult : null;
        return (
          <div className="space-y-5">
            {km && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Best K",           val: km.best_k },
                    { label: "Silhouette Score", val: km.silhouette_score.toFixed(3) },
                    { label: "DBSCAN Clusters",  val: db?.n_clusters ?? "—" },
                    { label: "DBSCAN Noise Pts", val: db?.n_noise ?? "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="glass rounded-xl border border-border/40 p-4 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                      <div className="mt-1 text-2xl font-bold text-primary" style={{ fontFamily: "Space Grotesk" }}>{val}</div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* 2-D cluster scatter */}
                  {cl.projection_2d && (
                    <div className="glass rounded-xl border border-border/40 p-5">
                      <h3 className="text-sm font-semibold mb-1">Cluster Map</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        PCA projection · features: {cl.feature_columns.slice(0, 4).join(", ")}
                      </p>
                      <ResponsiveContainer width="100%" height={260}>
                        <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="x" type="number" name="PC1" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} label={{ value: "PC1", position: "insideBottom", offset: -2, style: { fontSize: 9, fill: "var(--muted-foreground)" } }} />
                          <YAxis dataKey="y" type="number" name="PC2" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} label={{ value: "PC2", angle: -90, position: "insideLeft", style: { fontSize: 9, fill: "var(--muted-foreground)" } }} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10, borderRadius: 8 }}
                            formatter={(_: unknown, name: string) => [name === "x" ? "PC1" : "PC2", ""]} />
                          {Array.from({ length: km.best_k }, (_, ci) => {
                            const pts = cl.projection_2d!.x
                              .map((x, i) => ({ x, y: cl.projection_2d!.y[i], c: cl.projection_2d!.labels[i] }))
                              .filter(p => p.c === ci);
                            return (
                              <Scatter key={ci} name={`Cluster ${ci}`} data={pts}
                                fill={CLUSTER_COLORS[ci % CLUSTER_COLORS.length]} opacity={0.75} />
                            );
                          })}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Elbow + cluster sizes */}
                  <div className="glass rounded-xl border border-border/40 p-5 space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold mb-1">Elbow Method</h3>
                      <p className="text-xs text-muted-foreground mb-3">Best K={km.best_k} selected by silhouette score.</p>
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={km.k_range.map((k, i) => ({ k, inertia: km.inertias[i] }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="k" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} label={{ value: "K", position: "insideBottom", offset: -1, style: { fontSize: 9 } }} />
                          <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={50} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10, borderRadius: 8 }} />
                          <Line type="monotone" dataKey="inertia" stroke="#6ec6f5" strokeWidth={2}
                            dot={({ cx, cy, payload }) => (
                              <circle key={payload.k} cx={cx} cy={cy} r={payload.k === km.best_k ? 6 : 3}
                                fill={payload.k === km.best_k ? "#a78bfa" : "#6ec6f5"} stroke="none" />
                            )} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold mb-3">Cluster Sizes</h3>
                      <div className="space-y-2">
                        {km.cluster_stats.map(cs => (
                          <div key={cs.cluster} className="flex items-center gap-2.5">
                            <span className="text-xs font-mono w-16 flex-shrink-0"
                              style={{ color: CLUSTER_COLORS[cs.cluster % CLUSTER_COLORS.length] }}>
                              Cluster {cs.cluster}
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-card overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(cs.size / km.labels.length * 100).toFixed(1)}%`,
                                  background: CLUSTER_COLORS[cs.cluster % CLUSTER_COLORS.length],
                                }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right flex-shrink-0">
                              {cs.size} ({(cs.size / km.labels.length * 100).toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            {cl.kmeans && isError(cl.kmeans) && (
              <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                Clustering error: {cl.kmeans.error}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── FORECASTING ── */}
      {tab === "forecast" && results.ml?.forecasting && (
        <div className="space-y-5">
          {Object.keys(results.ml.forecasting).length === 0 ? (
            <p className="text-sm text-muted-foreground">No columns with enough data for forecasting (need ≥20 points).</p>
          ) : (
            Object.entries(results.ml.forecasting).map(([col, fc]) => {
              if (isError(fc)) {
                return <p key={col} className="text-sm text-destructive">{col}: {fc.error}</p>;
              }
              const histLen = fc.history_y.length;
              const chartData = [
                ...fc.history_y.map((y, i) => ({ i, actual: y })),
                ...fc.forecast_y.map((y, j) => ({
                  i: histLen + j,
                  forecast: y,
                  lower: fc.forecast_lower[j],
                  upper: fc.forecast_upper[j],
                })),
              ];
              return (
                <div key={col} className="glass rounded-xl border border-border/40 p-5">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-sm font-semibold">{col}</h3>
                    <div className="flex gap-2 flex-shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        fc.trend === "increasing" ? "bg-green-500/15 text-green-400"
                          : fc.trend === "decreasing" ? "bg-red-500/15 text-red-400"
                          : "bg-muted text-muted-foreground"}`}>
                        {fc.trend}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        fc.significant ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                        R²={fc.r_squared.toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Linear trend · slope={fc.slope.toExponential(2)} ·
                    {fc.significant ? " statistically significant" : " not significant"}
                    · p={fc.p_value.toFixed(4)} · +{fc.n_forecast} point{fc.n_forecast !== 1 ? "s" : ""} forecast
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                      <defs>
                        <linearGradient id={`ci-${col}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="i" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Area type="monotone" dataKey="upper" name="95% CI upper" stroke="transparent"
                        fill={`url(#ci-${col})`} legendType="none" />
                      <Area type="monotone" dataKey="lower" name="95% CI lower" stroke="transparent"
                        fill="transparent" legendType="none" />
                      <Line type="monotone" dataKey="actual" name="Historical" stroke="#6ec6f5"
                        strokeWidth={1.5} dot={false} connectNulls={false} />
                      <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#a78bfa"
                        strokeWidth={2} strokeDasharray="6 3"
                        dot={({ cx, cy, index }) => index >= histLen
                          ? <circle key={index} cx={cx} cy={cy} r={3} fill="#a78bfa" stroke="none" />
                          : <g key={index} />} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── FEATURE IMPORTANCE ── */}
      {tab === "rf" && results.ml?.random_forest && !isError(results.ml.random_forest) && (() => {
        const rf = results.ml!.random_forest as RFResult;
        return (
          <div className="glass rounded-xl border border-border/40 p-5">
            <h3 className="text-sm font-semibold mb-1">Random Forest — Feature Importance</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Predicting <span className="text-primary font-mono">{rf.target}</span> ·
              R²={rf.r2_score.toFixed(4)} · MAE={rf.mae.toFixed(4)} ·
              {rf.n_train} train / {rf.n_test} test samples
            </p>
            <ResponsiveContainer width="100%" height={Math.max(200, rf.feature_importance.length * 34)}>
              <BarChart layout="vertical" data={rf.feature_importance} margin={{ top: 0, right: 30, bottom: 0, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                <YAxis type="category" dataKey="feature" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={110} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 10, borderRadius: 8 }}
                  formatter={(v: number) => [v.toFixed(4), "Importance"]} />
                <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                  {rf.feature_importance.map((_, i) => (
                    <Cell key={i} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}
    </div>
  );
}
