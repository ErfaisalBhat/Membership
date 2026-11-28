import { useEffect, useState } from "react";
import { api } from "./client";

// Membership types, fees and dropdown values come from the backend
// (backend/config/membership.js), so they're defined in one place.
let cached = null;

export function loadConfig() {
  if (!cached) {
    cached = api("/public/config", { auth: false }).catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

// After the admin changes something the config carries (e.g. the fees): fetch it afresh.
export function reloadConfig() {
  cached = null;
  return loadConfig();
}

export function useConfig() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    loadConfig()
      .then((c) => alive && setConfig(c))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, []);
  return { config, error };
}

export function typeInfo(config, key) {
  return config?.membershipTypes.find((t) => t.key === key) || null;
}

// The plans people can apply for on the website. Honorary and Emeritus (adminOnly) are
// conferred by the Society and added by the admin only.
export function joinableTypes(config) {
  return (config?.membershipTypes || []).filter((t) => !t.adminOnly);
}
