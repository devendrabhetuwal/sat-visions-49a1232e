import { fromArrayBuffer, type GeoTIFF, type GeoTIFFImage } from "geotiff";

export interface GeoTiffMeta {
  width: number;
  height: number;
  samplesPerPixel: number;
  bandCount: number;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY] in image CRS
  bboxLatLng: [number, number, number, number] | null; // approx if geographic
  resolution: [number, number];
  origin: number[];
  geoKeys: Record<string, unknown> | null;
  projected: boolean;
  epsg?: number;
}

export interface LoadedTiff {
  tiff: GeoTIFF;
  image: GeoTIFFImage;
  meta: GeoTiffMeta;
}

export async function loadGeoTiff(file: File): Promise<LoadedTiff> {
  const buf = await file.arrayBuffer();
  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const bbox = image.getBoundingBox() as [number, number, number, number];
  const resolution = image.getResolution() as [number, number];
  const origin = image.getOrigin();
  const geoKeys = image.getGeoKeys();
  const epsg = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey;
  const projected = Boolean(geoKeys?.ProjectedCSTypeGeoKey);

  // Assume EPSG:4326 if geographic and bbox looks like lat/lng range
  let bboxLatLng: [number, number, number, number] | null = null;
  if (!projected && bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90) {
    bboxLatLng = bbox;
  }

  const meta: GeoTiffMeta = {
    width: image.getWidth(),
    height: image.getHeight(),
    samplesPerPixel: image.getSamplesPerPixel(),
    bandCount: image.getSamplesPerPixel(),
    bbox,
    bboxLatLng,
    resolution,
    origin,
    geoKeys: geoKeys as Record<string, unknown> | null,
    projected,
    epsg: typeof epsg === "number" ? epsg : undefined,
  };
  return { tiff, image, meta };
}

/** Compute normalized index (a - b) / (a + b) with basic stats. */
export function computeIndex(a: Float32Array | Uint16Array | Int16Array, b: Float32Array | Uint16Array | Int16Array) {
  const n = a.length;
  const out = new Float32Array(n);
  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  const hist = new Array(20).fill(0);
  for (let i = 0; i < n; i++) {
    const av = a[i] as number;
    const bv = b[i] as number;
    const denom = av + bv;
    if (!denom || !isFinite(denom)) { out[i] = NaN; continue; }
    const v = (av - bv) / denom;
    out[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v; count++;
    const bucket = Math.min(19, Math.max(0, Math.floor((v + 1) * 10)));
    hist[bucket]++;
  }
  return { data: out, min, max, mean: count ? sum / count : 0, count, histogram: hist };
}

/** Render a Float32 index array as a colorized PNG data URL (blue-white-green). */
export function renderIndexToDataURL(
  data: Float32Array,
  width: number,
  height: number,
  colormap: "ndvi" | "ndwi" | "gray" = "ndvi",
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);

  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    let r = 0, g = 0, b = 0, a = 255;
    if (!isFinite(v)) { a = 0; }
    else {
      const t = Math.min(1, Math.max(0, (v + 1) / 2));
      if (colormap === "ndvi") {
        // brown -> yellow -> green
        if (t < 0.5) {
          const k = t * 2;
          r = 139 + (255 - 139) * k; g = 90 + (230 - 90) * k; b = 43 + (100 - 43) * k;
        } else {
          const k = (t - 0.5) * 2;
          r = 255 - 255 * k; g = 230 - 100 * k; b = 100 - 100 * k;
        }
      } else if (colormap === "ndwi") {
        // brown -> white -> blue
        if (t < 0.5) {
          const k = t * 2;
          r = 160 + (240 - 160) * k; g = 120 + (240 - 120) * k; b = 60 + (240 - 60) * k;
        } else {
          const k = (t - 0.5) * 2;
          r = 240 - 200 * k; g = 240 - 100 * k; b = 240 + 15 * k;
        }
      } else {
        r = g = b = t * 255;
      }
    }
    const idx = i * 4;
    imgData.data[idx] = r;
    imgData.data[idx + 1] = g;
    imgData.data[idx + 2] = b;
    imgData.data[idx + 3] = a;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}
