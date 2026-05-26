from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf
from music21 import converter, note, tempo
from scipy.signal import hilbert

from null_test import null_test

FRAME_LENGTH = 2048
HOP_LENGTH = 512
EPSILON = 1e-12


@dataclass
class StemAudio:
    name: str
    path: str
    mono: np.ndarray
    stereo: np.ndarray
    sample_rate: int


def _normalize_name(value: str) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def _align_mono(signal: np.ndarray, target_length: int) -> np.ndarray:
    if signal.shape[0] > target_length:
        return signal[:target_length]
    if signal.shape[0] < target_length:
        padding = np.zeros(target_length - signal.shape[0], dtype=signal.dtype)
        return np.concatenate([signal, padding])
    return signal


def _align_stereo(signal: np.ndarray, target_length: int, target_channels: int) -> np.ndarray:
    if signal.ndim == 1:
        signal = signal[:, np.newaxis]
    if signal.shape[1] > target_channels:
        signal = signal[:, :target_channels]
    elif signal.shape[1] < target_channels:
        repeats = target_channels - signal.shape[1]
        padding = np.zeros((signal.shape[0], repeats), dtype=signal.dtype)
        signal = np.concatenate([signal, padding], axis=1)

    if signal.shape[0] > target_length:
        return signal[:target_length]
    if signal.shape[0] < target_length:
        padding = np.zeros((target_length - signal.shape[0], signal.shape[1]), dtype=signal.dtype)
        return np.concatenate([signal, padding], axis=0)
    return signal


def _dbfs(value: float) -> float:
    return 20.0 * np.log10(max(float(value), EPSILON))


def _segment_rms_db(signal: np.ndarray) -> float:
    rms = np.sqrt(np.mean(np.square(signal), dtype=np.float64))
    return _dbfs(rms)


def _rms_frames(signal: np.ndarray, frame_length: int = FRAME_LENGTH, hop_length: int = HOP_LENGTH) -> np.ndarray:
    rms = librosa.feature.rms(y=signal, frame_length=frame_length, hop_length=hop_length)[0]
    return np.maximum(rms, EPSILON)


def _times_for_frames(frame_count: int, sample_rate: int, hop_length: int = HOP_LENGTH) -> np.ndarray:
    return librosa.frames_to_time(np.arange(frame_count), sr=sample_rate, hop_length=hop_length)


def _intervals_from_mask(mask: np.ndarray, sample_rate: int, hop_length: int = HOP_LENGTH) -> list[tuple[float, float]]:
    intervals: list[tuple[float, float]] = []
    start_index: int | None = None
    frame_times = _times_for_frames(len(mask), sample_rate, hop_length)

    for index, active in enumerate(mask):
        if active and start_index is None:
            start_index = index
        elif not active and start_index is not None:
            start_time = float(frame_times[start_index])
            end_time = float(frame_times[index - 1] + hop_length / sample_rate)
            intervals.append((start_time, end_time))
            start_index = None

    if start_index is not None:
        start_time = float(frame_times[start_index])
        end_time = float(frame_times[-1] + hop_length / sample_rate)
        intervals.append((start_time, end_time))

    return intervals


def _merge_intervals(intervals: list[tuple[float, float]], gap_tolerance: float = 0.05) -> list[tuple[float, float]]:
    if not intervals:
        return []

    sorted_intervals = sorted(intervals, key=lambda item: item[0])
    merged = [sorted_intervals[0]]

    for start, end in sorted_intervals[1:]:
        previous_start, previous_end = merged[-1]
        if start <= previous_end + gap_tolerance:
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))

    return merged


def _quarter_to_seconds(offset: float, boundaries: list[tuple[float, float, tempo.MetronomeMark]]) -> float:
    elapsed = 0.0
    remaining_offset = float(offset)

    for start_q, end_q, mark in boundaries:
        seconds_per_quarter = mark.secondsPerQuarter() if hasattr(mark, "secondsPerQuarter") else 0.5
        segment_end = min(remaining_offset, end_q)
        if segment_end > start_q:
            elapsed += (segment_end - start_q) * seconds_per_quarter
        if remaining_offset <= end_q:
            break

    return elapsed


