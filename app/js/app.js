// app.js
// Wires the phone-first entry form to the matcher, store, and renderer.
// Vanilla DOM, event delegation. Loads tune_index.json at startup.

import { Matcher, norm } from "./matcher.js";
import { Store, TuneMemoryStore, emptySession, emptySet, tuneEntry } from "./store.js";
import { renderSession, titleType } from "./render.js";

let matcher = null;
let session = null;

const $ = (sel, root = document) => root.querySelector(sel);

// ---- persistence helpers ---------------------------------------------------

function persist() {
  Store.save(session);
}

function loadSession() {
  const existing = Store.list();
  session = existing[0] || Store.save(emptySession());
}

// ---- type abbreviation -----------------------------------------------------

const TYPE_ABBREV = {
  reel: "R", jig: "J", "slip jig": "SJ", hornpipe: "H",
  polka: "P", waltz: "W", slide: "S", march: "M",
  "set dance": "SD", barndance: "B", strathspey: "St", mazurka: "Mz",
};

function abbrevType(type) {
  if (!type) return "";
  return TYPE_ABBREV[type.toLowerCase()] || type.slice(0, 2).toUpperCase();
}

// ---- editor rendering ------------------------------------------------------

function setMeta() {
  $("#session-date").value = session.date;
  $("#session-venue").value = session.venue;
}

function renderEditor() {
  const wrap = $("#sets");
  wrap.innerHTML = "";
  session.sets.forEach((set, i) => wrap.appendChild(renderSetCard(set, i)));
  $("#set-count").textContent = session.sets.length;
}

function renderSetCard(set, setIdx) {
  const card = document.createElement("div");
  card.className = "set-card";
  card.dataset.set = setIdx;
  card.innerHTML = `
    <div class="set-card-head">
      <span class="set-label">Set ${setIdx + 1}</span>
      <input class="requester" placeholder="Requested by…" value="${attr(set.requester)}">
      <button class="icon-btn del-set" title="Delete set">✕</button>
    </div>
    <div class="tunes"></div>
    <div class="set-actions">
      <button class="add-tune">+ Tune</button>
      <button class="add-custom">+ Custom tune</button>
    </div>`;

  const tunesEl = $(".tunes", card);
  set.tunes.forEach((t, j) => tunesEl.appendChild(renderTuneRow(t, setIdx, j)));
  return card;
}

function renderTuneRow(tune, setIdx, tuneIdx) {
  const row = document.createElement("div");
  const isLinked = !!(tune.tune_id && tune.source === "thesession");
  const isCustom = tune.source === "custom";
  const autoOpen = isLinked && !!tune.setting_id;

  row.className = "tune-row" + (isCustom ? " custom" : "") + (autoOpen ? " detail-open" : "");
  row.dataset.set = setIdx;
  row.dataset.tune = tuneIdx;

  const displayName = tune.preferred_alias || tune.canonical_name || tune.raw_name;
  const abbrev = tune.type ? abbrevType(tune.type) : "";
  const tuneHref = tune.url
    ? (tune.setting_id ? `${tune.url}#setting${tune.setting_id}` : tune.url)
    : null;

  // Icons shown to the right of the tune name
  let extraIcons = "";
  if (isLinked) {
    extraIcons = `
      <span class="type-abbrev" title="${esc(titleType(tune.type))}">${esc(abbrev)}</span>
      <a class="tune-link-btn icon-btn" href="${esc(tuneHref)}" target="_blank"
         rel="noopener" title="View on thesession.org">↗</a>
      <button class="icon-btn expand-btn" title="Setting options">${autoOpen ? "▴" : "▾"}</button>`;
  } else if (isCustom) {
    if (abbrev) extraIcons += `<span class="type-abbrev" title="${esc(titleType(tune.type))}">${esc(abbrev)}</span>`;
    if (tuneHref) extraIcons += `<a class="tune-link-btn icon-btn" href="${esc(tuneHref)}" target="_blank" rel="noopener" title="View link">↗</a>`;
  }

  // Expandable detail row for setting ID (linked tunes only)
  const detailRow = isLinked ? `
    <div class="tune-row-detail">
      <span class="detail-label">Setting #</span>
      <input class="setting-id" type="number" min="1" placeholder="thesession.org setting ID"
             value="${attr(String(tune.setting_id || ""))}">
    </div>` : "";

  row.innerHTML = `
    <div class="tune-row-main">
      <span class="order">${tuneIdx + 1}</span>
      <div class="tune-field">
        <input class="tune-name" placeholder="Tune name…" autocomplete="off"
               value="${attr(displayName)}">
        <div class="suggestions" hidden></div>
      </div>
      ${extraIcons}
      <button class="icon-btn del-tune" title="Remove tune">✕</button>
    </div>
    ${detailRow}`;
  return row;
}

