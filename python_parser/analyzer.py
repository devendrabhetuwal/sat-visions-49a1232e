"""
TechLab AI — Data Cleaning & Statistical Analysis Engine
"""
from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Any
import warnings
warnings.filterwarnings("ignore")


def _safe_float(v: Any) -> float:
    try:
        f = float(v)
        return f if np.isfinite(f) else 0.0
    except Exception:
        return 0.0


def clean_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    """Full automated cleaning pipeline. Returns {df, report}."""
    report: list[dict] = []
    original_shape = df.shape

    # 1. Drop fully-empty columns
    empty_cols = [c for c in df.columns if df[c].isna().all()]
    if empty_cols:
        df = df.drop(columns=empty_cols)
        report.append({"type": "removed_empty_cols", "severity": "info",
                        "detail": f"Removed {len(empty_cols)} fully-empty column(s): {empty_cols[:5]}",
                        "count": len(empty_cols)})

    # 2. Drop fully-empty rows
    before = len(df)
    df = df.dropna(how="all")
    removed = before - len(df)
    if removed:
        report.append({"type": "removed_empty_rows", "severity": "info",
                        "detail": f"Removed {removed} fully-empty row(s)", "count": removed})

    # 3. Remove duplicate rows
    dup = int(df.duplicated().sum())
    if dup:
        df = df.drop_duplicates()
        report.append({"type": "removed_duplicates", "severity": "warning",
                        "detail": f"Removed {dup} duplicate row(s)", "count": dup})

    # 4. Try to parse object columns as datetime
    for col in list(df.select_dtypes(include="object").columns):
        try:
            parsed = pd.to_datetime(df[col], format="mixed", errors="coerce")
            if parsed.notna().sum() / max(len(df), 1) > 0.8:
                df[col] = parsed
                report.append({"type": "parsed_datetime", "severity": "info",
                                "detail": f"Column '{col}' parsed as datetime", "count": 1})
        except Exception:
            pass

    # 5. Convert remaining object columns to numeric where possible
    for col in list(df.select_dtypes(include="object").columns):
        numeric = pd.to_numeric(df[col], errors="coerce")
        if numeric.notna().sum() / max(len(df), 1) > 0.8:
            df[col] = numeric
            report.append({"type": "converted_numeric", "severity": "info",
                            "detail": f"Column '{col}' converted to numeric", "count": 1})

    # 6. Flag constant-value columns
    const_cols = [c for c in df.columns if df[c].nunique(dropna=True) <= 1]
    if const_cols:
        report.append({"type": "constant_cols", "severity": "warning",
                        "detail": f"{len(const_cols)} zero-variance column(s): {const_cols[:5]}",
                        "count": len(const_cols)})

    # 7. Impute missing numeric values with median
    total_imputed = 0
    imputed_cols: list[str] = []
    for col in df.select_dtypes(include=np.number).columns:
        missing = int(df[col].isna().sum())
        if missing:
            df[col] = df[col].fillna(float(df[col].median()))
            total_imputed += missing
            imputed_cols.append(col)
    if total_imputed:
        report.append({"type": "imputed_missing", "severity": "warning",
                        "detail": f"Imputed {total_imputed} missing numeric value(s) (median) across {len(imputed_cols)} column(s)",
                        "count": total_imputed, "columns": imputed_cols[:10]})

    # 8. Fill missing string values
    str_imputed = 0
    for col in df.select_dtypes(include="object").columns:
        missing = int(df[col].isna().sum())
        if missing:
            df[col] = df[col].fillna("Unknown")
            str_imputed += missing
    if str_imputed:
        report.append({"type": "imputed_string", "severity": "info",
                        "detail": f"Filled {str_imputed} missing string value(s) with 'Unknown'",
                        "count": str_imputed})

    # 9. Extreme outlier detection (3×IQR)
    outlier_cols: dict[str, int] = {}
    for col in df.select_dtypes(include=np.number).columns:
        q1 = df[col].quantile(0.25)
        q3 = df[col].quantile(0.75)
        iqr = q3 - q1
        if iqr > 0:
            mask = (df[col] < q1 - 3 * iqr) | (df[col] > q3 + 3 * iqr)
            n = int(mask.sum())
            if n:
                outlier_cols[col] = n
    if outlier_cols:
        total = sum(outlier_cols.values())
        report.append({"type": "outliers_detected", "severity": "error",
                        "detail": f"Detected {total} extreme outlier(s) (3×IQR) across {len(outlier_cols)} column(s)",
                        "count": total, "columns": outlier_cols})

    final_shape = df.shape
    report.insert(0, {
        "type": "summary", "severity": "info",
        "detail": f"Cleaned: {original_shape[0]}×{original_shape[1]} → {final_shape[0]}×{final_shape[1]}",
        "original_rows": original_shape[0], "original_cols": original_shape[1],
        "final_rows": final_shape[0], "final_cols": final_shape[1],
        "count": original_shape[0] - final_shape[0],
    })
    return {"df": df, "report": report}


