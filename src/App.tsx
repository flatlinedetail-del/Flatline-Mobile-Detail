import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { GoogleMapsProvider } from "./components/GoogleMapsProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import React, { Suspense, lazy, useEffect } from "react";
import Layout from "./components/Layout";
import { Toaster } from "@/components/ui/sonner";

// Performance logging for startup
const startTime = performance.now();

// Lazy load pages
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

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Securing Session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
};

const PageLoader = () => (
  <div className="flex items-center justify-center h-[calc(100vh-100px)]">
    <div className="flex flex-col items-center gap-2">
      <div className="w-5 h-5 border border-white/10 border-t-white/40 rounded-full animate-spin" />
      <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Loading Route...</span>
    </div>
  </div>
);

function AppContent() {
  useEffect(() => {
    const totalTime = performance.now() - startTime;
    console.log(`🚀 [App Shell] Loaded in ${totalTime.toFixed(2)}ms`);
  }, []);

  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/book" element={<PublicBooking />} />
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
