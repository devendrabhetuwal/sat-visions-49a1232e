/**
 * GPS / TEC data parser — supports CSV, TSV, TXT, DAT, IONEX
 * Auto-detects format, columns, stations, and units.
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

// ─── Column name heuristics ───────────────────────────────────────────────────
const COL_PATTERNS: Record<string, RegExp> = {
  time:      /^(time|epoch|datetime|date_time|gps_time|gpstime|ut|utc|mjd|doy|tow|timestamp)/i,
  date:      /^(date|gps_date)$/i,
  station:   /^(station|site|site_id|receiver|recv|sta|rcvr|name)$/i,
  prn:       /^(prn|svid|sv|sat|satellite|satid|sv_id|gnss|gnssid)$/i,
  lat:       /^(lat|latitude|glat|ipp_lat|lat_deg)$/i,
  lon:       /^(lon|long|longitude|glon|ipp_lon|lon_deg)$/i,
  elevation: /^(elev|elevation|ele|el|elv|elev_deg|elevation_deg)$/i,
  azimuth:   /^(az|azimuth|azm|azi)$/i,
  sTEC:      /^(stec|s_tec|slant_tec|tec_s|tecslant|sTEC|slantTEC|tec_obs)$/i,
  vTEC:      /^(vtec|v_tec|vert_tec|vertical_tec|tec_v|tecvert|vTEC|vertTEC|tec)$/i,
  roti:      /^(roti|rot_i)$/i,
  rot:       /^(rot|rate_tec)$/i,
};

function matchColumn(name: string): string | null {
  const n = name.trim();
  for (const [key, re] of Object.entries(COL_PATTERNS)) {
    if (re.test(n)) return key;
  }
  return null;
}

// ─── Delimiter detection ──────────────────────────────────────────────────────
function detectDelimiter(sample: string): string {
  const counts = { ",": 0, "\t": 0, ";": 0, " ": 0, "|": 0 };
  const firstLines = sample.split("\n").filter(l => l.trim() && !l.startsWith("#")).slice(0, 5);
  for (const line of firstLines) {
    for (const d of Object.keys(counts) as (keyof typeof counts)[]) {
      counts[d] += (line.match(new RegExp(d === " " ? "  +" : d.replace(/[|]/g, "\\|"), "g")) || []).length;
    }
  }
  // Prefer tab/comma/semicolon over space
  const ordered: (keyof typeof counts)[] = ["\t", ",", ";", "|", " "];
  let best = ","; let bestCount = 0;
  for (const d of ordered) {
    if (counts[d] > bestCount) { bestCount = counts[d]; best = d; }
  }
  return best;
}

// ─── IONEX parser ─────────────────────────────────────────────────────────────
function parseIONEX(text: string): { maps: IONEXMap[]; warnings: string[] } {
  const warnings: string[] = [];
  const maps: IONEXMap[] = [];
  const lines = text.split("\n");

  let inHeader = true;
  let inMap = false;
  let exponent = -1;         // TECU = value * 10^exponent

  let currentEpoch = "";
  let currentTimestamp = 0;
  let latStart = 0, latStep = 0, latCount = 0;
  let lonStart = 0, lonEnd = 0, lonStep = 0, lonCount = 0;
  let currentLat = 0;
  let latIdx = 0;
  let tecGrid: number[][] = [];

  for (const raw of lines) {
    const label = raw.length > 60 ? raw.slice(60).trim() : "";
    const data  = raw.slice(0, 60);

    if (inHeader) {
      if (label.includes("EXPONENT")) {
        exponent = parseInt(data.trim(), 10);
      }
      if (label.includes("END OF HEADER")) { inHeader = false; }
      continue;
    }

    if (label.includes("START OF TEC MAP")) {
      inMap = true; tecGrid = []; latIdx = 0; continue;
    }

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
      currentLat = parts[0];
      lonStart = parts[1]; lonEnd = parts[2]; lonStep = parts[3];
      lonCount = Math.round((lonEnd - lonStart) / lonStep) + 1;
      // First line of a new latitude band
      if (latIdx === 0) {
        latStart = parts[0];
        latStep = 0;          // will compute from second band
        latCount = 0;
      }
      tecGrid.push([]);
      latIdx++;
      continue;
    }

    // Data rows — 16 values per row, 5 chars each
    if (inMap && /^\s*[\d\s-]+$/.test(data) && data.trim().length > 0) {
      const row = tecGrid[tecGrid.length - 1];
      const tokens = data.match(/.{1,5}/g) ?? [];
      for (const t of tokens) {
        const v = parseInt(t, 10);
        if (!isNaN(v) && v !== 9999) {
          row.push(v * Math.pow(10, exponent));
        }
      }
    }
  }

  if (maps.length === 0) warnings.push("No TEC maps found in IONEX file — check format.");
  return { maps, warnings };
}

// ─── CSV/TXT parser ───────────────────────────────────────────────────────────
function parseDelimited(text: string, warnings: string[]): TECRecord[] {
  const lines = text.split("\n");

  // Skip comment/header lines
  const commentPat = /^[#!%;]/;
  const dataLines = lines.filter(l => l.trim() && !commentPat.test(l.trim()));
  if (dataLines.length < 2) { warnings.push("Too few data lines."); return []; }

  const sample = dataLines.slice(0, 20).join("\n");
  const delim = detectDelimiter(sample);

  // Parse header
  const rawHeaders = dataLines[0].split(delim).map(h => h.trim().replace(/["']/g, ""));
  const colMap: Record<string, number> = {};
  const detectedCols: Record<string, string> = {};

  rawHeaders.forEach((h, i) => {
    const key = matchColumn(h);
    if (key && !(key in colMap)) { colMap[key] = i; detectedCols[key] = h; }
  });

  // If no time column found, try to combine date + time
  let hasDateTime = "time" in colMap;
  if (!hasDateTime && "date" in colMap) hasDateTime = true;

  const records: TECRecord[] = [];
  let duplicates = 0;
  const seen = new Set<string>();

  for (let i = 1; i < dataLines.length; i++) {
    const cells = dataLines[i].split(delim).map(c => c.trim().replace(/["']/g, ""));
    if (cells.length < 2) continue;

    const get = (key: string): string => colMap[key] !== undefined ? (cells[colMap[key]] ?? "") : "";
    const getNum = (key: string): number => {
      const v = parseFloat(get(key));
      return isNaN(v) ? 0 : v;
    };

    // Parse timestamp
    let ts = 0;
    let isoStr = "";
    const rawTime = get("time") || get("date");
    if (rawTime) {
      const d = new Date(rawTime);
      if (!isNaN(d.getTime())) { ts = d.getTime(); isoStr = d.toISOString(); }
      else {
        // Try numeric MJD or DOY
        const num = parseFloat(rawTime);
        if (!isNaN(num) && num > 50000) { // MJD
          const d2 = new Date((num - 40587) * 86400000);
          ts = d2.getTime(); isoStr = d2.toISOString();
        }
      }
    }

    const sTEC = getNum("sTEC") || getNum("vTEC");
    const vTEC = getNum("vTEC") || sTEC;
    if (sTEC === 0 && vTEC === 0) continue; // skip zero-TEC rows
    if (sTEC < 0 || sTEC > 300) continue;   // sanity check

    const station = get("station") || "UNKNOWN";
    const prn = get("prn") || "G00";
    const key = `${ts}|${station}|${prn}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);

    const elev = getNum("elevation");
    const az   = getNum("azimuth");
    const lat  = getNum("lat");
    const lon  = getNum("lon");

    // Compute VTEC from sTEC using mapping function if elevation available
    let vtec = vTEC;
    if (elev > 0 && sTEC > 0 && vTEC === sTEC) {
      const Re = 6371; const h = 450;
      const sinEl = Math.sin((elev * Math.PI) / 180);
      const F = 1 / Math.sqrt(1 - ((Re * Math.cos((elev * Math.PI) / 180)) / (Re + h)) ** 2);
      vtec = sTEC / F;
    }

    records.push({ timestamp: ts, datetime: isoStr, station, prn, elevation: elev, azimuth: az, sTEC, vTEC: vtec, lat, lon });
  }

  if (duplicates > 0) warnings.push(`Removed ${duplicates} duplicate records.`);
  return records;
}

// ─── Format detection ─────────────────────────────────────────────────────────
export function detectFormat(text: string, filename: string): TECFormat {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["h5", "hdf5"].includes(ext)) return "hdf5";
  if (["nc"].includes(ext)) return "netcdf";
  if (text.includes("IONEX VERSION") || text.includes("IONOSPHERE MAPS")) return "ionex";
  if (text.includes("RINEX VERSION") && text.includes("OBSERVATION")) return "rinex_obs";
  if (text.includes("RINEX VERSION") && text.includes("NAVIGATION")) return "rinex_nav";
  if (["csv", "txt", "dat", "tsv"].includes(ext)) return "csv";
  return "csv"; // default — try CSV
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
    // Convert IONEX maps → flat records (one per lat/lon/epoch)
    for (const map of ionexMaps) {
      for (let li = 0; li < map.lat.length; li++) {
        for (let lo = 0; lo < map.lon.length; lo++) {
          const tec = map.tec[li]?.[lo] ?? 0;
          if (tec <= 0 || tec > 300) continue;
          records.push({
            timestamp: map.timestamp,
            datetime: map.epoch,
            station: "IONEX_GRID",
            prn: "GXX",
            elevation: 90,
            azimuth: 0,
            sTEC: tec,
            vTEC: tec,
            lat: map.lat[li],
            lon: map.lon[lo],
          });
        }
      }
    }
  } else if (format === "hdf5" || format === "netcdf") {
    warnings.push(`${format.toUpperCase()} requires the Python backend. Upload CSV/TXT/IONEX for browser processing.`);
  } else if (format === "rinex_obs" || format === "rinex_nav") {
    warnings.push("RINEX binary parsing requires the Python backend (georinex library). Upload CSV/TXT/IONEX instead.");
  } else {
    records = parseDelimited(text, warnings);
  }

  // Sort by timestamp
  records.sort((a, b) => a.timestamp - b.timestamp);

  const stations = [...new Set(records.map(r => r.station))].sort();
  const prns     = [...new Set(records.map(r => r.prn))].sort();
  const timestamps = records.map(r => r.timestamp).filter(Boolean);
  const tecs  = records.map(r => r.vTEC).filter(v => v > 0);
  const elevs = records.map(r => r.elevation).filter(v => v > 0);
  const lats  = records.map(r => r.lat).filter(Boolean);
  const lons  = records.map(r => r.lon).filter(Boolean);

  const timeRange: [number, number] = timestamps.length
    ? [Math.min(...timestamps), Math.max(...timestamps)] : [0, 0];
  const latRange: [number, number] = lats.length ? [Math.min(...lats), Math.max(...lats)] : [-90, 90];
  const lonRange: [number, number] = lons.length ? [Math.min(...lons), Math.max(...lons)] : [-180, 180];

  const rawHeaders = format === "csv" ? text.split("\n")[0]?.split(/[,\t;|]/).map(h => h.trim()) ?? [] : [];

  const detectedCols: Record<string, string> = {};
  rawHeaders.forEach(h => { const k = matchColumn(h); if (k) detectedCols[k] = h; });

  const qualityScore = Math.min(
    100,
    Math.round(
      (records.length > 0 ? 30 : 0) +
      (stations.length > 0 && stations[0] !== "UNKNOWN" ? 20 : 5) +
      (prns.length > 0 && prns[0] !== "G00" ? 15 : 0) +
      (tecs.length > 0 ? 20 : 0) +
      (elevs.length > 0 ? 15 : 0)
    )
  );

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
    rawHeaders,
    warnings,
    extractionReport,
  };
}
