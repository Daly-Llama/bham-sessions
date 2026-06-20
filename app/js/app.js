// app.js
// Wires the phone-first entry form to the matcher, store, and renderer.
// Vanilla DOM, event delegation. Loads tune_index.json at startup.

import { Matcher } from "./matcher.js";
import { Store, emptySession, emptySet, tuneEntry } from "./store.js";
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
  row.className = "tune-row" + (tune.source === "custom" ? " custom" : "");
  row.dataset.set = setIdx;
  row.dataset.tune = tuneIdx;

  const typeLabel = tune.type ? titleType(tune.type) : "";
  const badge = tune.source === "custom"
    ? `<span class="badge custom-badge">custom</span>`
    : (tune.tune_id ? `<span class="badge linked">✓ linked</span>` : "");

  row.innerHTML = `
    <span class="order">${tuneIdx + 1}</span>
    <div class="tune-field">
      <input class="tune-name" placeholder="Tune name…" autocomplete="off"
             value="${attr(tune.canonical_name || tune.raw_name)}">
      <div class="suggestions" hidden></div>
    </div>
    <span class="tune-type">${esc(typeLabel)}</span>
    ${badge}
    <button class="icon-btn del-tune" title="Remove tune">✕</button>`;
  return row;
}

// ---- autocomplete ----------------------------------------------------------

function showSuggestions(input, setIdx, tuneIdx) {
  const box = input.parentElement.querySelector(".suggestions");
  const results = matcher.search(input.value, { limit: 8 });
  if (!results.length) { box.hidden = true; box.innerHTML = ""; return; }

  box.innerHTML = results.map((r) => `
    <button class="suggestion" data-id="${r.id}">
      <span class="s-name">${esc(r.name)}</span>
      <span class="s-meta">${esc(titleType(r.type))}</span>
      ${r.matchedAlias ? `<span class="s-alias">aka ${esc(r.matchedAlias)}</span>` : ""}
    </button>`).join("");
  box.hidden = false;

  box.querySelectorAll(".suggestion").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep focus / fire before blur
      const chosen = results.find((r) => String(r.id) === btn.dataset.id);
      assignTune(setIdx, tuneIdx, chosen);
    });
  });
}

function assignTune(setIdx, tuneIdx, chosen) {
  const t = session.sets[setIdx].tunes[tuneIdx];
  t.canonical_name = chosen.name;
  t.type = chosen.type;
  t.tune_id = chosen.id;
  t.url = chosen.url;
  t.source = "thesession";
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
    const row = e.target.closest(".set-card");
    if (!row) return;
    const setIdx = +row.dataset.set;
    if (e.target.classList.contains("requester")) {
      session.sets[setIdx].requester = e.target.value; persist();
    } else if (e.target.classList.contains("tune-name")) {
      const tuneIdx = +e.target.closest(".tune-row").dataset.tune;
      const t = session.sets[setIdx].tunes[tuneIdx];
      t.raw_name = e.target.value;
      // Typing past a linked tune unlinks it until re-selected.
      if (t.tune_id && e.target.value !== t.canonical_name) {
        t.tune_id = null; t.url = null; t.canonical_name = ""; t.source = "thesession";
      }
      persist();
      showSuggestions(e.target, setIdx, tuneIdx);
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
    }
  });

  // Custom tunes: editing type/url happens inline via the type span + url field
  // when source === custom. Handled with a lightweight prompt for Tier 1.
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
