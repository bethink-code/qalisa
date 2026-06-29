import { Navigate, Route, Routes } from "react-router-dom";
import { getApiKey } from "./api/client";
import { Shell } from "./layout/Shell";
import { ChannelMessagesPage } from "./pages/ChannelMessagesPage";
import { CredentialsPage } from "./pages/CredentialsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { TemplatesPage } from "./pages/TemplatesPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getApiKey()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/credentials" element={<CredentialsPage />} />
        <Route path="/messages" element={<Navigate to="/messages/sms" replace />} />
        <Route path="/messages/:channel" element={<ChannelMessagesPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
      </Route>
    </Routes>
  );
}
