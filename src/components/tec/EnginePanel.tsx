/**
 * EnginePanel — Advanced Analysis UI
 * Renders results from src/lib/tec/engine.ts
 */
import { useMemo, useRef, useEffect } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  Zap, TrendingUp, Activity, AlertTriangle, Waves, BarChart3,
  Cpu, CheckCircle, AlertCircle, Clock, Sigma, GitBranch,
} from "lucide-react";
import type { EngineResult, SpectrumBin, S4Point, AnomalyPoint, ACFPoint } from "@/lib/tec/engine";

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "hsl(222 47% 10%)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    fontSize: 11,
    color: "#e2e8f0",
  },
};
const GRID_STYLE = { stroke: "rgba(255,255,255,0.06)", strokeDasharray: "3 3" };
const AXIS_STYLE = { style: { fontSize: 10, fill: "#94a3b8" } };

const fmt2  = (n: number) => isNaN(n) ? "—" : n.toFixed(2);
const fmt4  = (n: number) => isNaN(n) ? "—" : n.toFixed(4);
const fmtHz = (hz: number) => hz < 0.001 ? `${(hz * 1000).toFixed(3)} mHz` : `${hz.toFixed(4)} Hz`;

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, unit, sub, color = "text-primary" }: {
  icon: React.ReactNode; label: string; value: string | number; unit?: string;
  sub?: string; color?: string;
}) {
  return (
    <div className="glass rounded-xl border border-border/30 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`text-xl font-bold ${color}`} style={{ fontFamily: "Space Grotesk" }}>
        {value}{unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h3 className="text-sm font-semibold" style={{ fontFamily: "Space Grotesk" }}>{title}</h3>
      {badge && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">{badge}</span>}
    </div>
  );
}

// ─── Wavelet Scalogram (canvas) ───────────────────────────────────────────────
function WaveletCanvas({ details, energyByLevel }: { details: number[][]; energyByLevel: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const totalEnergy = energyByLevel.reduce((a, b) => a + b, 0) || 1;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !details.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const nLevels = details.length;
    const rowH = Math.floor(H / nLevels);

    details.forEach((det, lv) => {
      const maxAbs = Math.max(...det.map(Math.abs), 1e-9);
      const nCols  = det.length;
      const colW   = W / nCols;

      det.forEach((v, col) => {
        const norm = v / maxAbs;          // -1 … 1
        const h = Math.abs(norm);
        const r = norm > 0 ? Math.floor(239 * h) : 10;
        const g = norm > 0 ? Math.floor(68  * h) : Math.floor(130 * h);
        const b = norm > 0 ? 68 : Math.floor(246 * h);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.3 + h * 0.7})`;
        ctx.fillRect(col * colW, lv * rowH, Math.max(colW, 1), rowH);
      });

      // Label
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px monospace";
      const pct = ((energyByLevel[lv] / totalEnergy) * 100).toFixed(1);
      ctx.fillText(`L${lv + 1}  ${pct}%`, 6, lv * rowH + rowH - 5);
    });
  }, [details, energyByLevel, totalEnergy]);

  if (!details.length) return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Insufficient data for wavelet analysis</div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border/30">
      <canvas ref={ref} width={800} height={details.length * 40} className="w-full" style={{ imageRendering: "pixelated" }} />
      <div className="flex gap-3 px-3 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded" style={{ background: "rgba(239,68,68,0.8)" }} /> Positive</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded" style={{ background: "rgba(10,130,246,0.8)" }} /> Negative</span>
        <span className="ml-auto">L1=finest scale · L{details.length}=coarsest scale</span>
      </div>
    </div>
  );
}

// ─── PCA Variance Bar ─────────────────────────────────────────────────────────
function PCABar({ explainedVariance }: { explainedVariance: number[] }) {
  const colors = ["#4fc3f7", "#a78bfa", "#34d399", "#fbbf24", "#f87171"];
  return (
    <div className="space-y-2">
      {explainedVariance.map((v, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-8 shrink-0 text-muted-foreground">PC{i + 1}</span>
          <div className="flex-1 rounded-full bg-muted/20 h-3 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${v * 100}%`, background: colors[i % colors.length] }} />
          </div>
          <span className="w-12 text-right font-mono" style={{ color: colors[i % colors.length] }}>{(v * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
interface EnginePanelProps {
  result: EngineResult;
  rawValues: number[];
  timestamps: number[];
}

export function EnginePanel({ result, rawValues, timestamps }: EnginePanelProps) {
  const fmtEpoch = (ts: number) => {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? String(ts) : `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
  };

  // ── Downsample for charts to avoid DOM overload ───────────────────────────
  const maxPts = 400;
  const step   = Math.max(1, Math.floor(rawValues.length / maxPts));

  const filteredOverlay = useMemo(() => {
    return rawValues.filter((_, i) => i % step === 0).map((v, idx) => {
      const i = idx * step;
      return {
        epoch:  fmtEpoch(timestamps[i] ?? i * 30000),
        raw:    +v.toFixed(3),
        kalman: +(result.kalmanTEC[i] ?? v).toFixed(3),
        lowPass: +(result.lowPassTEC[i] ?? v).toFixed(3),
      };
    });
  }, [rawValues, result.kalmanTEC, result.lowPassTEC, timestamps, step]);

  const anomalyOverlay = useMemo(() => {
    return rawValues.filter((_, i) => i % step === 0).map((v, idx) => {
      const i = idx * step;
      const a = result.anomalies[i];
      return {
        epoch:  fmtEpoch(timestamps[i] ?? i * 30000),
        tec:    +v.toFixed(3),
        anomaly: a?.isAnomaly ? +v.toFixed(3) : null,
        score:  +(a?.score ?? 0).toFixed(2),
      };
    });
  }, [rawValues, result.anomalies, timestamps, step]);

  const s4Data = useMemo((): (S4Point & { epoch: string })[] => {
    const sub = result.s4.filter((_, i) => i % Math.max(1, Math.floor(result.s4.length / maxPts)) === 0);
    return sub.map(p => ({ ...p, epoch: fmtEpoch(p.timestamp) }));
  }, [result.s4]);

  const spectrumData = useMemo((): (SpectrumBin & { freqLabel: string })[] => {
    const half = Math.floor(result.spectrum.length / 2);
    return result.spectrum.slice(1, half).map(b => ({
      ...b, freqLabel: b.freq < 0.0001 ? "<0.1mHz" : fmtHz(b.freq),
    }));
  }, [result.spectrum]);

  const acfData = useMemo((): (ACFPoint & { lagLabel: string })[] => {
    return result.acf.map(a => ({ ...a, lagLabel: `${a.lag}` }));
  }, [result.acf]);

  const waveletLevelData = useMemo(() => {
    return result.wavelet.details.map((det, lv) => {
      const sub = det.filter((_, i) => i % Math.max(1, Math.floor(det.length / maxPts)) === 0);
      return {
        level: lv + 1,
        label: `L${lv + 1} (${["finest","fine","medium","coarse","coarsest"][lv] ?? "coarser"})`,
        data:  sub.map((v, i) => ({ i, coeff: +v.toFixed(4) })),
        energy: result.wavelet.energyByLevel[lv] ?? 0,
      };
    });
  }, [result.wavelet]);

  const anomalyCount  = result.anomalyCount;
  const anomalyStatus = anomalyCount === 0 ? "clean" : anomalyCount < 5 ? "minor" : "elevated";
  const s4Status      = result.maxS4 < 0.3 ? "calm" : result.maxS4 < 0.6 ? "moderate" : "strong";

  return (
    <div className="space-y-6">

      {/* ── Engine Status Banner ──────────────────────────────────────────── */}
      <div className="glass rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Advanced Engine</span>
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-400">ACTIVE</span>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {["FFT + Windowing","Butterworth IIR","Kalman RTS","S4 Scintillation","MAD Anomaly","Haar Wavelet","Lomb-Scargle","ACF","PCA"].map(alg => (
              <span key={alg} className="flex items-center gap-1 rounded-md bg-muted/20 px-2 py-1 text-muted-foreground">
                <CheckCircle className="h-2.5 w-2.5 text-green-400" /> {alg}
              </span>
            ))}
          </div>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {result.computeMs} ms
          </span>
        </div>
      </div>

      {/* ── Key Metrics ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <MetricCard icon={<Zap className="h-3 w-3" />} label="Dominant Period"
          value={result.dominantPeriodMin > 0 ? fmt2(result.dominantPeriodMin) : "—"}
          unit="min" sub={`${fmtHz(result.dominantFreqHz)}`} />
        <MetricCard icon={<Activity className="h-3 w-3" />} label="Mean S4"
          value={fmt4(result.meanS4)} unit=""
          sub={`Max: ${fmt4(result.maxS4)} · ${s4Status}`}
          color={result.maxS4 > 0.6 ? "text-red-400" : result.maxS4 > 0.3 ? "text-yellow-400" : "text-green-400"} />
        <MetricCard icon={<AlertTriangle className="h-3 w-3" />} label="Anomalies"
          value={anomalyCount} unit=""
          sub={`${fmt2(result.anomalyPct)}% of samples · ${anomalyStatus}`}
          color={anomalyCount > 10 ? "text-red-400" : anomalyCount > 0 ? "text-yellow-400" : "text-green-400"} />
        <MetricCard icon={<Sigma className="h-3 w-3" />} label="RMS"
          value={fmt2(result.rms)} unit="TECU" sub={`SNR: ${isFinite(result.snrDB) ? fmt2(result.snrDB) : "∞"} dB`} />
        <MetricCard icon={<BarChart3 className="h-3 w-3" />} label="Samples"
          value={result.nSamples.toLocaleString()} unit=""
          sub={`${fmt2(result.durationSec / 3600)} hr · ${fmt2(result.sampleRateHz * 1000)} mHz fs`} />
        <MetricCard icon={<Waves className="h-3 w-3" />} label="Wavelet Levels"
          value={result.wavelet.levels} unit=""
          sub={`${result.wavelet.details.length} detail bands`} />
      </div>

      {/* ── FFT Power Spectrum ────────────────────────────────────────────── */}
      <div className="glass rounded-2xl border border-border/40 p-5">
        <SectionHeader icon={<Zap className="h-4 w-4" />} title="FFT Power Spectrum (Hann windowed)" badge="Cooley-Tukey" />
        <p className="mb-3 text-xs text-muted-foreground">
          Frequency decomposition of TEC signal — peaks reveal periodic ionospheric structures (tidal, wave activity).
          {result.peaks[0] && <> Dominant peak: <strong className="text-primary">{fmtHz(result.peaks[0].freq)}</strong> ({fmt2(result.peaks[0].dB)} dB).</>}
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={spectrumData}>
            <defs>
              <linearGradient id="specGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="freqLabel" tick={AXIS_STYLE} interval="preserveStartEnd" label={{ value: "Frequency (Hz)", position: "insideBottom", offset: -4, style: { fontSize: 10, fill: "#94a3b8" } }} />
            <YAxis tick={AXIS_STYLE} label={{ value: "Power (dB)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#94a3b8" } }} />
            <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} formatter={(v: number) => [`${v.toFixed(2)} dB`, "Power"]} />
            <Area type="monotone" dataKey="dB" name="Power (dB)" stroke="#a78bfa" fill="url(#specGrad)" strokeWidth={1.5} dot={false} />
            {result.peaks.slice(0, 3).map((p, i) => (
              <ReferenceLine key={i} x={p.freq < 0.0001 ? "<0.1mHz" : fmtHz(p.freq)}
                stroke="#f87171" strokeDasharray="3 3" strokeWidth={1}
                label={{ value: `P${i + 1}`, fill: "#f87171", fontSize: 9 }} />
            ))}
          </AreaChart>
        </ResponsiveContainer>

        {/* Peak table */}
        {result.peaks.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-border/30">
            <table className="w-full text-xs">
              <thead className="bg-muted/10 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  {["Rank", "Frequency", "Period", "Power (dB)", "Phase (rad)"].map(h => (
                    <th key={h} className="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.peaks.slice(0, 6).map((p, i) => (
                  <tr key={i} className="border-t border-border/20">
                    <td className="px-3 py-1.5 font-semibold text-primary">#{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono">{fmtHz(p.freq)}</td>
                    <td className="px-3 py-1.5 font-mono">{p.freq > 0 ? fmt2(1 / p.freq / 60) + " min" : "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{fmt2(p.dB)}</td>
                    <td className="px-3 py-1.5 font-mono">{fmt2(p.phase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Kalman + Butterworth Filtered TEC ─────────────────────────────── */}
      <div className="glass rounded-2xl border border-border/40 p-5">
        <SectionHeader icon={<TrendingUp className="h-4 w-4" />} title="Signal Filtering — Raw vs Kalman vs Low-Pass" badge="Butterworth + RTS" />
        <p className="mb-3 text-xs text-muted-foreground">
          <strong className="text-blue-300">Kalman RTS smoother</strong> (forward-backward pass) and <strong className="text-green-300">Butterworth low-pass</strong> remove high-frequency noise while preserving ionospheric trends.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={filteredOverlay}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="epoch" tick={AXIS_STYLE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_STYLE} label={{ value: "TEC (TECU)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#94a3b8" } }} />
            <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="raw"     name="Raw TEC"          stroke="rgba(148,163,184,0.5)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="kalman"  name="Kalman (RTS)"     stroke="#4fc3f7" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="lowPass" name="Butterworth LP"   stroke="#34d399" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
          <div className="glass rounded-xl p-2">
            <div className="text-muted-foreground">Kalman RMSE</div>
            <div className="font-mono font-bold text-primary">
              {fmt4(Math.sqrt(rawValues.reduce((s, v, i) => s + (v - (result.kalmanTEC[i] ?? v)) ** 2, 0) / rawValues.length))}
            </div>
          </div>
          <div className="glass rounded-xl p-2">
            <div className="text-muted-foreground">Noise reduction</div>
            <div className="font-mono font-bold text-green-400">
              {isFinite(result.snrDB) ? `${fmt2(result.snrDB)} dB` : "∞ dB"}
            </div>
          </div>
          <div className="glass rounded-xl p-2">
            <div className="text-muted-foreground">Smoothing</div>
            <div className="font-mono font-bold text-blue-400">Forward-Backward</div>
          </div>
        </div>
      </div>

      {/* ── S4 Scintillation Index ─────────────────────────────────────────── */}
      <div className="glass rounded-2xl border border-border/40 p-5">
        <SectionHeader icon={<Activity className="h-4 w-4" />} title="S4 Amplitude Scintillation Index" badge="60-sec sliding window" />
        <p className="mb-3 text-xs text-muted-foreground">
          S4 = σ(I)/μ(I) where I ∝ sTEC². Values &gt;0.3 indicate moderate scintillation; &gt;0.6 = strong.
          Current status: <span className={`font-semibold ${result.maxS4 > 0.6 ? "text-red-400" : result.maxS4 > 0.3 ? "text-yellow-400" : "text-green-400"}`}>{s4Status.toUpperCase()}</span>
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={s4Data}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="epoch" tick={AXIS_STYLE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_STYLE} domain={[0, Math.max(1, result.maxS4 * 1.2)]} />
            <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} />
            <ReferenceLine y={0.3} stroke="#fbbf24" strokeDasharray="4 3" label={{ value: "Moderate", fill: "#fbbf24", fontSize: 9 }} />
            <ReferenceLine y={0.6} stroke="#f87171" strokeDasharray="4 3" label={{ value: "Strong",   fill: "#f87171", fontSize: 9 }} />
            <Bar dataKey="s4" name="S4 Index"
              fill="#a78bfa" radius={[2, 2, 0, 0]}
              label={false} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex gap-4 text-xs">
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-400" /> Weak (S4 &lt; 0.3): {s4Data.filter(p => p.s4 < 0.3).length} epochs</div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-yellow-400" /> Moderate (0.3–0.6): {s4Data.filter(p => p.s4 >= 0.3 && p.s4 < 0.6).length} epochs</div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Strong (&gt;0.6): {s4Data.filter(p => p.s4 >= 0.6).length} epochs</div>
        </div>
      </div>

      {/* ── Anomaly Detection ─────────────────────────────────────────────── */}
      <div className="glass rounded-2xl border border-border/40 p-5">
        <SectionHeader icon={<AlertTriangle className="h-4 w-4" />} title="Anomaly Detection — Modified Z-Score (MAD)" badge={`${anomalyCount} flagged`} />
        <p className="mb-3 text-xs text-muted-foreground">
          Modified Z = 0.6745 × (x − median) / MAD. Threshold 3.5σ (robust to outliers). 
          <span className={` ml-1 font-semibold ${anomalyCount === 0 ? "text-green-400" : "text-yellow-400"}`}>
            {anomalyCount === 0 ? "No anomalies detected — signal is clean." : `${anomalyCount} anomalies (${fmt2(result.anomalyPct)}% of data).`}
          </span>
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={anomalyOverlay}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="epoch" tick={AXIS_STYLE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_STYLE} label={{ value: "TEC (TECU)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#94a3b8" } }} />
            <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="tec"     name="TEC"     stroke="#4fc3f7" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="anomaly" name="Anomaly" stroke="#f87171" strokeWidth={0} dot={{ r: 4, fill: "#f87171", stroke: "#f87171" }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
        {anomalyCount > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-red-500/20">
            <table className="w-full text-xs">
              <thead className="bg-red-500/10 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>{["Time","TEC (TECU)","Score","Severity"].map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {result.anomalies.filter(a => a.isAnomaly).slice(0, 8).map((a, i) => (
                  <tr key={i} className="border-t border-red-500/10">
                    <td className="px-3 py-1.5 font-mono">{new Date(a.timestamp).toISOString().slice(11, 19)}</td>
                    <td className="px-3 py-1.5 font-mono">{fmt2(a.value)}</td>
                    <td className="px-3 py-1.5 font-mono">{fmt2(a.score)}σ</td>
                    <td className={`px-3 py-1.5 font-semibold ${a.severity === "critical" ? "text-red-400" : "text-yellow-400"}`}>
                      {a.severity.toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Autocorrelation ───────────────────────────────────────────────── */}
      <div className="glass rounded-2xl border border-border/40 p-5">
        <SectionHeader icon={<GitBranch className="h-4 w-4" />} title="Autocorrelation Function (ACF)" badge="FFT-accelerated" />
        <p className="mb-3 text-xs text-muted-foreground">
          ACF measures self-similarity at each lag. Significant bars (outside dashed CI) reveal periodicities. Dashed lines = 95% confidence interval (±1.96/√N).
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={acfData.slice(0, 60)}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="lagLabel" tick={AXIS_STYLE} label={{ value: "Lag (epochs)", position: "insideBottom", offset: -4, style: { fontSize: 10, fill: "#94a3b8" } }} />
            <YAxis tick={AXIS_STYLE} domain={[-1, 1]} />
            <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} />
            <ReferenceLine y={0}                    stroke="rgba(255,255,255,0.3)" />
            <ReferenceLine y={ 1.96 / Math.sqrt(result.nSamples)} stroke="#fbbf24" strokeDasharray="4 3" />
            <ReferenceLine y={-1.96 / Math.sqrt(result.nSamples)} stroke="#fbbf24" strokeDasharray="4 3" />
            <Bar dataKey="acf" name="ACF" fill="#4fc3f7" radius={[2, 2, 0, 0]}
              label={false}
              // Color significant bars differently
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-muted-foreground">
          Significant lags: {acfData.filter(a => a.significant && a.lag > 0).map(a => a.lag).slice(0, 10).join(", ") || "none detected"}
        </div>
      </div>

      {/* ── Haar Wavelet Decomposition ────────────────────────────────────── */}
      <div className="glass rounded-2xl border border-border/40 p-5">
        <SectionHeader icon={<Waves className="h-4 w-4" />} title="Haar Wavelet Decomposition — Multi-Scale Analysis" badge={`${result.wavelet.levels} levels`} />
        <p className="mb-3 text-xs text-muted-foreground">
          Each level reveals signal structure at a different time scale. Energy distribution shows where variability is concentrated.
        </p>

        {/* Scalogram */}
        <WaveletCanvas details={result.wavelet.details} energyByLevel={result.wavelet.energyByLevel} />

        {/* Detail coefficient charts */}
        <div className="mt-4 space-y-3">
          {waveletLevelData.slice(0, 3).map(lv => (
            <div key={lv.level}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">{lv.label}</span>
                <span className="font-mono text-[10px] text-primary">Energy: {lv.energy.toFixed(2)}</span>
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={lv.data}>
                  <defs>
                    <linearGradient id={`wGrad${lv.level}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4fc3f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4fc3f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis hide />
                  <YAxis tick={{ style: { fontSize: 9, fill: "#94a3b8" } }} />
                  <Tooltip contentStyle={{ ...TOOLTIP_STYLE.contentStyle, fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Area type="monotone" dataKey="coeff" stroke="#4fc3f7" fill={`url(#wGrad${lv.level})`} strokeWidth={1} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </div>

      {/* ── Lomb-Scargle Periodogram ──────────────────────────────────────── */}
      {result.lsSpectrum.length > 0 && (
        <div className="glass rounded-2xl border border-border/40 p-5">
          <SectionHeader icon={<BarChart3 className="h-4 w-4" />} title="Lomb-Scargle Periodogram" badge="Irregular sampling" />
          <p className="mb-3 text-xs text-muted-foreground">
            Unlike FFT, Lomb-Scargle handles unevenly sampled GPS data natively. Power = 1.0 means the period is statistically significant.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={result.lsSpectrum.map(b => ({
              period: b.period > 0 ? +( b.period / 60).toFixed(2) : 0,
              power:  +b.power.toFixed(4),
            })).filter(b => b.period > 0 && b.period < 1440)}>
              <defs>
                <linearGradient id="lsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#34d399" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="period" tick={AXIS_STYLE} label={{ value: "Period (min)", position: "insideBottom", offset: -4, style: { fontSize: 10, fill: "#94a3b8" } }} />
              <YAxis tick={AXIS_STYLE} domain={[0, 1]} label={{ value: "Power", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#94a3b8" } }} />
              <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} formatter={(v: number) => [v.toFixed(4), "Power"]} />
              <ReferenceLine y={0.7} stroke="#fbbf24" strokeDasharray="4 3" label={{ value: "Significant", fill: "#fbbf24", fontSize: 9 }} />
              <Area type="monotone" dataKey="power" name="LS Power" stroke="#34d399" fill="url(#lsGrad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── PCA ───────────────────────────────────────────────────────────── */}
      {result.pca && result.pca.explainedVariance.length > 0 && (
        <div className="glass rounded-2xl border border-border/40 p-5">
          <SectionHeader icon={<GitBranch className="h-4 w-4" />} title="PCA — Station Covariance Decomposition" badge="Power iteration" />
          <p className="mb-3 text-xs text-muted-foreground">
            Principal components of multi-station TEC. PC1 captures the dominant ionospheric mode shared across stations.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Explained Variance by Component</p>
              <PCABar explainedVariance={result.pca.explainedVariance} />
              <div className="mt-2 text-xs text-muted-foreground">
                Cumulative (PC1+PC2): {((result.pca.cumulativeVariance[1] ?? result.pca.cumulativeVariance[0] ?? 0) * 100).toFixed(1)}%
              </div>
            </div>
            {result.pca.scores.length > 1 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">PC1 vs PC2 Scores</p>
                <ResponsiveContainer width="100%" height={160}>
                  <ScatterChart>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis type="number" dataKey="pc1" name="PC1" tick={AXIS_STYLE} label={{ value: "PC1", position: "insideBottom", style: { fontSize: 10, fill: "#94a3b8" } }} />
                    <YAxis type="number" dataKey="pc2" name="PC2" tick={AXIS_STYLE} label={{ value: "PC2", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#94a3b8" } }} />
                    <ZAxis range={[20, 20]} />
                    <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} />
                    <Scatter name="Epochs" data={result.pca.scores.slice(0, 200).map(s => ({ pc1: +(s[0] ?? 0).toFixed(3), pc2: +(s[1] ?? 0).toFixed(3) }))} fill="#a78bfa" opacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
