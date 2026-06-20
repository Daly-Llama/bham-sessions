# Bham Irish Sessions — Setlist Tool (Tier 1)

A phone-friendly tool for scribing tunes at the monthly session. Type a tune name,
pick the match from autocomplete, and the canonical name, tune type, and
thesession.org link fill in automatically. Produces the same grouped setlist PDF the
group already shares on Facebook — without the manual lookup-and-retype afterward.

This is **Tier 1**: a static app, no backend, no accounts, free to host. The code is
structured so a later shared live-view (Tier 2) is an additive change. See
`../.claude/plans/` or the project plan for the full tier roadmap.

## What's here

```
app/                 the static web app (this is what gets hosted)
  index.html
  styles.css
  js/matcher.js      raw name -> ranked candidate tunes (pure, dependency-free)
  js/store.js        localStorage persistence behind a thin interface
  js/render.js       session -> printable setlist HTML
  js/app.js          wires the entry form to the above
  tune_index.json    generated reference data (built from the dump)
scripts/
  build_index.py     builds app/tune_index.json from thesession.org's data dump
  validate_matcher.py  checks the index against gold-standard tunes from past PDFs
data/                downloaded dump CSVs (build inputs; not committed)
```

## Rebuilding the tune index

The app ships with `app/tune_index.json` already built. To refresh it from the latest
thesession.org open data:

```bash
# from the project root
curl -sL -o data/tunes.csv            https://raw.githubusercontent.com/adactio/TheSession-data/main/csv/tunes.csv
curl -sL -o data/aliases.csv          https://raw.githubusercontent.com/adactio/TheSession-data/main/csv/aliases.csv
curl -sL -o data/tune_popularity.csv  https://raw.githubusercontent.com/adactio/TheSession-data/main/csv/tune_popularity.csv

python scripts/build_index.py      # writes app/tune_index.json
python scripts/validate_matcher.py # sanity-check against past setlists
```

`build_index.py` normalizes names ("Banshee, The" -> "The Banshee"), de-duplicates
aliases, and attaches a popularity score so the common version of a colliding name
(e.g. *Cooley's* the reel, not the hornpipe) ranks first.

## Running locally

The app uses ES modules and `fetch`, so it must be served over HTTP (opening
`index.html` directly via `file://` will not work):

```bash
cd app
python -m http.server 8731
# then open http://localhost:8731
```

## Using it at a session

1. Set the date and venue at the top.
2. For each set: type the requester, then add tunes. Type a tune name and tap the
   matching tune — type and link fill in automatically (the **✓ linked** badge confirms).
3. For a tune not on thesession, use **+ Custom tune**, then double-click the row to set
   its type and an optional link.
4. Tap **Preview** to see the finished setlist, **Export PDF** to print/save it for
   Facebook, and **Export data** to download the session as JSON (backup / portability).

Sessions are saved in the browser automatically (localStorage).

## Deploying (free, static)

Host the `app/` folder on GitHub Pages (or any static host). Everything runs in the
browser; there is nothing to run server-side in Tier 1.

## Tier 2 / later (not built)

A shared **read-only** live view (one scribe writes, everyone reads) is the natural next
step. The seams are already in place: the stable session schema in `store.js`, the
storage methods that an API client can replace, and the pure `matcher`/`render` modules
that port to a server unchanged.
