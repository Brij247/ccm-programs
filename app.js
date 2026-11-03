import { firebaseConfig } from "./firebase-config.js";
import { createStore } from "./store.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s).trim().replace(/\s+/g, " ");
const key = (s) => norm(s).toLowerCase();
const splitNames = (s) => String(s).split(/[,\n;]/).map(norm).filter(Boolean);

let programs = [];
let view = "programs";
let editingId = null;
let store;

// ---------- "Your name" ----------
const myName = $("#myName");
try { myName.value = localStorage.getItem("ccm-my-name") || ""; } catch {}
myName.addEventListener("input", () => { try { localStorage.setItem("ccm-my-name", norm(myName.value)); } catch {} });
const stamp = () => ({ updatedAt: Date.now(), updatedBy: norm(myName.value) });

// ---------- helpers ----------
const isSingle = (p) => p.type === "single";
const typeLabel = (p) => (isSingle(p) ? "Single" : "Group");
function status(p) {
  const n = (p.participants || []).length;
  if (isSingle(p)) return n >= 1 ? "full" : "need";
  if (p.needed == null || p.needed === "") return "unset";
  return n >= p.needed ? "full" : "need";
}
function timeAgo(t) {
  if (!t) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return new Date(t).toLocaleDateString();
}
let toastTimer;
function toast(msg, action) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.onclick = () => { t.hidden = true; action.run(); };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 6000 : 2500);
}
function showBanner(html, isError) {
  const b = $("#banner");
  b.innerHTML = html;
  b.classList.toggle("error", !!isError);
  b.hidden = false;
}
const fail = (e) => { console.error(e); toast("Could not save: " + (e.code || e.message || e)); };

// Count how many programs each person is in (to flag people in many programs).
function personCounts() {
  const m = new Map();
  for (const p of programs) for (const n of p.participants || []) m.set(key(n), (m.get(key(n)) || 0) + 1);
  return m;
}

