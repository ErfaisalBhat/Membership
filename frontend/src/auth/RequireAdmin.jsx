import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Spinner } from "../ui/form";

export default function RequireAdmin({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "checking") return <Spinner label="Checking session…" />;
  if (status !== "in") return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}
