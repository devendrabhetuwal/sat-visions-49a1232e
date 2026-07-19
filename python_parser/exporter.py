"""
TechLab AI — Export Engine
Excel · Jupyter Notebook · HTML Report
"""
from __future__ import annotations
import io
import pandas as pd
import numpy as np
from typing import Any


def export_to_excel(df: pd.DataFrame, stats: dict | None = None) -> bytes:
    """Multi-sheet Excel workbook: Data + Statistics + Correlation."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Data", index=False)
        if stats and "column_stats" in stats:
            pd.DataFrame(stats["column_stats"]).to_excel(writer, sheet_name="Statistics", index=False)
        if stats and "correlation" in stats:
            cd = stats["correlation"]
            pd.DataFrame(cd["matrix"], columns=cd["columns"], index=cd["columns"]).to_excel(
                writer, sheet_name="Correlation"
            )
    return buf.getvalue()


def export_to_notebook(df: pd.DataFrame, filename: str = "data") -> str:
    """Generate a ready-to-run Jupyter notebook with EDA + ML cells."""
    import nbformat
    from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell

    nb = new_notebook()
    csv_snippet = df.head(2000).to_csv(index=False)

    nb.cells = [
        new_markdown_cell(
            f"# TechLab AI Analysis — {filename}\n\n"
            f"> Auto-generated notebook · {len(df):,} rows · {len(df.columns)} columns"
        ),
        # Imports
        new_code_cell(
            "import pandas as pd\n"
            "import numpy as np\n"
            "import matplotlib.pyplot as plt\n"
            "import seaborn as sns\n"
            "from io import StringIO\n"
            "from sklearn.ensemble import IsolationForest\n"
            "from sklearn.cluster import KMeans\n"
            "from sklearn.preprocessing import StandardScaler\n"
            "from sklearn.decomposition import PCA\n\n"
            "plt.style.use('seaborn-v0_8-darkgrid')\n"
            "pd.set_option('display.max_columns', None)\n"
            "pd.set_option('display.float_format', '{:.4f}'.format)"
        ),
        # Load data
        new_markdown_cell("## 1. Load Data"),
        new_code_cell(
            f"csv_data = \"\"\"\\\n{csv_snippet}\"\"\"\n\n"
            "df = pd.read_csv(StringIO(csv_data))\n"
            "print(f'Shape: {df.shape}')\n"
            "df.head()"
        ),
        # Overview
        new_markdown_cell("## 2. Data Overview"),
        new_code_cell("df.info()\nprint('\\n')\ndf.describe()"),
        # Missing values
        new_markdown_cell("## 3. Missing Values"),
        new_code_cell(
            "missing = df.isnull().sum().sort_values(ascending=False)\n"
            "missing = missing[missing > 0]\n"
            "if len(missing):\n"
            "    print(missing)\n"
            "    missing.plot(kind='bar', figsize=(10, 4), title='Missing Values per Column')\n"
            "    plt.tight_layout(); plt.show()\n"
            "else:\n"
            "    print('No missing values ✓')"
        ),
        # Distributions
        new_markdown_cell("## 4. Distributions"),
        new_code_cell(
            "num_cols = df.select_dtypes(include='number').columns[:8].tolist()\n"
            "df[num_cols].hist(bins=25, figsize=(16, 10), edgecolor='white', linewidth=0.3)\n"
            "plt.suptitle('Column Distributions', y=1.02, fontsize=14)\n"
            "plt.tight_layout(); plt.show()"
        ),
        # Correlation
        new_markdown_cell("## 5. Correlation Matrix"),
        new_code_cell(
            "num_df = df.select_dtypes(include='number')\n"
            "if len(num_df.columns) > 1:\n"
            "    fig, ax = plt.subplots(figsize=(12, 10))\n"
            "    sns.heatmap(num_df.corr(), annot=True, fmt='.2f', cmap='coolwarm',\n"
            "                square=True, linewidths=0.5, ax=ax)\n"
            "    plt.title('Correlation Matrix', fontsize=14)\n"
            "    plt.tight_layout(); plt.show()"
        ),
        # Anomaly detection
        new_markdown_cell("## 6. Anomaly Detection (Isolation Forest)"),
        new_code_cell(
            "num_df = df.select_dtypes(include='number').dropna()\n"
            "if len(num_df) >= 10:\n"
            "    Xs = StandardScaler().fit_transform(num_df)\n"
            "    clf = IsolationForest(contamination=0.05, random_state=42)\n"
            "    labels = clf.fit_predict(Xs)\n"
            "    scores = clf.score_samples(Xs)\n"
            "    n_anom = (labels == -1).sum()\n"
            "    print(f'Anomalies: {n_anom} / {len(labels)} ({n_anom/len(labels)*100:.1f}%)')\n"
            "    plt.figure(figsize=(10, 4))\n"
            "    plt.hist(scores, bins=30, color='steelblue', alpha=0.7, edgecolor='white')\n"
            "    plt.axvline(scores[labels==-1].max(), color='red', linestyle='--', label='Anomaly threshold')\n"
            "    plt.title('Isolation Forest Score Distribution')\n"
            "    plt.xlabel('Anomaly Score (lower = more anomalous)')\n"
            "    plt.legend(); plt.tight_layout(); plt.show()"
        ),
        # Clustering
        new_markdown_cell("## 7. K-Means Clustering"),
        new_code_cell(
            "num_df = df.select_dtypes(include='number').dropna()\n"
            "if len(num_df) >= 10:\n"
            "    Xs = StandardScaler().fit_transform(num_df)\n"
            "    # Elbow method\n"
            "    inertias = [KMeans(n_clusters=k, random_state=42, n_init=10).fit(Xs).inertia_\n"
            "                for k in range(2, min(9, len(Xs)//3))]\n"
            "    plt.figure(figsize=(8, 4))\n"
            "    plt.plot(range(2, 2+len(inertias)), inertias, marker='o')\n"
            "    plt.title('Elbow Method'); plt.xlabel('K'); plt.ylabel('Inertia')\n"
            "    plt.tight_layout(); plt.show()\n"
            "    # Fit best k (adjust as needed)\n"
            "    km = KMeans(n_clusters=3, random_state=42, n_init=10)\n"
            "    labels_km = km.fit_predict(Xs)\n"
            "    proj = PCA(n_components=2).fit_transform(Xs)\n"
            "    plt.figure(figsize=(8, 6))\n"
            "    scatter = plt.scatter(proj[:,0], proj[:,1], c=labels_km, cmap='tab10', alpha=0.7)\n"
            "    plt.colorbar(scatter, label='Cluster')\n"
            "    plt.title('K-Means Clusters (PCA projection)')\n"
            "    plt.xlabel('PC1'); plt.ylabel('PC2')\n"
            "    plt.tight_layout(); plt.show()\n"
            "    print(pd.Series(labels_km, name='cluster').value_counts().sort_index())"
        ),
        # Forecasting
        new_markdown_cell("## 8. Trend & Forecasting"),
        new_code_cell(
            "from scipy import stats as sp\n\n"
            "num_col = df.select_dtypes(include='number').columns[0]\n"
            "y = df[num_col].dropna().values\n"
            "x = np.arange(len(y))\n"
            "slope, intercept, r, p, _ = sp.linregress(x, y)\n"
            "n_fcast = max(10, len(y)//5)\n"
            "xf = np.arange(len(y), len(y)+n_fcast)\n"
            "yf = slope*xf + intercept\n"
            "se = np.sqrt(np.sum((y-(slope*x+intercept))**2)/max(len(y)-2,1))\n\n"
            "plt.figure(figsize=(12, 5))\n"
            "plt.plot(x[-100:], y[-100:], label='Historical', color='steelblue', linewidth=1.5)\n"
            "plt.plot(xf, yf, '--', color='tomato', linewidth=2, label='Forecast')\n"
            "plt.fill_between(xf, yf-1.96*se, yf+1.96*se, color='tomato', alpha=0.15, label='95% CI')\n"
            "plt.title(f'{num_col}: Linear Trend (slope={slope:.4f}, R²={r**2:.4f}, p={p:.4f})')\n"
            "plt.legend(); plt.tight_layout(); plt.show()"
        ),
    ]
    return nbformat.writes(nb)


def export_to_html(df: pd.DataFrame, stats: dict | None, ml: dict | None, filename: str = "data") -> str:
    """Styled dark-theme HTML report."""
    col_stats = stats.get("column_stats", []) if stats else []
    n_anom = 0
    if ml and "isolation_forest" in (ml.get("anomalies") or {}):
        n_anom = (ml["anomalies"]["isolation_forest"] or {}).get("n_anomalies", 0)

    rows_html = ""
    for s in col_stats:
        missing_style = " style='color:#f59e0b'" if s.get("missing", 0) > 0 else ""
        skew = s.get("skewness", 0)
        skew_badge = ""
        if abs(skew) > 1:
            skew_badge = f" <span style='color:#f59e0b;font-size:10px'>skewed</span>"
        rows_html += (
            f"<tr>"
            f"<td style='font-family:monospace;color:#6ec6f5'>{s['column']}</td>"
            f"<td>{s['count']:,}</td>"
            f"<td{missing_style}>{s['missing']}</td>"
            f"<td>{s['mean']:.4g}</td><td>{s['median']:.4g}</td>"
            f"<td>{s['std']:.4g}</td>"
            f"<td>{s['min']:.4g}</td><td>{s['max']:.4g}</td>"
            f"<td>{skew:.3f}{skew_badge}</td>"
            f"<td>{s.get('kurtosis', 0):.3f}</td>"
            f"</tr>"
        )

    n_numeric = len(df.select_dtypes(include="number").columns)
    missing_total = int(df.isnull().sum().sum())

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TechLab AI Report — {filename}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e2e8f0;line-height:1.6}}
  .wrap{{max-width:1200px;margin:0 auto;padding:48px 24px}}
  h1{{font-size:2.25rem;font-weight:800;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px}}
  h2{{font-size:1.05rem;font-weight:700;color:#e2e8f0;margin:36px 0 14px;border-left:3px solid #00d4ff;padding-left:12px;letter-spacing:-.01em}}
  .meta{{color:#64748b;font-size:.85rem;margin-bottom:36px}}
  .meta strong{{color:#94a3b8}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px}}
  .card{{background:#111827;border:1px solid #1e293b;border-radius:14px;padding:22px 18px;text-align:center}}
  .card-val{{font-size:2.1rem;font-weight:800;color:#00d4ff;font-variant-numeric:tabular-nums}}
  .card-lbl{{font-size:.68rem;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:5px}}
  .tbl-wrap{{background:#111827;border:1px solid #1e293b;border-radius:14px;padding:0;overflow:hidden;margin-bottom:24px}}
  table{{width:100%;border-collapse:collapse;font-size:.82rem}}
  thead{{background:#1a2235}}
  th{{padding:11px 14px;text-align:left;font-weight:600;color:#64748b;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}}
  td{{padding:10px 14px;border-bottom:1px solid #1a2235;color:#cbd5e1}}
  tr:last-child td{{border-bottom:none}}
  tr:hover td{{background:#0f172a}}
  .footer{{margin-top:48px;padding-top:24px;border-top:1px solid #1e293b;color:#334155;font-size:.78rem;text-align:center}}
</style>
</head>
<body>
<div class="wrap">
  <h1>TechLab AI Analysis Report</h1>
  <p class="meta">
    File: <strong>{filename}</strong> &nbsp;·&nbsp;
    Generated: <strong>{pd.Timestamp.now().strftime('%Y-%m-%d %H:%M UTC')}</strong>
  </p>

  <div class="grid">
    <div class="card"><div class="card-val">{len(df):,}</div><div class="card-lbl">Total Rows</div></div>
    <div class="card"><div class="card-val">{len(df.columns)}</div><div class="card-lbl">Columns</div></div>
    <div class="card"><div class="card-val">{n_numeric}</div><div class="card-lbl">Numeric Cols</div></div>
    <div class="card"><div class="card-val" style="color:{'#f87171' if missing_total else '#34d399'}">{missing_total:,}</div><div class="card-lbl">Missing Values</div></div>
    <div class="card"><div class="card-val" style="color:{'#f87171' if n_anom else '#34d399'}">{n_anom}</div><div class="card-lbl">Anomalies</div></div>
  </div>

  <h2>Statistical Summary</h2>
  <div class="tbl-wrap">
    <table>
      <thead>
        <tr><th>Column</th><th>Count</th><th>Missing</th><th>Mean</th><th>Median</th><th>Std Dev</th><th>Min</th><th>Max</th><th>Skewness</th><th>Kurtosis</th></tr>
      </thead>
      <tbody>{rows_html if rows_html else '<tr><td colspan="10" style="text-align:center;color:#64748b;padding:20px">No numeric columns</td></tr>'}</tbody>
    </table>
  </div>

  <h2>Dataset Preview (first 30 rows)</h2>
  <div class="tbl-wrap" style="overflow-x:auto">
    {df.head(30).to_html(border=0, index=False, classes="")}
  </div>

  <div class="footer">Generated by TechLab AI · Scientific Data Analysis Platform</div>
</div>
</body>
</html>"""
