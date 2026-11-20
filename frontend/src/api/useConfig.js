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
