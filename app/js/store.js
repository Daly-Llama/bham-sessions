// store.js
// Thin persistence interface over localStorage. Every read/write of session
// data goes through here, so Tier 2 can swap this for an API client behind the
// same method names without the rest of the app noticing.

const SESSIONS_KEY = "bham_sessions";

function newId() {
  return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

// The single source-of-truth session shape (see plan). One stable schema,
// identical whether persisted locally or, later, in a database.
function emptySession() {
  return {
    id: newId(),
    date: new Date().toISOString().slice(0, 10),
    venue: "The Casual Pint",
    sets: [],
  };
}

function emptySet(index) {
  return { index, requester: "", tunes: [] };
}

// tune_id/url null => custom tune not on thesession; source records origin.
function tuneEntry(order) {
  return {
    order,
    canonical_name: "",
    type: "",
    tune_id: null,
    url: null,
    source: "thesession", // "thesession" | "custom"
    raw_name: "",
    preferred_alias: null, // locally-remembered alternate name
    setting_id: null,      // thesession.org setting ID for deep-link anchor
  };
}

// Cross-session memory: preferred alias and setting ID per tune.
// Stored separately so it survives session wipes and exports.
// Migrates transparently from old string-only format { tuneId: "alias" }.
const TUNE_MEMORY_KEY = "bham_preferred_aliases"; // key kept for backward compat

const TuneMemoryStore = {
  _raw() {
    try { return JSON.parse(localStorage.getItem(TUNE_MEMORY_KEY)) || {}; } catch { return {}; }
  },
  getAll() {
    const raw = this._raw();
    const out = {};
    for (const [id, val] of Object.entries(raw)) {
      out[id] = typeof val === "string" ? { alias: val } : val;
    }
    return out;
  },
  get(tuneId) { return this.getAll()[String(tuneId)] || null; },
  set(tuneId, patch) {
    const raw = this._raw();
    const existing = typeof raw[String(tuneId)] === "string"
      ? { alias: raw[String(tuneId)] }
      : (raw[String(tuneId)] || {});
    raw[String(tuneId)] = { ...existing, ...patch };
    localStorage.setItem(TUNE_MEMORY_KEY, JSON.stringify(raw));
  },
};

const Store = {
  _all() {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || {};
    } catch {
      return {};
    }
  },

  _persist(all) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  },

  list() {
    return Object.values(this._all())
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },

  get(id) {
    return this._all()[id] || null;
  },

  save(session) {
    const all = this._all();
    all[session.id] = session;
    this._persist(all);
    return session;
  },

  remove(id) {
    const all = this._all();
    delete all[id];
    this._persist(all);
  },

  // Portability so nothing is lost before a backend exists.
  exportJSON(session) {
    return JSON.stringify(session, null, 2);
  },

  importJSON(text) {
    const session = JSON.parse(text);
    if (!session.id) session.id = newId();
    return this.save(session);
  },
};

export { Store, TuneMemoryStore, emptySession, emptySet, tuneEntry, newId };