// ---- autocomplete ----------------------------------------------------------

function showSuggestions(input, setIdx, tuneIdx) {
  const box = input.parentElement.querySelector(".suggestions");
  const results = matcher.search(input.value, { limit: 8 });
  if (!results.length) { box.hidden = true; box.innerHTML = ""; return; }

  // Apply stored preferred alias and flag tunes with saved memory.
  const displayResults = results.map((r) => {
    const mem = TuneMemoryStore.get(r.id);
    const hasMem = !!(mem?.alias || mem?.setting_id);
    const pref = mem?.alias;
    return {
      ...r,
      name: pref || r.name,
      matchedAlias: pref ? null : r.matchedAlias,
      hasMem,
    };
  });

  box.innerHTML = displayResults.map((r) => `
    <button class="suggestion" data-id="${r.id}">
      ${r.hasMem ? `<span class="s-dot" title="Previously used">●</span>` : ""}
      <span class="s-name">${esc(r.name)}</span>
      <span class="s-meta">${esc(titleType(r.type))}</span>
      ${r.matchedAlias ? `<span class="s-alias">aka ${esc(r.matchedAlias)}</span>` : ""}
      <a class="s-link" href="${esc(r.url)}" target="_blank" rel="noopener"
         title="View on thesession.org" tabindex="-1">↗</a>
    </button>`).join("");
  box.hidden = false;

  box.querySelectorAll(".suggestion").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      if (e.target.closest(".s-link")) return; // let the link open without selecting
      e.preventDefault(); // keep focus / fire before blur
      const chosen = results.find((r) => String(r.id) === btn.dataset.id);
      assignTune(setIdx, tuneIdx, chosen);
    });
  });
}

function injectPreferredAlias(tuneId, alias) {
  const tune = matcher.index.find((t) => t.id === tuneId);
  if (!tune) return;
  const key = norm(alias);
  if (!matcher.entries.some((e) => e.key === key && e.tune.id === tuneId)) {
    matcher.entries.push({ key, label: alias, tune, alias: true });
  }
}

function assignTune(setIdx, tuneIdx, chosen) {
  const t = session.sets[setIdx].tunes[tuneIdx];

  // Save alias preference if matched via alias
  if (chosen.matchedAlias) {
    TuneMemoryStore.set(chosen.id, { alias: chosen.matchedAlias });
    injectPreferredAlias(chosen.id, chosen.matchedAlias);
  }

  // Load all saved memory for this tune (alias + setting_id)
  const mem = TuneMemoryStore.get(chosen.id);
  t.canonical_name = chosen.name;
  t.preferred_alias = mem?.alias || null;
  t.type = chosen.type;
  t.tune_id = chosen.id;
  t.url = chosen.url;
  t.source = "thesession";
  t.setting_id = mem?.setting_id || null; // auto-populate saved setting
  persist();
  renderEditor();
}

// ---- mutations -------------------------------------------------------------

function addSet() {
  session.sets.push(emptySet(session.sets.length));
  const set = session.sets[session.sets.length - 1];
  set.tunes.push(tuneEntry(1));
  persist(); renderEditor();
}

function addTune(setIdx, custom = false) {
  const set = session.sets[setIdx];
  const t = tuneEntry(set.tunes.length + 1);
  if (custom) t.source = "custom";
  set.tunes.push(t);
  persist(); renderEditor();
}

// ---- preview / export ------------------------------------------------------

function showPreview() {
  $("#preview").innerHTML = renderSession(session);
  document.body.classList.add("previewing");
}

function showEditor() {
  document.body.classList.remove("previewing");
}

