import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { FeedPage } from "./pages/FeedPage";
import { ProfilePage } from "./pages/ProfilePage";
import { UserHomePage } from "./pages/UserHomePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ClaimPage } from "./pages/ClaimPage";

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<FeedPage />} />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/u/:handle" element={<UserHomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/direct/:addr" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
