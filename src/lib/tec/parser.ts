/**
 * GPS / TEC data parser — supports CSV, TSV, TXT, DAT, IONEX
 * Auto-detects format, columns, stations, and units.
 * Robust fallback logic so almost any tabular file with numeric data produces graphs.
 */

export type TECFormat = "csv" | "ionex" | "rinex_obs" | "rinex_nav" | "netcdf" | "hdf5" | "unknown";

export interface TECRecord {
  timestamp: number;        // Unix ms UTC
  datetime: string;         // ISO string
  station: string;
  prn: string;              // e.g. "G01", "R05"
  elevation: number;        // degrees
  azimuth: number;          // degrees
  sTEC: number;             // Slant TEC (TECU)
  vTEC: number;             // Vertical TEC (TECU)
  lat: number;
  lon: number;
}

export interface IONEXMap {
  epoch: string;
  timestamp: number;
  lat: number[];
  lon: number[];
  tec: number[][];          // [lat][lon] in TECU
}

export interface ParseResult {
  format: TECFormat;
  records: TECRecord[];
  ionexMaps: IONEXMap[];
  stations: string[];
  prns: string[];
  timeRange: [number, number];
  latRange: [number, number];
  lonRange: [number, number];
  columns: string[];
  rawHeaders: string[];
  warnings: string[];
  extractionReport: ExtractionReport;
}

export interface ExtractionReport {
  totalRows: number;
  validRows: number;
  duplicatesRemoved: number;
  missingFilled: number;
  stationsFound: string[];
  prnsFound: string[];
  tecRange: [number, number];
  elevRange: [number, number];
  timeRange: [string, string];
  detectedColumns: Record<string, string>;
  qualityScore: number;       // 0-100
  warnings: string[];
}

// ─── Strict column patterns ───────────────────────────────────────────────────
const STRICT_PATTERNS: Record<string, RegExp> = {
  time:      /^(time|epoch|datetime|date_time|gps_time|gpstime|ut|utc|mjd|doy|tow|timestamp|date)$/i,
  station:   /^(station|site|site_id|receiver|recv|sta|rcvr|name)$/i,
  prn:       /^(prn|svid|sv|sat|satellite|satid|sv_id|gnss|gnssid)$/i,
  lat:       /^(lat|latitude|glat|ipp_lat|lat_deg)$/i,
  lon:       /^(lon|long|longitude|glon|ipp_lon|lon_deg)$/i,
  elevation: /^(elev|elevation|ele|el|elv|elev_deg|elevation_deg)$/i,
  azimuth:   /^(az|azimuth|azm|azi)$/i,
  sTEC:      /^(stec|s_tec|slant_tec|tec_s|tecslant|sTEC|slantTEC|tec_obs)$/i,
  vTEC:      /^(vtec|v_tec|vert_tec|vertical_tec|tec_v|tecvert|vTEC|vertTEC|tec)$/i,
  roti:      /^(roti|rot_i)$/i,
};

// ─── Fuzzy column matching (substring / contains) ────────────────────────────
function matchColumnFuzzy(name: string): string | null {
  const n = name.trim();

  // 1. Strict exact patterns
  for (const [key, re] of Object.entries(STRICT_PATTERNS)) {
    if (re.test(n)) return key;
  }

  // 2. Substring / contains heuristics (case-insensitive)
  const lo = n.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/stec|slanttec/.test(lo))                      return "sTEC";
  if (/vtec|verttec|verticaltec/.test(lo))            return "vTEC";
  if (/^tec\d*$|tec_[a-z]+|[a-z]+_tec/.test(lo))    return "vTEC";  // tec14, tec_gps, gps_tec …
  if (/time|epoch|utc|datetime|gpstime/.test(lo))     return "time";
  if (/date(?!time)/.test(lo))                        return "time";
  if (/station|site|recv|rcvr/.test(lo))              return "station";
  if (/prn|svid|satid|gnssid/.test(lo))               return "prn";
  if (/^lat\b|latitude|ipp_lat/.test(lo))             return "lat";
  if (/^lon\b|^long\b|longitude|ipp_lon/.test(lo))    return "lon";
  if (/elev|elevation/.test(lo))                      return "elevation";
  if (/azim|azm/.test(lo))                            return "azimuth";
  if (/roti/.test(lo))                                return "roti";

  return null;
}

