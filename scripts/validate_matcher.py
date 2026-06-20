"""Validate the tune index against gold-standard tunes from past setlist PDFs.

The six PDFs in the Bham Irish Sessions folder were curated by hand, so the
(tune name, type) pairs in them are ground truth. This checks that the index
built from thesession.org's dump can reproduce them:

  1. Coverage  - does each gold tune resolve by canonical name or alias?
  2. Disambiguation - when a name collides across multiple tunes, does adding
     the known tune type narrow it to a single correct candidate?

Run:  python scripts/validate_matcher.py
"""

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "app" / "tune_index.json"

# Gold set extracted from 2024-11-11 and 2025-06-08 session PDFs.
# (display name as written in the PDF, tune type). Parenthetical alternates in
# the PDFs are split out as separate alias probes. "Sung" tunes are songs not
# on thesession and are excluded from the dump-coverage check.
GOLD = [
    ("Lark in the Morning", "jig"), ("The Lilting Banshee", "jig"),
    ("The Blarney Pilgrim", "jig"), ("The Haunted House", "jig"),
    ("Rambling Pitchfork", "jig"), ("The Rollicking Boys Of Tandragee", "jig"),
    ("Hundred Pipers", "jig"), ("The Killavil", "jig"),
    ("Billy O'Rourke Is The Buachaill", "slide"), ("The Carraroe", "jig"),
    ("Out on the Ocean", "jig"), ("Cooley's", "reel"), ("The Earl's Chair", "reel"),
    ("Tripping Up The Stairs", "jig"), ("The Mug Of Brown Ale", "jig"),
    ("The Banshee", "reel"), ("The Maid Behind The Bar", "reel"),
    ("Off To California", "hornpipe"), ("The Boys Of Bluehill", "hornpipe"),
    ("Banish Misfortune", "jig"), ("The Cliffs Of Moher", "jig"),
    ("Willie Coleman's", "jig"), ("The Swallowtail", "jig"),
    ("The Maids Of Glenroe", "jig"), ("The Hole In The Hedge", "jig"),
    ("Trip To Parliament", "reel"), ("O'Connell's Trip To Parliament", "reel"),
    ("The Torn Jacket", "reel"), ("The Connaughtman's Rambles", "jig"),
    ("My Darling Asleep", "jig"), ("Rolling In The Ryegrass", "reel"),
    ("The Silver Spear", "reel"), ("The Ballydesmond", "polka"),
    ("The Maid Of Feakle", "reel"), ("The Morning Star", "reel"),
    ("The Kesh", "jig"), ("The Swaggering Jig", "slip jig"),
    ("Morrison's", "jig"), ("The Kid On The Mountain", "slip jig"),
    ("The Galway Rambler", "reel"), ("Sliabh Russell", "jig"),
    ("Garrett Barry's", "jig"), ("The Tar Road To Sligo", "jig"),
    ("Paddy Clancy's", "jig"), ("The Pipe On The Hob", "jig"),
    ("The Rolling Waves", "jig"),
    # June 2025 additions
    ("The Hag At The Churn", "jig"), ("Basket Of Turf", "jig"),
    ("The Wise Maid", "reel"), ("The Ships Are Sailing", "reel"),
    ("Jimmy Ward's", "jig"), ("Father Kelly's", "reel"),
    ("The Reconciliation", "reel"), ("The Geese In The Bog", "jig"),
    ("Donnybrook Fair", "jig"), ("The Wind That Shakes The Barley", "reel"),
    ("Jackie Coleman's", "reel"), ("Drowsy Maggie", "reel"),
    ("Si Bheag Si Mhor", "waltz"), ("Lord Mayo", "march"),
    ("The Blackthorn Stick", "jig"), ("The Roscommon", "reel"),
    ("Farewell To Whalley Range", "slip jig"), ("Porthole Of The Kelp", "reel"),
    ("The Maids Of Mitchelstown", "reel"), ("The Humours Of Ennistymon", "jig"),
    ("Dusty Windowsills", "jig"), ("Wild Mountain Thyme", "barndance"),
    ("The Banks Of Newfoundland", "jig"), ("Heaton Chapel", "reel"),
]

_ARTICLE_FRONT = re.compile(r"^(the|a|an)\s+", re.IGNORECASE)


def norm(s: str) -> str:
    """Loose key: lowercase, drop a leading article, strip non-alphanumerics."""
    s = s.lower().strip()
    s = _ARTICLE_FRONT.sub("", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def main():
    index = json.load(open(INDEX, encoding="utf-8"))

    # Build name/alias -> list of tunes lookups keyed by the loose norm.
    by_key = defaultdict(list)
    for t in index:
        keys = {norm(t["name"])} | {norm(a) for a in t["aliases"]}
        for k in keys:
            by_key[k].append(t)

    covered = collisions = disambiguated = 0
    misses, ambiguous = [], []

    for name, ttype in GOLD:
        cands = by_key.get(norm(name), [])
        if not cands:
            misses.append((name, ttype))
            continue
        covered += 1
        if len(cands) > 1:
            collisions += 1
            typed = [c for c in cands if c["type"] == ttype]
            if len(typed) == 1:
                disambiguated += 1
            elif len(typed) > 1:
                # Rank remaining same-type candidates by popularity; the top
                # one is what the autocomplete would surface first.
                top = max(typed, key=lambda c: c["pop"])
                ambiguous.append((name, ttype, len(typed), top))

    n = len(GOLD)
    print(f"Gold tunes: {n}")
    print(f"Resolved by name/alias: {covered}/{n} ({covered/n:.0%})")
    print(f"  of which name-collided across >1 tune: {collisions}")
    print(f"  collisions uniquely fixed by type:     {disambiguated}/{collisions}")
    if misses:
        print(f"\nMISSES ({len(misses)}) - not found in index:")
        for name, ttype in misses:
            print(f"  - {name} [{ttype}]")
    if ambiguous:
        print(f"\nMULTIPLE SAME-TYPE CANDIDATES ({len(ambiguous)}) "
              f"- top pick by popularity shown (human confirms in UI):")
        for name, ttype, nt, top in ambiguous:
            print(f"  - {name} [{ttype}]: {nt} options -> top: "
                  f"id {top['id']}, pop {top['pop']}")


if __name__ == "__main__":
    main()