def _score_context(score_path: str | None) -> dict[str, Any]:
    if not score_path:
        return {"available": False, "parts": {}, "phrase_endings": [], "rest_intervals": []}

    path = Path(score_path)
    if not path.exists() or path.suffix.lower() not in {".xml", ".musicxml"}:
        return {"available": False, "parts": {}, "phrase_endings": [], "rest_intervals": []}

    score = converter.parse(str(path))
    boundaries = score.metronomeMarkBoundaries()
    if not boundaries:
        default_mark = tempo.MetronomeMark(number=120)
        boundaries = [(0.0, float(score.highestTime), default_mark)]

    parts: dict[str, dict[str, Any]] = {}
    global_active_intervals: list[tuple[float, float]] = []
    global_rest_intervals: list[tuple[float, float]] = []

    for index, part in enumerate(score.parts, start=1):
        instrument = part.getInstrument(returnDefault=True)
        label = part.partName or getattr(instrument, "partName", None) or instrument.instrumentName or f"Part {index}"
        active_intervals: list[tuple[float, float]] = []
        rest_intervals: list[tuple[float, float]] = []

        for element in part.flatten().notesAndRests:
            start_seconds = _quarter_to_seconds(float(element.offset), boundaries)
            end_seconds = _quarter_to_seconds(float(element.offset + element.quarterLength), boundaries)
            if isinstance(element, note.Rest):
                rest_intervals.append((start_seconds, end_seconds))
            else:
                active_intervals.append((start_seconds, end_seconds))

        merged_active = _merge_intervals(active_intervals)
        merged_rests = _merge_intervals(rest_intervals)
        phrase_endings = [start for start, _ in merged_rests]

        parts[_normalize_name(label)] = {
            "label": str(label),
            "active_intervals": merged_active,
            "rest_intervals": merged_rests,
            "phrase_endings": phrase_endings,
        }
        global_active_intervals.extend(merged_active)
        global_rest_intervals.extend(merged_rests)

    global_active_intervals = _merge_intervals(global_active_intervals)
    global_rest_intervals = _merge_intervals(global_rest_intervals)

    return {
        "available": True,
        "parts": parts,
        "phrase_endings": [start for start, _ in global_rest_intervals],
        "rest_intervals": global_rest_intervals,
    }


def _match_score_part(stem_name: str, score_context: dict[str, Any]) -> dict[str, Any] | None:
    normalized_name = _normalize_name(stem_name)
    if not normalized_name or not score_context["available"]:
        return None

    parts = score_context["parts"]
    if normalized_name in parts:
        return parts[normalized_name]

    for key, value in parts.items():
        if normalized_name in key or key in normalized_name:
            return value

    return None


def _detected_rest_intervals(source_mono: np.ndarray, sample_rate: int) -> list[tuple[float, float]]:
    frame_db = _dbfs_array(_rms_frames(source_mono))
    quiet_mask = frame_db < -40.0
    rests = [interval for interval in _intervals_from_mask(quiet_mask, sample_rate) if interval[1] - interval[0] >= 0.5]
    return _merge_intervals(rests)


def _dbfs_array(values: np.ndarray) -> np.ndarray:
    return 20.0 * np.log10(np.maximum(values, EPSILON))


def _flag_timestamp_from_signal(signal: np.ndarray, sample_rate: int) -> float:
    frame_db = _dbfs_array(_rms_frames(signal))
    frame_index = int(np.argmax(frame_db))
    return float(librosa.frames_to_time(frame_index, sr=sample_rate, hop_length=HOP_LENGTH))


