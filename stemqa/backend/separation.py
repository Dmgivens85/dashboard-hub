from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Callable, Iterable

import numpy as np
import soundfile as sf

HTDEMUCS_FT = "htdemucs_ft"
MDX_EXTRA = "mdx_extra"

_MODEL_ALIASES = {
    "htdemucs ft": HTDEMUCS_FT,
    "htdemucs_ft": HTDEMUCS_FT,
    "mdx-net hq3": MDX_EXTRA,
    "mdx net hq3": MDX_EXTRA,
    "mdx_extra": MDX_EXTRA,
}
_ENSEMBLE_ALIASES = {
    "ensemble",
    "htdemucs ft + mdx-net",
    "htdemucs ft + mdx-net hq3",
    "htdemucs_ft+mdx-net hq3",
}
_DISALLOWED_INPUT_SEGMENTS = {"stems", "exports", "residuals"}
_STEM_ORDER = {
    "vocals": 0,
    "drums": 1,
    "bass": 2,
    "other": 3,
    "guitar": 4,
    "piano": 5,
}


class SeparationError(RuntimeError):
    pass


def resolve_model(model: str) -> tuple[list[str], bool]:
    normalized = (model or "").strip().lower()
    if normalized in _MODEL_ALIASES:
        return [_MODEL_ALIASES[normalized]], False
    if normalized in _ENSEMBLE_ALIASES:
        return [HTDEMUCS_FT, MDX_EXTRA], True
    raise SeparationError(f"Unsupported separation model: {model}")


def validate_source_input(source_path: str | Path) -> Path:
    resolved = Path(source_path).expanduser().resolve()
    if not resolved.exists():
        raise SeparationError(f"Source file does not exist: {resolved}")
    if any(part in _DISALLOWED_INPUT_SEGMENTS for part in resolved.parts):
        raise SeparationError("Separation only accepts original source files as input.")
    return resolved


def _stem_sort_key(path: Path) -> tuple[int, str]:
    stem_name = path.stem.lower()
    return (_STEM_ORDER.get(stem_name, 999), stem_name)


def _collect_demucs_outputs(output_root: Path, model_name: str, source: Path) -> list[Path]:
    candidate_dir = output_root / model_name / source.stem
    if not candidate_dir.exists():
        model_root = output_root / model_name
        fallback_dirs = sorted([path for path in model_root.iterdir() if path.is_dir()]) if model_root.exists() else []
        if len(fallback_dirs) == 1:
            candidate_dir = fallback_dirs[0]

    stem_paths = sorted(candidate_dir.glob("*.wav"), key=_stem_sort_key)
    if not stem_paths:
        raise SeparationError(f"Demucs completed without writing stems for model {model_name}.")
    return stem_paths


def _segment_seconds() -> float | None:
    configured = os.getenv("STEMQA_DEMUCS_SEGMENT")
    if configured is None or not configured.strip():
        return None
    try:
        segment = float(configured)
    except ValueError as exc:
        raise SeparationError(f"Invalid STEMQA_DEMUCS_SEGMENT value: {configured}") from exc
    if segment <= 0:
        return None
    return segment


def _run_demucs(
    source: Path,
    model_name: str,
    output_root: Path,
    overlap: int,
    shifts: int,
    log_callback: Callable[[str], None] | None = None,
) -> list[Path]:
    segment_seconds = _segment_seconds()
    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "--out",
        str(output_root),
        "--overlap",
        str(overlap / 10),
        "--shifts",
        str(shifts),
        "--jobs",
        "1",
        "-n",
        model_name,
        str(source),
    ]
    if segment_seconds is not None:
        cmd.extend(["--segment", f"{segment_seconds:g}"])
    env = os.environ.copy()
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
    )

    output_lines: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        cleaned = line.strip()
        if not cleaned:
            continue
        output_lines.append(cleaned)
        if log_callback:
            log_callback(cleaned)

    return_code = process.wait()
    if return_code != 0:
        raise SeparationError("\n".join(output_lines[-20:]) or "Demucs separation failed.")
    return _collect_demucs_outputs(output_root, model_name, source)


def _match_channel_count(data: np.ndarray, target_channels: int) -> np.ndarray:
    current_channels = data.shape[1]
    if current_channels == target_channels:
        return data
    if current_channels == 1 and target_channels > 1:
        return np.repeat(data, target_channels, axis=1)
    if current_channels > target_channels:
        return data[:, :target_channels]
    pad_channels = target_channels - current_channels
    padding = np.zeros((data.shape[0], pad_channels), dtype=data.dtype)
    return np.concatenate([data, padding], axis=1)


