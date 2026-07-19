---
name: TechLab AI build
description: ML/export/AI features layered onto SatVision AI; architecture and key decisions.
---

# TechLab AI — Layered Build

## What was built
Three new capabilities added to the existing `/data-lab` page via two new page tabs ("Machine Learning", "Export") and a Python AI endpoint.

## Architecture decisions

**Python modules** (in `python_parser/`, importable from `main.py` via `sys.path.insert`):
- `analyzer.py` — cleaning pipeline + descriptive stats + PCA + FFT
- `ml_engine.py` — Isolation Forest, K-Means/DBSCAN, RF, linear forecasting
- `exporter.py` — Excel (openpyxl), Jupyter (nbformat), HTML report

**New FastAPI endpoints** (appended to `python_parser/main.py`):
- `POST /api/py/analyze` — cleaning + stats, JSON body `{csv, filename}`
- `POST /api/py/ml` — full ML pipeline, JSON body `{csv, target_col, contamination, n_clusters}`
- `POST /api/py/export/excel|notebook|html` — file downloads
- `POST /api/py/ai/chat` — OpenAI gpt-4o-mini, needs `OPENAI_API_KEY` secret

**Frontend components**:
- `src/components/techlab/MLPanel.tsx` — sub-tabbed panel (Anomaly/Cluster/Forecast/RF)
- `src/components/techlab/ExportPanel.tsx` — download cards
- `src/routes/data-lab.tsx` — added `PageTab = … | "ml" | "export"`, state, callbacks

**Why JSON body (not multipart)**: data is already parsed client-side as ParsedData; converting back to CSV string and posting as JSON is simpler than re-uploading as a file. Helper `parsedDataToCSV()` in data-lab.tsx does the serialization.

**sys.path trick**: `main.py` adds `os.path.dirname(__file__)` to sys.path so `from analyzer import ...` works when run as `python python_parser/main.py` from workspace root.

## New Python packages
scikit-learn, scipy, openpyxl, nbformat, openai — added to `pyproject.toml`, installed with `uv sync`.

## OPENAI_API_KEY
Must be stored as a Replit Secret (key: `OPENAI_API_KEY`). The AI chat endpoint (`/api/py/ai/chat`) returns HTTP 503 if missing.
