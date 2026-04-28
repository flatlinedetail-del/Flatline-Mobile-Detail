import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { GoogleMapsProvider } from "./components/GoogleMapsProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Clients from "./pages/Clients";
import ProtectedClients from "./pages/ProtectedClients";
import Communications from "./pages/Communications";
import Waitlist from "./pages/Waitlist";
import Calendar from "./pages/Calendar";
import JobDetail from "./pages/JobDetail";
import Invoices from "./pages/Invoices";
import Quotes from "./pages/Quotes";
import Settings from "./pages/Settings";
import PublicBooking from "./pages/PublicBooking";
import Reports from "./pages/Reports";
import Help from "./pages/Help";
import Expenses from "./pages/Expenses";
import Marketing from "./pages/Marketing";
import FormsBuilder from "./pages/FormsBuilder";
import BookAppointment from "./pages/BookAppointment";
import AILeadEngine from "./pages/AILeadEngine";
import Login from "./pages/Login";
import PublicInvoicePayment from "./pages/PublicInvoicePayment";
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
        <Route path="/book" element={<PublicBooking />} />
        <Route path="/invoice/:invoiceId" element={<PublicInvoicePayment />} />
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
          <Route path="leads/engine" element={<AILeadEngine />} />
          <Route path="clients" element={<Clients />} />
          <Route path="protected-clients" element={<ProtectedClients />} />
          <Route path="communications" element={<Communications />} />
          <Route path="waitlist" element={<Waitlist />} />
          <Route path="book-appointment" element={<BookAppointment />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="calendar/:id" element={<JobDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="quotes" element={<Quotes />} />
          <Route path="reports" element={<Reports />} />
          <Route path="help" element={<Help />} />
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
