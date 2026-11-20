import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { MemberAuthProvider } from "./account/MemberAuthContext";
import { loadConfig } from "./api/useConfig";
import App from "./App";
import "./index.css";

// Load the site settings early. The tab title stays "Membership" (index.html).
loadConfig().catch(() => {});

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
