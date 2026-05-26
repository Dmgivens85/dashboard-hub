from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf


def _rms_dbfs(signal: np.ndarray) -> float:
    rms = float(np.sqrt(np.mean(np.square(signal), dtype=np.float64)))
    return 20.0 * np.log10(max(rms, 1e-12))


def null_test(source_path: str | Path, stem_paths: list[str | Path]) -> dict[str, Any]:
    if not stem_paths:
        raise ValueError("At least one stem path is required for a null test.")

    src, samplerate = sf.read(str(source_path), always_2d=True)
    stems: list[np.ndarray] = []

    for stem_path in stem_paths:
        stem, stem_sr = sf.read(str(stem_path), always_2d=True)
        if stem_sr != samplerate:
            raise ValueError(f"Sample rate mismatch in stem: {stem_path}")
        stems.append(stem)

    min_len = min(src.shape[0], *(stem.shape[0] for stem in stems))
    src = src[:min_len]
    aligned_stems = [stem[:min_len] for stem in stems]

    stem_sum = np.zeros_like(src, dtype=np.float64)
    for stem in aligned_stems:
        stem_sum += stem.astype(np.float64)

    residual = src.astype(np.float64) - stem_sum
    rms_src = float(np.sqrt(np.mean(np.square(src), dtype=np.float64)))
    rms_res = float(np.sqrt(np.mean(np.square(residual), dtype=np.float64)))
    score = (1.0 - (rms_res / max(rms_src, 1e-12))) * 100.0
    residual_dbfs = _rms_dbfs(residual)

    if residual_dbfs > -20.0:
        status = "reject"
    elif residual_dbfs > -30.0:
        status = "flag"
    else:
        status = "pass"

    return {
        "score": round(score, 1),
        "status": status,
        "sample_rate": samplerate,
        "frames": min_len,
        "rms_source": round(rms_src, 8),
        "rms_residual": round(rms_res, 8),
        "residual_dbfs": round(residual_dbfs, 2),
        "residual": residual.astype(np.float32),
    }
