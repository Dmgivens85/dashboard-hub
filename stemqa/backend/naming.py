from __future__ import annotations


def _compact(value: str, strip_periods: bool = False, max_length: int | None = None) -> str:
    text = str(value or "")
    if strip_periods:
        text = text.replace(".", "")
    text = text.replace(" ", "")
    if max_length is not None:
        text = text[:max_length]
    return text


def build_name(
    catalog_id: str,
    composer: str,
    title: str,
    instrument: str,
    stem_type: str,
    version: int,
    sr: int,
    bit_depth: int,
) -> str:
    parts = [
        "TOMPLAY",
        _compact(catalog_id),
        _compact(composer),
        _compact(title, strip_periods=True, max_length=12),
        _compact(instrument),
        str(stem_type),
        f"v{str(version).zfill(2)}",
        f"{sr // 1000}k",
        f"{bit_depth}b",
    ]
    return "_".join(parts) + ".wav"
