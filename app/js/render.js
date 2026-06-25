// render.js
// Pure session -> HTML for the printable / shareable setlist. No storage, no
// form logic. The same function feeds the on-screen preview and the
// print-to-PDF output (and, in Tier 2, a live read-only page) unchanged.

function esc(s) {
  return (s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function titleType(type) {
  // thesession stores lowercase ("slip jig"); display as Title Case.
  return (type || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso || "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" });
}

function tuneUrl(tune) {
  if (!tune.url) return null;
  return tune.setting_id ? `${tune.url}#setting${tune.setting_id}` : tune.url;
}

function tuneCell(tune) {
  const name = esc(tune.preferred_alias || tune.canonical_name || tune.raw_name || "");
  const url = tuneUrl(tune);
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${name}</a>` : name;
}

function renderSession(session) {
  const title = `${formatDate(session.date)} session at ${esc(session.venue || "")}`;
  const rows = [];

  session.sets.forEach((set, i) => {
    const setNo = i + 1;
    const count = set.tunes.length;
    // Set header: name + requester in first two cells, rest empty
    rows.push(`
      <tr class="set-header">
        <td class="set-no"><strong>Set ${setNo}</strong> <span class="count">(${count})</span></td>
        <td class="set-requester">${esc(set.requester)}</td>
        <td colspan="2"></td>
      </tr>`);
    set.tunes.forEach((tune, j) => {
      rows.push(`
        <tr>
          <td class="tune-no">${j + 1}</td>
          <td></td>
          <td class="tune">${tuneCell(tune)}</td>
          <td class="type">${esc(titleType(tune.type))}</td>
        </tr>`);
    });
  });

  return `
    <div class="setlist">
      <h1 class="setlist-title">${title}</h1>
      <table class="setlist-table">
        <colgroup>
          <col class="col-set">
          <col class="col-req">
          <col class="col-tune">
          <col class="col-type">
        </colgroup>
        <thead>
          <tr>
            <th>Set / #</th><th>Requested By</th><th>Tune Name and Link</th><th>Tune Type</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>`;
}

export { renderSession, formatDate, titleType };
