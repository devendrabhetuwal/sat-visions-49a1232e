
# Port Scientific Visualizer into SatVision AI

Rebuild the uploaded Flask app's capabilities natively inside the existing TanStack Start + React stack. No Flask server — parsing runs in TanStack server functions (Python via existing `python_parser/` where useful) and rendering runs in the React UI with Plotly + Recharts. Split by data type: **Data Lab** for generic tabular/scientific formats, new **Ionosphere Lab** for GNSS/space-weather formats.

## Scope (first pass)

Delivers the 4 selected priorities:
1. RINEX parsing + TEC/STEC/VTEC computation
2. IONEX global TEC maps + heatmaps/contours
3. Generic tabular viz (CSV/Excel/JSON/NetCDF/HDF5)
4. Export tools (PNG/SVG/PDF/CSV)

Explicitly deferred (call out in UI as "coming soon" placeholders, not built now): MATLAB `.mat`, CDF, RINEX Navigation `.nav`, full sky-plot ground tracks, animated IONEX time slider (static frame first), and the "150+ graph types" catalog (ship ~25 well-chosen chart types; enough scaffolding to add more).

## Where things land

```text
src/routes/
  data-lab.tsx                  # ENHANCED — generic tabular/scientific
  _authenticated/
    ionosphere.tsx              # NEW — RINEX / IONEX / space weather
src/components/datalab/
  UploadDropzone.tsx            # shared drag-drop + progress
  DataPreview.tsx               # column selector, first-N rows
  ChartGrid.tsx                 # auto-selected chart suggestions
  ChartCard.tsx                 # wraps Plotly, export menu
  charts/{Line,Scatter,Heatmap,Contour,Histogram,Box,Violin,
          Surface3D,Scatter3D,Correlation,PSD,FFT,Spectrogram,
          Polar,Bar,Area,Density,PairPlot}.tsx
src/components/ionosphere/
  RinexSummary.tsx              # constellations, obs types, sat count
  TECTimeSeries.tsx             # per-sat TEC/STEC/VTEC
  SkyPlot.tsx                   # elev/az polar plot
  IonexGlobalMap.tsx            # lat/lon TEC heatmap w/ contour
  IonexLatLonSlices.tsx         # lat-vs-TEC, lon-vs-TEC
  SpaceWeatherPanel.tsx         # Kp/Dst/F10.7 uploader (CSV/JSON)
src/lib/
  parsers/                      # NEW — pure TS parsers
    csv.ts  json.ts  xlsx.ts   # already partially covered by python_parser
    ionex.ts                    # IONEX ASCII + .gz (fflate)
    rinex.ts                    # RINEX 2/3 obs (obs types, epochs)
    netcdf.ts  hdf5.ts          # via h5wasm + netcdfjs
  gnss/
    tec.ts                      # STEC from L1/L2, code TEC from P1/P2
    geometry.ts                 # elev/az from sat XYZ
    cycleSlips.ts               # MW/GF combinations
  charts/autoSelect.ts          # picks chart types from column dtypes
  export/
    downloadPng.ts downloadSvg.ts downloadCsv.ts downloadPdf.ts
  ionosphere.functions.ts       # server fns: parseRinex, parseIonex,
                                # computeTec, summarize (uses python_parser)
```

## Technical details

- **Client-side parsing where possible** so million-row files don't hit the Worker: CSV via PapaParse streaming, XLSX via `xlsx`, JSON native, `.gz` via `fflate`, IONEX via a small custom parser, NetCDF via `netcdfjs`, HDF5 via `h5wasm`. RINEX 2/3 obs parsed in TS (header + epoch blocks; no heavy deps).
- **Server-side (createServerFn)** only when the file must go through the existing Python pipeline for stats (`python_parser/analyzer.py`) or when a browser parser is infeasible. Heavy compute stays client-side to respect Cloudflare Worker limits.
- **Charts**: `react-plotly.js` + `plotly.js-dist-min` (already suits 3D surface, contour, heatmap, spectrogram, polar). Existing Recharts stays for simple KPIs.
- **TEC computation**: geometry-free L1/L2 → STEC (TECU); code combination P1/P2; VTEC via thin-shell mapping function with configurable ionosphere height. Elevation/azimuth from broadcast eph is out-of-scope in v1 — v1 assumes elevation supplied or defaults to 90°; UI clearly notes when nav file support lands.
- **Auto graph selection** (`charts/autoSelect.ts`): rules on column dtype/cardinality/time-index — numeric+time → line; two numerics → scatter+regression; ≥3 numerics → correlation heatmap + pair plot; single numeric → histogram+box+density; lat+lon columns → map.
- **Export**: Plotly's `toImage` for PNG/SVG; jsPDF for multi-chart PDF; PapaParse for CSV.
- **Uploads**: reuse existing dropzone patterns; add per-file streaming progress bar; hard 200 MB browser limit with clear message above that.
- **Auth**: Ionosphere Lab is authenticated (under `_authenticated/`) so results tie to projects; Data Lab stays public like it is today.
- **Nav**: add "Ionosphere" link to authenticated nav; add head() metadata (title/description/og) for both routes.
- **Persistence**: reuse `projects` table; add optional `analysis_type` tag (`generic|rinex|ionex`) via migration so history filters correctly.

## Dependencies to add

`plotly.js-dist-min`, `react-plotly.js`, `papaparse`, `xlsx`, `fflate`, `netcdfjs`, `h5wasm`, `jspdf`.

## Out of scope (explicit)

- Standalone Flask/Python server, PythonAnywhere/Render deployment configs, `templates/index.html`, `static/*` — the request's original delivery format. Same features, different runtime.
- Full 150-graph catalog, `.mat`/CDF parsers, RINEX navigation decoding, IONEX time-lapse animation, sunspot/Kp live feeds. Scaffolded for easy follow-up.

## Build order

1. Deps + shared upload/preview/export scaffolding.
2. Data Lab: parsers (csv/xlsx/json/netcdf/hdf5) + auto-chart engine + 15+ chart components.
3. Ionosphere Lab route + RINEX parser + TEC compute + time-series/sky-plot charts.
4. IONEX parser + global map / lat-lon slices.
5. Migration for `analysis_type`, nav link, head metadata, docs page update.
6. Verify: `tsgo --noEmit`, smoke-test sample files, screenshot both routes.
