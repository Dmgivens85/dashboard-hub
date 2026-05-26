from __future__ import annotations

from pathlib import Path
from typing import Iterable

import numpy as np
import soundfile as sf

HTDEMUCS_FT = "htdemucs_ft"
MDX_NET_HQ3 = "UVR-MDX-NET-Inst_HQ_3.onnx"

_MODEL_ALIASES = {
    "htdemucs ft": HTDEMUCS_FT,
    "htdemucs_ft": HTDEMUCS_FT,
    "mdx-net hq3": MDX_NET_HQ3,
    "mdx net hq3": MDX_NET_HQ3,
    "uvr-mdx-net-inst_hq_3.onnx": MDX_NET_HQ3,
}
_ENSEMBLE_ALIASES = {
    "ensemble",
    "htdemucs ft + mdx-net",
    "htdemucs ft + mdx-net hq3",
    "htdemucs_ft+mdx-net hq3",
}
_DISALLOWED_INPUT_SEGMENTS = {"stems", "exports", "residuals"}


class SeparationError(RuntimeError):
    pass


def resolve_model(model: str) -> tuple[str | list[str], str | None]:
    normalized = (model or "").strip().lower()
    if normalized in _MODEL_ALIASES:
        return _MODEL_ALIASES[normalized], None
    if normalized in _ENSEMBLE_ALIASES:
        return [HTDEMUCS_FT, MDX_NET_HQ3], "avg_wave"
    raise SeparationError(f"Unsupported separation model: {model}")


def validate_source_input(source_path: str | Path) -> Path:
    resolved = Path(source_path).expanduser().resolve()
    if not resolved.exists():
        raise SeparationError(f"Source file does not exist: {resolved}")
    if any(part in _DISALLOWED_INPUT_SEGMENTS for part in resolved.parts):
        raise SeparationError("Separation only accepts original source files as input.")
    return resolved


def separate(
    source_path: str | Path,
    model: str,
    output_dir: str | Path,
    overlap: int = 8,
    shifts: int = 2,
) -> list[str]:
    source = validate_source_input(source_path)
    output_root = Path(output_dir).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    try:
        from audio_separator.separator import Separator
    except ImportError as exc:
        raise SeparationError(
            "audio-separator is not installed. Install backend requirements before running separation."
        ) from exc

    model_filename, ensemble_algorithm = resolve_model(model)
    kwargs = {
        "output_dir": str(output_root),
        "mdx_params": {"overlap": overlap / 10.0, "shifts": shifts},
    }
    if ensemble_algorithm:
        kwargs["ensemble_algorithm"] = ensemble_algorithm

    separator = Separator(**kwargs)
    separator.load_model(model_filename=model_filename)
    output_files = separator.separate(str(source))
    return [str(Path(path).resolve()) for path in output_files]


def write_float_wav(target_path: str | Path, data: np.ndarray, sample_rate: int) -> Path:
    target = Path(target_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(target), data, sample_rate, format="WAV", subtype="FLOAT")
    return target


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
        if stem_data.shape[0] > target_frames:
            stem_data = stem_data[:target_frames]
        elif stem_data.shape[0] < target_frames:
            pad = np.zeros((target_frames - stem_data.shape[0], target_channels), dtype=stem_data.dtype)
            stem_data = np.concatenate([stem_data, pad], axis=0)

        target_path = conformed_dir / f"{stem_path.stem}.wav"
        write_float_wav(target_path, stem_data.astype(np.float32), sample_rate)
        conformed_paths.append(str(target_path.resolve()))

    return conformed_paths
