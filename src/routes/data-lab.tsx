import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, FileText, BarChart3, Table, Download, Copy, RefreshCw,
  Satellite, ChevronUp, ChevronDown, AlertCircle, CheckCircle,
  Sparkles, FlaskConical, Waves, Thermometer, Wind, Leaf,
  Layers, TrendingUp, Hash, X, Info, ExternalLink, Settings,
  Filter, Zap, Globe, Database, Play, Code,
} from "lucide-react";
import {
  LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/data-lab")({
  component: DataLabPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type PageTab = "sources" | "clean" | "visualize";
type DataFormat = "csv" | "json" | "xml" | "tsv" | "plain" | "unknown";
type ViewMode = "table" | "stats" | "converted";
type ChartKind = "timeseries" | "altitude" | "contour" | "tmd" | "iri" | "nrlmsise" | "tiegcm";

interface ParsedData {
  headers: string[];
  rows: Record<string, string | number>[];
  rawFormat: DataFormat;
  numericColumns: string[];
  textColumns: string[];
}

interface ColumnStats {
  col: string; count: number; missing: number;
  min: number; max: number; mean: number;
  median: number; stdDev: number; q1: number; q3: number;
}

// ─── Data sources ─────────────────────────────────────────────────────────────
const SOURCES = [
  {
    id: "spdf",
    name: "NASA SPDF",
    full: "Space Physics Data Facility",
    icon: "🛰️",
    color: "#6ec6f5",
    url: "https://spdf.gsfc.nasa.gov",
    dataUrl: "https://omniweb.gsfc.nasa.gov",
    desc: "Primary NASA archive for heliospheric, magnetospheric, and solar wind data. Hosts OMNI solar wind dataset, geomagnetic indices (Kp, Dst, AE), and multi-mission plasma data.",
    formats: ["CDF", "ASCII", "CSV"],
    params: ["Solar wind speed/density/pressure", "IMF Bz", "Kp, Dst, AE indices", "Particle fluxes"],
    sample: `Year,DOY,Hour,Bz_nT,Vsw_km_s,Nsw_cm3,Kp,Dst_nT
2023,001,00,-3.2,425.1,6.8,2,−18
2023,001,01,-1.1,412.3,7.1,2,−15
2023,001,02,2.4,398.7,5.9,1,−12
2023,001,03,4.8,385.2,5.2,1,−10
2023,001,04,1.2,402.6,6.4,2,−14
2023,001,05,-5.6,441.8,8.3,3,−22`,
  },
  {
    id: "earthdata",
    name: "NASA Earthdata",
    full: "NASA Earthdata Search",
    icon: "🌍",
    color: "#34d399",
    url: "https://earthdata.nasa.gov",
    dataUrl: "https://search.earthdata.nasa.gov",
    desc: "Central portal for NASA Earth-observing data. Covers atmosphere, ocean, land, cryosphere. Key sensors: MODIS, VIIRS, MERRA-2, AIRS, MLS.",
    formats: ["HDF5", "NetCDF-4", "HDF-EOS", "GeoTIFF"],
    params: ["Total electron content (TEC)", "Column ozone", "Aerosol optical depth", "Sea surface temperature"],
    sample: `Lat,Lon,TEC_TECU,O3_DU,AOD_550nm,SST_K
45.0,-90.0,22.3,312.4,0.12,285.6
45.0,-85.0,21.8,315.1,0.09,286.1
40.0,-90.0,24.1,308.7,0.15,290.3
40.0,-85.0,23.6,310.2,0.11,291.0
35.0,-90.0,26.8,302.1,0.18,295.7
35.0,-85.0,25.4,305.8,0.14,296.2`,
  },
  {
    id: "cdaweb",
    name: "CDAWeb",
    full: "Coordinated Data Analysis Web",
    icon: "⚡",
    color: "#f59e0b",
    url: "https://cdaweb.gsfc.nasa.gov",
    dataUrl: "https://cdaweb.gsfc.nasa.gov/index.html/",
    desc: "NASA GSFC interface for in-situ space physics data from 200+ missions including MMS, Van Allen Probes, ACE, Wind, STEREO, and Cluster.",
    formats: ["CDF", "ASCII", "CSV"],
    params: ["Magnetic field vectors (B_GSM)", "Electron/ion density & temperature", "Electric fields", "Pitch-angle distributions"],
    sample: `Epoch_UTC,Bx_GSM,By_GSM,Bz_GSM,Ne_cm3,Te_eV,Vx_km_s
2023-01-01T00:00:00,-8.2,3.1,-5.4,8.3,2840,-412
2023-01-01T00:00:04,-8.5,3.4,-5.1,8.6,2910,-415
2023-01-01T00:00:08,-8.1,3.0,-5.6,8.1,2780,-409
2023-01-01T00:00:12,-7.9,2.8,-5.8,7.9,2720,-405
2023-01-01T00:00:16,-8.3,3.2,-5.3,8.4,2860,-413
2023-01-01T00:00:20,-8.6,3.5,-5.0,8.8,2960,-418`,
  },
  {
    id: "icon",
    name: "ICON",
    full: "Ionospheric Connection Explorer",
    icon: "🔭",
    color: "#a78bfa",
    url: "https://icon.ssl.berkeley.edu",
    dataUrl: "https://icon.ssl.berkeley.edu/Data",
    desc: "NASA ICON satellite (2019–present) measures ionospheric winds, plasma density, and ion temperatures at 575 km altitude using MIGHTI, EUV, FUV, and IVM instruments.",
    formats: ["NetCDF-4", "CDF"],
    params: ["Thermospheric wind (zonal/meridional)", "O+ density", "Ion temperature", "630 nm airglow"],
    sample: `Altitude_km,Lon_deg,Lat_deg,Uz_m_s,Umer_m_s,O_plus_cm3,Ti_K
200,−90,10,12.3,−45.2,2.1e5,1240
220,−90,10,18.7,−52.1,1.8e5,1310
240,−90,10,24.1,−58.4,1.4e5,1390
260,−90,10,29.8,−63.7,1.0e5,1480
280,−90,10,35.2,−68.9,7.2e4,1580
300,−90,10,40.6,−73.2,4.8e4,1690`,
  },
  {
    id: "swarm",
    name: "ESA Swarm",
    full: "ESA Swarm Mission",
    icon: "🧲",
    color: "#f87171",
    url: "https://earth.esa.int/eogateway/missions/swarm",
    dataUrl: "https://vires.services",
    desc: "ESA constellation of 3 satellites (A/B/C) at 430–530 km. Measures Earth's magnetic field, electron density, plasma irregularities, and field-aligned currents since 2013.",
    formats: ["CDF", "NetCDF", "ASCII"],
    params: ["Total field F (nT)", "Vector B (NEC frame)", "Electron density Ne", "Plasma bubble index"],
    sample: `Timestamp,Latitude,Longitude,Radius_km,F_nT,Bx_NEC,By_NEC,Bz_NEC,Ne_cm3
2023-06-01T00:00:00,52.3,10.2,6841.2,48924.3,−21340.1,1823.4,42980.2,4.2e4
2023-06-01T00:00:02,52.1,10.4,6841.3,48926.1,−21342.8,1821.7,42983.5,4.3e4
2023-06-01T00:00:04,51.9,10.6,6841.4,48928.4,−21345.2,1819.3,42986.8,4.1e4
2023-06-01T00:00:06,51.7,10.8,6841.5,48930.7,−21347.5,1817.0,42990.1,4.4e4
2023-06-01T00:00:08,51.5,11.0,6841.6,48932.9,−21349.8,1814.8,42993.3,4.0e4
2023-06-01T00:00:10,51.3,11.2,6841.7,48935.2,−21352.0,1812.5,42996.6,4.5e4`,
  },
  {
    id: "ncei",
    name: "NOAA NCEI",
    full: "National Centers for Environmental Information",
    icon: "🌡️",
    color: "#60a5fa",
    url: "https://www.ncei.noaa.gov",
    dataUrl: "https://www.ngdc.noaa.gov/geomag",
    desc: "NOAA's primary climate and geomagnetic data archive. Provides geomagnetic observatory data (IAGA-2002 format), solar indices (F10.7, sunspot number), and magnetic storm catalogs.",
    formats: ["IAGA-2002", "CSV", "ASCII", "JSON"],
    params: ["H, D, Z, F components (nT)", "F10.7 solar flux (sfu)", "Sunspot number", "Geomagnetic Kp, ap"],
    sample: `Date,H_nT,D_deg,Z_nT,F_nT,F10p7_sfu,SSN,ap
2023-01-01,20412.3,−2.41,42398.1,47182.4,148.2,78,12
2023-01-02,20408.7,−2.39,42401.5,47180.1,149.8,82,15
2023-01-03,20415.1,−2.43,42394.2,47184.7,147.6,76,9
2023-01-04,20421.8,−2.45,42387.4,47188.2,152.3,91,18
2023-01-05,20398.4,−2.37,42412.8,47174.6,143.1,68,24
2023-01-06,20385.2,−2.34,42428.3,47163.9,138.7,55,36`,
  },
  {
    id: "madrigal",
    name: "Madrigal",
    full: "Madrigal Database",
    icon: "📡",
    color: "#fb923c",
    url: "https://cedar.openmadrigal.org",
    dataUrl: "https://cedar.openmadrigal.org/index.html",
    desc: "Global network of incoherent scatter radar (ISR) and other ground-based instruments. Provides plasma parameters: electron density, electron/ion temperature, plasma drift velocity.",
    formats: ["HDF5", "ASCII (Madrigal format)", "NetCDF"],
    params: ["Electron density Ne (m⁻³)", "Electron temperature Te (K)", "Ion temperature Ti (K)", "Line-of-sight velocity (m/s)"],
    sample: `UT_hour,Alt_km,Ne_m3,Te_K,Ti_K,Vlos_m_s,AzElev
0.0,100,4.2e10,1840,1120,−32.4,90
0.0,120,8.7e10,2140,1280,−28.1,90
0.0,150,1.2e11,2680,1450,−18.6,90
0.0,200,9.8e10,3100,1620,−12.3,90
0.0,250,6.4e10,3560,1780,−8.4,90
0.0,300,3.8e10,4020,1940,−5.2,90`,
  },
];

// ─── Cleaning operations ───────────────────────────────────────────────────────
const FILL_VALUES = [-9999, -9999.9, 99999, 99999.9, 999999, 9.9692e36, 1e31, -1e31];

function removeFillValues(data: ParsedData, custom: number): ParsedData {
  const fills = [...FILL_VALUES, custom].filter(isFinite);
  const rows = data.rows.map((row) => {
    const r: Record<string, string | number> = {};
    for (const h of data.headers) {
      const v = row[h];
      if (typeof v === "number" && fills.some((f) => Math.abs(v - f) < 1e-3)) {
        r[h] = NaN;
      } else {
        r[h] = v;
      }
    }
    return r;
  }).filter((row) => !Object.values(row).every((v) => typeof v === "number" && isNaN(v as number)));
  return { ...data, rows };
}

function removeOutliers(data: ParsedData, sigma: number): ParsedData {
  const rows = [...data.rows];
  for (const col of data.numericColumns) {
    const vals = rows.map((r) => r[col]).filter((v): v is number => typeof v === "number" && isFinite(v));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    for (const row of rows) {
      const v = row[col];
      if (typeof v === "number" && Math.abs(v - mean) > sigma * std) row[col] = NaN;
    }
  }
  return { ...data, rows };
}

function movingAverage(data: ParsedData, window: number): ParsedData {
  const rows = data.rows.map((_, i, arr) => {
    const r: Record<string, string | number> = {};
    for (const h of data.headers) {
      if (data.numericColumns.includes(h)) {
        const vals: number[] = [];
        for (let j = Math.max(0, i - Math.floor(window / 2)); j <= Math.min(arr.length - 1, i + Math.floor(window / 2)); j++) {
          const v = arr[j][h];
          if (typeof v === "number" && isFinite(v)) vals.push(v);
        }
        r[h] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
      } else {
        r[h] = data.rows[i][h];
      }
    }
    return r;
  });
  return { ...data, rows };
}

function filterByFlag(data: ParsedData, flagCol: string, maxVal: number): ParsedData {
  if (!flagCol || !data.headers.includes(flagCol)) return data;
  const rows = data.rows.filter((r) => {
    const v = r[flagCol];
    return typeof v === "number" ? v <= maxVal : true;
  });
  return { ...data, rows };
}

function removeDuplicates(data: ParsedData, keyCol: string): ParsedData {
  if (!keyCol) return data;
  const seen = new Set<string>();
  const rows = data.rows.filter((r) => {
    const k = String(r[keyCol] ?? "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { ...data, rows };
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
function detectFormat(raw: string): DataFormat {
  const t = raw.trim();
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (t.startsWith("<")) return "xml";
  if (t.includes("\t") && !t.includes(",")) return "tsv";
  if (t.includes(",")) return "csv";
  if (/^[\d\s.\-eE+]+$/.test(t)) return "plain";
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

function parseRaw(raw: string): ParsedData {
  const fmt = detectFormat(raw);
  if (fmt === "tsv") return parseCSV(raw, "\t");
  if (fmt === "json") {
    const obj = JSON.parse(raw);
    const arr = Array.isArray(obj) ? obj : [obj];
    const headers = Object.keys(arr[0]);
    const rows = arr.map((item: Record<string, unknown>) => {
      const row: Record<string, string | number> = {};
      headers.forEach((h) => { const v = item[h]; row[h] = typeof v === "number" ? v : String(v ?? ""); });
      return row;
    });
    const numericColumns = headers.filter((h) => rows.some((r) => typeof r[h] === "number"));
    return { headers, rows, rawFormat: "json", numericColumns, textColumns: headers.filter((h) => !numericColumns.includes(h)) };
  }
  return parseCSV(raw, ",");
}

function computeStats(data: ParsedData): ColumnStats[] {
  return data.numericColumns.map((col) => {
    const vals = data.rows.map((r) => r[col]).filter((v): v is number => typeof v === "number" && isFinite(v)).sort((a, b) => a - b);
    const n = vals.length;
    const missing = data.rows.length - n;
    if (!n) return { col, count: 0, missing, min: 0, max: 0, mean: 0, median: 0, stdDev: 0, q1: 0, q3: 0 };
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (vals[n / 2 - 1] + vals[n / 2]) / 2 : vals[Math.floor(n / 2)];
    const stdDev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    return { col, count: n, missing, min: vals[0], max: vals[n - 1], mean, median, stdDev, q1: vals[Math.floor(n * 0.25)], q3: vals[Math.floor(n * 0.75)] };
  });
}

function toCSV(data: ParsedData): string {
  return [data.headers.join(","), ...data.rows.map((r) => data.headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
}
function toJSON(data: ParsedData): string { return JSON.stringify(data.rows, null, 2); }
function downloadFile(content: string, filename: string, mime: string) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([content], { type: mime })), download: filename });
  a.click();
}
function fmt(n: number) { return isNaN(n) ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(4); }

// ─── Python snippets ───────────────────────────────────────────────────────────
const PYTHON: Record<ChartKind, string> = {
  timeseries: `import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
df["time"] = pd.to_datetime(df["time"])   # adjust column name

fig, ax = plt.subplots(figsize=(12, 4))
ax.plot(df["time"], df["value"], lw=1.2, color="#6ec6f5")
ax.set_xlabel("Time (UTC)"); ax.set_ylabel("Value")
ax.set_title("Time Series"); ax.grid(alpha=0.3)
plt.tight_layout(); plt.savefig("timeseries.png", dpi=150)`,

  altitude: `import pandas as pd, numpy as np
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
# Expects columns: Alt_km, value

fig, ax = plt.subplots(figsize=(5, 8))
ax.plot(df["value"], df["Alt_km"], lw=2, color="#a78bfa")
ax.set_xlabel("Value"); ax.set_ylabel("Altitude (km)")
ax.set_title("Vertical / Altitude Profile")
ax.grid(alpha=0.3); plt.tight_layout()
plt.savefig("altitude_profile.png", dpi=150)`,

  contour: `import numpy as np
import matplotlib.pyplot as plt
from scipy.interpolate import griddata

df = pd.read_csv("your_data.csv")
# Expects: Lat, Lon, value columns

lat = np.linspace(-90, 90, 181)
lon = np.linspace(-180, 180, 361)
LON, LAT = np.meshgrid(lon, lat)
Z = griddata((df.Lon, df.Lat), df["value"], (LON, LAT), method="linear")

fig, ax = plt.subplots(figsize=(12, 6), subplot_kw={"projection": "mollweide"})
c = ax.contourf(np.deg2rad(LON), np.deg2rad(LAT), Z, levels=30, cmap="viridis")
plt.colorbar(c, ax=ax, label="Value")
ax.set_title("Global Contour Map"); plt.savefig("contour.png", dpi=150)`,

  tmd: `import pandas as pd, numpy as np
import matplotlib.pyplot as plt

df = pd.read_csv("your_data.csv")
# Expects: time, altitude_km, density_kg_m3

fig, ax = plt.subplots(figsize=(12, 5))
sc = ax.scatter(df["time"], df["altitude_km"], c=np.log10(df["density_kg_m3"]),
                cmap="plasma", s=8)
plt.colorbar(sc, ax=ax, label="log₁₀(ρ  kg/m³)")
ax.set_xlabel("Time"); ax.set_ylabel("Altitude (km)")
ax.set_title("Thermospheric Mass Density")
plt.tight_layout(); plt.savefig("tmd.png", dpi=150)`,

  iri: `# Requires: pip install iricore
import iricore
import numpy as np
import matplotlib.pyplot as plt

# IRI-2016 profile at given location/time
alts = np.arange(100, 600, 10)
result = iricore.iri(2023, 180, 12.0, 45.0, 10.0, alts)

fig, axes = plt.subplots(1, 3, figsize=(14, 8))
axes[0].plot(result.ne / 1e6, alts, lw=2, color="#6ec6f5")
axes[0].set_xlabel("Ne (cm⁻³)"); axes[0].set_ylabel("Alt (km)")
axes[1].plot(result.te, alts, lw=2, color="#f59e0b")
axes[1].set_xlabel("Te (K)")
axes[2].plot(result.ti, alts, lw=2, color="#34d399")
axes[2].set_xlabel("Ti (K)")
for ax in axes: ax.grid(alpha=0.3); ax.set_title("")
fig.suptitle("IRI-2016 Profiles"); plt.tight_layout()
plt.savefig("iri_profiles.png", dpi=150)`,

  nrlmsise: `# Requires: pip install nrlmsise00
from nrlmsise00 import msise_flat
import numpy as np
import matplotlib.pyplot as plt

alts = np.arange(100, 800, 5)
rho, T = [], []
for alt in alts:
    out = msise_flat(2023, 1, 0.0, alt, 45.0, 0.0, 150, 150, 4)
    rho.append(out[5])   # total mass density kg/m³
    T.append(out[10])    # exospheric temperature K

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 8))
ax1.semilogx(rho, alts, lw=2, color="#f87171")
ax1.set_xlabel("Mass Density (kg/m³)"); ax1.set_ylabel("Altitude (km)")
ax1.set_title("NRLMSISE-00 Density"); ax1.grid(alpha=0.3)
ax2.plot(T, alts, lw=2, color="#60a5fa")
ax2.set_xlabel("Temperature (K)")
ax2.set_title("NRLMSISE-00 Temperature"); ax2.grid(alpha=0.3)
plt.tight_layout(); plt.savefig("nrlmsise.png", dpi=150)`,

  tiegcm: `# TIE-GCM output (NetCDF) visualization
import netCDF4 as nc
import numpy as np
import matplotlib.pyplot as plt

ds = nc.Dataset("tiegcm_output.nc")
ne  = ds.variables["NE"][0, :, :, :]   # time, lev, lat, lon
lev = ds.variables["lev"][:]           # pressure levels → approx altitude
lat = ds.variables["lat"][:]

# Lat-pressure cross-section (zonal mean)
ne_zonal = ne.mean(axis=-1)            # average over longitude

fig, ax = plt.subplots(figsize=(10, 7))
c = ax.contourf(lat, lev, np.log10(ne_zonal + 1), levels=25, cmap="turbo")
ax.set_xlabel("Geographic Latitude (°)")
ax.set_ylabel("Pressure Level (log₁₀ Pa)")
ax.set_title("TIE-GCM Electron Density — Lat/Pressure Cross-section")
plt.colorbar(c, ax=ax, label="log₁₀(Ne  m⁻³)")
plt.savefig("tiegcm_cross_section.png", dpi=150)`,
};

// ─── Color scale helper ────────────────────────────────────────────────────────
function valToColor(v: number, min: number, max: number, scheme: "viridis" | "plasma" | "turbo" = "viridis"): string {
  const t = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  if (scheme === "plasma") {
    const r = Math.round(13 + t * 235);
    const g = Math.round(8 + t * 144);
    const b = Math.round(135 + (1 - t) * 120);
    return `rgb(${r},${g},${b})`;
  }
  if (scheme === "turbo") {
    const r = Math.round(t < 0.5 ? 50 + t * 400 : 250 - (t - 0.5) * 400);
    const g = Math.round(t < 0.5 ? 40 + t * 430 : 255);
    const b = Math.round(t < 0.5 ? 200 - t * 300 : 50);
    return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
  }
  // viridis
  const r = Math.round(68 + t * 187);
  const g = Math.round(1 + t * 220);
  const b = Math.round(84 + (t < 0.5 ? t * 172 : (1 - t) * 172));
  return `rgb(${r},${g},${b})`;
}

// ─── Main page ────────────────────────────────────────────────────────────────
function DataLabPage() {
  const [pageTab, setPageTab] = useState<PageTab>("sources");
  const [rawInput, setRawInput] = useState("");
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [cleaned, setCleaned] = useState<ParsedData | null>(null);
  const [stats, setStats] = useState<ColumnStats[]>([]);
  const [view, setView] = useState<ViewMode>("table");
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cleaning state
  const [fillCustom, setFillCustom] = useState(-9999);
  const [sigmaThresh, setSigmaThresh] = useState(3);
  const [maWindow, setMaWindow] = useState(5);
  const [flagCol, setFlagCol] = useState("");
  const [flagMax, setFlagMax] = useState(1);
  const [dedupCol, setDedupCol] = useState("");

  // Visualize state
  const [chartKind, setChartKind] = useState<ChartKind>("timeseries");
  const [chartX, setChartX] = useState("");
  const [chartY, setChartY] = useState("");
  const [chartY2, setChartY2] = useState("");
  const [chartAlt, setChartAlt] = useState("");
  const [showPython, setShowPython] = useState(false);

  const active = cleaned ?? parsed;

  const process = useCallback((text: string) => {
    setParseError("");
    try {
      const result = parseRaw(text);
      setParsed(result);
      setCleaned(null);
      setStats(computeStats(result));
      setChartX(result.headers[0] ?? "");
      setChartY(result.numericColumns[0] ?? "");
      setChartY2(result.numericColumns[1] ?? "");
      setChartAlt(result.numericColumns.find((c) => /alt|height|km/i.test(c)) ?? result.numericColumns[0] ?? "");
      setFlagCol(result.headers.find((c) => /flag|quality|qf/i.test(c)) ?? "");
      setDedupCol(result.headers[0] ?? "");
      setView("table");
      toast.success(`Parsed ${result.rows.length} rows × ${result.headers.length} cols`);
    } catch (e) { setParseError(e instanceof Error ? e.message : "Failed to parse"); setParsed(null); }
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => { const t = e.target?.result as string; setRawInput(t); process(t); };
    reader.readAsText(file);
  };

  const applyClean = (op: string) => {
    if (!parsed) return;
    const src = cleaned ?? parsed;
    let result: ParsedData;
    if (op === "fill") result = removeFillValues(src, fillCustom);
    else if (op === "outlier") result = removeOutliers(src, sigmaThresh);
    else if (op === "ma") result = movingAverage(src, maWindow);
    else if (op === "flag") result = filterByFlag(src, flagCol, flagMax);
    else if (op === "dedup") result = removeDuplicates(src, dedupCol);
    else return;
    setCleaned(result);
    setStats(computeStats(result));
    const removed = src.rows.length - result.rows.length;
    toast.success(`Done — ${removed > 0 ? `${removed} rows removed, ` : ""}${result.rows.length} remain`);
  };

  const resetCleaning = () => { setCleaned(null); if (parsed) setStats(computeStats(parsed)); toast("Reset to original data"); };

  const sortedRows = active ? [...active.rows].sort((a, b) => {
    if (!sortCol) return 0;
    const av = a[sortCol], bv = b[sortCol];
    if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
    return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  }) : [];

  const toggleSort = (col: string) => { if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } };
  const chartData = sortedRows.slice(0, 200).map((r) => ({ x: r[chartX], [chartY]: r[chartY], [chartY2]: r[chartY2], alt: r[chartAlt] }));
  const altData = sortedRows.slice(0, 200).map((r) => ({ alt: r[chartAlt] as number, val: r[chartY] as number })).filter((d) => isFinite(d.alt) && isFinite(d.val));

  const CHART_TABS: { id: ChartKind; label: string; icon: string }[] = [
    { id: "timeseries", label: "Time Series", icon: "📈" },
    { id: "altitude", label: "Altitude Profile", icon: "🔺" },
    { id: "contour", label: "Contour / Global Grid", icon: "🌐" },
    { id: "tmd", label: "Mass Density (TMD)", icon: "⚛️" },
    { id: "iri", label: "IRI Model", icon: "🔵" },
    { id: "nrlmsise", label: "NRLMSISE-00", icon: "🌫️" },
    { id: "tiegcm", label: "TIE-GCM", icon: "🌀" },
  ];

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
            <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <FlaskConical className="h-3.5 w-3.5" /> Space Data Lab
            </span>
            <Link to="/dashboard" className="glass rounded-full px-4 py-1.5 text-xs font-medium">Dashboard</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <FlaskConical className="h-3.5 w-3.5" /> Space Physics Data Lab
          </div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
            From Raw Data <span className="text-gradient">to Science</span>
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Browse 7 major space & atmospheric data repositories, import and clean your data files,
            then produce publication-quality plots — all with Python export.
          </p>
        </div>

        {/* Page tabs */}
        <div className="mb-6 flex gap-2 border-b border-border/40 pb-0">
          {([
            { id: "sources" as PageTab, label: "Data Sources", icon: <Database className="h-3.5 w-3.5" /> },
            { id: "clean"   as PageTab, label: "Import & Clean", icon: <Settings className="h-3.5 w-3.5" /> },
            { id: "visualize" as PageTab, label: "Visualize", icon: <BarChart3 className="h-3.5 w-3.5" /> },
          ]).map((t) => (
            <button key={t.id} onClick={() => setPageTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                pageTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t.icon} {t.label}
              {t.id === "clean" && parsed && (
                <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                  {(cleaned ?? parsed).rows.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── SOURCES TAB ─────────────────────────────────────────────────────── */}
        {pageTab === "sources" && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Click any source to open its data portal. Use the sample data button to load a representative dataset directly into the Import & Clean tab.
            </p>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {SOURCES.map((src) => (
                <div key={src.id} className="glass flex flex-col rounded-2xl border border-border/40 p-5 transition-all hover:-translate-y-0.5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{src.icon}</span>
                      <div>
                        <h3 className="font-bold" style={{ fontFamily: "Space Grotesk", color: src.color }}>{src.name}</h3>
                        <p className="text-[10px] text-muted-foreground">{src.full}</p>
                      </div>
                    </div>
                    <a href={src.url} target="_blank" rel="noreferrer"
                      className="shrink-0 flex items-center gap-1 rounded-md glass px-2 py-1 text-[10px] hover:text-primary transition-colors">
                      <ExternalLink className="h-3 w-3" /> Portal
                    </a>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground leading-relaxed">{src.desc}</p>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {src.formats.map((f) => (
                      <span key={f} className="rounded-md bg-muted/20 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{f}</span>
                    ))}
                  </div>
                  <div className="mb-4 space-y-1">
                    {src.params.map((p) => (
                      <div key={p} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: src.color }} />
                        {p}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setRawInput(src.sample);
                      process(src.sample);
                      setPageTab("clean");
                    }}
                    className="mt-auto flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Play className="h-3.5 w-3.5" /> Load Sample Data
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── IMPORT & CLEAN TAB ──────────────────────────────────────────────── */}
        {pageTab === "clean" && (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            {/* Left: input */}
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-5 transition-all ${isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">Drop file or click to upload</p>
                <p className="text-xs text-muted-foreground">CSV · JSON · TSV · CDF exports · ASCII</p>
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </div>

              <textarea rows={8} value={rawInput} onChange={(e) => setRawInput(e.target.value)}
                placeholder="Or paste raw data here…"
                className="w-full rounded-xl border border-border bg-input px-4 py-3 font-mono text-xs outline-none focus:border-primary"
                style={{ resize: "vertical", color: "var(--foreground)" }} />

              {parseError && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {parseError}
                </div>
              )}

              <button onClick={() => process(rawInput)} disabled={!rawInput.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}>
                <Sparkles className="h-4 w-4" /> Parse Data
              </button>

              {/* Cleaning panel */}
              {parsed && (
                <div className="glass rounded-2xl border border-border/40 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5"><Filter className="h-3.5 w-3.5 text-primary" /> Cleaning Pipeline</h3>
                    {cleaned && <button onClick={resetCleaning} className="text-[10px] text-muted-foreground hover:text-destructive">↺ Reset</button>}
                  </div>

                  {/* Fill values */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Remove Fill / Missing Values</p>
                    <p className="text-[10px] text-muted-foreground">Auto-removes: −9999, 99999.9, 1e31, 9.97e36 + custom</p>
                    <div className="flex gap-2">
                      <input type="number" value={fillCustom} onChange={(e) => setFillCustom(Number(e.target.value))}
                        className="w-28 rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none" placeholder="Custom fill" />
                      <button onClick={() => applyClean("fill")} className="flex-1 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">Apply</button>
                    </div>
                  </div>

                  {/* Outlier removal */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Remove Statistical Outliers (Z-score)</p>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">±σ</span>
                        <input type="number" min={1} max={10} step={0.5} value={sigmaThresh} onChange={(e) => setSigmaThresh(Number(e.target.value))}
                          className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none" />
                      </div>
                      <button onClick={() => applyClean("outlier")} className="flex-1 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">Apply</button>
                    </div>
                  </div>

                  {/* Moving average */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Moving Average Smooth</p>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">N=</span>
                        <input type="number" min={2} max={50} value={maWindow} onChange={(e) => setMaWindow(Number(e.target.value))}
                          className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none" />
                      </div>
                      <button onClick={() => applyClean("ma")} className="flex-1 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">Apply</button>
                    </div>
                  </div>

                  {/* Quality flag filter */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Quality Flag Filter</p>
                    <div className="flex gap-2">
                      <select value={flagCol} onChange={(e) => setFlagCol(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        <option value="">— flag column —</option>
                        {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <input type="number" value={flagMax} onChange={(e) => setFlagMax(Number(e.target.value))}
                        className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none" title="Max acceptable flag value" />
                      <button onClick={() => applyClean("flag")} className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">Apply</button>
                    </div>
                  </div>

                  {/* Dedup */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Remove Duplicates</p>
                    <div className="flex gap-2">
                      <select value={dedupCol} onChange={(e) => setDedupCol(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-xs outline-none">
                        {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <button onClick={() => applyClean("dedup")} className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30">Apply</button>
                    </div>
                  </div>

                  {cleaned && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => downloadFile(toCSV(active!), "cleaned.csv", "text/csv")}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg glass py-2 text-xs hover:text-primary">
                        <Download className="h-3.5 w-3.5" /> CSV
                      </button>
                      <button onClick={() => downloadFile(toJSON(active!), "cleaned.json", "application/json")}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg glass py-2 text-xs hover:text-primary">
                        <Download className="h-3.5 w-3.5" /> JSON
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: data view */}
            <div>
              {!active ? (
                <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center">
                  <FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">No data loaded</p>
                  <p className="mt-1 text-xs text-muted-foreground">Upload a file, paste data, or load a sample from the Sources tab</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="glass rounded-full px-3 py-1 text-xs"><b>{active.rows.length}</b> rows</span>
                    <span className="glass rounded-full px-3 py-1 text-xs"><b>{active.headers.length}</b> columns</span>
                    <span className="glass rounded-full px-3 py-1 text-xs"><b>{active.numericColumns.length}</b> numeric</span>
                    {cleaned && <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400"><CheckCircle className="h-3 w-3" /> Cleaned</span>}
                    <button onClick={() => setPageTab("visualize")}
                      className="ml-auto flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white"
                      style={{ background: "var(--gradient-primary)" }}>
                      <BarChart3 className="h-3.5 w-3.5" /> Visualize →
                    </button>
                  </div>

                  {/* View tabs */}
                  <div className="flex gap-2">
                    {([
                      { id: "table" as ViewMode, label: "Table", icon: <Table className="h-3.5 w-3.5" /> },
                      { id: "stats" as ViewMode, label: "Statistics", icon: <Hash className="h-3.5 w-3.5" /> },
                      { id: "converted" as ViewMode, label: "Export", icon: <Download className="h-3.5 w-3.5" /> },
                    ]).map((v) => (
                      <button key={v.id} onClick={() => setView(v.id)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${view === v.id ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"}`}>
                        {v.icon} {v.label}
                      </button>
                    ))}
                  </div>

                  {/* Table */}
                  {view === "table" && (
                    <div className="glass overflow-hidden rounded-xl border border-border/40">
                      <div className="max-h-[520px] overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 border-b border-border/40 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left opacity-40">#</th>
                              {active.headers.map((h) => (
                                <th key={h} className="cursor-pointer px-3 py-2 text-left hover:text-foreground select-none" onClick={() => toggleSort(h)}>
                                  <span className="flex items-center gap-1">{h}
                                    {sortCol === h ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronUp className="h-3 w-3 opacity-20" />}
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedRows.slice(0, 500).map((row, i) => (
                              <tr key={i} className="border-b border-border/20 hover:bg-white/2">
                                <td className="px-3 py-2 text-xs text-muted-foreground/50">{i + 1}</td>
                                {active.headers.map((h) => (
                                  <td key={h} className="px-3 py-2 text-xs">
                                    {typeof row[h] === "number" && isFinite(row[h] as number)
                                      ? <span className="font-mono text-primary/90">{fmt(row[h] as number)}</span>
                                      : <span>{String(row[h] ?? "")}</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  {view === "stats" && (
                    <div className="space-y-3">
                      {stats.map((s) => (
                        <div key={s.col} className="glass rounded-xl border border-border/40 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold">{s.col}</h3>
                            <span className="text-xs text-muted-foreground">{s.count} values · {s.missing} missing</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                            {[["Min", s.min], ["Q1", s.q1], ["Median", s.median], ["Mean", s.mean], ["Q3", s.q3], ["Max", s.max], ["StdDev", s.stdDev], ["Range", s.max - s.min]].map(([l, v]) => (
                              <div key={l as string} className="rounded-lg bg-muted/10 p-2 text-center">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div>
                                <div className="mt-0.5 font-mono text-xs font-semibold">{fmt(v as number)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Export */}
                  {view === "converted" && (
                    <div className="space-y-4">
                      {[
                        { label: "CSV", content: toCSV(active), file: "data.csv", mime: "text/csv" },
                        { label: "JSON", content: toJSON(active), file: "data.json", mime: "application/json" },
                      ].map(({ label, content, file, mime }) => (
                        <div key={label} className="glass rounded-xl border border-border/40 overflow-hidden">
                          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
                            <span className="text-xs font-semibold uppercase text-primary">{label}</span>
                            <div className="flex gap-2">
                              <button onClick={() => { navigator.clipboard.writeText(content); toast.success(`${label} copied!`); }}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-primary"><Copy className="h-3 w-3" /> Copy</button>
                              <button onClick={() => downloadFile(content, file, mime)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-primary"><Download className="h-3 w-3" /> Download</button>
                            </div>
                          </div>
                          <pre className="max-h-44 overflow-auto p-4 font-mono text-[11px] text-muted-foreground">{content.slice(0, 2000)}{content.length > 2000 ? "\n…" : ""}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── VISUALIZE TAB ───────────────────────────────────────────────────── */}
        {pageTab === "visualize" && (
          <div className="space-y-5">
            {!active ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
                <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium text-muted-foreground">No data loaded</p>
                <button onClick={() => setPageTab("sources")} className="mt-3 rounded-full bg-primary/20 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/30">
                  ← Go to Sources to load data
                </button>
              </div>
            ) : (
              <>
                {/* Chart type selector */}
                <div className="flex flex-wrap gap-2">
                  {CHART_TABS.map((t) => (
                    <button key={t.id} onClick={() => setChartKind(t.id)}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                        chartKind === t.id ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"
                      }`}>
                      <span>{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>

                {/* Axis selectors */}
                <div className="glass flex flex-wrap items-end gap-4 rounded-xl border border-border/40 p-4">
                  {(chartKind === "altitude" || chartKind === "iri" || chartKind === "nrlmsise" || chartKind === "tiegcm") ? (
                    <>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Altitude column</label>
                        <select value={chartAlt} onChange={(e) => setChartAlt(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none">
                          {active.numericColumns.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Parameter 1</label>
                        <select value={chartY} onChange={(e) => setChartY(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none">
                          {active.numericColumns.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Parameter 2 (optional)</label>
                        <select value={chartY2} onChange={(e) => setChartY2(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none">
                          <option value="">— none —</option>
                          {active.numericColumns.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">X axis</label>
                        <select value={chartX} onChange={(e) => setChartX(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none">
                          {active.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Y axis (primary)</label>
                        <select value={chartY} onChange={(e) => setChartY(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none">
                          {active.numericColumns.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Y axis 2 (optional)</label>
                        <select value={chartY2} onChange={(e) => setChartY2(e.target.value)} className="rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none">
                          <option value="">— none —</option>
                          {active.numericColumns.filter((h) => h !== chartY).map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </>
                  )}

                  <button onClick={() => setShowPython((v) => !v)}
                    className={`ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${showPython ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"}`}>
                    <Code className="h-3.5 w-3.5" /> Python Code
                  </button>
                </div>

                {/* Python snippet */}
                {showPython && (
                  <div className="glass rounded-xl border border-border/40 overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
                      <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                        <Code className="h-3.5 w-3.5" /> Python — matplotlib + numpy equivalent
                      </span>
                      <button onClick={() => { navigator.clipboard.writeText(PYTHON[chartKind]); toast.success("Code copied!"); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    </div>
                    <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-green-400/90 bg-black/30">
                      {PYTHON[chartKind]}
                    </pre>
                  </div>
                )}

                {/* Chart render */}
                <div className="glass rounded-2xl border border-border/40 p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-lg">{CHART_TABS.find((t) => t.id === chartKind)?.icon}</span>
                    <h3 className="font-semibold">{CHART_TABS.find((t) => t.id === chartKind)?.label}</h3>
                    <span className="ml-auto text-xs text-muted-foreground">{Math.min(active.rows.length, 200)} points</span>
                  </div>

                  {/* TIME SERIES */}
                  {(chartKind === "timeseries" || chartKind === "tmd") && (
                    <ResponsiveContainer width="100%" height={340}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6ec6f5" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6ec6f5" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey={chartY} stroke="#6ec6f5" fill="url(#cg1)" strokeWidth={2} dot={false} />
                        {chartY2 && <Area type="monotone" dataKey={chartY2} stroke="#a78bfa" fill="url(#cg2)" strokeWidth={2} dot={false} />}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}

                  {/* ALTITUDE PROFILE / IRI / NRLMSISE / TIE-GCM */}
                  {(chartKind === "altitude" || chartKind === "iri" || chartKind === "nrlmsise" || chartKind === "tiegcm") && (
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={altData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" dataKey="val" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} label={{ value: chartY, position: "insideBottom", offset: -5, style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                        <YAxis type="number" dataKey="alt" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} label={{ value: chartAlt, angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--muted-foreground)" } }} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: number) => [fmt(v), chartY]} labelFormatter={(l: number) => `${chartAlt}: ${fmt(l)}`} />
                        <Line type="monotone" dataKey="val" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}

                  {/* CONTOUR / GLOBAL GRID */}
                  {chartKind === "contour" && (
                    <ContourGrid data={active} xCol={chartX} yCol={chartAlt || active.numericColumns[1] || ""} valCol={chartY} />
                  )}
                </div>

                {/* Chart description */}
                <div className="glass rounded-xl border border-border/40 p-4">
                  <ChartDescription kind={chartKind} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Contour grid component ────────────────────────────────────────────────────
function ContourGrid({ data, xCol, yCol, valCol }: { data: ParsedData; xCol: string; yCol: string; valCol: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rows = data.rows.filter((r) =>
      typeof r[xCol] === "number" && typeof r[yCol] === "number" && typeof r[valCol] === "number"
    );
    if (rows.length < 4) { ctx.fillStyle = "#666"; ctx.fillText("Not enough numeric data for grid", 20, 50); return; }

    const xs = rows.map((r) => r[xCol] as number);
    const ys = rows.map((r) => r[yCol] as number);
    const vs = rows.map((r) => r[valCol] as number);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const vMin = Math.min(...vs), vMax = Math.max(...vs);

    const W = canvas.width, H = canvas.height;
    const GRID = 60;
    const cellW = W / GRID, cellH = H / GRID;

    // Simple nearest-neighbour gridding
    const grid = Array.from({ length: GRID }, (_, gy) =>
      Array.from({ length: GRID }, (_, gx) => {
        const tx = xMin + (gx / GRID) * (xMax - xMin);
        const ty = yMin + (gy / GRID) * (yMax - yMin);
        let best = Infinity, bestV = vMin;
        for (let i = 0; i < rows.length; i++) {
          const d = ((xs[i] - tx) / (xMax - xMin + 1)) ** 2 + ((ys[i] - ty) / (yMax - yMin + 1)) ** 2;
          if (d < best) { best = d; bestV = vs[i]; }
        }
        return bestV;
      })
    );

    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        ctx.fillStyle = valToColor(grid[gy][gx], vMin, vMax, "viridis");
        ctx.fillRect(gx * cellW, (GRID - 1 - gy) * cellH, cellW + 1, cellH + 1);
      }
    }

    // Color bar
    const barX = W - 30, barW = 16;
    for (let i = 0; i < H; i++) {
      ctx.fillStyle = valToColor(vMin + ((H - i) / H) * (vMax - vMin), vMin, vMax, "viridis");
      ctx.fillRect(barX, i, barW, 2);
    }
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "10px monospace";
    ctx.fillText(fmt(vMax), barX - 2, 12);
    ctx.fillText(fmt(vMin), barX - 2, H - 4);

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "11px Arial";
    ctx.fillText(xCol, W / 2 - 20, H - 4);
    ctx.save(); ctx.translate(12, H / 2 + 20); ctx.rotate(-Math.PI / 2); ctx.fillText(yCol, 0, 0); ctx.restore();
  }, [data, xCol, yCol, valCol]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} width={700} height={340} className="rounded-xl w-full" style={{ maxWidth: 700 }} />
      <p className="text-xs text-muted-foreground">Nearest-neighbour gridded contour — X: {xCol} · Y: {yCol} · Value: {valCol}</p>
    </div>
  );
}

// ─── Chart description ─────────────────────────────────────────────────────────
function ChartDescription({ kind }: { kind: ChartKind }) {
  const MAP: Record<ChartKind, { title: string; text: string; uses: string[] }> = {
    timeseries: {
      title: "Time Series Plot",
      text: "Plots one or more parameters against time. Essential for monitoring geomagnetic activity, solar wind conditions, ionospheric variability, and space weather events.",
      uses: ["Dst/Kp storm indices over time", "Solar wind speed & IMF Bz", "Electron density from ICON/Swarm", "F10.7 solar flux over a solar cycle"],
    },
    altitude: {
      title: "Vertical / Altitude Profile",
      text: "Plots a parameter on the X-axis against altitude on the Y-axis, revealing the vertical structure of the atmosphere or ionosphere at a given time/location.",
      uses: ["Ne vs altitude from ISR (Madrigal)", "Temperature profiles (NRLMSISE-00)", "Wind speed vs altitude (ICON MIGHTI)", "Ion composition vs altitude (IRI)"],
    },
    contour: {
      title: "Contour Map / Global Grid",
      text: "2D colour-mapped grid showing spatial distribution. Useful for global or regional maps of geophysical parameters over latitude/longitude or latitude/altitude cross-sections.",
      uses: ["Global TEC maps (GPS data)", "Swarm electron density maps", "Global Kp colour maps", "TIE-GCM lat-lon parameter maps"],
    },
    tmd: {
      title: "Thermospheric Mass Density (TMD) Plot",
      text: "Visualises total atmospheric mass density (ρ) in the thermosphere (typically 200–600 km). Data from accelerometer-equipped satellites like CHAMP, GRACE, GOCE, and Swarm.",
      uses: ["Orbit-averaged density from CHAMP/GRACE", "Density enhancement during geomagnetic storms", "Density vs local solar time", "Long-term density trends (solar cycle)"],
    },
    iri: {
      title: "IRI — International Reference Ionosphere",
      text: "Empirical model for electron density, ion composition, and temperatures in the ionosphere (50–2000 km). Python package: iricore. Output: Ne(h), Te(h), Ti(h), ion fractions.",
      uses: ["Ne altitude profile for a given location/time", "Peak electron density NmF2 & hmF2", "Compare model vs Madrigal ISR data", "Ion composition (O+, H+, He+) vs altitude"],
    },
    nrlmsise: {
      title: "NRLMSISE-00 Atmospheric Model",
      text: "Standard empirical thermosphere-ionosphere model from Naval Research Lab. Provides neutral densities (N₂, O₂, O, Ar, He), total mass density, and temperatures from surface to exosphere.",
      uses: ["Mass density vs altitude at different F10.7", "Temperature profile (Tn, Texo)", "Compare storm-time vs quiet-time density", "Drag estimation for LEO satellites"],
    },
    tiegcm: {
      title: "TIE-GCM — Ionosphere-Thermosphere GCM",
      text: "NCAR's physics-based 3D general circulation model of the coupled thermosphere-ionosphere system. Driven by solar EUV, particle precipitation, and magnetospheric inputs. Output: NetCDF.",
      uses: ["Lat-pressure cross-sections of Ne, Tn, Un", "Joule heating during geomagnetic storms", "Global Pedersen/Hall conductance maps", "E×B drift and electric potential maps"],
    },
  };

  const info = MAP[kind];
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{info.title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{info.text}</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {info.uses.map((u) => (
          <span key={u} className="rounded-md bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">{u}</span>
        ))}
      </div>
    </div>
  );
}
