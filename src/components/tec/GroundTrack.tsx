/**
 * GroundTrack — plots ionospheric pierce-point (IPP) tracks per PRN
 * on the world map. Uses the lat/lon columns already parsed from the
 * dataset (assumed to be IPP or receiver footprint).
 */
import { useMemo } from "react";
import type { TECRecord } from "@/lib/tec/parser";
import { STATION_COLORS } from "@/lib/tec/calculations";

interface MapAPI {
  MapContainer: React.ComponentType<Record<string, unknown>>;
  TileLayer: React.ComponentType<Record<string, unknown>>;
  Polyline: React.ComponentType<Record<string, unknown>>;
  CircleMarker: React.ComponentType<Record<string, unknown>>;
  Popup: React.ComponentType<Record<string, unknown>>;
}

interface Props {
  records: TECRecord[];
  map: MapAPI | null;
  /** Max PRNs to render (top by point count). */
  maxPrns?: number;
}

export function GroundTrack({ records, map, maxPrns = 12 }: Props) {
  const tracks = useMemo(() => {
    const byPrn = new Map<string, TECRecord[]>();
    for (const r of records) {
      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
      if (Math.abs(r.lat) > 90 || Math.abs(r.lon) > 180) continue;
      const list = byPrn.get(r.prn) ?? [];
      list.push(r);
      byPrn.set(r.prn, list);
    }
    return [...byPrn.entries()]
      .map(([prn, recs]) => ({ prn, recs: recs.sort((a, b) => a.timestamp - b.timestamp) }))
      .sort((a, b) => b.recs.length - a.recs.length)
      .slice(0, maxPrns);
  }, [records, maxPrns]);

  const hasData = tracks.length > 0;

  return (
    <div className="glass rounded-2xl border border-border/40 overflow-hidden relative" style={{ height: 520 }}>
      {map ? (
        <map.MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ height: "100%", width: "100%", background: "#0d1117" }}
          attributionControl={false}
        >
          <map.TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; OpenStreetMap &copy; CARTO"
          />
          {tracks.map((t, i) => {
            const color = STATION_COLORS[i % STATION_COLORS.length];
            // Break the polyline where the longitude jumps (dateline crossing)
            const segments: [number, number][][] = [[]];
            let last: TECRecord | null = null;
            for (const r of t.recs) {
              if (last && Math.abs(r.lon - last.lon) > 180) segments.push([]);
              segments[segments.length - 1].push([r.lat, r.lon]);
              last = r;
            }
            const start = t.recs[0];
            const end = t.recs[t.recs.length - 1];
            return (
              <g key={t.prn}>
                {segments.map((seg, si) =>
                  seg.length >= 2 ? (
                    <map.Polyline
                      key={si}
                      positions={seg}
                      pathOptions={{ color, weight: 1.5, opacity: 0.75 }}
                    />
                  ) : null,
                )}
                <map.CircleMarker
                  center={[start.lat, start.lon]}
                  radius={4}
                  pathOptions={{ color, fillColor: color, fillOpacity: 1, weight: 1 }}
                >
                  <map.Popup>
                    <div className="text-xs">
                      <p className="font-bold">{t.prn} · start</p>
                      <p>Time: {new Date(start.timestamp).toISOString().slice(0, 19)}Z</p>
                      <p>Lat/Lon: {start.lat.toFixed(2)}°, {start.lon.toFixed(2)}°</p>
                    </div>
                  </map.Popup>
                </map.CircleMarker>
                <map.CircleMarker
                  center={[end.lat, end.lon]}
                  radius={4}
                  pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 1, weight: 1.5 }}
                >
                  <map.Popup>
                    <div className="text-xs">
                      <p className="font-bold">{t.prn} · end</p>
                      <p>Time: {new Date(end.timestamp).toISOString().slice(0, 19)}Z</p>
                      <p>Lat/Lon: {end.lat.toFixed(2)}°, {end.lon.toFixed(2)}°</p>
                    </div>
                  </map.Popup>
                </map.CircleMarker>
              </g>
            );
          })}
        </map.MapContainer>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading map…</div>
      )}
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-muted-foreground bg-card/80 rounded-lg px-4 py-2">
            No pierce-point coordinates in dataset — ground track needs <code>lat</code>/<code>lon</code> per epoch.
          </p>
        </div>
      )}
    </div>
  );
}