function exportJSON() {
  const blob = new Blob([Store.exportJSON(session)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `session-${session.date}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- events ----------------------------------------------------------------

function wireEvents() {
  $("#session-date").addEventListener("change", (e) => { session.date = e.target.value; persist(); });
  $("#session-venue").addEventListener("change", (e) => { session.venue = e.target.value; persist(); });
  $("#add-set").addEventListener("click", addSet);
  $("#btn-preview").addEventListener("click", showPreview);
  $("#btn-edit").addEventListener("click", showEditor);
  $("#btn-pdf").addEventListener("click", () => { showPreview(); setTimeout(() => window.print(), 50); });
  $("#btn-export").addEventListener("click", exportJSON);
  $("#btn-new").addEventListener("click", () => {
    if (!confirm("Start a new session? The current one is saved and stays in your list.")) return;
    session = Store.save(emptySession());
    setMeta(); renderEditor();
  });

  const sets = $("#sets");

  // Text inputs: bind directly so focus is never lost mid-typing.
  sets.addEventListener("input", (e) => {
    const card = e.target.closest(".set-card");
    if (!card) return;
    const setIdx = +card.dataset.set;
    if (e.target.classList.contains("requester")) {
      session.sets[setIdx].requester = e.target.value; persist();
    } else if (e.target.classList.contains("tune-name")) {
      const tuneIdx = +e.target.closest(".tune-row").dataset.tune;
      const t = session.sets[setIdx].tunes[tuneIdx];
      t.raw_name = e.target.value;
      // Typing past a linked tune unlinks it until re-selected.
      if (t.tune_id && e.target.value !== (t.preferred_alias || t.canonical_name)) {
        t.tune_id = null; t.url = null; t.canonical_name = "";
        t.preferred_alias = null; t.setting_id = null; t.source = "thesession";
      }
      persist();
      showSuggestions(e.target, setIdx, tuneIdx);
    } else if (e.target.classList.contains("setting-id")) {
      const tuneRow = e.target.closest(".tune-row");
      const tuneIdx = +tuneRow.dataset.tune;
      const t = session.sets[setIdx].tunes[tuneIdx];
      const raw = e.target.value.trim();
      t.setting_id = raw ? parseInt(raw, 10) : null;
      // Persist to memory so it auto-populates on future selection
      if (t.tune_id && t.setting_id) {
        TuneMemoryStore.set(t.tune_id, { setting_id: t.setting_id });
      }
      // Update the link href in-place (no renderEditor — avoids destroying the input)
      const linkBtn = tuneRow.querySelector(".tune-link-btn");
      if (linkBtn && t.url) {
        linkBtn.href = t.setting_id ? `${t.url}#setting${t.setting_id}` : t.url;
      }
      persist();
    }
  });

  sets.addEventListener("focusin", (e) => {
    if (e.target.classList.contains("tune-name") && e.target.value) {
      const card = e.target.closest(".set-card");
      const tuneIdx = +e.target.closest(".tune-row").dataset.tune;
      showSuggestions(e.target, +card.dataset.set, tuneIdx);
    }
  });

  sets.addEventListener("focusout", (e) => {
    if (e.target.classList.contains("tune-name")) {
      const box = e.target.parentElement.querySelector(".suggestions");
      setTimeout(() => { if (box) box.hidden = true; }, 120);
    }
  });

  sets.addEventListener("click", (e) => {
    const card = e.target.closest(".set-card");
    if (!card) return;
    const setIdx = +card.dataset.set;
    if (e.target.classList.contains("add-tune")) addTune(setIdx, false);
    else if (e.target.classList.contains("add-custom")) addTune(setIdx, true);
    else if (e.target.classList.contains("del-set")) {
      session.sets.splice(setIdx, 1); persist(); renderEditor();
    } else if (e.target.classList.contains("del-tune")) {
      const tuneIdx = +e.target.closest(".tune-row").dataset.tune;
      session.sets[setIdx].tunes.splice(tuneIdx, 1); persist(); renderEditor();
    } else if (e.target.classList.contains("expand-btn")) {
      const rowEl = e.target.closest(".tune-row");
      const isOpen = rowEl.classList.toggle("detail-open");
      e.target.textContent = isOpen ? "▴" : "▾";
    }
  });

  // Custom tunes: dblclick to set type/url via prompt.
  sets.addEventListener("dblclick", (e) => {
    const rowEl = e.target.closest(".tune-row.custom");
    if (!rowEl) return;
    const setIdx = +rowEl.dataset.set, tuneIdx = +rowEl.dataset.tune;
    const t = session.sets[setIdx].tunes[tuneIdx];
    const type = prompt("Tune type (e.g. Reel, Jig, Song):", t.type || "");
    if (type !== null) t.type = type.trim().toLowerCase();
    const url = prompt("Optional link URL (leave blank for none):", t.url || "");
    t.url = url && url.trim() ? url.trim() : null;
    t.canonical_name = $(".tune-name", rowEl).value;
    persist(); renderEditor();
  });
}

// ---- utils -----------------------------------------------------------------

function esc(s) {
  return (s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function attr(s) { return esc(s).replace(/"/g, "&quot;"); }

// ---- bootstrap -------------------------------------------------------------

async function main() {
  const res = await fetch("tune_index.json");
  matcher = new Matcher(await res.json());
  // Inject saved preferred aliases so they rank in searches this session.
  for (const [tuneId, mem] of Object.entries(TuneMemoryStore.getAll())) {
    if (mem.alias) injectPreferredAlias(parseInt(tuneId, 10), mem.alias);
  }
  loadSession();
  if (!session.sets.length) addSet();
  setMeta();
  renderEditor();
  wireEvents();
  $("#loading").remove();
}

main().catch((err) => {
  document.getElementById("loading").textContent =
    "Failed to load. Run this from a local web server (see README): " + err;
});
