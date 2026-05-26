from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import soundfile as sf
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from flag_detection import analyze_flags
from ingest import SUPPORTED_SCORE_EXTENSIONS, validate
from naming import build_name
from null_test import null_test
from separation import conform_stem_outputs, separate

app = FastAPI(title="StemQA API")

BASE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = BASE_DIR / "runtime"
UPLOADS_DIR = RUNTIME_DIR / "uploads"
JOBS_DIR = RUNTIME_DIR / "jobs"
RESIDUALS_DIR = RUNTIME_DIR / "residuals"
DEFAULT_EXPORT_DIR = RUNTIME_DIR / "exports"
DEFAULT_ALLOWED_ORIGINS = (
    "https://dmgivens85.github.io",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
)
LIVE_SEPARATION_DISABLED_MESSAGE = (
    "Live separation is not available on this instance. Run the backend locally for full separation support."
)

for directory in (UPLOADS_DIR, JOBS_DIR, RESIDUALS_DIR, DEFAULT_EXPORT_DIR):
    directory.mkdir(parents=True, exist_ok=True)

JOBS: dict[str, dict[str, Any]] = {}

STEM_COLORS = [
    "#E82076",
    "#2ab76e",
    "#4f8ff7",
    "#f4a259",
    "#9b5de5",
    "#00a6a6",
    "#c0392b",
    "#7f8c8d",
]


def _allowed_origins() -> list[str]:
    configured = os.getenv("STEMQA_ALLOWED_ORIGINS", "")
    if configured.strip():
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return list(DEFAULT_ALLOWED_ORIGINS)


def _live_separation_disabled() -> bool:
    configured = os.getenv("STEMQA_DISABLE_SEPARATION", "")
    return configured.strip().lower() in {"1", "true", "yes", "on"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SeparationRequest(BaseModel):
    file_path: str
    score_path: str | None = None
    model: str = "HTDemucs FT"
    overlap: int = Field(default=8, ge=2, le=16)
    shifts: int = Field(default=2, ge=0, le=4)
    stems: list[dict[str, Any]] = Field(default_factory=list)


class NullTestRequest(BaseModel):
    stem_paths: list[str]
    source_path: str


class ExportRequest(BaseModel):
    job_id: str
    session_meta: dict[str, Any] = Field(default_factory=dict)
    flags: list[dict[str, Any]] = Field(default_factory=list)


def _copy_upload(upload: UploadFile, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)


def _format_size(size_bytes: int) -> str:
    size = float(size_bytes)
    units = ["B", "KB", "MB", "GB"]
    for unit in units:
        if size < 1024.0 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size_bytes} B"


def _source_type_from_part_count(part_count: int) -> str:
    if part_count <= 2:
        return "Solo"
    if part_count <= 12:
        return "Chamber"
    return "Orchestra"


def _parse_score(score_path: Path) -> dict[str, Any]:
    suffix = score_path.suffix.lower()
    if suffix not in SUPPORTED_SCORE_EXTENSIONS:
        return {
            "status": "unsupported",
            "message": "Unsupported score format.",
            "part_count": 0,
            "bar_count": 0,
            "instruments": [],
            "source_type": "Unknown",
        }

    if suffix == ".sib":
        return {
            "status": "uploaded",
            "message": ".sib upload saved; parsing requires an exported MusicXML file in this scaffold.",
            "part_count": 0,
            "bar_count": 0,
            "instruments": [],
            "source_type": "Unknown",
        }

    try:
        from music21 import converter
    except ImportError:
        return {
            "status": "unavailable",
            "message": "music21 is not installed yet, so score parsing is unavailable.",
            "part_count": 0,
            "bar_count": 0,
            "instruments": [],
            "source_type": "Unknown",
        }

    score = converter.parse(str(score_path))
    parts = list(score.parts)
    instruments: list[str] = []
    bar_count = 0

    for index, part in enumerate(parts, start=1):
        instrument = part.getInstrument(returnDefault=True)
        name = part.partName or getattr(instrument, "partName", None) or instrument.instrumentName or f"Part {index}"
        instruments.append(str(name))
        measures = list(part.getElementsByClass("Measure"))
        bar_count = max(bar_count, len(measures))

    source_type = _source_type_from_part_count(len(instruments)) if instruments else "Unknown"
    return {
        "status": "parsed",
        "message": "Score parsed successfully.",
        "part_count": len(instruments),
        "bar_count": bar_count,
        "instruments": instruments,
        "source_type": source_type,
    }


def _build_stem_rows(instruments: list[str]) -> list[dict[str, Any]]:
    stems: list[dict[str, Any]] = []
    for index, instrument in enumerate(instruments):
        stems.append(
            {
                "id": f"stem-{index + 1}",
                "instrument": instrument,
                "source_badge": "score",
                "detection_confidence": 1.0,
                "stem_type": "IsolatedStem",
                "color": STEM_COLORS[index % len(STEM_COLORS)],
            }
        )
    return stems


