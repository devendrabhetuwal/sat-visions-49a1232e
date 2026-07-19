/**
 * SatVision Advanced Computational Engine v2
 * ─────────────────────────────────────────────
 * High-performance in-browser signal processing & ionospheric analysis.
 * Pure TypeScript, no dependencies — all algorithms run locally.
 *
 * Algorithms:
 *   • Cooley-Tukey FFT  (radix-2, iterative, Hann windowed)
 *   • Lomb-Scargle periodogram  (irregular sampling)
 *   • Butterworth IIR filter   (biquad cascade, LP / HP / BP)
 *   • Kalman smoother          (forward-backward 1-D)
 *   • S4 scintillation index   (sliding window RMS)
 *   • Sigma-phi phase scintillation
 *   • Modified-Z anomaly detection  (robust MAD)
 *   • Autocorrelation via FFT  (O(N log N))
 *   • Haar wavelet DWT / IDWT  (multi-level)
 *   • PCA                      (covariance + power iteration)
 *   • IDW spatial interpolation
 *   • Ionospheric Pierce Point  (single-layer 350 km)
 *   • Differential TEC
 *   • Welford running statistics  (O(1))
 *   • Signal quality: SNR, RMS, RMSE, MAPE
 */

// ── Complex arithmetic ─────────────────────────────────────────────────────────
export interface Complex { re: number; im: number }
const cAdd  = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cSub  = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cMul  = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cExp  = (theta: number): Complex => ({ re: Math.cos(theta), im: Math.sin(theta) });
const cAbs  = (a: Complex): number => Math.sqrt(a.re * a.re + a.im * a.im);

// ── Utilities ──────────────────────────────────────────────────────────────────
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function bitReverse(n: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) { result = (result << 1) | (n & 1); n >>= 1; }
  return result;
}

function hannWindow(N: number): number[] {
  return Array.from({ length: N }, (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1))));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. COOLEY-TUKEY FFT (iterative radix-2)
// ─────────────────────────────────────────────────────────────────────────────
export function fft(signal: number[], applyWindow = true): Complex[] {
  const N = nextPow2(signal.length);
  const win = applyWindow ? hannWindow(signal.length) : null;
  const x: Complex[] = Array.from({ length: N }, (_, i) => ({
    re: (win ? (signal[i] ?? 0) * win[i] : (signal[i] ?? 0)),
    im: 0,
  }));

  const bits = Math.log2(N);
  for (let i = 0; i < N; i++) {
    const j = bitReverse(i, bits);
    if (j > i) { const tmp = x[i]; x[i] = x[j]; x[j] = tmp; }
  }

  for (let len = 2; len <= N; len <<= 1) {
    const wStep = cExp(-2 * Math.PI / len);
    for (let i = 0; i < N; i += len) {
      let w: Complex = { re: 1, im: 0 };
      for (let j = 0; j < len >> 1; j++) {
        const u = x[i + j];
        const v = cMul(x[i + j + (len >> 1)], w);
        x[i + j]             = cAdd(u, v);
        x[i + j + (len >> 1)] = cSub(u, v);
        w = cMul(w, wStep);
      }
    }
  }
  return x;
}

/** One-sided power spectrum.
 *  Returns { freq (Hz), power (linear), dB } for bins 0 … N/2 */
export interface SpectrumBin { freq: number; power: number; dB: number; phase: number }
export function powerSpectrum(signal: number[], sampleRateHz: number): SpectrumBin[] {
  const X = fft(signal, true);
  const N = X.length;
  const half = Math.floor(N / 2) + 1;
  return Array.from({ length: half }, (_, k) => {
    const mag  = cAbs(X[k]) / N;
    const pwr  = k === 0 || k === half - 1 ? mag * mag : 2 * mag * mag;
    return {
      freq:  k * sampleRateHz / N,
      power: pwr,
      dB:    pwr > 0 ? 10 * Math.log10(pwr) : -120,
      phase: Math.atan2(X[k].im, X[k].re),
    };
  });
}

