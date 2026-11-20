// All calls to the backend go through here.
// In development Vite forwards /api to the backend; in production the backend serves this app.
const BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

// Three kinds of login, each kept in sessionStorage (cleared when the tab closes):
//   admin  - the admin panel
//   member - a member's own account
//   join   - an applicant who verified their email on the join page
function makeStore(key) {
  return {
    get() {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(token) {
      try {
        sessionStorage.setItem(key, token);
      } catch {
        /* storage unavailable */
      }
    },
    clear() {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
  };
}

export const tokenStore = makeStore("mp_admin_token");
export const memberTokenStore = makeStore("mp_member_token");
export const joinTokenStore = makeStore("mp_join_token");

export class ApiError extends Error {
  constructor(message, status, errors, code) {
    super(message);
    this.status = status;
    this.errors = errors || {};
    this.code = code || "";
  }
}

export const apiUrl = (path) => `${BASE}/api${path}`;

function authHeaders(auth) {
  if (auth === "admin") {
    const t = tokenStore.get();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
  if (auth === "member") {
    const t = memberTokenStore.get();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
  if (auth === "join") {
    const t = joinTokenStore.get();
    return t ? { "X-Join-Token": t } : {};
  }
  return {};
}

const SESSION_EVENTS = { admin: "mp:session-ended", member: "mp:member-session-ended", join: "mp:join-session-ended" };
const STORES = { admin: tokenStore, member: memberTokenStore, join: joinTokenStore };

// auth: "admin" (default), "member", "join" or false
async function request(path, { method = "GET", json, form, auth = "admin" } = {}) {
  const headers = auth ? authHeaders(auth) : {};
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }

  let res;
  try {
    res = await fetch(apiUrl(path), { method, headers, body });
  } catch {
    throw new ApiError("Cannot reach the server. Please check your connection.", 0);
  }

  if (res.status === 401 && auth && STORES[auth] && STORES[auth].get()) {
    STORES[auth].clear();
    window.dispatchEvent(new Event(SESSION_EVENTS[auth]));
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    throw new ApiError(data?.message || `Request failed (${res.status}).`, res.status, data?.errors, data?.code);
  }
  return res;
}

export async function api(path, options) {
  const res = await request(path, options);
  return res.status === 204 ? null : res.json();
}

export async function apiBlob(path, options) {
  const res = await request(path, options);
  return res.blob();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Opens a protected file (PDF, image) in a new tab. The tab is opened first,
// synchronously, so pop-up blockers allow it.
export async function openInNewTab(path, auth = "admin") {
  const win = window.open("about:blank", "_blank");
  try {
    const blob = await apiBlob(path, { auth });
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}