def _energy_snapshot(stems: list[StemAudio], timestamp: float, window_seconds: float = 0.25) -> list[dict[str, Any]]:
    half_window = window_seconds / 2.0
    snapshot: list[dict[str, Any]] = []

    for stem in stems:
        start = max(0, int((timestamp - half_window) * stem.sample_rate))
        end = min(len(stem.mono), int((timestamp + half_window) * stem.sample_rate))
        if end <= start:
            energy_db = -120.0
        else:
            energy_db = _segment_rms_db(stem.mono[start:end])

        snapshot.append(
            {
                "label": stem.name,
                "color": None,
                "energy": round(float(energy_db), 1),
            }
        )

    return snapshot


def _register_flag(
    flags: list[dict[str, Any]],
    *,
    flag_type: str,
    timestamp: float,
    description: str,
    title: str,
    stem_name: str | None = None,
    stem_path: str | None = None,
    severity: str = "flag",
    duration: float | None = None,
) -> None:
    flags.append(
        {
            "id": f"flag-{len(flags) + 1}",
            "type": flag_type,
            "timestamp": round(float(timestamp), 3),
            "description": description,
            "title": title,
            "stem_name": stem_name,
            "stem_path": stem_path,
            "state": "active",
            "severity": severity,
            "duration": round(float(duration), 3) if duration is not None else None,
        }
    )


def _detect_null_flag(source_path: str, stems: list[StemAudio], flags: list[dict[str, Any]]) -> None:
    if not stems:
        return

    result = null_test(source_path, [stem.path for stem in stems])
    if result["status"] == "pass":
        return

    residual = result["residual"]
    residual_mono = residual.mean(axis=1) if residual.ndim == 2 else residual
    timestamp = _flag_timestamp_from_signal(residual_mono, result["sample_rate"])
    severity = "reject" if result["status"] == "reject" else "flag"
    description = (
        f"Stem sum residual measured {result['residual_dbfs']} dBFS against the source. "
        "Thresholds are > -20 dBFS reject, -20 to -30 dBFS flag, below -30 dBFS pass."
    )
    _register_flag(
        flags,
        flag_type="Cat-3",
        timestamp=timestamp,
        description=description,
        title="Null residual exceeds tolerance",
        severity=severity,
    )


def _detect_transients(source_mono: np.ndarray, stems: list[StemAudio], sample_rate: int, flags: list[dict[str, Any]]) -> None:
    source_onsets = librosa.onset.onset_detect(y=source_mono, sr=sample_rate, units="time")
    if len(source_onsets) == 0:
        return

    for stem in stems:
        stem_onsets = librosa.onset.onset_detect(y=stem.mono, sr=sample_rate, units="time")
        if len(stem_onsets) == 0:
            continue

        stem_flags: list[float] = []
        for onset_time in source_onsets:
            nearest = float(np.min(np.abs(stem_onsets - onset_time)))
            if nearest > 0.01:
                stem_flags.append(float(onset_time))

        for timestamp in _cluster_timestamps(stem_flags):
            _register_flag(
                flags,
                flag_type="Cat-2",
                timestamp=timestamp,
                description="Stem onset timing drifts more than 10 ms away from the matching source transient.",
                title="Transient integrity drift",
                stem_name=stem.name,
                stem_path=stem.path,
            )


def _cluster_timestamps(timestamps: list[float], cluster_gap: float = 0.5) -> list[float]:
    if not timestamps:
        return []

    sorted_timestamps = sorted(timestamps)
    clustered = [sorted_timestamps[0]]

    for timestamp in sorted_timestamps[1:]:
        if timestamp - clustered[-1] >= cluster_gap:
            clustered.append(timestamp)

    return clustered


def _is_tonal(segment: np.ndarray, sample_rate: int) -> bool:
    if segment.size == 0:
        return False
    flatness = librosa.feature.spectral_flatness(y=segment)
    return float(np.mean(flatness)) < 0.1


