"""Build a compact tune index for the Bham Sessions setlist app.

Reads thesession.org's official open-data dump (tunes.csv, aliases.csv) and
emits app/tune_index.json: one entry per tune with its canonical display name,
type, and de-duplicated aliases. This is the static reference data that powers
autocomplete and fuzzy matching in the browser.

Run:  python scripts/build_index.py
"""

import csv
import json
import re
import sys
from pathlib import Path

csv.field_size_limit(10**7)  # tunes.csv embeds long ABC notation fields

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "app" / "tune_index.json"

# thesession stores names with a trailing article, e.g. "Banshee, The".
# The setlist PDFs display the natural "The Banshee" form, so normalise it.
_ARTICLE_RE = re.compile(r"^(.*),\s+(The|A|An)$", re.IGNORECASE)


def normalize_name(name: str) -> str:
    name = (name or "").strip()
    m = _ARTICLE_RE.match(name)
    if m:
        return f"{m.group(2).capitalize()} {m.group(1).strip()}"
    return name


def load_tunes():
    """Return {tune_id: {"name", "type"}}, one entry per tune (first seen)."""
    tunes = {}
    with open(DATA / "tunes.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tid = row["tune_id"]
            if tid not in tunes:
                tunes[tid] = {
                    "name": normalize_name(row["name"]),
                    "type": (row["type"] or "").strip(),
                }
    return tunes


def load_aliases():
    """Return {tune_id: [normalized alias, ...]} with duplicates removed."""
    aliases = {}
    with open(DATA / "aliases.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tid = row["tune_id"]
            alias = normalize_name(row["alias"])
            if alias:
                aliases.setdefault(tid, [])
                if alias not in aliases[tid]:
                    aliases[tid].append(alias)
    return aliases


def load_popularity():
    """Return {tune_id: tunebook_count}; used to rank colliding tune names."""
    pop = {}
    path = DATA / "tune_popularity.csv"
    if not path.exists():
        return pop
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                pop[row["tune_id"]] = int(row["tunebooks"])
            except (ValueError, KeyError):
                continue
    return pop


def main():
    tunes = load_tunes()
    aliases = load_aliases()
    popularity = load_popularity()

    index = []
    for tid, info in tunes.items():
        # Aliases that merely repeat the canonical name add no search value.
        extra = [a for a in aliases.get(tid, []) if a != info["name"]]
        index.append({
            "id": int(tid),
            "name": info["name"],
            "type": info["type"],
            "pop": popularity.get(tid, 0),
            "aliases": extra,
        })

    # Most-popular first so colliding names surface the common tune at the top.
    index.sort(key=lambda t: (-t["pop"], t["id"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    n_aliases = sum(len(t["aliases"]) for t in index)
    size_mb = OUT.stat().st_size / 1_000_000
    print(f"Wrote {len(index):,} tunes ({n_aliases:,} aliases) to {OUT}")
    print(f"Index size: {size_mb:.2f} MB")


if __name__ == "__main__":
    sys.exit(main())
