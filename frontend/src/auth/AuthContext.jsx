import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokenStore } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // status: "checking" | "in" | "out"
  const [status, setStatus] = useState(() => (tokenStore.get() ? "checking" : "out"));
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (status !== "checking") return;
    api("/auth/me")
      .then((me) => {
        setUsername(me.username);
        setStatus("in");
      })
      .catch(() => {
        tokenStore.clear();
        setStatus("out");
      });
  }, [status]);

  // Any request that gets 401 ends the session.
  useEffect(() => {
    const end = () => setStatus("out");
    window.addEventListener("mp:session-ended", end);
    return () => window.removeEventListener("mp:session-ended", end);
  }, []);

  const login = useCallback(async (user, password) => {
    const data = await api("/auth/login", { method: "POST", json: { username: user, password }, auth: false });
    tokenStore.set(data.token);
    setUsername(data.username);
    setStatus("in");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* already logged out */
    }
    tokenStore.clear();
    setStatus("out");
  }, []);

  const value = useMemo(() => ({ status, username, login, logout }), [status, username, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
