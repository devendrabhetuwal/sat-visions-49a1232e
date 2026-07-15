import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface GeoMapProps {
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  overlayUrl?: string | null;
  basemap?: "satellite" | "streets" | "terrain";
}

const BASEMAPS = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri, Maxar, Earthstar Geographics",
  },
  streets: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "© OpenStreetMap",
  },
  terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri",
  },
};

export function GeoMap({ bbox, overlayUrl, basemap = "satellite" }: GeoMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([20, 0], 2);
    mapRef.current = map;
    const b = BASEMAPS[basemap];
    baseLayerRef.current = L.tileLayer(b.url, { attribution: b.attr, maxZoom: 19 }).addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    if (baseLayerRef.current) baseLayerRef.current.remove();
    const b = BASEMAPS[basemap];
    baseLayerRef.current = L.tileLayer(b.url, { attribution: b.attr, maxZoom: 19 }).addTo(mapRef.current);
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
    }
    if (bbox && overlayUrl) {
      const bounds: L.LatLngBoundsExpression = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ];
      overlayRef.current = L.imageOverlay(overlayUrl, bounds, { opacity: 0.8 }).addTo(map);
      map.fitBounds(bounds, { padding: [24, 24] });
    } else if (bbox) {
      const bounds: L.LatLngBoundsExpression = [
        [bbox[1], bbox[0]],
        [bbox[3], bbox[2]],
      ];
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [bbox, overlayUrl]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl" style={{ minHeight: 360 }} />;
}
