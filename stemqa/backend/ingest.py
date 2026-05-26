from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

SUPPORTED_AUDIO_FORMATS = {"WAV", "FLAC"}
SUPPORTED_SCORE_EXTENSIONS = {".sib", ".xml", ".musicxml"}

_SUBTYPE_BIT_DEPTHS = {
    "PCM_S8": 8,
    "PCM_U8": 8,
    "PCM_16": 16,
    "PCM_24": 24,
    "PCM_32": 32,
    "FLOAT": 32,
    "DOUBLE": 64,
}


def _status_entry(label: str, value: str, status: str, note: str | None = None) -> dict[str, Any]:
    entry: dict[str, Any] = {"label": label, "value": value, "status": status}
    if note:
        entry["note"] = note
    return entry


def _bit_depth_from_subtype(subtype: str) -> int | None:
    subtype_upper = (subtype or "").upper()
    if subtype_upper in _SUBTYPE_BIT_DEPTHS:
        return _SUBTYPE_BIT_DEPTHS[subtype_upper]

    digits = "".join(ch for ch in subtype_upper if ch.isdigit())
    return int(digits) if digits else None


def validate(file_path: str | Path) -> dict[str, Any]:
    file_path = Path(file_path)
    info = sf.info(str(file_path))
    data, samplerate = sf.read(str(file_path), always_2d=True)

    file_format = (info.format or "").upper()
    subtype = (info.subtype or "").upper()
    bit_depth = _bit_depth_from_subtype(subtype)
    dc_offset = float(np.mean(data))
    clipping = bool(np.any(np.abs(data) >= 0.9999))
    size_bytes = file_path.stat().st_size

    checks = [
        _status_entry(
            "File format",
            file_format or "Unknown",
            "pass" if file_format in SUPPORTED_AUDIO_FORMATS else "fail",
            "WAV and FLAC are accepted production formats.",
        ),
        _status_entry(
            "Bit depth",
            f"{bit_depth}-bit" if bit_depth is not None else subtype or "Unknown",
            "pass" if (bit_depth or 0) >= 24 else "warn",
            "Below 24-bit is a soft flag and requires acknowledgement.",
        ),
        _status_entry(
            "Sample rate",
            f"{samplerate / 1000:.1f} kHz",
            "pass" if samplerate >= 44_100 else "warn",
            "44.1 kHz and above are treated as passing for ingest.",
        ),
        _status_entry(
            "DC offset",
            f"{dc_offset:+.5f}",
            "fail" if abs(dc_offset) > 0.01 else "pass",
            "Any meaningful DC offset is a hard reject.",
        ),
        _status_entry(
            "Clipping",
            "Detected" if clipping else "None",
            "warn" if clipping else "pass",
            "Detected clipping is surfaced as a soft flag.",
        ),
    ]

    hard_reject = any(check["status"] == "fail" for check in checks)
    soft_flags = [check["label"] for check in checks if check["status"] == "warn"]

    return {
        "path": str(file_path),
        "filename": file_path.name,
        "format": file_format,
        "subtype": subtype,
        "bit_depth": bit_depth,
        "samplerate": samplerate,
        "channels": info.channels,
        "frames": info.frames,
        "duration": float(info.duration),
        "file_size": size_bytes,
        "dc_offset": dc_offset,
        "clipping": clipping,
        "checks": checks,
        "hard_reject": hard_reject,
        "soft_flags": soft_flags,
    }
