import { Link, Route, Routes } from "react-router-dom";
import RequireAdmin from "./auth/RequireAdmin";
import LoginPage from "./auth/LoginPage";
import ChangePasswordPage from "./auth/ChangePasswordPage";
import AdminLayout from "./layout/AdminLayout";
import PublicLayout from "./layout/PublicLayout";
import DashboardPage from "./admin/DashboardPage";
import ApplicationsPage from "./admin/ApplicationsPage";
import ApplicationDetailPage from "./admin/ApplicationDetailPage";
import PaymentsPage from "./admin/PaymentsPage";
import FeesPage from "./admin/FeesPage";
import MembersPage from "./members/MembersPage";
import MemberFormPage from "./members/MemberFormPage";
import MemberDetailPage from "./members/MemberDetailPage";
import HomePage from "./public/HomePage";
import PublicMembersPage from "./public/PublicMembersPage";
import VerifyPage from "./public/VerifyPage";
import JoinPage from "./join/JoinPage";
import AccountPage from "./account/AccountPage";

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
        Go to the home page
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/members" element={<PublicMembersPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/verify/:token" element={<VerifyPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/admin/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="members/new" element={<MemberFormPage />} />
        <Route path="members/:id" element={<MemberDetailPage />} />
        <Route path="members/:id/edit" element={<MemberFormPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="applications/:id" element={<ApplicationDetailPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="fees" element={<FeesPage />} />
        <Route path="password" element={<ChangePasswordPage />} />
      </Route>
    </Routes>
  );
}
