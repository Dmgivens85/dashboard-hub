# StemQA

StemQA is an AI audio stem separation workbench with a FastAPI backend and a Vite + React frontend.

## Local backend run

Use the shared project virtualenv at `stemqa/.venv` and place Demucs model weights on the external drive:

```bash
cd /Users/denavongivens/dashboard-hub/stemqa/backend
export TORCH_HOME=/Volumes/Expansion/.cache/torch
export STEMQA_OUTPUT_DIR=/Volumes/Expansion/stemqa_output
../.venv/bin/pip install -r requirements.txt
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

## Local separation verification

The local verification run completed against:

- Source: `/Volumes/Expansion/Rubric/all-i-have-to-do-is-dream-everly-brothers-b-3-b-30-c.wav`
- Raw outputs: `/Volumes/Expansion/stemqa_output/local_validation/raw`
- Conformed stems: `/Volumes/Expansion/stemqa_output/local_validation/stems`

## Frontend run

```bash
cd /Users/denavongivens/dashboard-hub/stemqa/frontend
npm install
npm run dev
```

## Hosted backend note

The Render free-tier instance keeps ingest and read-only API support online, but live separation is disabled there and returns:

`Live separation is not available on this instance. Run the backend locally for full separation support.`