def _match_frame_count(data: np.ndarray, target_frames: int) -> np.ndarray:
    if data.shape[0] == target_frames:
        return data
    if data.shape[0] > target_frames:
        return data[:target_frames]
    padding = np.zeros((target_frames - data.shape[0], data.shape[1]), dtype=data.dtype)
    return np.concatenate([data, padding], axis=0)


def write_float_wav(target_path: str | Path, data: np.ndarray, sample_rate: int) -> Path:
    target = Path(target_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(target), data, sample_rate, format="WAV", subtype="FLOAT")
    return target


def _average_stem_sets(stem_sets: list[list[Path]], output_dir: Path) -> list[str]:
    if not stem_sets:
        return []
    if len(stem_sets) == 1:
        return [str(path.resolve()) for path in stem_sets[0]]

    output_dir.mkdir(parents=True, exist_ok=True)
    reference_paths = stem_sets[0]
    averaged_paths: list[str] = []

    for reference_path in reference_paths:
        stem_name = reference_path.stem.lower()
        matching_paths = []
        for stem_set in stem_sets:
            match = next((path for path in stem_set if path.stem.lower() == stem_name), None)
            if match is None:
                raise SeparationError(f"Missing {stem_name} stem while averaging ensemble outputs.")
            matching_paths.append(match)

        stacked_audio: list[np.ndarray] = []
        sample_rate: int | None = None
        target_frames = 0
        target_channels = 0

        for stem_path in matching_paths:
            audio, stem_sr = sf.read(str(stem_path), always_2d=True)
            if sample_rate is None:
                sample_rate = stem_sr
            elif stem_sr != sample_rate:
                raise SeparationError(f"Sample rate mismatch while averaging ensemble output: {stem_path}")

            target_frames = max(target_frames, audio.shape[0])
            target_channels = max(target_channels, audio.shape[1])
            stacked_audio.append(audio.astype(np.float32))

        normalized_audio = [
            _match_frame_count(_match_channel_count(audio, target_channels), target_frames) for audio in stacked_audio
        ]
        averaged_audio = np.mean(np.stack(normalized_audio, axis=0), axis=0, dtype=np.float32)
        target_path = output_dir / f"{stem_name}.wav"
        write_float_wav(target_path, averaged_audio.astype(np.float32), sample_rate or 44_100)
        averaged_paths.append(str(target_path.resolve()))

    return averaged_paths


def separate(
    source_path: str | Path,
    model: str,
    output_dir: str | Path,
    overlap: int = 8,
    shifts: int = 2,
    log_callback: Callable[[str], None] | None = None,
) -> list[str]:
    source = validate_source_input(source_path)
    output_root = Path(output_dir).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    model_names, is_ensemble = resolve_model(model)
    stem_sets = [
        _run_demucs(source, model_name, output_root, overlap, shifts, log_callback=log_callback)
        for model_name in model_names
    ]

    if is_ensemble:
        return _average_stem_sets(stem_sets, output_root / "ensemble_avg")
    return [str(path.resolve()) for path in stem_sets[0]]


def conform_stem_outputs(
    source_path: str | Path,
    output_paths: Iterable[str | Path],
    output_dir: str | Path,
) -> list[str]:
    source, sample_rate = sf.read(str(source_path), always_2d=True)
    target_frames = source.shape[0]
    target_channels = source.shape[1]
    conformed_dir = Path(output_dir)
    conformed_dir.mkdir(parents=True, exist_ok=True)

    conformed_paths: list[str] = []
    for raw_path in output_paths:
        stem_path = Path(raw_path)
        stem_data, stem_sr = sf.read(str(stem_path), always_2d=True)
        if stem_sr != sample_rate:
            raise SeparationError(f"Sample rate mismatch in separated stem: {stem_path}")

        stem_data = _match_channel_count(stem_data, target_channels)
        stem_data = _match_frame_count(stem_data, target_frames)

        target_path = conformed_dir / f"{stem_path.stem}.wav"
        write_float_wav(target_path, stem_data.astype(np.float32), sample_rate)
        conformed_paths.append(str(target_path.resolve()))

    return conformed_paths
