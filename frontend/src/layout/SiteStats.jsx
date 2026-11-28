import { useEffect, useState } from "react";
import { api } from "../api/client";
import Icon from "../ui/icons";

// "Online now" and "Visitors", below the footer of the public website.
// The browser keeps a random id (no personal data) and checks in when a page opens and every
// minute while the tab is visible. See backend/public/visitors.js.

const KEY = "mp_visitor_id";
const EVERY_MS = 60 * 1000;

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function visitorId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!/^[a-f0-9]{32}$/.test(id || "")) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return randomId(); // storage blocked (private window): counted for this page only
  }
}

const number = (n) => new Intl.NumberFormat("en-IN").format(n);

export default function SiteStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const id = visitorId();
    let alive = true;
    const ping = () => {
      if (document.visibilityState === "hidden") return;
      api("/public/presence", { method: "POST", json: { id }, auth: false })
        .then((s) => alive && setStats(s))
        .catch(() => {}); // the strip just stays hidden
    };
    ping();
    const timer = setInterval(ping, EVERY_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  if (!stats) return null;

  // Sits on the right of the footer row, beside the copyright.
  return (
    <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-brand-100 ring-1 ring-white/10">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-semibold tabular-nums text-white">{number(stats.online)}</span> online now
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-brand-100 ring-1 ring-white/10">
          <Icon name="eye" className="h-3.5 w-3.5 text-[#e2c48f]" />
          <span className="font-semibold tabular-nums text-white">{number(stats.visitors)}</span> visitors
        </span>
    </div>
  );
}