def _score_check(score_info: dict[str, Any]) -> dict[str, Any]:
    status_map = {
        "parsed": "pass",
        "uploaded": "warn",
        "unsupported": "warn",
        "unavailable": "warn",
    }
    return {
        "label": "Sibelius score",
        "value": score_info["status"],
        "status": status_map.get(score_info["status"], "info"),
        "note": score_info["message"],
    }


def _source_type_check(source_type: str) -> dict[str, Any]:
    if source_type in {"Chamber", "Orchestra"}:
        status = "warn"
        note = "Medium confidence ceiling note applies for chamber and orchestra sources."
    elif source_type == "Solo":
        status = "pass"
        note = "Source type was derived from the uploaded score."
    else:
        status = "info"
        note = "No score-derived source type is available in this scaffold."
    return {"label": "Source type", "value": source_type, "status": status, "note": note}


def _serialize_stems(
    stem_paths: list[str],
    requested_stems: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    requested_stems = requested_stems or []

    for index, stem_path in enumerate(stem_paths):
        path = Path(stem_path)
        requested = requested_stems[index] if index < len(requested_stems) else {}
        display_name = requested.get("instrument") or path.stem
        rows.append(
            {
                "name": display_name,
                "raw_name": path.stem,
                "path": str(path),
                "filename": path.name,
                "stem_type": requested.get("stem_type", "IsolatedStem"),
            }
        )
    return rows


def _job_progress(status: str) -> float:
    if status == "processing":
        return 0.5
    if status == "complete":
        return 1.0
    return 0.0


def _resolve_runtime_file(path: str) -> Path:
    candidate = Path(path).expanduser().resolve()
    runtime_root = RUNTIME_DIR.resolve()
    if not candidate.is_file() or not candidate.is_relative_to(runtime_root):
        raise HTTPException(status_code=404, detail="Media file not available.")
    return candidate


def _run_separation_job(job_id: str, request: SeparationRequest) -> None:
    job = JOBS[job_id]
    try:
        job["status"] = "processing"
        job["progress"] = 0.15

        raw_dir = JOBS_DIR / job_id / "raw"
        stems_dir = JOBS_DIR / job_id / "stems"
        raw_paths = separate(
            source_path=request.file_path,
            model=request.model,
            output_dir=raw_dir,
            overlap=request.overlap,
            shifts=request.shifts,
        )

        job["progress"] = 0.7
        conformed_paths = conform_stem_outputs(request.file_path, raw_paths, stems_dir)
        serialized_stems = _serialize_stems(conformed_paths, request.stems)
        job["progress"] = 0.86
        detected_flags = analyze_flags(
            source_path=request.file_path,
            stem_entries=serialized_stems,
            score_path=request.score_path,
        )

        job.update(
            {
                "status": "complete",
                "progress": 1.0,
                "stems": serialized_stems,
                "flags": detected_flags,
            }
        )
    except Exception as exc:  # noqa: BLE001
        job.update(
            {
                "status": "failed",
                "progress": 1.0,
                "error": str(exc),
                "stems": [],
            }
        )


@app.post("/api/ingest")
async def ingest_audio(
    audio_file: UploadFile = File(...),
    sib_file: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    session_id = uuid.uuid4().hex
    session_dir = UPLOADS_DIR / session_id
    audio_path = session_dir / "source" / audio_file.filename
    _copy_upload(audio_file, audio_path)

    score_info = {
        "status": "missing",
        "message": "No score file uploaded.",
        "part_count": 0,
        "bar_count": 0,
        "instruments": [],
        "source_type": "Unknown",
    }

    score_path: Path | None = None
    if sib_file and sib_file.filename:
        score_path = session_dir / "score" / sib_file.filename
        _copy_upload(sib_file, score_path)
        score_info = _parse_score(score_path)

    try:
        validation = validate(audio_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Audio validation failed: {exc}") from exc

    stems = _build_stem_rows(score_info["instruments"])
    checks = list(validation["checks"])
    checks.append(_source_type_check(score_info["source_type"]))
    checks.append(_score_check(score_info))

    return {
        "session_id": session_id,
        "file_path": str(audio_path.resolve()),
        "score_path": str(score_path.resolve()) if score_path else None,
        "checks": checks,
        "stems": stems,
        "source_type": score_info["source_type"],
        "duration": validation["duration"],
        "audio": {
            "filename": validation["filename"],
            "format": validation["format"],
            "subtype": validation["subtype"],
            "bit_depth": validation["bit_depth"],
            "sample_rate": validation["samplerate"],
            "channels": validation["channels"],
            "duration": validation["duration"],
            "file_size": validation["file_size"],
            "file_size_human": _format_size(validation["file_size"]),
            "dc_offset": validation["dc_offset"],
            "clipping": validation["clipping"],
            "hard_reject": validation["hard_reject"],
            "soft_flags": validation["soft_flags"],
        },
        "score": score_info,
    }


@app.post("/api/separate")
async def separate_audio(request: SeparationRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    if _live_separation_disabled():
        raise HTTPException(status_code=503, detail=LIVE_SEPARATION_DISABLED_MESSAGE)

    try:
        source_path = Path(request.file_path).expanduser().resolve()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid source path: {exc}") from exc

    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source file not found.")

    job_id = uuid.uuid4().hex
    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0.0,
        "model": request.model,
        "file_path": str(source_path),
        "score_path": request.score_path,
        "requested_stems": request.stems,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stems": [],
        "flags": [],
    }
    background_tasks.add_task(_run_separation_job, job_id, request)
    return {"job_id": job_id, "status": "processing"}


@app.get("/api/job/{job_id}")
async def get_job(job_id: str) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "progress": job.get("progress", _job_progress(job["status"])),
        "stems": job.get("stems", []),
        "flags": job.get("flags", []),
        "error": job.get("error"),
    }


@app.post("/api/null_test")
async def run_null_test(request: NullTestRequest) -> dict[str, Any]:
    try:
        result = null_test(request.source_path, request.stem_paths)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Null test failed: {exc}") from exc

    residual_path = RESIDUALS_DIR / f"{uuid.uuid4().hex}_residual.wav"
    sf.write(str(residual_path), result["residual"], result["sample_rate"], format="WAV", subtype="FLOAT")

    return {
        "score": result["score"],
        "status": result["status"],
        "residual_dbfs": result["residual_dbfs"],
        "residual_path": str(residual_path.resolve()),
    }


@app.post("/api/export")
async def export_stems(request: ExportRequest) -> dict[str, Any]:
    job = JOBS.get(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job["status"] != "complete":
        raise HTTPException(status_code=409, detail="Separation job is not complete.")

    effective_flags = request.flags or job.get("flags", [])
    unresolved_flags = [flag for flag in effective_flags if flag.get("state", "active") == "active"]
    if unresolved_flags:
        raise HTTPException(status_code=409, detail="Export is blocked until all flags are acknowledged.")
    job["flags"] = effective_flags

    export_root = Path(request.session_meta.get("output_dir") or DEFAULT_EXPORT_DIR).expanduser().resolve()
    export_dir = export_root / request.job_id
    export_dir.mkdir(parents=True, exist_ok=True)

    catalog_id = request.session_meta.get("catalog_id", "UNKNOWN")
    composer = request.session_meta.get("composer", "UNKNOWN")
    title = request.session_meta.get("title", "UNTITLED")
    version = int(request.session_meta.get("version", 1))
    stem_meta = request.session_meta.get("stems", [])
    stem_meta_by_name = {item.get("name"): item for item in stem_meta if item.get("name")}

    output_paths: list[str] = []
    for index, stem_entry in enumerate(job.get("stems", [])):
        stem_path = Path(stem_entry["path"])
        meta = stem_meta_by_name.get(stem_entry["name"], {})
        if not meta and index < len(stem_meta):
            meta = stem_meta[index]
        instrument = meta.get("instrument") or stem_entry["name"]
        stem_type = meta.get("stem_type", stem_entry.get("stem_type", "IsolatedStem"))

        data, sample_rate = sf.read(str(stem_path), always_2d=True)
        info = sf.info(str(stem_path))
        bit_depth = 32 if info.subtype.upper() in {"FLOAT", "DOUBLE"} else 32
        filename = build_name(catalog_id, composer, title, instrument, stem_type, version, sample_rate, bit_depth)
        output_path = export_dir / filename
        sf.write(str(output_path), data.astype("float32"), sample_rate, format="WAV", subtype="FLOAT")
        output_paths.append(str(output_path.resolve()))

    session_log_path = export_dir / f"{request.job_id}_SESSION.txt"
    session_log_path.write_text(
        "\n".join(
            [
                "StemQA Session Export",
                f"Job ID: {request.job_id}",
                f"Model: {job['model']}",
                f"Source: {job['file_path']}",
                f"Exported At (UTC): {datetime.now(timezone.utc).isoformat()}",
                "",
                "Session Metadata:",
                json.dumps(request.session_meta, indent=2, sort_keys=True),
                "",
                "Flags:",
                json.dumps(effective_flags, indent=2),
            ]
        ),
        encoding="utf-8",
    )

    return {"output_paths": output_paths, "session_log_path": str(session_log_path.resolve())}


@app.get("/api/media")
async def get_media(path: str = Query(...)) -> FileResponse:
    media_path = _resolve_runtime_file(path)
    return FileResponse(media_path)