def _detect_rest_energy(
    stems: list[StemAudio],
    score_context: dict[str, Any],
    sample_rate: int,
    flags: list[dict[str, Any]],
) -> None:
    if not score_context["available"]:
        return

    for stem in stems:
        part_context = _match_score_part(stem.name, score_context)
        if not part_context:
            continue

        for start_time, end_time in part_context["rest_intervals"]:
            start_index = int(start_time * sample_rate)
            end_index = int(end_time * sample_rate)
            segment = stem.mono[start_index:end_index]
            if segment.size == 0:
                continue

            rms_db = _segment_rms_db(segment)
            if rms_db <= -40.0:
                continue

            flag_type = "HF-06" if _is_tonal(segment, sample_rate) else "Cat-3"
            description = (
                f"Stem energy stayed at {rms_db:.1f} dBFS during a scored rest interval. "
                "Tonally pitched rest spectral leakage is marked HF-06."
                if flag_type == "HF-06"
                else f"Stem energy stayed at {rms_db:.1f} dBFS during a scored rest interval."
            )
            _register_flag(
                flags,
                flag_type=flag_type,
                timestamp=start_time,
                description=description,
                title="Rest energy spectral leakage",
                stem_name=stem.name,
                stem_path=stem.path,
                duration=end_time - start_time,
            )


def _dominant_modulation_rate(segment: np.ndarray, sample_rate: int) -> float:
    if segment.size < sample_rate:
        return 0.0

    envelope = np.abs(hilbert(segment))
    envelope = envelope - np.mean(envelope)
    if np.allclose(envelope, 0):
        return 0.0

    spectrum = np.fft.rfft(envelope)
    frequencies = np.fft.rfftfreq(envelope.size, d=1.0 / sample_rate)
    valid = (frequencies >= 0.5) & (frequencies <= 12.0)
    if not np.any(valid):
        return 0.0

    dominant_index = int(np.argmax(np.abs(spectrum[valid])))
    return float(frequencies[valid][dominant_index])


