import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { GoogleMapsProvider } from "./components/GoogleMapsProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import React, { Suspense, lazy, useEffect } from "react";
import Layout from "./components/Layout";
import FieldModeLayout from "./components/fieldMode/FieldModeLayout";
import { useIsPhone } from "./hooks/useBreakpoint";
import { Toaster } from "@/components/ui/sonner";

// Performance logging for startup
const startTime = performance.now();

// Lazy load pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const Clients = lazy(() => import("./pages/Clients"));
const ProtectedClients = lazy(() => import("./pages/ProtectedClients"));
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
// FormsBuilder (basic builder) was retired in favor of the premium
// Forms & Waivers Studio. Lazy import kept here for symmetry with the
// other admin pages; the active mount point is Settings → Forms tab.
const FormsStudio = lazy(() => import("./pages/FormsStudio"));
const CustomerSigning = lazy(() => import("./pages/CustomerSigning"));
const BookAppointment = lazy(() => import("./pages/BookAppointment"));
const AILeadEngine = lazy(() => import("./pages/AILeadEngine"));
const Login = lazy(() => import("./pages/Login"));
const FieldHome = lazy(() => import("./pages/fieldMode/FieldHome"));
const ActiveJob = lazy(() => import("./pages/fieldMode/ActiveJob"));
const FieldSchedule = lazy(() => import("./pages/fieldMode/FieldSchedule"));
const FieldClients = lazy(() => import("./pages/fieldMode/FieldClients"));
const FieldInvoices = lazy(() => import("./pages/fieldMode/FieldInvoices"));
const FieldLeads = lazy(() => import("./pages/fieldMode/FieldLeads"));
const FieldQuotes = lazy(() => import("./pages/fieldMode/FieldQuotes"));
const FieldBookJob = lazy(() => import("./pages/fieldMode/FieldBookJob"));
const FieldBookingIntelligence = lazy(() => import("./pages/fieldMode/FieldBookingIntelligence"));

/**
 * Track A shell switch: phones get the simplified Field Mode shell,
 * tablets and desktop keep the full DetailFlow Layout untouched.
 * Routing is identical in both shells — only the chrome (sidebar,
 * header, bottom nav) differs.
 */
function ShellSwitch() {
  const isPhone = useIsPhone();
  return isPhone ? <FieldModeLayout /> : <Layout />;
}

/**
 * Track A index switch: on phones the "/" route renders FieldHome
 * (field-first dashboard) instead of the full Dashboard. Tablet and
 * desktop continue to see Dashboard at "/", unchanged.
 */
function IndexSwitch() {
  const isPhone = useIsPhone();
  return isPhone ? <FieldHome /> : <Dashboard />;
}

/**
 * Track A /calendar switch: phones get the compact FieldSchedule
 * stacked-card view. Tablet and desktop keep the full Calendar grid.
 * No routes removed — the underlying URL is identical for both.
 */
function CalendarSwitch() {
  const isPhone = useIsPhone();
  return isPhone ? <FieldSchedule /> : <Calendar />;
}

/**
 * Track A /clients switch: phones get the compact FieldClients cards
 * list, EXCEPT when a `clientId` URL param is present — in that case
 * we fall through to the full `Clients` page (which natively reads
 * the URL param via its deepLinkClientId effect and opens the detail
 * dialog). This fixes "tapping a client doesn't open the profile" on
 * phone while giving phone users every desktop feature inside the
 * profile (not a reduced view).
 *
 * Tablet and desktop always get the full Clients page.
 */
function ClientsSwitch() {
  const isPhone = useIsPhone();
  const { search } = useLocation();
  const hasClientId = new URLSearchParams(search).get("clientId");
  if (isPhone && !hasClientId) return <FieldClients />;
  return <Clients />;
}

/**
 * Track A /invoices switch: phones get the compact FieldInvoices list
 * unless a `invoiceId` URL param is present, in which case the full
 * Invoices page renders so the user can use every existing action
 * (send, mark paid, PDF, refund). Tablet/desktop always full page.
 */
function InvoicesSwitch() {
  const isPhone = useIsPhone();
  const { search } = useLocation();
  const hasInvoiceId = new URLSearchParams(search).get("invoiceId");
  if (isPhone && !hasInvoiceId) return <FieldInvoices />;
  return <Invoices />;
}

/**
 * Track A /leads switch: same pattern — compact phone list, full
 * desktop Leads page when a `leadId` URL param is set or on tablet/desktop.
 */
function LeadsSwitch() {
  const isPhone = useIsPhone();
  const { search } = useLocation();
  const hasLeadId = new URLSearchParams(search).get("leadId");
  if (isPhone && !hasLeadId) return <FieldLeads />;
  return <Leads />;
}

/**
 * Track A /quotes switch: same pattern — compact phone list, full
 * Smart Quote page when a `quoteId` URL param is set or on tablet/desktop.
 */
function QuotesSwitch() {
  const isPhone = useIsPhone();
  const { search } = useLocation();
  const hasQuoteId = new URLSearchParams(search).get("quoteId");
  const hasNew = new URLSearchParams(search).get("new");
  if (isPhone && !hasQuoteId && !hasNew) return <FieldQuotes />;
  return <Quotes />;
}

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
          <Route path="/sign/:token" element={<CustomerSigning />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ShellSwitch />
              </ProtectedRoute>
            }
          >
            <Route index element={<IndexSwitch />} />
            <Route path="leads" element={<LeadsSwitch />} />
            <Route path="leads/engine" element={<AILeadEngine />} />
            <Route path="clients" element={<ClientsSwitch />} />
            <Route path="protected-clients" element={<ProtectedClients />} />
            {/* Communications is no longer a primary tab — keep the route
                accessible only as a redirect for any old in-app links and
                outside bookmarks. The actual client-scoped history lives
                inside Client Profile → Communications. */}
            <Route path="communications" element={<Navigate to="/clients" replace />} />
            <Route path="waitlist" element={<Waitlist />} />
            <Route path="book-appointment" element={<BookAppointment />} />
            <Route path="calendar" element={<CalendarSwitch />} />
            <Route path="calendar/:id" element={<JobDetail />} />
            <Route path="invoices" element={<InvoicesSwitch />} />
            <Route path="quotes" element={<QuotesSwitch />} />
            <Route path="reports" element={<Reports />} />
            <Route path="help" element={<Help />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="forms" element={<Navigate to="/settings?tab=forms" replace />} />
            <Route path="settings" element={<Settings />} />
            {/* Phone Field Mode active-job screen. The route is registered
                globally so deep links work everywhere, but the UI is sized
                for phones — tablet/desktop users will normally hit the full
                JobDetail page at /calendar/:id instead. */}
            <Route path="field/job/:id" element={<ActiveJob />} />
            {/* Phone Field Mode mobile booking wizard. Replaces the full
                BookAppointment page for phone users — same Firestore
                collection, same schema, phone-optimised 5-step UI. */}
            <Route path="field/book-job" element={<FieldBookJob />} />
            {/* Phone Field Mode service timing intelligence. Shows which
                services are due/overdue for the client's vehicles using
                the deterministic serviceTimingEngine. Links out to the
                full AI analysis in desktop JobDetail. */}
            <Route path="field/intelligence/:id" element={<FieldBookingIntelligence />} />
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
