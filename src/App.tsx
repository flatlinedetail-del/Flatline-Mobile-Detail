import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { GoogleMapsProvider } from "./components/GoogleMapsProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Clients from "./pages/Clients";
import Calendar from "./pages/Calendar";
import Appointments from "./pages/Appointments";
import JobDetail from "./pages/JobDetail";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";
import Marketing from "./pages/Marketing";
import FormsBuilder from "./pages/FormsBuilder";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import { Toaster } from "@/components/ui/sonner";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AppContent() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="leads" element={<Leads />} />
          <Route path="clients" element={<Clients />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="appointments/:id" element={<JobDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="forms" element={<FormsBuilder />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster />
    </Router>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <GoogleMapsProvider>
          <AppContent />
        </GoogleMapsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