def compute_statistics(df: pd.DataFrame) -> dict[str, Any]:
    """Comprehensive statistical analysis."""
    numeric_df = df.select_dtypes(include=np.number)
    if numeric_df.empty:
        return {"error": "No numeric columns found"}

    # Descriptive stats
    col_stats: list[dict] = []
    for col in numeric_df.columns:
        s = numeric_df[col].dropna()
        if len(s) < 2:
            continue
        q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
        col_stats.append({
            "column": col,
            "count": int(len(s)),
            "missing": int(df[col].isna().sum()),
            "mean":     round(_safe_float(s.mean()), 6),
            "median":   round(_safe_float(s.median()), 6),
            "std":      round(_safe_float(s.std()), 6),
            "min":      round(_safe_float(s.min()), 6),
            "max":      round(_safe_float(s.max()), 6),
            "q1":       round(q1, 6),
            "q3":       round(q3, 6),
            "iqr":      round(q3 - q1, 6),
            "skewness": round(_safe_float(s.skew()), 4) if len(s) > 2 else 0.0,
            "kurtosis": round(_safe_float(s.kurtosis()), 4) if len(s) > 3 else 0.0,
            "cv":       round(_safe_float(s.std() / s.mean()), 4) if s.mean() != 0 else 0.0,
        })
    result: dict[str, Any] = {"column_stats": col_stats}

    # Correlation matrix
    valid_cols = [c for c in numeric_df.columns if numeric_df[c].nunique() > 1]
    if len(valid_cols) >= 2:
        corr = numeric_df[valid_cols].corr().round(4).fillna(0)
        result["correlation"] = {
            "columns": list(valid_cols),
            "matrix": corr.values.tolist(),
        }

    # Histograms (up to 8 cols)
    histograms: dict[str, dict] = {}
    for col in list(numeric_df.columns)[:8]:
        s = numeric_df[col].dropna()
        if len(s) < 5:
            continue
        counts, edges = np.histogram(s, bins=20)
        histograms[col] = {
            "counts": counts.tolist(),
            "edges": [round(float(e), 6) for e in edges],
        }
    result["histograms"] = histograms

    # PCA (≥3 numeric cols)
    if len(valid_cols) >= 3 and len(numeric_df) >= 10:
        try:
            from sklearn.preprocessing import StandardScaler
            from sklearn.decomposition import PCA
            X = numeric_df[valid_cols].dropna()
            n = min(3, len(valid_cols), len(X))
            Xs = StandardScaler().fit_transform(X)
            pca = PCA(n_components=n)
            pca.fit(Xs)
            result["pca"] = {
                "explained_variance_ratio": [round(float(v), 4) for v in pca.explained_variance_ratio_],
                "components": [[round(float(v), 4) for v in row] for row in pca.components_],
                "feature_names": list(valid_cols),
                "n_components": n,
            }
        except Exception as e:
            result["pca"] = {"error": str(e)}

    # Trend detection
    try:
        from scipy import stats as sp_stats
        trends: dict[str, dict] = {}
        for col in list(valid_cols)[:6]:
            y = numeric_df[col].dropna().values
            if len(y) < 10:
                continue
            x = np.arange(len(y), dtype=float)
            slope, _, r, p, _ = sp_stats.linregress(x, y)
            trends[col] = {
                "slope": round(float(slope), 8),
                "r_squared": round(float(r ** 2), 4),
                "p_value": round(float(p), 6),
                "significant": bool(p < 0.05),
                "trend": "increasing" if slope > 1e-10 else ("decreasing" if slope < -1e-10 else "flat"),
            }
        if trends:
            result["trends"] = trends
    except Exception:
        pass

    # FFT
    if valid_cols:
        col = valid_cols[0]
        s = numeric_df[col].dropna().values
        if len(s) >= 32:
            try:
                sig = s - s.mean()
                fft_mag = np.abs(np.fft.rfft(sig))
                freqs = np.fft.rfftfreq(len(s))
                top = [i for i in np.argsort(fft_mag)[-10:][::-1] if i > 0]
                result["fft"] = {
                    "column": col,
                    "dominant_frequencies": [round(float(freqs[i]), 6) for i in top],
                    "magnitudes": [round(float(fft_mag[i]), 4) for i in top],
                }
            except Exception:
                pass

    return result
