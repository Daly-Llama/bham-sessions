// matcher.js
// Pure tune-matching module: raw name -> ranked candidate tunes.
// No DOM, no storage. Kept dependency-free so the same logic can later be
// lifted to a server (Tier 2) without touching the UI.

const THESESSION_URL = "https://thesession.org/tunes/";

const ARTICLE_FRONT = /^(the|a|an)\s+/i;

// Loose key: lowercase, drop a leading article, strip non-alphanumerics.
// Mirrors the norm() used when validating the index in Python.
function norm(s) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(ARTICLE_FRONT, "")
    .replace(/[^a-z0-9]+/g, "");
}

function tuneUrl(tune) {
  return THESESSION_URL + tune.id;
}

class Matcher {
  // index: array of { id, name, type, pop, aliases:[...] }
  constructor(index) {
    this.index = index;
    // Flat searchable entries: one per name/alias spelling, pointing at a tune.
    this.entries = [];
    for (const tune of index) {
      this.entries.push({ key: norm(tune.name), label: tune.name, tune });
      for (const alias of tune.aliases) {
        this.entries.push({ key: norm(alias), label: alias, tune, alias: true });
      }
    }
  }

  // Return up to `limit` candidate tunes for a raw query, best first.
  // Scoring: exact key (0) < prefix (1) < substring (2). Within a score,
  // more popular tunes rank higher. Results are de-duplicated by tune id.
  search(query, { limit = 8, type = null } = {}) {
    const q = norm(query);
    if (!q) return [];

    const best = new Map(); // tune id -> { tune, score, label, alias }
    for (const e of this.entries) {
      if (type && e.tune.type !== type) continue;
      let score;
      if (e.key === q) score = 0;
      else if (e.key.startsWith(q)) score = 1;
      else if (e.key.includes(q)) score = 2;
      else continue;

      const prev = best.get(e.tune.id);
      if (!prev || score < prev.score) {
        best.set(e.tune.id, { tune: e.tune, score, label: e.label, alias: !!e.alias });
      }
    }

    return [...best.values()]
      .sort((a, b) =>
        a.score - b.score || (b.tune.pop || 0) - (a.tune.pop || 0))
      .slice(0, limit)
      .map((m) => ({
        id: m.tune.id,
        name: m.tune.name,
        type: m.tune.type,
        pop: m.tune.pop || 0,
        url: tuneUrl(m.tune),
        // Show which alias matched when it differs from the canonical name,
        // so the scribe understands why a result appeared.
        matchedAlias: m.alias && norm(m.label) !== norm(m.tune.name) ? m.label : null,
      }));
  }
}

export { Matcher, norm, tuneUrl, THESESSION_URL };
