import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, memberTokenStore } from "../api/client";

// Remembers the logged-in member (their own account, not the admin).
const MemberAuthContext = createContext(null);

export function MemberAuthProvider({ children }) {
  // status: "checking" | "in" | "out"
  const [status, setStatus] = useState(() => (memberTokenStore.get() ? "checking" : "out"));
  const [account, setAccount] = useState(null); // { member, renewal, onlinePayments }

  useEffect(() => {
    if (status !== "checking") return;
    api("/account/me", { auth: "member" })
      .then((data) => {
        setAccount(data);
        setStatus("in");
      })
      .catch(() => {
        memberTokenStore.clear();
        setStatus("out");
      });
  }, [status]);

  useEffect(() => {
    const end = () => {
      setAccount(null);
      setStatus("out");
    };
    window.addEventListener("mp:member-session-ended", end);
    return () => window.removeEventListener("mp:member-session-ended", end);
  }, []);

  const requestCode = useCallback((email) => api("/account/otp", { method: "POST", json: { email }, auth: false }), []);

  const verifyCode = useCallback(async (email, code) => {
    const data = await api("/account/verify", { method: "POST", json: { email, code }, auth: false });
    memberTokenStore.set(data.token);
    setAccount({ member: data.member, renewal: data.renewal, onlinePayments: data.onlinePayments });
    setStatus("in");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/account/logout", { method: "POST", auth: "member" });
    } catch {
      /* already logged out */
    }
    memberTokenStore.clear();
    setAccount(null);
    setStatus("out");
  }, []);

  const value = useMemo(
    () => ({ status, account, setAccount, requestCode, verifyCode, logout }),
    [status, account, requestCode, verifyCode, logout]
  );
  return <MemberAuthContext.Provider value={value}>{children}</MemberAuthContext.Provider>;
}

export function useMemberAuth() {
  return useContext(MemberAuthContext);
}
