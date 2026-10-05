// Keychron Dash admin: password login, searchable score table with contact
// details, CSV export and delete. Talks to /api/admin/* (cookie session).

type Row = {
  id: number;
  name: string;
  email: string;
  phone: string;
  score: number;
  switches: number;
  distance: number;
  createdAt: string;
};

const PAGE = 100;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const loginView = $("login-view");
const dataView = $("data-view");
const loginForm = $<HTMLFormElement>("login-form");
const loginError = $("login-error");
const search = $<HTMLInputElement>("search");
const tbody = $("rows");
const summary = $("summary");
const more = $<HTMLButtonElement>("more");
const csv = $<HTMLAnchorElement>("csv");
const notice = $("notice");

let offset = 0;
let total = 0;
let pendingDelete: number | null = null;

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
};

function show(view: "login" | "data") {
  loginView.hidden = view !== "login";
  dataView.hidden = view !== "data";
  $("logout").hidden = view !== "data";
}

function flash(message: string) {
  notice.textContent = message;
  notice.hidden = false;
  window.setTimeout(() => {
    notice.hidden = true;
  }, 2500);
}

function cell(text: string, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderRows(rows: Row[], append: boolean) {
  if (!append) tbody.replaceChildren();
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.append(
      cell(String(offset + i + 1), "num"),
      cell(row.name),
      cell(row.email),
      cell(row.phone),
      cell(String(row.score).padStart(5, "0"), "num score"),
      cell(String(row.switches), "num"),
      cell(`${row.distance} m`, "num"),
      cell(formatDate(row.createdAt)),
    );
    const actions = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = pendingDelete === row.id ? "Confirm delete" : "Delete";
    del.addEventListener("click", () => void onDelete(row.id, del));
    actions.append(del);
    tr.append(actions);
    tbody.append(tr);
  });
  if (!tbody.children.length) {
    const tr = document.createElement("tr");
    const td = cell(search.value ? "No scores match this search." : "No scores yet. They will appear here as people play.", "empty");
    td.colSpan = 9;
    tr.append(td);
    tbody.append(tr);
  }
}

async function load(append = false) {
  if (!append) offset = 0;
  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (search.value.trim()) params.set("q", search.value.trim());
  const response = await fetch(`/api/admin/scores?${params}`, { credentials: "same-origin" });
  if (response.status === 401) return show("login");
  if (!response.ok) return flash("Couldn't load scores. Please refresh.");
  const data = (await response.json()) as { total: number; scores: Row[] };
  total = data.total;
  renderRows(data.scores, append);
  offset += data.scores.length;
  summary.textContent = `${total} ${total === 1 ? "score" : "scores"}${search.value.trim() ? " matching" : ""}`;
  more.hidden = offset >= total;
  const csvParams = new URLSearchParams();
  if (search.value.trim()) csvParams.set("q", search.value.trim());
  csv.href = `/api/admin/scores.csv${csvParams.size ? `?${csvParams}` : ""}`;
  show("data");
}

async function onDelete(id: number, button: HTMLButtonElement) {
  if (pendingDelete !== id) {
    pendingDelete = id;
    button.textContent = "Confirm delete";
    window.setTimeout(() => {
      if (pendingDelete === id) {
        pendingDelete = null;
        button.textContent = "Delete";
      }
    }, 4000);
    return;
  }
  pendingDelete = null;
  const response = await fetch(`/api/admin/scores/${id}`, { method: "DELETE", credentials: "same-origin" });
  if (!response.ok) return flash("Couldn't delete that score.");
  flash("Score deleted");
  await load();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const password = ($<HTMLInputElement>("password")).value;
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
    credentials: "same-origin",
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    loginError.textContent = data.error ?? "Couldn't log in";
    return;
  }
  ($<HTMLInputElement>("password")).value = "";
  await load();
});

$("logout").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
  tbody.replaceChildren();
  show("login");
});

let searchTimer = 0;
search.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void load(), 300);
});
more.addEventListener("click", () => void load(true));
$("refresh").addEventListener("click", () => void load());

void (async () => {
  const me = await fetch("/api/admin/me", { credentials: "same-origin" });
  if (me.ok) await load();
  else show("login");
})();