// ---------- render ----------
function render() {
  // Keep focus + typed text in "add participant" boxes when live updates re-render.
  const active = document.activeElement;
  const focusId = active?.dataset?.pid;
  const typed = {};
  document.querySelectorAll(".add-p input").forEach((i) => { if (i.value) typed[i.dataset.pid] = i.value; });

  renderStats();
  if (view === "programs") renderPrograms(); else renderPeople();

  for (const [pid, val] of Object.entries(typed)) {
    const i = document.querySelector(`.add-p input[data-pid="${CSS.escape(pid)}"]`);
    if (i) i.value = val;
  }
  if (focusId) {
    const i = document.querySelector(`.add-p input[data-pid="${CSS.escape(focusId)}"]`);
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
}

function renderStats() {
  const total = programs.reduce((a, p) => a + (p.participants || []).length, 0);
  const people = new Set(programs.flatMap((p) => (p.participants || []).map(key))).size;
  const need = programs.filter((p) => status(p) === "need").length;
  const empty = programs.filter((p) => !(p.participants || []).length).length;
  $("#stats").innerHTML = [
    [programs.length, "Programs"],
    [programs.filter(isSingle).length, "Single programs"],
    [total, "Participant slots filled"],
    [people, "Different people"],
    [need, "Need more people"],
    [empty, "No participants yet"],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
}

function matches(p, q) {
  if (!q) return true;
  const hay = [p.name, ...(p.leaders || []), ...(p.participants || []), p.notes].join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function renderPrograms() {
  const q = $("#search").value.trim().toLowerCase();
  const f = $("#filter").value;
  const tf = $("#typeFilter").value;
  const counts = personCounts();
  const list = programs
    .map((p, i) => ({ p, num: i + 1 }))
    .filter(({ p }) => matches(p, q))
    .filter(({ p }) => tf === "all" || (tf === "single") === isSingle(p))
    .filter(({ p }) => f === "all" || (f === "empty" ? !(p.participants || []).length : status(p) === f));

  const el = $("#list");
  if (!list.length) { el.innerHTML = `<p class="empty">No programs match.</p>`; return; }
  el.innerHTML = list.map(({ p, num }) => {
    const parts = p.participants || [];
    const st = status(p);
    const pct = st === "unset" ? (parts.length ? 100 : 0) : Math.min(100, p.needed ? (parts.length / p.needed) * 100 : 100);
    const pill = st === "unset" ? `${parts.length} joined` : `${parts.length} / ${p.needed}`;
    const left = st === "need" ? ` · ${p.needed - parts.length} more needed` : st === "full" ? " · filled" : " · target not set";
    const leaders = (p.leaders || []).join(", ");
    const single = isSingle(p);
    const leaderLine = leaders
      ? `${single ? "Coordinator" : "Leader"}${(p.leaders || []).length > 1 ? "s" : ""}: ${esc(leaders)}`
      : single ? "" : "No leader yet";
    const showAdd = !single || parts.length === 0;
    return `
    <article class="card" data-id="${esc(p.id)}">
      <div class="card-head">
        <span class="num">${num}</span>
        <div class="titles">
          <h2>${esc(p.name)} <span class="type ${single ? "single" : "group"}">${typeLabel(p)}</span></h2>
          ${leaderLine ? `<p class="leaders">${leaderLine}</p>` : ""}
        </div>
        <button type="button" class="edit" data-act="edit">Edit</button>
      </div>
      ${single ? "" : `<div class="progress ${st}">
        <div class="bar"><span style="width:${pct}%"></span></div>
        <span class="pill">${pill}</span>
      </div>
      <p class="meta">${esc(left.slice(3))}</p>`}
      ${parts.length
        ? `${single ? `<p class="meta">Performer</p>` : ""}<ul class="chips">${parts.map((n) => {
            const c = counts.get(key(n)) || 0;
            return `<li class="${c > 2 ? "dup" : ""}" title="${c > 1 ? `In ${c} programs` : ""}"><span>${esc(n)}</span><button type="button" data-act="rm" data-name="${esc(n)}" aria-label="Remove ${esc(n)}">×</button></li>`;
          }).join("")}</ul>`
        : `<p class="none">${single ? "No performer added yet." : "No participants added yet."}</p>`}
      ${showAdd ? `<form class="add-p" data-act="add">
        <input data-pid="${esc(p.id)}" placeholder="${single ? "Add performer name" : "Add name(s), comma separated"}" aria-label="Add ${single ? "performer" : "participant"} to ${esc(p.name)}" maxlength="300">
        <button type="submit">Add</button>
      </form>` : ""}
      ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ""}
      ${p.updatedAt ? `<p class="meta">Updated ${timeAgo(p.updatedAt)}${p.updatedBy ? " by " + esc(p.updatedBy) : ""}</p>` : ""}
    </article>`;
  }).join("");
}

function renderPeople() {
  const q = $("#search").value.trim().toLowerCase();
  const m = new Map();
  const get = (n) => {
    const k = key(n);
    if (!m.has(k)) m.set(k, { name: norm(n), in: [], leads: [] });
    return m.get(k);
  };
  for (const p of programs) {
    for (const n of p.participants || []) get(n).in.push(p.name);
    for (const n of p.leaders || []) get(n).leads.push(p.name);
  }
  const rows = [...m.values()]
    .filter((r) => !q || [r.name, ...r.in, ...r.leads].join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.in.length + b.leads.length - (a.in.length + a.leads.length) || a.name.localeCompare(b.name));
  const el = $("#people");
  if (!rows.length) { el.innerHTML = `<p class="empty" style="padding:16px">No people yet.</p>`; return; }
  el.innerHTML = `<table>
    <thead><tr><th>Name</th><th>Total</th><th>Programs</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td><strong>${esc(r.name)}</strong></td>
      <td class="count">${r.in.length + r.leads.length}</td>
      <td>${r.leads.map((n) => `<span class="tag lead">Leads: ${esc(n)}</span>`).join("")}${r.in.map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</td>
    </tr>`).join("")}</tbody></table>`;
}

// ---------- events ----------
$("#list").addEventListener("submit", (e) => {
  const form = e.target.closest("form.add-p");
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector("input");
  const id = form.closest(".card").dataset.id;
  const p = programs.find((x) => x.id === id);
  const existing = new Set((p.participants || []).map(key));
  const names = [];
  for (const n of splitNames(input.value)) if (!existing.has(key(n))) { existing.add(key(n)); names.push(n); }
  input.value = "";
  if (!names.length) { toast("Already in this program"); return; }
  if (isSingle(p)) {
    if ((p.participants || []).length) { toast("A single program has one performer. Remove the current one first."); return; }
    names.splice(1);
  }
  store.addParticipants(id, names, stamp()).then(() => toast(`Added ${names.join(", ")}`)).catch(fail);
});

$("#list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest(".card").dataset.id;
  if (btn.dataset.act === "edit") openEdit(id);
  if (btn.dataset.act === "rm") {
    const name = btn.dataset.name;
    store.removeParticipant(id, name, stamp())
      .then(() => toast(`Removed ${name}`, { label: "Undo", run: () => store.addParticipants(id, [name], stamp()).catch(fail) }))
      .catch(fail);
  }
});

$("#search").addEventListener("input", render);
$("#filter").addEventListener("change", render);
$("#typeFilter").addEventListener("change", render);
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  view = b.dataset.view;
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  $("#list").hidden = view !== "programs";
  $("#people").hidden = view !== "people";
  $("#filter").hidden = view !== "programs";
  $("#typeFilter").hidden = view !== "programs";
  render();
}));

// ---------- edit dialog ----------
const dlg = $("#editDlg");
const form = $("#editForm");
const F = form.elements;
function openEdit(id) {
  editingId = id;
  const p = id ? programs.find((x) => x.id === id) : { name: "", type: "group", leaders: [], needed: null, notes: "" };
  $("#dlgTitle").textContent = id ? "Edit program" : "Add program";
  F.name.value = p.name || "";
  F.type.value = isSingle(p) ? "single" : "group";
  syncTypeFields();
  F.leaders.value = (p.leaders || []).join(", ");
  F.needed.value = p.needed ?? "";
  F.notes.value = p.notes || "";
  $("#deleteBtn").hidden = !id;
  dlg.showModal();
  F.name.focus();
}
function syncTypeFields() {
  const single = F.type.value === "single";
  $("#neededField").hidden = single;
  $("#leadersLabel").textContent = single ? "Coordinator(s) (optional)" : "Leader(s)";
}
F.type.addEventListener("change", syncTypeFields);
$("#addBtn").addEventListener("click", () => openEdit(null));
$("#cancelBtn").addEventListener("click", () => dlg.close());
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const neededRaw = F.needed.value.trim();
  const single = F.type.value === "single";
  const fields = {
    name: norm(F.name.value),
    type: single ? "single" : "group",
    leaders: splitNames(F.leaders.value),
    needed: single ? 1 : neededRaw === "" ? null : Math.max(0, parseInt(neededRaw, 10) || 0),
    notes: F.notes.value.trim(),
    ...stamp(),
  };
  if (!fields.name) return;
  const cur = editingId && programs.find((x) => x.id === editingId);
  if (single && cur && (cur.participants || []).length > 1) {
    alert("This program has more than one participant. Remove extra names before making it a single program.");
    return;
  }
  const isEdit = !!editingId;
  const op = editingId
    ? store.update(editingId, fields)
    : store.add({ ...fields, participants: [], order: Math.max(0, ...programs.map((p) => p.order || 0)) + 1 });
  dlg.close();
  op.then(() => toast(isEdit ? "Saved" : "Program added")).catch(fail);
});
$("#deleteBtn").addEventListener("click", () => {
  const p = programs.find((x) => x.id === editingId);
  if (!p || !confirm(`Delete "${p.name}" and its participant list? This cannot be undone.`)) return;
  const id = editingId;
  dlg.close();
  store.remove(id).then(() => toast("Program deleted")).catch(fail);
});

// ---------- Excel export ----------
const XLSX_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
$("#exportBtn").addEventListener("click", async () => {
  const btn = $("#exportBtn");
  btn.disabled = true;
  btn.textContent = "Preparing…";
  try {
    const XLSX = await import(XLSX_URL);
    const fmtTime = (t) => (t ? new Date(t).toLocaleString() : "");

    // Sheet 1: one row per program
    const summary = programs.map((p, i) => {
      const n = (p.participants || []).length;
      return {
        "#": i + 1,
        Program: p.name,
        Type: typeLabel(p),
        "Leader(s)": (p.leaders || []).join(", "),
        "Total needed": p.needed ?? "",
        Joined: n,
        "Still needed": p.needed == null ? "" : Math.max(0, p.needed - n),
        Participants: (p.participants || []).join(", "),
        Notes: p.notes || "",
        "Last updated": fmtTime(p.updatedAt),
        "Updated by": p.updatedBy || "",
      };
    });

    // Sheet 2: one row per participant (easy to filter / sort in Excel)
    const rows = [];
    programs.forEach((p, i) => (p.participants || []).forEach((name) =>
      rows.push({ "#": i + 1, Program: p.name, Type: typeLabel(p), Participant: name, "Leader(s)": (p.leaders || []).join(", ") })));

    // Sheet 3: one row per person with all their programs
    const m = new Map();
    const get = (n) => { const k = key(n); if (!m.has(k)) m.set(k, { name: norm(n), in: [], leads: [] }); return m.get(k); };
    for (const p of programs) {
      for (const n of p.participants || []) get(n).in.push(p.name);
      for (const n of p.leaders || []) get(n).leads.push(p.name);
    }
    const people = [...m.values()].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({
      Name: r.name,
      "Programs joined": r.in.length,
      "Programs led": r.leads.length,
      "Participating in": r.in.join(", "),
      Leading: r.leads.join(", "),
    }));

    const wb = XLSX.utils.book_new();
    const add = (data, name, widths, header) => {
      const ws = XLSX.utils.json_to_sheet(data, header ? { header } : undefined);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    add(summary, "Programs", [4, 32, 8, 30, 12, 8, 12, 60, 40, 20, 16]);
    add(rows, "Participants", [4, 32, 8, 28, 30], ["#", "Program", "Type", "Participant", "Leader(s)"]);
    add(people, "By person", [24, 15, 13, 60, 40], ["Name", "Programs joined", "Programs led", "Participating in", "Leading"]);
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `CCM-Anniversary-Programs-${date}.xlsx`);
  } catch (e) {
    console.error(e);
    toast("Could not create the Excel file. Check your internet connection.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Download Excel";
  }
});

// ---------- start ----------
setInterval(() => { if (view === "programs" && !document.activeElement?.closest?.(".add-p")) render(); }, 60000);

try {
  store = await createStore(firebaseConfig);
  if (store.mode === "local") {
    showBanner("<strong>Local mode:</strong> changes are saved only in this browser. Add your Firebase config in <code>firebase-config.js</code> to share edits with everyone (see README).");
  }
  store.subscribe(
    (data) => { programs = data; render(); },
    (err) => {
      console.error(err);
      showBanner(`<strong>Could not load shared data:</strong> ${esc(err.code || err.message)}. Check the Firestore rules and config (see README).`, true);
    }
  );
} catch (err) {
  console.error(err);
  showBanner(`<strong>Could not connect:</strong> ${esc(err.message)}`, true);
}