// ─── Delimiter detection ──────────────────────────────────────────────────────
function detectDelimiter(sample: string): string {
  const firstLines = sample.split("\n").filter(l => l.trim() && !l.trim().startsWith("#")).slice(0, 5);
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0, "|": 0, " ": 0 };
  for (const line of firstLines) {
    for (const d of Object.keys(counts)) {
      counts[d] += (line.match(new RegExp(d === " " ? " {2,}" : d.replace(/[|]/g, "\\|"), "g")) || []).length;
    }
  }
  const ordered = ["\t", ",", ";", "|", " "];
  let best = ",";
  let bestCount = 0;
  for (const d of ordered) {
    if (counts[d] > bestCount) { bestCount = counts[d]; best = d; }
  }
  return best;
}

// ─── Robust timestamp parser ──────────────────────────────────────────────────
function parseTimestamp(raw: string): number {
  if (!raw || raw === "" || raw === "-" || raw === "nan") return 0;

  // 1. ISO / standard date strings
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.getTime();

  const num = parseFloat(raw);
  if (isNaN(num)) return 0;

  // 2. Unix epoch in seconds (> 1e8 and < 2e10)
  if (num > 1e8 && num < 2e10) return num * 1000;

  // 3. Unix epoch in milliseconds (> 1e11)
  if (num > 1e11) return num;

  // 4. Modified Julian Date (MJD > 50000)
  if (num > 50000 && num < 100000) {
    return (num - 40587) * 86400000;
  }

  // 5. Day-of-year (1–366) — return as ms since epoch-start (treated as index)
  if (num >= 1 && num <= 366) return num * 86400000;

  // 6. Fractional hour (0–24) — treat as seconds in a day
  if (num >= 0 && num <= 24) return num * 3600000;

  return 0;
}

// ─── IONEX parser ─────────────────────────────────────────────────────────────
function parseIONEX(text: string): { maps: IONEXMap[]; warnings: string[] } {
  const warnings: string[] = [];
  const maps: IONEXMap[] = [];
  const lines = text.split("\n");

  let inHeader = true;
  let inMap = false;
  let exponent = -1;

  let currentEpoch = "";
  let currentTimestamp = 0;
  let latStart = 0, latStep = 0, latCount = 0;
  let lonStart = 0, lonEnd = 0, lonStep = 0, lonCount = 0;
  let latIdx = 0;
  let tecGrid: number[][] = [];

  for (const raw of lines) {
    const label = raw.length > 60 ? raw.slice(60).trim() : "";
    const data  = raw.slice(0, 60);

    if (inHeader) {
      if (label.includes("EXPONENT"))    exponent = parseInt(data.trim(), 10);
      if (label.includes("END OF HEADER")) inHeader = false;
      continue;
    }

    if (label.includes("START OF TEC MAP")) { inMap = true; tecGrid = []; latIdx = 0; continue; }
    if (label.includes("END OF TEC MAP")) {
      inMap = false;
      if (currentEpoch) {
        const latArr: number[] = [];
        for (let i = 0; i < latCount; i++) latArr.push(latStart + i * latStep);
        const lonArr: number[] = [];
        for (let i = 0; i < lonCount; i++) lonArr.push(lonStart + i * lonStep);
        maps.push({ epoch: currentEpoch, timestamp: currentTimestamp, lat: latArr, lon: lonArr, tec: tecGrid });
      }
      continue;
    }
    if (!inMap) continue;

    if (label.includes("EPOCH OF CURRENT MAP")) {
      const parts = data.trim().split(/\s+/).map(Number);
      const [yr, mo, dy, hr, mn, sc] = parts;
      const d = new Date(Date.UTC(yr, mo - 1, dy, hr, mn, Math.round(sc)));
      currentTimestamp = d.getTime();
      currentEpoch = d.toISOString();
      continue;
    }

    if (label.includes("LAT/LON1/LON2/DLON/H")) {
      const parts = data.trim().split(/\s+/).map(Number);
      lonStart = parts[1]; lonEnd = parts[2]; lonStep = parts[3];
      lonCount = Math.round((lonEnd - lonStart) / lonStep) + 1;
      if (latIdx === 0) { latStart = parts[0]; latStep = 0; latCount = 0; }
      tecGrid.push([]); latIdx++;
      continue;
    }

    if (inMap && /^\s*[\d\s-]+$/.test(data) && data.trim().length > 0) {
      const row = tecGrid[tecGrid.length - 1];
      const tokens = data.match(/.{1,5}/g) ?? [];
      for (const t of tokens) {
        const v = parseInt(t, 10);
        if (!isNaN(v) && v !== 9999) row.push(v * Math.pow(10, exponent));
      }
    }
  }

  if (maps.length === 0) warnings.push("No TEC maps found in IONEX file — check format.");
  return { maps, warnings };
}