/** Find top-N spectral peaks (local maxima in power spectrum). */
export function spectralPeaks(spectrum: SpectrumBin[], n = 5): SpectrumBin[] {
  const peaks: SpectrumBin[] = [];
  for (let i = 1; i < spectrum.length - 1; i++) {
    if (spectrum[i].power > spectrum[i - 1].power && spectrum[i].power > spectrum[i + 1].power) {
      peaks.push(spectrum[i]);
    }
  }
  return peaks.sort((a, b) => b.power - a.power).slice(0, n);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LOMB-SCARGLE PERIODOGRAM (handles irregular time sampling)
// ─────────────────────────────────────────────────────────────────────────────
export interface LSBin { freq: number; period: number; power: number }
export function lombScargle(times: number[], values: number[], nFreqs = 256): LSBin[] {
  if (times.length < 4) return [];
  const n    = times.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const vars = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (vars === 0) return [];

  const dt   = (times[times.length - 1] - times[0]);
  const fMin = 1 / dt;
  const fMax = n / (2 * dt);
  const dv   = values.map(v => v - mean);

  return Array.from({ length: nFreqs }, (_, ki) => {
    const f = fMin + ki * (fMax - fMin) / nFreqs;
    const w = 2 * Math.PI * f;

    let sumSin2 = 0, sumCos2 = 0;
    for (const t of times) { const wt = w * t; sumSin2 += Math.sin(2 * wt); sumCos2 += Math.cos(2 * wt); }
    const tau = Math.atan2(sumSin2, sumCos2) / (2 * w);

    let cosPart = 0, sinPart = 0, cosNorm = 0, sinNorm = 0;
    for (let i = 0; i < n; i++) {
      const ph = w * (times[i] - tau);
      cosPart += dv[i] * Math.cos(ph); cosNorm += Math.cos(ph) ** 2;
      sinPart += dv[i] * Math.sin(ph); sinNorm += Math.sin(ph) ** 2;
    }

    const pwr = (cosNorm > 0 && sinNorm > 0)
      ? (cosPart ** 2 / cosNorm + sinPart ** 2 / sinNorm) / (2 * vars)
      : 0;

    return { freq: f, period: f > 0 ? 1 / f : 0, power: Math.min(pwr, 1) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BUTTERWORTH IIR FILTER (bilinear-transform biquad cascade)
// ─────────────────────────────────────────────────────────────────────────────
interface BiquadCoeffs { b0: number; b1: number; b2: number; a1: number; a2: number }

function butterLPCoeffs(cutoff: number, fs: number): BiquadCoeffs {
  const K  = Math.tan(Math.PI * cutoff / fs);
  const K2 = K * K;
  const Q  = Math.SQRT2;
  const norm = 1 / (1 + K / Q + K2);
  return { b0: K2 * norm, b1: 2 * K2 * norm, b2: K2 * norm, a1: 2 * (K2 - 1) * norm, a2: (1 - K / Q + K2) * norm };
}

function butterHPCoeffs(cutoff: number, fs: number): BiquadCoeffs {
  const K  = Math.tan(Math.PI * cutoff / fs);
  const K2 = K * K;
  const Q  = Math.SQRT2;
  const norm = 1 / (1 + K / Q + K2);
  return { b0: norm, b1: -2 * norm, b2: norm, a1: 2 * (K2 - 1) * norm, a2: (1 - K / Q + K2) * norm };
}

function applyBiquad(signal: number[], c: BiquadCoeffs): number[] {
  const y = new Array(signal.length).fill(0);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    y[i] = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y[i];
  }
  return y;
}

export function butterworthLowPass(signal: number[], cutoffHz: number, sampleRateHz: number): number[] {
  if (cutoffHz <= 0 || cutoffHz >= sampleRateHz / 2) return [...signal];
  return applyBiquad(applyBiquad(signal, butterLPCoeffs(cutoffHz, sampleRateHz)), butterLPCoeffs(cutoffHz, sampleRateHz));
}

export function butterworthHighPass(signal: number[], cutoffHz: number, sampleRateHz: number): number[] {
  if (cutoffHz <= 0 || cutoffHz >= sampleRateHz / 2) return [...signal];
  return applyBiquad(applyBiquad(signal, butterHPCoeffs(cutoffHz, sampleRateHz)), butterHPCoeffs(cutoffHz, sampleRateHz));
}

export function butterworthBandPass(signal: number[], loHz: number, hiHz: number, sampleRateHz: number): number[] {
  if (loHz <= 0 || hiHz <= loHz || hiHz >= sampleRateHz / 2) return [...signal];
  const lp = butterworthLowPass(signal, hiHz, sampleRateHz);
  return butterworthHighPass(lp, loHz, sampleRateHz);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. KALMAN SMOOTHER (forward-backward 1-D, constant-position model)
// ─────────────────────────────────────────────────────────────────────────────
export function kalmanFilter(
  measurements: number[],
  processNoise   = 0.01,   // Q — how much the state can change per step
  measurementNoise = 1.0,  // R — sensor noise variance
): number[] {
  const n = measurements.length;
  if (n === 0) return [];

  // ── Forward pass ─────────────────────────────────────────────────────────
  const x_fwd = new Float64Array(n);
  const P_fwd = new Float64Array(n);
  x_fwd[0] = measurements[0];
  P_fwd[0] = measurementNoise;

  for (let k = 1; k < n; k++) {
    const P_pred = P_fwd[k - 1] + processNoise;
    const K      = P_pred / (P_pred + measurementNoise);
    x_fwd[k]     = x_fwd[k - 1] + K * (measurements[k] - x_fwd[k - 1]);
    P_fwd[k]     = (1 - K) * P_pred;
  }

  // ── Backward pass (RTS smoother) ─────────────────────────────────────────
  const x_s = new Float64Array(n);
  x_s[n - 1] = x_fwd[n - 1];
  for (let k = n - 2; k >= 0; k--) {
    const P_pred = P_fwd[k] + processNoise;
    const G      = P_fwd[k] / P_pred;
    x_s[k]       = x_fwd[k] + G * (x_s[k + 1] - x_fwd[k]);
  }

  return Array.from(x_s);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. S4 SCINTILLATION INDEX (amplitude scintillation)
// ─────────────────────────────────────────────────────────────────────────────
/** S4 = sqrt((mean(I²) - mean(I)²) / mean(I)²)  where I ∝ sTEC² */
export interface S4Point { timestamp: number; s4: number; level: string }
export function computeS4(
  sTEC: number[],
  timestamps: number[],
  windowSec = 60,
  sampleIntervalSec = 30,
): S4Point[] {
  const results: S4Point[] = [];
  const halfW = Math.floor(windowSec / (2 * sampleIntervalSec));

  for (let i = 0; i < sTEC.length; i++) {
    const lo = Math.max(0, i - halfW);
    const hi = Math.min(sTEC.length - 1, i + halfW);
    const window = sTEC.slice(lo, hi + 1).filter(v => v > 0 && isFinite(v));
    if (window.length < 3) continue;

    const I  = window.map(v => v * v);         // intensity proxy
    const mI  = I.reduce((a, b) => a + b, 0) / I.length;
    const mI2 = I.map(v => v * v).reduce((a, b) => a + b, 0) / I.length;
    const s4  = mI > 0 ? Math.sqrt(Math.max(0, (mI2 - mI * mI) / (mI * mI))) : 0;
    const s4c = Math.min(s4, 2);               // cap at 2 for display

    results.push({
      timestamp: timestamps[i],
      s4: +s4c.toFixed(4),
      level: s4c < 0.3 ? "weak" : s4c < 0.6 ? "moderate" : "strong",
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ANOMALY DETECTION (Modified Z-score using Median Absolute Deviation)
// ─────────────────────────────────────────────────────────────────────────────
export interface AnomalyPoint {
  index: number; timestamp: number; value: number;
  score: number; isAnomaly: boolean; severity: "normal" | "warning" | "critical";
}

export function detectAnomalies(
  values: number[],
  timestamps: number[],
  threshold = 3.5,
): AnomalyPoint[] {
  const clean = values.filter(v => isFinite(v));
  if (clean.length < 4) return [];

  // Compute median
  const sorted = [...clean].sort((a, b) => a - b);
  const med = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  // Median Absolute Deviation
  const absDevs = clean.map(v => Math.abs(v - med));
  const madSorted = [...absDevs].sort((a, b) => a - b);
  const mad = madSorted.length % 2 === 0
    ? (madSorted[madSorted.length / 2 - 1] + madSorted[madSorted.length / 2]) / 2
    : madSorted[Math.floor(madSorted.length / 2)];

  const denominator = mad > 0 ? mad : 1e-6;

  return values.map((v, i) => {
    const score = isFinite(v) ? Math.abs(0.6745 * (v - med) / denominator) : 0;
    const isAnomaly = score > threshold;
    return {
      index: i,
      timestamp: timestamps[i] ?? i * 60000,
      value: v,
      score: +score.toFixed(3),
      isAnomaly,
      severity: score > threshold * 2 ? "critical" : score > threshold ? "warning" : "normal",
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. AUTOCORRELATION via FFT (O(N log N))
// ─────────────────────────────────────────────────────────────────────────────
export interface ACFPoint { lag: number; acf: number; significant: boolean }
export function autocorrelation(signal: number[], maxLag?: number): ACFPoint[] {
  const n = signal.length;
  const m = signal.reduce((a, b) => a + b, 0) / n;
  const centered = signal.map(v => v - m);

  // Zero-pad to 2×length for circular auto-correlation
  const N = nextPow2(2 * n);
  const padded: Complex[] = Array.from({ length: N }, (_, i) => ({
    re: i < n ? centered[i] : 0, im: 0,
  }));

  // Forward FFT
  const X = fft(centered.concat(new Array(N - n).fill(0)), false);
  // Power spectrum
  const S: Complex[] = X.map(c => ({ re: c.re * c.re + c.im * c.im, im: 0 }));
  // IFFT of power spectrum
  const ifftResult: Complex[] = fft(
    S.map(c => c.re),
    false,
  );
  // Normalize
  const acf0 = ifftResult[0].re;
  if (acf0 === 0) return [];

  const limit = Math.min(maxLag ?? Math.floor(n / 4), n - 1);
  const significance = 1.96 / Math.sqrt(n);

  return Array.from({ length: limit + 1 }, (_, lag) => ({
    lag,
    acf: +(ifftResult[lag].re / acf0).toFixed(4),
    significant: Math.abs(ifftResult[lag].re / acf0) > significance,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. HAAR WAVELET DWT / IDWT (multi-level)
// ─────────────────────────────────────────────────────────────────────────────
export interface WaveletResult {
  levels: number;
  approximation: number[];
  details: number[][];    // details[0] = finest, details[levels-1] = coarsest
  energyByLevel: number[];
}

export function haarDWT(signal: number[], maxLevels = 6): WaveletResult {
  let current = [...signal];
  const details: number[][] = [];

  const levels = Math.min(maxLevels, Math.floor(Math.log2(signal.length)));

  for (let lv = 0; lv < levels; lv++) {
    const n = Math.floor(current.length / 2);
    const approx  = new Array(n).fill(0);
    const detail  = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      approx[i] = (current[2 * i] + current[2 * i + 1]) / Math.SQRT2;
      detail[i] = (current[2 * i] - current[2 * i + 1]) / Math.SQRT2;
    }
    details.push(detail);
    current = approx;
  }

  const energyByLevel = details.map(d => d.reduce((s, v) => s + v * v, 0));
  return { levels, approximation: current, details, energyByLevel };
}

export function haarIDWT(wt: WaveletResult): number[] {
  let current = [...wt.approximation];
  for (let lv = wt.levels - 1; lv >= 0; lv--) {
    const detail = wt.details[lv];
    const n = current.length;
    const reconstructed = new Array(n * 2).fill(0);
    for (let i = 0; i < n; i++) {
      reconstructed[2 * i]     = (current[i] + detail[i]) / Math.SQRT2;
      reconstructed[2 * i + 1] = (current[i] - detail[i]) / Math.SQRT2;
    }
    current = reconstructed;
  }
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. PRINCIPAL COMPONENT ANALYSIS (covariance + power iteration)
// ─────────────────────────────────────────────────────────────────────────────
export interface PCAResult {
  components: number[][];      // eigenvectors [nComponents × nFeatures]
  eigenvalues: number[];
  scores: number[][];          // projected data [nSamples × nComponents]
  explainedVariance: number[]; // fraction of total variance explained
  cumulativeVariance: number[];
}

function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length, n = B[0].length, k = B.length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < k; l++)
        C[i][j] += A[i][l] * B[l][j];
  return C;
}

function matTranspose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map(row => row[j]));
}

/** Power iteration to find top-k eigenvectors of symmetric matrix M. */
function topEigenvectors(M: number[][], k: number, iters = 100): { vecs: number[][]; vals: number[] } {
  const n  = M.length;
  const vecs: number[][] = [];
  const vals: number[]   = [];
  const deflated = M.map(row => [...row]);

  for (let comp = 0; comp < k; comp++) {
    // Random init
    let v = Array.from({ length: n }, () => Math.random() - 0.5);
    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    v = v.map(x => x / norm);

    for (let iter = 0; iter < iters; iter++) {
      const Mv = deflated.map(row => row.reduce((s, x, j) => s + x * v[j], 0));
      norm = Math.sqrt(Mv.reduce((s, x) => s + x * x, 0));
      if (norm === 0) break;
      v = Mv.map(x => x / norm);
    }

    const eigenvalue = deflated.reduce((s, row, i) =>
      s + row.reduce((ss, x, j) => ss + x * v[j], 0) * v[i], 0);

    vecs.push(v);
    vals.push(eigenvalue);

    // Deflate: M ← M - λ * v * vᵀ
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        deflated[i][j] -= eigenvalue * v[i] * v[j];
  }
  return { vecs, vals };
}

export function pca(matrix: number[][], nComponents = 3): PCAResult {
  const nSamples  = matrix.length;
  const nFeatures = matrix[0]?.length ?? 0;
  if (nSamples < 2 || nFeatures < 2) {
    return { components: [], eigenvalues: [], scores: [], explainedVariance: [], cumulativeVariance: [] };
  }

  // Centre each feature (column)
  const means = Array.from({ length: nFeatures }, (_, j) =>
    matrix.reduce((s, row) => s + row[j], 0) / nSamples);
  const X = matrix.map(row => row.map((v, j) => v - means[j]));

  // Covariance matrix  C = Xᵀ X / (n-1)
  const Xt = matTranspose(X);
  const C  = matMul(Xt, X).map(row => row.map(v => v / (nSamples - 1)));

  const k = Math.min(nComponents, nFeatures, nSamples);
  const { vecs, vals } = topEigenvectors(C, k);

  const totalVar = vals.reduce((a, b) => a + Math.abs(b), 0) || 1;
  const explainedVariance = vals.map(v => Math.abs(v) / totalVar);
  const cumulativeVariance = explainedVariance.reduce<number[]>((acc, v, i) => {
    acc.push((acc[i - 1] ?? 0) + v); return acc;
  }, []);

  // Scores = X · V  [nSamples × k]
  const V = matTranspose(vecs);   // [nFeatures × k]
  const scores = X.map(row =>
    Array.from({ length: k }, (_, j) => row.reduce((s, v, fi) => s + v * V[fi][j], 0)));

  return { components: vecs, eigenvalues: vals, scores, explainedVariance, cumulativeVariance };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. IDW SPATIAL INTERPOLATION
// ─────────────────────────────────────────────────────────────────────────────
export interface GeoPoint { lat: number; lon: number; value: number }

function geoDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  return Math.sqrt(dLat * dLat + dLon * dLon);  // fast planar approx (degrees)
}

export function idwInterpolate(points: GeoPoint[], qLat: number, qLon: number, power = 2): number {
  let wSum = 0, vSum = 0;
  for (const p of points) {
    const d = geoDist(p.lat, p.lon, qLat, qLon);
    if (d < 1e-8) return p.value;
    const w = 1 / Math.pow(d, power);
    wSum += w; vSum += w * p.value;
  }
  return wSum > 0 ? vSum / wSum : 0;
}

/** Build a regular lat/lon grid using IDW interpolation.
 *  Returns { grid, latRange, lonRange } where grid[row][col] = TEC value. */
export function buildIDWGrid(
  points: GeoPoint[],
  gridRows = 30,
  gridCols = 60,
): { grid: number[][]; lats: number[]; lons: number[] } {
  if (!points.length) return { grid: [], lats: [], lons: [] };
  const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);

  const latArr = Array.from({ length: gridRows }, (_, i) => latMin + (i / (gridRows - 1)) * (latMax - latMin));
  const lonArr = Array.from({ length: gridCols }, (_, i) => lonMin + (i / (gridCols - 1)) * (lonMax - lonMin));

  const grid = latArr.map(lat => lonArr.map(lon => idwInterpolate(points, lat, lon)));
  return { grid, lats: latArr, lons: lonArr };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. IONOSPHERIC PIERCE POINT  (single-layer model at 350 km)
// ─────────────────────────────────────────────────────────────────────────────
export interface IPP { lat: number; lon: number; mappingFactor: number }

export function computeIPP(
  staLat: number, staLon: number,
  elevDeg: number, azDeg: number,
  hIono = 350,
): IPP {
  const Re   = 6371;
  const elev = elevDeg * Math.PI / 180;
  const az   = azDeg   * Math.PI / 180;

  // Earth-centered angle
  const psi = Math.PI / 2 - elev - Math.asin(Re / (Re + hIono) * Math.cos(elev));

  const lat1 = staLat * Math.PI / 180;
  const lon1 = staLon * Math.PI / 180;

  const latIPP = Math.asin(Math.sin(lat1) * Math.cos(psi) + Math.cos(lat1) * Math.sin(psi) * Math.cos(az));
  const dLon   = Math.asin(Math.sin(psi) * Math.sin(az) / Math.cos(latIPP));

  const mappingFactor = 1 / Math.cos(Math.asin(Re / (Re + hIono) * Math.cos(elev)));

  return {
    lat: latIPP * 180 / Math.PI,
    lon: (lon1 + dLon) * 180 / Math.PI,
    mappingFactor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. DIFFERENTIAL TEC
// ─────────────────────────────────────────────────────────────────────────────
export function diffTEC(s1: number[], s2: number[]): number[] {
  const n = Math.min(s1.length, s2.length);
  return Array.from({ length: n }, (_, i) => s1[i] - s2[i]);
}

/** Geometry-free linear combination of pseudoranges (ionospheric observable).
 *  L4 = P2 - P1  (code),  or  L4 = λ1·L1 - λ2·L2  (carrier) */
export function computeL4(P1: number[], P2: number[]): number[] {
  return diffTEC(P2, P1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. WELFORD RUNNING STATISTICS (O(1) per sample)
// ─────────────────────────────────────────────────────────────────────────────
export class RunningStats {
  private n    = 0;
  private _mean = 0;
  private M2   = 0;
  private _min  = Infinity;
  private _max  = -Infinity;

  push(value: number) {
    if (!isFinite(value)) return;
    this.n++;
    const delta = value - this._mean;
    this._mean += delta / this.n;
    this.M2    += delta * (value - this._mean);
    if (value < this._min) this._min = value;
    if (value > this._max) this._max = value;
  }

  get count()    { return this.n; }
  get mean()     { return this._mean; }
  get variance() { return this.n > 1 ? this.M2 / (this.n - 1) : 0; }
  get stdDev()   { return Math.sqrt(this.variance); }
  get min()      { return this._min; }
  get max()      { return this._max; }
  get range()    { return this._max - this._min; }

  reset() { this.n = 0; this._mean = 0; this.M2 = 0; this._min = Infinity; this._max = -Infinity; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. SIGNAL QUALITY METRICS
// ─────────────────────────────────────────────────────────────────────────────
export function computeRMS(signal: number[]): number {
  if (!signal.length) return 0;
  return Math.sqrt(signal.reduce((s, v) => s + v * v, 0) / signal.length);
}

export function computeSNR(signal: number[], noise: number[]): number {
  const ps = computeRMS(signal);
  const pn = computeRMS(noise);
  return pn > 0 ? 20 * Math.log10(ps / pn) : Infinity;
}

export function computeRMSE(actual: number[], predicted: number[]): number {
  const n = Math.min(actual.length, predicted.length);
  if (!n) return 0;
  return Math.sqrt(actual.slice(0, n).reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0) / n);
}

export function computeMAPE(actual: number[], predicted: number[]): number {
  const n = Math.min(actual.length, predicted.length);
  if (!n) return 0;
  let sum = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (actual[i] !== 0) { sum += Math.abs((actual[i] - predicted[i]) / actual[i]); count++; }
  }
  return count > 0 ? (sum / count) * 100 : 0;
}

/** Compute local trend via simple linear regression over a sliding window. */
export function localTrend(signal: number[], windowSize = 10): number[] {
  return signal.map((_, i) => {
    const lo = Math.max(0, i - windowSize), hi = Math.min(signal.length - 1, i + windowSize);
    const sub = signal.slice(lo, hi + 1);
    const n = sub.length, xi = sub.map((_, j) => j);
    const mx = (n - 1) / 2;
    const my = sub.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let j = 0; j < n; j++) {
      num += (xi[j] - mx) * (sub[j] - my);
      den += (xi[j] - mx) ** 2;
    }
    return den > 0 ? my + (num / den) * (i - lo - mx) : my;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. HIGH-LEVEL ANALYSIS RUNNER  (runs all algorithms on a TEC dataset)
// ─────────────────────────────────────────────────────────────────────────────
export interface EngineResult {
  // Input metadata
  nSamples:      number;
  sampleRateHz:  number;
  durationSec:   number;
  // FFT
  spectrum:      SpectrumBin[];
  peaks:         SpectrumBin[];
  dominantFreqHz: number;
  dominantPeriodMin: number;
  // Lomb-Scargle (for irregular data)
  lsSpectrum:    LSBin[];
  // Butterworth filtered
  lowPassTEC:    number[];
  highPassTEC:   number[];
  // Kalman smoothed
  kalmanTEC:     number[];
  // S4 scintillation
  s4:            S4Point[];
  meanS4:        number;
  maxS4:         number;
  // Anomaly detection
  anomalies:     AnomalyPoint[];
  anomalyCount:  number;
  anomalyPct:    number;
  // Autocorrelation
  acf:           ACFPoint[];
  // Wavelet
  wavelet:       WaveletResult;
  // Signal quality
  rms:           number;
  snrDB:         number;
  // PCA (multi-station)
  pca?:          PCAResult;
  // Computation time
  computeMs:     number;
}

export function runEngine(
  values: number[],
  timestamps: number[],
  sampleIntervalSec = 30,
  stationMatrix?: number[][],  // [nTime × nStations] for PCA
): EngineResult {
  const t0 = performance.now();

  const clean = values.filter(v => isFinite(v) && v > 0);
  const n = values.length;
  if (n < 4) {
    return {
      nSamples: n, sampleRateHz: 0, durationSec: 0,
      spectrum: [], peaks: [], dominantFreqHz: 0, dominantPeriodMin: 0,
      lsSpectrum: [], lowPassTEC: values, highPassTEC: values.map(() => 0),
      kalmanTEC: values, s4: [], meanS4: 0, maxS4: 0,
      anomalies: [], anomalyCount: 0, anomalyPct: 0,
      acf: [], wavelet: { levels: 0, approximation: [], details: [], energyByLevel: [] },
      rms: 0, snrDB: 0, computeMs: 0,
    };
  }

  const fs         = 1 / sampleIntervalSec;
  const durationSec = (timestamps[n - 1] - timestamps[0]) / 1000 || n * sampleIntervalSec;

  // FFT
  const spectrum   = powerSpectrum(values, fs);
  const peaks      = spectralPeaks(spectrum);
  const dominant   = peaks[0] ?? spectrum[1];

  // Lomb-Scargle (using timestamps in seconds)
  const timeSec = timestamps.map(t => t / 1000);
  const lsSpectrum = lombScargle(timeSec, values, 128);

  // Butterworth filters
  const cutLPHz    = fs / 8;   // low-pass at 1/8 Nyquist
  const cutHPHz    = fs / 32;  // high-pass at 1/32 Nyquist
  const lowPassTEC  = butterworthLowPass(values, cutLPHz, fs);
  const highPassTEC = butterworthHighPass(values, cutHPHz, fs);

  // Kalman
  const kalmanTEC  = kalmanFilter(values, 0.05, 2.0);

  // S4
  const s4        = computeS4(values, timestamps, 60, sampleIntervalSec);
  const s4vals    = s4.map(p => p.s4);
  const meanS4    = s4vals.length ? s4vals.reduce((a, b) => a + b, 0) / s4vals.length : 0;
  const maxS4     = s4vals.length ? Math.max(...s4vals) : 0;

  // Anomaly detection
  const anomalies     = detectAnomalies(values, timestamps);
  const anomalyCount  = anomalies.filter(a => a.isAnomaly).length;
  const anomalyPct    = n > 0 ? (anomalyCount / n) * 100 : 0;

  // Autocorrelation
  const acf = autocorrelation(values.slice(0, 512), Math.min(60, Math.floor(values.length / 4)));

  // Wavelet
  const wavelet = haarDWT(values, 5);

  // Signal quality
  const rms   = computeRMS(clean);
  const residual = values.map((v, i) => v - kalmanTEC[i]);
  const snrDB = computeSNR(values, residual);

  // PCA (multi-station)
  let pcaResult: PCAResult | undefined;
  if (stationMatrix && stationMatrix.length > 2 && stationMatrix[0].length > 1) {
    pcaResult = pca(stationMatrix, Math.min(3, stationMatrix[0].length));
  }

  return {
    nSamples: n,
    sampleRateHz: fs,
    durationSec,
    spectrum, peaks,
    dominantFreqHz:    dominant?.freq ?? 0,
    dominantPeriodMin: dominant?.freq > 0 ? 1 / (dominant.freq * 60) : 0,
    lsSpectrum,
    lowPassTEC, highPassTEC,
    kalmanTEC,
    s4, meanS4, maxS4,
    anomalies, anomalyCount, anomalyPct,
    acf,
    wavelet,
    rms, snrDB,
    pca: pcaResult,
    computeMs: +(performance.now() - t0).toFixed(2),
  };
}