def _detect_warble(source_mono: np.ndarray, stems: list[StemAudio], sample_rate: int, flags: list[dict[str, Any]]) -> None:
    window_size = sample_rate
    hop_size = max(sample_rate // 4, 1)

    for stem in stems:
        rms_db = _dbfs_array(_rms_frames(stem.mono))
        quiet_mask = rms_db < -18.0
        quiet_intervals = [
            interval for interval in _intervals_from_mask(quiet_mask, sample_rate) if interval[1] - interval[0] >= 1.0
        ]

        for start_time, end_time in quiet_intervals:
            start_index = int(start_time * sample_rate)
            end_index = int(end_time * sample_rate)
            if end_index - start_index < window_size:
                continue

            window_flags = 0
            window_count = 0
            for window_start in range(start_index, end_index - window_size + 1, hop_size):
                window_end = window_start + window_size
                stem_rate = _dominant_modulation_rate(stem.mono[window_start:window_end], sample_rate)
                source_rate = _dominant_modulation_rate(source_mono[window_start:window_end], sample_rate)
                window_count += 1
                if stem_rate > 2.0 and source_rate <= 2.0:
                    window_flags += 1

            if window_count == 0:
                continue

            if window_flags / window_count > 0.3:
                timestamp = start_time + (end_time - start_time) / 2.0
                _register_flag(
                    flags,
                    flag_type="HF-02",
                    timestamp=timestamp,
                    description="Quiet-passage modulation exceeds 2 Hz across more than 30% of the passage and is absent in the source.",
                    title="Warble modulation detected",
                    stem_name=stem.name,
                    stem_path=stem.path,
                    duration=end_time - start_time,
                )


def _cancellation_db(stereo_signal: np.ndarray) -> float:
    if stereo_signal.ndim == 1 or stereo_signal.shape[1] < 2:
        return 0.0

    left = stereo_signal[:, 0]
    right = stereo_signal[:, 1]
    stereo_rms = np.sqrt(np.mean((left**2 + right**2) / 2.0, dtype=np.float64))
    mono_fold = (left + right) / 2.0
    mono_rms = np.sqrt(np.mean(np.square(mono_fold), dtype=np.float64))
    return _dbfs(stereo_rms) - _dbfs(mono_rms)


def _detect_phase(source_stereo: np.ndarray, stems: list[StemAudio], sample_rate: int, flags: list[dict[str, Any]]) -> None:
    if source_stereo.ndim == 1 or source_stereo.shape[1] < 2:
        return

    window_size = sample_rate
    hop_size = max(sample_rate // 4, 1)

    for stem in stems:
        if stem.stereo.ndim == 1 or stem.stereo.shape[1] < 2:
            continue

        timestamps: list[float] = []
        max_start = min(source_stereo.shape[0], stem.stereo.shape[0]) - window_size
        for start_index in range(0, max(max_start, 0) + 1, hop_size):
            end_index = start_index + window_size
            source_cancel = _cancellation_db(source_stereo[start_index:end_index])
            stem_cancel = _cancellation_db(stem.stereo[start_index:end_index])
            if stem_cancel - source_cancel > 6.0:
                timestamps.append(start_index / sample_rate)

        for timestamp in _cluster_timestamps(timestamps):
            _register_flag(
                flags,
                flag_type="HF-03",
                timestamp=timestamp,
                description="Stem mono fold shows more than 6 dB additional cancellation versus the source mono fold.",
                title="Phase cancellation delta",
                stem_name=stem.name,
                stem_path=stem.path,
            )


def _tail_extension(signal: np.ndarray, sample_rate: int, phrase_end: float) -> float:
    start_index = int(phrase_end * sample_rate)
    if start_index >= signal.size:
        return 0.0

    post_phrase = signal[start_index:]
    frame_db = _dbfs_array(_rms_frames(post_phrase))
    above_threshold = frame_db > -40.0
    intervals = _intervals_from_mask(above_threshold, sample_rate)
    if not intervals:
        return 0.0
    return intervals[0][1]


def _detect_reverb_tail(
    source_mono: np.ndarray,
    stems: list[StemAudio],
    score_context: dict[str, Any],
    sample_rate: int,
    flags: list[dict[str, Any]],
) -> None:
    if score_context["available"]:
        phrase_endings = score_context["phrase_endings"]
        for stem in stems:
            part_context = _match_score_part(stem.name, score_context)
            if part_context and part_context["phrase_endings"]:
                phrase_endings = part_context["phrase_endings"]

            for phrase_end in phrase_endings:
                source_tail = _tail_extension(source_mono, sample_rate, phrase_end)
                stem_tail = _tail_extension(stem.mono, sample_rate, phrase_end)
                if abs(stem_tail - source_tail) > 0.2:
                    _register_flag(
                        flags,
                        flag_type="HF-01",
                        timestamp=phrase_end,
                        description="Stem reverb decay differs from the source by more than 200 ms at a score-derived phrase ending.",
                        title="Reverb tail mismatch",
                        stem_name=stem.name,
                        stem_path=stem.path,
                    )
        return

    for stem in stems:
        for rest_start, rest_end in _detected_rest_intervals(source_mono, sample_rate):
            segment = stem.mono[int(rest_start * sample_rate) : int(rest_end * sample_rate)]
            if segment.size == 0:
                continue
            frame_db = _dbfs_array(_rms_frames(segment))
            active_intervals = _intervals_from_mask(frame_db > -40.0, sample_rate)
            if active_intervals and active_intervals[0][1] > 0.5:
                _register_flag(
                    flags,
                    flag_type="HF-01",
                    timestamp=rest_start,
                    description="Stem reverb extends more than 500 ms into a detected rest window with no score available.",
                    title="Reverb tail extension",
                    stem_name=stem.name,
                    stem_path=stem.path,
                )


def _activity_mask(intervals: list[tuple[float, float]], frame_times: np.ndarray) -> np.ndarray:
    mask = np.zeros_like(frame_times, dtype=bool)
    for start_time, end_time in intervals:
        mask |= (frame_times >= start_time) & (frame_times < end_time)
    return mask


def _detect_ensemble_collapse(
    stems: list[StemAudio],
    score_context: dict[str, Any],
    sample_rate: int,
    flags: list[dict[str, Any]],
) -> None:
    if not stems:
        return

    stem_frame_db = {stem.name: _dbfs_array(_rms_frames(stem.mono)) for stem in stems}
    frame_times = _times_for_frames(len(next(iter(stem_frame_db.values()))), sample_rate)
    stem_linear = {stem.name: np.maximum(_rms_frames(stem.mono), EPSILON) for stem in stems}
    total_energy = np.sum(np.stack(list(stem_linear.values()), axis=0), axis=0)

    for stem in stems:
        ratio = stem_linear[stem.name] / np.maximum(total_energy, EPSILON)
        candidate_mask = ratio < 0.2

        if score_context["available"]:
            part_context = _match_score_part(stem.name, score_context)
            if not part_context:
                continue
            candidate_mask &= _activity_mask(part_context["active_intervals"], frame_times)
        else:
            all_hot = np.ones_like(candidate_mask, dtype=bool)
            for frame_db in stem_frame_db.values():
                all_hot &= frame_db > -12.0
            candidate_mask &= all_hot

        intervals = [
            interval for interval in _intervals_from_mask(candidate_mask, sample_rate) if interval[1] - interval[0] >= 2.0
        ]
        for start_time, end_time in intervals:
            _register_flag(
                flags,
                flag_type="HF-05",
                timestamp=start_time,
                description="Target stem energy drops below 20% of total stem energy for more than 2 consecutive seconds.",
                title="Ensemble collapse",
                stem_name=stem.name,
                stem_path=stem.path,
                duration=end_time - start_time,
            )


def analyze_flags(
    source_path: str,
    stem_entries: list[dict[str, Any]],
    score_path: str | None = None,
) -> list[dict[str, Any]]:
    source_stereo, sample_rate = sf.read(source_path, always_2d=True)
    source_mono = librosa.to_mono(source_stereo.T)
    source_length = source_mono.shape[0]
    source_channels = source_stereo.shape[1]

    stems: list[StemAudio] = []
    for stem_entry in stem_entries:
        stem_stereo, stem_sample_rate = sf.read(stem_entry["path"], always_2d=True)
        if stem_sample_rate != sample_rate:
            continue

        aligned_stereo = _align_stereo(stem_stereo, source_length, source_channels)
        aligned_mono = librosa.to_mono(aligned_stereo.T)
        stems.append(
            StemAudio(
                name=stem_entry.get("name") or Path(stem_entry["path"]).stem,
                path=stem_entry["path"],
                mono=aligned_mono,
                stereo=aligned_stereo,
                sample_rate=sample_rate,
            )
        )

    flags: list[dict[str, Any]] = []
    score_context = _score_context(score_path)

    _detect_null_flag(source_path, stems, flags)
    _detect_transients(source_mono, stems, sample_rate, flags)
    _detect_rest_energy(stems, score_context, sample_rate, flags)
    _detect_warble(source_mono, stems, sample_rate, flags)
    _detect_phase(source_stereo, stems, sample_rate, flags)
    _detect_reverb_tail(source_mono, stems, score_context, sample_rate, flags)
    _detect_ensemble_collapse(stems, score_context, sample_rate, flags)

    sorted_flags = sorted(flags, key=lambda item: (item["timestamp"], item["type"], item.get("stem_name") or ""))
    for index, flag in enumerate(sorted_flags, start=1):
        flag["id"] = f"flag-{index}"
        flag["stem_energies"] = _energy_snapshot(stems, flag["timestamp"])

    return sorted_flags