// ─── CSV/TXT/DAT parser ───────────────────────────────────────────────────────
function parseDelimited(text: string, filename: string, warnings: string[]): TECRecord[] {
  const lines = text.split("\n");
  const commentPat = /^[#!%;]/;
  const dataLines = lines.filter(l => l.trim() && !commentPat.test(l.trim()));
  if (dataLines.length < 2) { warnings.push("Too few data lines (need header + at least 1 row)."); return []; }

  const sample = dataLines.slice(0, 20).join("\n");
  const delim = detectDelimiter(sample);

  const rawHeaders = dataLines[0].split(delim).map(h => h.trim().replace(/["'`]/g, ""));
  const colMap: Record<string, number> = {};
  const detectedCols: Record<string, string> = {};

  rawHeaders.forEach((h, i) => {
    const key = matchColumnFuzzy(h);
    if (key && !(key in colMap)) { colMap[key] = i; detectedCols[key] = h; }
  });

  // ─── Fallback: if no TEC column at all, use first purely numeric column ────
  if (!("sTEC" in colMap) && !("vTEC" in colMap)) {
    // Find first column where >50% of values are numeric
    for (let ci = 0; ci < rawHeaders.length; ci++) {
      const vals = dataLines.slice(1, 11).map(l => l.split(delim)[ci]?.trim() ?? "");
      const numericCount = vals.filter(v => !isNaN(parseFloat(v)) && v !== "").length;
      if (numericCount >= Math.max(2, vals.length * 0.5)) {
        colMap["vTEC"] = ci;
        detectedCols["vTEC"] = rawHeaders[ci];
        warnings.push(`No TEC column detected — using "${rawHeaders[ci]}" as vertical TEC proxy.`);
        break;
      }
    }
  }

  // ─── Fallback: no time column — we'll generate synthetic timestamps ────────
  const hasTime = "time" in colMap;
  if (!hasTime) {
    warnings.push("No time column detected — using row index as synthetic time axis.");
  }

  // Station name from filename if no station column
  const filenameStation = filename
    .replace(/\.[^.]+$/, "")          // drop extension
    .replace(/[^A-Z0-9]/gi, "_")      // normalise
    .toUpperCase()
    .slice(0, 8) || "STATION";

  const records: TECRecord[] = [];
  let duplicates = 0;
  const seen = new Set<string>();

  for (let i = 1; i < dataLines.length; i++) {
    const cells = dataLines[i].split(delim).map(c => c.trim().replace(/["'`]/g, ""));
    if (cells.length < 1) continue;

    const get = (key: string): string => colMap[key] !== undefined ? (cells[colMap[key]] ?? "") : "";
    const getNum = (key: string): number => {
      const v = parseFloat(get(key));
      return isNaN(v) ? 0 : v;
    };

    // ── Timestamp ────────────────────────────────────────────────────────────
    let ts = 0;
    let isoStr = "";
    if (hasTime) {
      ts = parseTimestamp(get("time"));
    }
    if (ts === 0) {
      // Synthetic: row index → 1-minute spacing from a fixed reference
      ts = new Date("2000-01-01T00:00:00Z").getTime() + i * 60000;
    }
    isoStr = new Date(ts).toISOString();

    // ── TEC values ──────────────────────────────────────────────────────────
    const sTECRaw = getNum("sTEC");
    const vTECRaw = getNum("vTEC");
    let sTEC = sTECRaw !== 0 ? sTECRaw : vTECRaw;
    let vTEC = vTECRaw !== 0 ? vTECRaw : sTECRaw;

    // Accept any non-NaN, non-extreme TEC value (relax the sanity check)
    if (isNaN(sTEC) || sTEC < -500 || sTEC > 10000) continue;
    // If TEC is exactly 0 AND we have numeric data, skip (likely fill value)
    // But only skip if ALL numeric columns are 0 (hard skip)
    if (sTEC === 0 && vTEC === 0) {
      const anyNumericNonZero = Object.keys(colMap)
        .filter(k => k !== "time" && k !== "station" && k !== "prn")
        .some(k => Math.abs(getNum(k)) > 0);
      if (!anyNumericNonZero) continue;
    }

    const station = get("station") || filenameStation;
    const prn     = get("prn") || "G01";
    const key = `${ts}|${station}|${prn}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);

    const elev = getNum("elevation");
    const az   = getNum("azimuth");
    const lat  = getNum("lat");
    const lon  = getNum("lon");

    // Compute vTEC from sTEC using mapping function if elevation is available
    if (elev > 5 && sTEC > 0 && vTEC === sTEC) {
      const Re = 6371, h = 450;
      const cosEl = Math.cos((elev * Math.PI) / 180);
      const sinArg = (Re * cosEl) / (Re + h);
      if (Math.abs(sinArg) < 1) {
        vTEC = sTEC / Math.sqrt(1 - sinArg * sinArg);
      }
    }

    records.push({ timestamp: ts, datetime: isoStr, station, prn, elevation: elev, azimuth: az, sTEC, vTEC, lat, lon });
  }

  if (duplicates > 0) warnings.push(`Removed ${duplicates} duplicate records.`);

  if (records.length === 0) {
    warnings.push(
      "No valid TEC records found. Check that the file has a numeric TEC column (sTEC, vTEC, TEC, or any numeric column)."
    );
  }

  return records;
}

// ─── Format detection ─────────────────────────────────────────────────────────
export function detectFormat(text: string, filename: string): TECFormat {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["h5", "hdf5", "he5"].includes(ext)) return "hdf5";
  if (["nc", "nc4", "cdf", "netcdf"].includes(ext)) return "netcdf";
  if (text.includes("IONEX VERSION") || text.includes("IONOSPHERE MAPS") || ext === "ionex") return "ionex";
  if (text.includes("RINEX VERSION") && text.includes("OBSERVATION")) return "rinex_obs";
  if (text.includes("RINEX VERSION") && text.includes("NAVIGATION"))  return "rinex_nav";
  return "csv"; // default: try CSV parsing
}

// ─── Merge multiple ParseResults ──────────────────────────────────────────────
export function mergeParseResults(results: ParseResult[], filenameHints: string[]): ParseResult {
  const allRecords: TECRecord[] = [];
  const allWarnings: string[] = [];
  const allIonexMaps: IONEXMap[] = [];

  // Deduplicate station names across files: if multiple files lack a station column,
  // rename stations to the filename-derived label to avoid collision.
  results.forEach((r, fi) => {
    const stationLabel = filenameHints[fi] || `FILE${fi + 1}`;
    const stationSet = new Set(r.records.map(rec => rec.station));
    const isGeneric = stationSet.size === 1 && (stationSet.has("STATION") || stationSet.has("UNKNOWN"));
    const recs = r.records.map(rec => ({
      ...rec,
      station: isGeneric ? stationLabel : rec.station,
    }));
    allRecords.push(...recs);
    allWarnings.push(...r.warnings.map(w => `[${stationLabel}] ${w}`));
    allIonexMaps.push(...r.ionexMaps);
  });

  allRecords.sort((a, b) => a.timestamp - b.timestamp);

  const stations = [...new Set(allRecords.map(r => r.station))].sort();
  const prns     = [...new Set(allRecords.map(r => r.prn))].sort();
  const timestamps = allRecords.map(r => r.timestamp).filter(Boolean);
  const tecs  = allRecords.map(r => r.vTEC).filter(v => isFinite(v) && v > 0);
  const elevs = allRecords.map(r => r.elevation).filter(v => v > 0);
  const lats  = allRecords.map(r => r.lat).filter(Boolean);
  const lons  = allRecords.map(r => r.lon).filter(Boolean);

  const timeRange: [number, number] = timestamps.length
    ? [Math.min(...timestamps), Math.max(...timestamps)] : [0, 0];
  const latRange: [number, number]  = lats.length ? [Math.min(...lats), Math.max(...lats)] : [-90, 90];
  const lonRange: [number, number]  = lons.length ? [Math.min(...lons), Math.max(...lons)] : [-180, 180];

  const qualityScore = Math.min(100, Math.round(
    (allRecords.length > 0 ? 30 : 0) +
    (stations.length > 0 ? 20 : 0) +
    (prns.length > 0 && prns[0] !== "G00" ? 15 : 5) +
    (tecs.length > 0 ? 20 : 0) +
    (elevs.length > 0 ? 15 : 0)
  ));

  const detectedCols: Record<string, string> = results.reduce((acc, r) => ({
    ...acc, ...r.extractionReport.detectedColumns,
  }), {} as Record<string, string>);

  const extractionReport: ExtractionReport = {
    totalRows: allRecords.length,
    validRows: allRecords.length,
    duplicatesRemoved: 0,
    missingFilled: 0,
    stationsFound: stations,
    prnsFound: prns,
    tecRange: tecs.length ? [Math.min(...tecs), Math.max(...tecs)] : [0, 0],
    elevRange: elevs.length ? [Math.min(...elevs), Math.max(...elevs)] : [0, 90],
    timeRange: timeRange[0] ? [new Date(timeRange[0]).toISOString(), new Date(timeRange[1]).toISOString()] : ["—", "—"],
    detectedColumns: detectedCols,
    qualityScore,
    warnings: allWarnings,
  };

  return {
    format: results[0]?.format ?? "csv",
    records: allRecords,
    ionexMaps: allIonexMaps,
    stations, prns, timeRange, latRange, lonRange,
    columns: Object.keys(detectedCols),
    rawHeaders: results[0]?.rawHeaders ?? [],
    warnings: allWarnings,
    extractionReport,
  };
}

// ─── Main parse entry point ───────────────────────────────────────────────────
export function parseFile(text: string, filename: string): ParseResult {
  const warnings: string[] = [];
  const format = detectFormat(text, filename);

  let records: TECRecord[] = [];
  let ionexMaps: IONEXMap[] = [];

  if (format === "ionex") {
    const result = parseIONEX(text);
    ionexMaps = result.maps;
    warnings.push(...result.warnings);
    for (const map of ionexMaps) {
      for (let li = 0; li < map.lat.length; li++) {
        for (let lo = 0; lo < map.lon.length; lo++) {
          const tec = map.tec[li]?.[lo] ?? 0;
          if (tec <= 0 || tec > 300) continue;
          records.push({
            timestamp: map.timestamp, datetime: map.epoch,
            station: "IONEX_GRID", prn: "GXX",
            elevation: 90, azimuth: 0,
            sTEC: tec, vTEC: tec,
            lat: map.lat[li], lon: map.lon[lo],
          });
        }
      }
    }
  } else if (format === "hdf5" || format === "netcdf") {
    warnings.push(`${format.toUpperCase()} requires the Python backend. Upload CSV/TXT/IONEX for instant browser processing.`);
  } else if (format === "rinex_obs" || format === "rinex_nav") {
    warnings.push("RINEX binary parsing requires the Python backend. Upload CSV/TXT/IONEX instead.");
  } else {
    records = parseDelimited(text, filename, warnings);
  }

  records.sort((a, b) => a.timestamp - b.timestamp);

  const stations = [...new Set(records.map(r => r.station))].sort();
  const prns     = [...new Set(records.map(r => r.prn))].sort();
  const timestamps = records.map(r => r.timestamp).filter(Boolean);
  const tecs  = records.map(r => r.vTEC).filter(v => isFinite(v) && v > 0);
  const elevs = records.map(r => r.elevation).filter(v => v > 0);
  const lats  = records.map(r => r.lat).filter(Boolean);
  const lons  = records.map(r => r.lon).filter(Boolean);

  const timeRange: [number, number] = timestamps.length ? [Math.min(...timestamps), Math.max(...timestamps)] : [0, 0];
  const latRange: [number, number]  = lats.length ? [Math.min(...lats), Math.max(...lats)] : [-90, 90];
  const lonRange: [number, number]  = lons.length ? [Math.min(...lons), Math.max(...lons)] : [-180, 180];

  const rawHeaders = format === "csv" ? text.split("\n")[0]?.split(/[,\t;| ]+/).map(h => h.trim()) ?? [] : [];
  const detectedCols: Record<string, string> = {};
  rawHeaders.forEach(h => { const k = matchColumnFuzzy(h); if (k) detectedCols[k] = h; });

  const qualityScore = Math.min(100, Math.round(
    (records.length > 0 ? 30 : 0) +
    (stations.length > 0 && stations[0] !== "UNKNOWN" ? 20 : 5) +
    (prns.length > 0 && prns[0] !== "G00" ? 15 : 0) +
    (tecs.length > 0 ? 20 : 0) +
    (elevs.length > 0 ? 15 : 0)
  ));

  const extractionReport: ExtractionReport = {
    totalRows: records.length,
    validRows: records.length,
    duplicatesRemoved: 0,
    missingFilled: 0,
    stationsFound: stations,
    prnsFound: prns,
    tecRange: tecs.length ? [Math.min(...tecs), Math.max(...tecs)] : [0, 0],
    elevRange: elevs.length ? [Math.min(...elevs), Math.max(...elevs)] : [0, 90],
    timeRange: timeRange[0] ? [new Date(timeRange[0]).toISOString(), new Date(timeRange[1]).toISOString()] : ["—", "—"],
    detectedColumns: detectedCols,
    qualityScore,
    warnings,
  };

  return {
    format, records, ionexMaps, stations, prns,
    timeRange, latRange, lonRange,
    columns: Object.keys(detectedCols),
    rawHeaders, warnings, extractionReport,
  };
}
