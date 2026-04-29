import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { GoogleMapsProvider } from "./components/GoogleMapsProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import React, { Suspense, lazy } from "react";
import Layout from "./components/Layout";
import { Toaster } from "@/components/ui/sonner";

// Lazy load pages to reduce initial memory usage
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const Clients = lazy(() => import("./pages/Clients"));
const ProtectedClients = lazy(() => import("./pages/ProtectedClients"));
const Communications = lazy(() => import("./pages/Communications"));
const Waitlist = lazy(() => import("./pages/Waitlist"));
const Calendar = lazy(() => import("./pages/Calendar"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Settings = lazy(() => import("./pages/Settings"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const Reports = lazy(() => import("./pages/Reports"));
const Help = lazy(() => import("./pages/Help"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Marketing = lazy(() => import("./pages/Marketing"));
const FormsBuilder = lazy(() => import("./pages/FormsBuilder"));
const BookAppointment = lazy(() => import("./pages/BookAppointment"));
const AILeadEngine = lazy(() => import("./pages/AILeadEngine"));
const Login = lazy(() => import("./pages/Login"));
const PublicInvoicePayment = lazy(() => import("./pages/PublicInvoicePayment"));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-white/50">Initializing Tactical Systems...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AppContent() {
  return (
    <Router>
      <Suspense fallback={<LoadingFallback />}>
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
      </Suspense>
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
