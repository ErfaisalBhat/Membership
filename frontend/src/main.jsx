import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { MemberAuthProvider } from "./account/MemberAuthContext";
import { loadConfig } from "./api/useConfig";
import App from "./App";
import "./index.css";

// Use the organization's name as the browser tab title.
loadConfig()
  .then((c) => {
    document.title = `${c.orgCode} Membership`;
  })
  .catch(() => {});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MemberAuthProvider>
          <App />
        </MemberAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
