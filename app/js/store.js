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
    preferred_alias: null, // locally-remembered alternate name, persists across sessions
    setting_id: null,      // thesession.org setting ID for deep-link anchor
  };
}

// Separate key so preferred alias memory persists independently of session data.
const PREF_ALIASES_KEY = "bham_preferred_aliases";

const PreferredAliasStore = {
  getAll() {
    try { return JSON.parse(localStorage.getItem(PREF_ALIASES_KEY)) || {}; } catch { return {}; }
  },
  get(tuneId) { return this.getAll()[String(tuneId)] || null; },
  set(tuneId, alias) {
    const all = this.getAll();
    all[String(tuneId)] = alias;
    localStorage.setItem(PREF_ALIASES_KEY, JSON.stringify(all));
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

export { Store, PreferredAliasStore, emptySession, emptySet, tuneEntry, newId };
