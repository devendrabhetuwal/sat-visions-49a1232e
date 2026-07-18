"""
SatVision AI — Python parser backend
Converts RINEX / HDF5 / NetCDF → CSV for the browser TEC Lab.
Runs on port 5001.
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile, os, io, traceback
import numpy as np
import pandas as pd

app = FastAPI(title="SatVision Python Parser", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── GPS frequency constants ────────────────────────────────────────────────────
F1 = 1575.42e6   # L1 Hz
F2 = 1227.60e6   # L2 Hz
# STEC (TECU) = K × (P2 - P1)  where K ≈ 9.521
_K = (F1**2 * F2**2) / (40.308 * (F2**2 - F1**2) * 1e16)
# sign: P2-P1 negative because L2 delay > L1, so we use F1²-F2² below
STEC_FACTOR = (F1**2 * F2**2) / (40.308e16 * (F1**2 - F2**2))

# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/api/py/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# ── RINEX parser ───────────────────────────────────────────────────────────────
@app.post("/api/py/parse/rinex")
async def parse_rinex(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "obs.rnx")[1] or ".rnx"
    content = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        import georinex as gr
        obs = gr.load(tmp_path, use="C1 P1 P2 C2 L1 L2", verbose=False)
        rows = []
        # obs is an xarray.Dataset with dims (time, sv)
        svs = obs.sv.values if "sv" in obs.dims else []
        times = obs.time.values if "time" in obs.dims else []
        # Station name from header
        station = "UNK"
        try:
            hdr = gr.rinexheader(tmp_path)
            station = (hdr.get("MARKER NAME") or hdr.get("marker name") or "UNK").strip()[:4] or "UNK"
        except Exception:
            pass

        for sv in svs:
            sv_str = str(sv)
            for i, t in enumerate(times):
                row: dict = {}
                row["datetime"]  = str(pd.Timestamp(t).isoformat())
                row["station"]   = station
                row["prn"]       = sv_str
                row["elevation"] = 0.0
                row["azimuth"]   = 0.0
                row["lat"]       = 0.0
                row["lon"]       = 0.0

                # Get pseudoranges — prefer P1/P2, fallback to C1/C2
                p1 = _get_val(obs, "P1", i, sv)
                p2 = _get_val(obs, "P2", i, sv)
                c1 = _get_val(obs, "C1", i, sv)
                c2 = _get_val(obs, "C2", i, sv)

                pr1 = p1 if not np.isnan(p1) else c1
                pr2 = p2 if not np.isnan(p2) else c2

                if np.isnan(pr1) or np.isnan(pr2) or pr1 == 0 or pr2 == 0:
                    continue

                # Compute geometry-free (ionospheric) combination
                # P_iono = P2 - P1  (positive when TEC > 0)
                p_iono = pr2 - pr1
                stec = abs(STEC_FACTOR * p_iono)
                if stec <= 0 or stec > 300:
                    continue

                row["sTEC"] = round(stec, 3)
                row["vTEC"] = round(stec, 3)   # VTEC needs mapping fn + elev
                rows.append(row)

        if not rows:
            raise HTTPException(status_code=422, detail="No dual-frequency pseudorange data found in RINEX file. Ensure file contains P1+P2 or C1+C2 observations.")

        df = pd.DataFrame(rows)
        return JSONResponse({"csv": df.to_csv(index=False), "rows": len(rows), "format": "rinex"})

    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"RINEX parse error: {e}\n{tb}")
    finally:
        os.unlink(tmp_path)


def _get_val(obs, key: str, time_idx: int, sv) -> float:
    try:
        if key not in obs:
            return float("nan")
        val = obs[key].sel(sv=sv).values[time_idx]
        v = float(val)
        return float("nan") if np.isnan(v) else v
    except Exception:
        return float("nan")


# ── HDF5 parser ────────────────────────────────────────────────────────────────
@app.post("/api/py/parse/hdf5")
async def parse_hdf5(file: UploadFile = File(...)):
    content = await file.read()
    try:
        import h5py
        buf = io.BytesIO(content)
        with h5py.File(buf, "r") as f:
            info = _hdf5_describe(f)
            df = _hdf5_to_dataframe(f)

        if df is None or df.empty:
            raise HTTPException(status_code=422, detail=f"Could not extract tabular TEC data. HDF5 structure:\n{info}")

        # Normalise column names to TEC Lab schema
        df = _normalise_columns(df)
        if "sTEC" not in df.columns and "vTEC" not in df.columns:
            raise HTTPException(status_code=422,
                detail=f"No TEC column found. Detected columns: {list(df.columns)}\nHDF5 structure:\n{info}")

        return JSONResponse({"csv": df.to_csv(index=False), "rows": len(df), "format": "hdf5"})

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HDF5 parse error: {e}\n{traceback.format_exc()}")


def _hdf5_describe(f, prefix="", lines=None, depth=0):
    if lines is None:
        lines = []
    for k, v in f.items():
        import h5py
        if isinstance(v, h5py.Group):
            lines.append(f"{'  '*depth}[group] {prefix}{k}/")
            if depth < 3:
                _hdf5_describe(v, f"{prefix}{k}/", lines, depth+1)
        else:
            lines.append(f"{'  '*depth}[dataset] {prefix}{k} shape={v.shape} dtype={v.dtype}")
    return "\n".join(lines[:60])


def _hdf5_to_dataframe(f):
    """Try to find the main TEC dataset and return a DataFrame."""
    import h5py
    # Strategy 1: look for a dataset with TEC-like name
    tec_keys = []
    _find_tec_datasets(f, tec_keys)
    if tec_keys:
        key = tec_keys[0]
        data = f[key][()]
        if data.ndim == 1:
            return pd.DataFrame({"vTEC": data})
        elif data.ndim == 2:
            # rows=time, cols=prn or lat
            cols = [f"col_{i}" for i in range(data.shape[1])]
            return pd.DataFrame(data, columns=cols)

    # Strategy 2: find the largest 2D numeric dataset
    best = (None, 0)
    _find_largest_dataset(f, best_holder=best)
    if best[0] is not None:
        data = f[best[0]][()]
        if data.ndim == 2:
            cols = [f"col_{i}" for i in range(data.shape[1])]
            return pd.DataFrame(data, columns=cols)
        elif data.ndim == 1:
            return pd.DataFrame({"value": data})

    # Strategy 3: flatten all 1-D numeric datasets into columns
    cols = {}
    _collect_1d(f, cols)
    if cols:
        min_len = min(len(v) for v in cols.values())
        return pd.DataFrame({k: v[:min_len] for k, v in cols.items()})

    return None


def _find_tec_datasets(group, result, prefix=""):
    import h5py
    import re
    tec_re = re.compile(r"tec|vtec|stec|iono|tecu", re.IGNORECASE)
    for k, v in group.items():
        path = f"{prefix}/{k}"
        if isinstance(v, h5py.Group):
            _find_tec_datasets(v, result, path)
        elif tec_re.search(k) and v.ndim >= 1 and np.issubdtype(v.dtype, np.number):
            result.append(path[1:])  # strip leading /


def _find_largest_dataset(group, prefix="", best_holder=None):
    import h5py
    for k, v in group.items():
        path = f"{prefix}/{k}"
        if isinstance(v, h5py.Group):
            _find_largest_dataset(v, path, best_holder)
        elif v.ndim >= 1 and np.issubdtype(v.dtype, np.number):
            size = int(np.prod(v.shape))
            if best_holder and size > best_holder[1]:
                best_holder = (path[1:], size)


def _collect_1d(group, result, prefix=""):
    import h5py
    for k, v in group.items():
        if isinstance(v, h5py.Group):
            _collect_1d(v, result, f"{prefix}{k}_")
        elif v.ndim == 1 and np.issubdtype(v.dtype, np.number) and len(v) < 1_000_000:
            result[f"{prefix}{k}"] = v[()]


# ── NetCDF parser ──────────────────────────────────────────────────────────────
@app.post("/api/py/parse/netcdf")
async def parse_netcdf(file: UploadFile = File(...)):
    content = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".nc") as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        import xarray as xr
        ds = xr.open_dataset(tmp_path, engine="netcdf4")
        desc = str(ds)

        # Try to find TEC variables
        import re
        tec_re = re.compile(r"tec|vtec|stec|iono|tecu", re.IGNORECASE)
        tec_vars = [v for v in ds.data_vars if tec_re.search(v)]

        if tec_vars:
            sub = ds[tec_vars]
        else:
            sub = ds  # use all variables

        try:
            df = sub.to_dataframe().reset_index()
        except Exception:
            # Fall back: flatten each variable
            frames = []
            for v in sub.data_vars:
                arr = sub[v].values.flatten()
                frames.append(pd.Series(arr, name=v))
            df = pd.concat(frames, axis=1)

        df = df.dropna(how="all")
        if df.empty:
            raise HTTPException(status_code=422, detail=f"No data extracted. Dataset:\n{desc}")

        df = _normalise_columns(df)
        if "sTEC" not in df.columns and "vTEC" not in df.columns:
            raise HTTPException(status_code=422,
                detail=f"No TEC column found. Variables: {list(ds.data_vars)}\nDataset:\n{desc}")

        # Limit size
        if len(df) > 500_000:
            df = df.sample(500_000, random_state=42).sort_index()

        return JSONResponse({"csv": df.to_csv(index=False), "rows": len(df), "format": "netcdf"})

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"NetCDF parse error: {e}\n{traceback.format_exc()}")
    finally:
        os.unlink(tmp_path)


# ── Column normaliser ──────────────────────────────────────────────────────────
_COL_MAP = {
    r"(v_?tec|vert.*tec|tec_v|vtec)": "vTEC",
    r"(s_?tec|slant.*tec|tec_s|stec)": "sTEC",
    r"(tec|tecu)": "vTEC",
    r"(prn|sv|svid|sat|satellite)": "prn",
    r"(station|site|receiver|rcvr|sta)": "station",
    r"(datetime|time|epoch|timestamp|date_time)": "datetime",
    r"(lat|latitude|glat)": "lat",
    r"(lon|long|longitude|glon)": "lon",
    r"(elev|elevation|el)": "elevation",
    r"(az|azimuth|azi)": "azimuth",
}

def _normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    import re
    rename = {}
    for col in df.columns:
        for pattern, canonical in _COL_MAP.items():
            if re.fullmatch(pattern, str(col), re.IGNORECASE):
                if canonical not in rename.values():
                    rename[col] = canonical
                break
    return df.rename(columns=rename)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001, log_level="info")
