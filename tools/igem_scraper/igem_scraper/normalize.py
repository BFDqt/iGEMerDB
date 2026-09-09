from __future__ import annotations

import hashlib
import re


_SPACE_RE = re.compile(r"\s+")


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    v = value.strip()
    v = v.replace("\u00a0", " ")
    v = _SPACE_RE.sub(" ", v)
    return v


def normalize_name(public_name: str | None) -> str:
    v = normalize_text(public_name)
    # Keep original case for Chinese; lower for latin-heavy strings.
    if re.search(r"[A-Za-z]", v):
        v = v.lower()
    return v


def normalize_affiliation(aff: str | None) -> str:
    v = normalize_text(aff)
    if re.search(r"[A-Za-z]", v):
        v = v.lower()
    # Light cleanup
    v = v.replace("（", "(").replace("）", ")")
    v = v.replace("，", ",")
    v = _SPACE_RE.sub(" ", v)
    return v


def person_uid(public_name_norm: str, affiliation_norm: str | None) -> str:
    key = public_name_norm + "|" + (affiliation_norm or "")
    # 20 bytes hex is enough; keep stable.
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:40]


def team_name_norm(team_name: str | None) -> str:
    """Normalize a team name for canonical matching across years.

    Rules:
    - Lowercase
    - Unicode dash variants → ASCII hyphen
    - Remove extra whitespace
    - Strip common punctuation differences: underscores, smart quotes, fullwidth chars
    """
    import unicodedata

    # Fullwidth letters/digits (common in East Asian team names) must fold
    # onto their ASCII counterparts or cross-year matching splits them.
    v = unicodedata.normalize("NFKC", normalize_text(team_name))
    v = v.lower()
    # Dash variants
    v = v.replace("\u2013", "-").replace("\u2014", "-").replace("\u2015", "-")
    v = v.replace("\u2212", "-").replace("\uff0d", "-")
    # Underscore → space (iGEM sometimes uses Team_Name)
    v = v.replace("_", " ")
    # Smart quotes / fullwidth
    v = v.replace("\u2018", "'").replace("\u2019", "'")
    v = v.replace("\u201c", '"').replace("\u201d", '"')
    v = v.replace("\uff08", "(").replace("\uff09", ")")
    # Collapse whitespace
    v = _SPACE_RE.sub(" ", v).strip()
    return v
