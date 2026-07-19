"""
TechLab AI — Machine Learning Engine
Anomaly Detection · Clustering · Forecasting · Feature Importance
"""
from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Any
import warnings
warnings.filterwarnings("ignore")


def run_anomaly_detection(df: pd.DataFrame, contamination: float = 0.05) -> dict[str, Any]:
    """Isolation Forest + Z-score anomaly detection."""
    num = df.select_dtypes(include=np.number)
    if num.empty or len(num) < 10:
        return {"error": "Need ≥10 rows of numeric data for anomaly detection"}

    X = num.fillna(num.median())
    result: dict[str, Any] = {}

    # Isolation Forest
    try:
        from sklearn.ensemble import IsolationForest
        from sklearn.preprocessing import StandardScaler
        Xs = StandardScaler().fit_transform(X)
        clf = IsolationForest(contamination=contamination, random_state=42, n_estimators=100)
        labels = clf.fit_predict(Xs)
        scores = clf.score_samples(Xs)
        mask = labels == -1
        result["isolation_forest"] = {
            "n_anomalies": int(mask.sum()),
            "anomaly_rate": round(float(mask.mean()), 4),
            "anomaly_indices": num.index[mask].tolist()[:200],
            "all_scores": [round(float(v), 4) for v in scores[:500]],
        }
    except Exception as e:
        result["isolation_forest"] = {"error": str(e)}

    # Z-score per column
    zscore_cols: dict[str, dict] = {}
    for col in list(num.columns)[:8]:
        s = num[col]
        std = float(s.std())
        if std < 1e-10:
            continue
        z = np.abs((s - float(s.mean())) / std)
        mask_z = z > 3
        if mask_z.sum():
            zscore_cols[col] = {
                "count": int(mask_z.sum()),
                "indices": num.index[mask_z].tolist()[:50],
            }
    result["zscore"] = {
        "threshold": 3.0,
        "anomalies_by_column": zscore_cols,
        "total": sum(v["count"] for v in zscore_cols.values()),
    }
    return result


def run_clustering(df: pd.DataFrame, n_clusters: int = 3) -> dict[str, Any]:
    """K-Means + DBSCAN with 2-D PCA projection."""
    num = df.select_dtypes(include=np.number)
    min_rows = max(n_clusters * 2, 10)
    if num.empty or len(num) < min_rows:
        return {"error": f"Need ≥{min_rows} rows for clustering"}

    from sklearn.preprocessing import StandardScaler
    cols = list(num.columns[:6])
    X = num[cols].fillna(num[cols].median())
    Xs = StandardScaler().fit_transform(X)
    result: dict[str, Any] = {"feature_columns": cols}

    # K-Means with silhouette-based auto-k selection
    try:
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score
        k_max = min(8, len(X) // 3)
        k_range = list(range(2, max(3, k_max + 1)))
        best_k, best_sil, best_labels = n_clusters, -1.0, None
        inertias: list[float] = []
        for k in k_range:
            km = KMeans(n_clusters=k, random_state=42, n_init=10)
            lbl = km.fit_predict(Xs)
            inertias.append(float(km.inertia_))
            if len(set(lbl)) > 1:
                sil = float(silhouette_score(Xs, lbl))
                if sil > best_sil:
                    best_sil, best_k, best_labels = sil, k, lbl
        if best_labels is None:
            km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            best_labels = km.fit_predict(Xs)
            best_k = n_clusters
            best_sil = 0.0
        cluster_stats = [{"cluster": c, "size": int((best_labels == c).sum())} for c in range(best_k)]
        result["kmeans"] = {
            "best_k": best_k,
            "silhouette_score": round(best_sil, 4),
            "inertias": [round(v, 2) for v in inertias],
            "k_range": k_range,
            "labels": best_labels.tolist(),
            "cluster_stats": cluster_stats,
        }
    except Exception as e:
        result["kmeans"] = {"error": str(e)}

    # DBSCAN
    try:
        from sklearn.cluster import DBSCAN
        min_samples = max(3, len(X) // 50)
        db = DBSCAN(eps=0.5, min_samples=min_samples)
        db_lbl = db.fit_predict(Xs)
        n_cl = len(set(db_lbl)) - (1 if -1 in db_lbl else 0)
        result["dbscan"] = {
            "n_clusters": n_cl,
            "n_noise": int((db_lbl == -1).sum()),
            "labels": db_lbl.tolist(),
        }
    except Exception as e:
        result["dbscan"] = {"error": str(e)}

    # 2-D PCA projection for visualization
    try:
        from sklearn.decomposition import PCA
        proj = PCA(n_components=2).fit_transform(Xs)
        km_labels = result.get("kmeans", {}).get("labels", [0] * len(X))
        n = min(500, len(proj))
        result["projection_2d"] = {
            "x": [round(float(v), 4) for v in proj[:n, 0]],
            "y": [round(float(v), 4) for v in proj[:n, 1]],
            "labels": km_labels[:n] if isinstance(km_labels, list) else [],
        }
    except Exception:
        pass

    return result


def run_ml_pipeline(df: pd.DataFrame, target_col: str | None = None) -> dict[str, Any]:
    """Random Forest feature importance + linear forecasting."""
    num = df.select_dtypes(include=np.number)
    if num.empty or len(num) < 20:
        return {"error": "Need ≥20 rows of numeric data"}

    result: dict[str, Any] = {}

    # Random Forest regression (if target provided)
    if target_col and target_col in num.columns:
        try:
            from sklearn.ensemble import RandomForestRegressor
            from sklearn.model_selection import train_test_split
            from sklearn.metrics import r2_score, mean_absolute_error
            feats = [c for c in num.columns if c != target_col]
            if feats:
                X = num[feats].fillna(num[feats].median())
                y = num[target_col].fillna(float(num[target_col].median()))
                Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)
                rf = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1, max_depth=8)
                rf.fit(Xtr, ytr)
                pred = rf.predict(Xte)
                result["random_forest"] = {
                    "target": target_col,
                    "features": feats,
                    "r2_score": round(float(r2_score(yte, pred)), 4),
                    "mae": round(float(mean_absolute_error(yte, pred)), 4),
                    "n_train": len(Xtr),
                    "n_test": len(Xte),
                    "feature_importance": [
                        {"feature": f, "importance": round(float(imp), 4)}
                        for f, imp in sorted(zip(feats, rf.feature_importances_), key=lambda x: -x[1])
                    ],
                }
        except Exception as e:
            result["random_forest"] = {"error": str(e)}

    # Linear trend forecasting (first 3 numeric cols)
    try:
        from scipy import stats as sp
        forecasts: dict[str, dict] = {}
        for col in list(num.columns[:3]):
            s = num[col].dropna().values
            if len(s) < 20:
                continue
            x = np.arange(len(s), dtype=float)
            slope, intercept, r, p, _ = sp.linregress(x, s)
            n_fcast = max(5, len(s) // 5)
            xf = np.arange(len(s), len(s) + n_fcast, dtype=float)
            yf = slope * xf + intercept
            residuals = s - (slope * x + intercept)
            se = float(np.sqrt(np.sum(residuals ** 2) / max(len(s) - 2, 1)))
            margin = 1.96 * se
            # Return last 100 history points to keep payload small
            hist_start = max(0, len(s) - 100)
            forecasts[col] = {
                "method": "linear_trend",
                "slope": round(float(slope), 8),
                "r_squared": round(float(r ** 2), 4),
                "p_value": round(float(p), 6),
                "significant": bool(p < 0.05),
                "trend": "increasing" if slope > 1e-10 else ("decreasing" if slope < -1e-10 else "flat"),
                "history_start_idx": hist_start,
                "history_y": [round(float(v), 4) for v in s[hist_start:]],
                "forecast_y": [round(float(v), 4) for v in yf],
                "forecast_lower": [round(float(v - margin), 4) for v in yf],
                "forecast_upper": [round(float(v + margin), 4) for v in yf],
                "n_forecast": n_fcast,
            }
        result["forecasting"] = forecasts
    except Exception as e:
        result["forecasting"] = {"error": str(e)}

    return result
