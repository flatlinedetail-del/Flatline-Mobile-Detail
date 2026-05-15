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

// ─── Lazy-load desktop / tablet pages ────────────────────────────────────────
const Dashboard        = lazy(() => import("./pages/Dashboard"));
const Leads            = lazy(() => import("./pages/Leads"));
const Clients          = lazy(() => import("./pages/Clients"));
const ProtectedClients = lazy(() => import("./pages/ProtectedClients"));
const Waitlist         = lazy(() => import("./pages/Waitlist"));
const Calendar         = lazy(() => import("./pages/Calendar"));
const JobDetail        = lazy(() => import("./pages/JobDetail"));
const Invoices         = lazy(() => import("./pages/Invoices"));
const Quotes           = lazy(() => import("./pages/Quotes"));
const Settings         = lazy(() => import("./pages/Settings"));
const PublicBooking    = lazy(() => import("./pages/PublicBooking"));
const Reports          = lazy(() => import("./pages/Reports"));
const Help             = lazy(() => import("./pages/Help"));
const Expenses         = lazy(() => import("./pages/Expenses"));
const Marketing        = lazy(() => import("./pages/Marketing"));
// FormsBuilder (basic builder) was retired in favor of the premium
// Forms & Waivers Studio. Lazy import kept here for symmetry with the
// other admin pages; the active mount point is Settings → Forms tab.
const FormsStudio      = lazy(() => import("./pages/FormsStudio"));
const CustomerSigning  = lazy(() => import("./pages/CustomerSigning"));
const BookAppointment  = lazy(() => import("./pages/BookAppointment"));
const AILeadEngine     = lazy(() => import("./pages/AILeadEngine"));
const Login            = lazy(() => import("./pages/Login"));

// ─── Lazy-load phone Field Mode pages ────────────────────────────────────────
// Primary field screens
const FieldHome                = lazy(() => import("./pages/fieldMode/FieldHome"));
const ActiveJob                = lazy(() => import("./pages/fieldMode/ActiveJob"));
const FieldSchedule            = lazy(() => import("./pages/fieldMode/FieldSchedule"));
const FieldClients             = lazy(() => import("./pages/fieldMode/FieldClients"));
const FieldInvoices            = lazy(() => import("./pages/fieldMode/FieldInvoices"));
const FieldLeads               = lazy(() => import("./pages/fieldMode/FieldLeads"));
const FieldQuotes              = lazy(() => import("./pages/fieldMode/FieldQuotes"));
const FieldBookJob             = lazy(() => import("./pages/fieldMode/FieldBookJob"));
const FieldBookingIntelligence = lazy(() => import("./pages/fieldMode/FieldBookingIntelligence"));
// Mobile detail screens (replace silent desktop fallbacks)
const FieldClientDetail   = lazy(() => import("./pages/fieldMode/FieldClientDetail"));
const FieldInvoiceDetail  = lazy(() => import("./pages/fieldMode/FieldInvoiceDetail"));
const FieldLeadDetail     = lazy(() => import("./pages/fieldMode/FieldLeadDetail"));
const FieldQuoteDetail    = lazy(() => import("./pages/fieldMode/FieldQuoteDetail"));
// Mobile landing / bridge screens for secondary admin pages
const FieldSettings          = lazy(() => import("./pages/fieldMode/FieldSettings"));
const FieldReports           = lazy(() => import("./pages/fieldMode/FieldReports"));
const FieldMarketing         = lazy(() => import("./pages/fieldMode/FieldMarketing"));
const FieldExpenses          = lazy(() => import("./pages/fieldMode/FieldExpenses"));
const FieldProtectedClients  = lazy(() => import("./pages/fieldMode/FieldProtectedClients"));
const FieldWaitlist          = lazy(() => import("./pages/fieldMode/FieldWaitlist"));

// ─── Shell switch ─────────────────────────────────────────────────────────────
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

// ─── Index switch ─────────────────────────────────────────────────────────────
/**
 * Track A index switch: on phones the "/" route renders FieldHome
 * (field-first dashboard) instead of the full Dashboard. Tablet and
 * desktop continue to see Dashboard at "/", unchanged.
 */
function IndexSwitch() {
  const isPhone = useIsPhone();
  return isPhone ? <FieldHome /> : <Dashboard />;
}

// ─── Calendar switch ──────────────────────────────────────────────────────────
/**
 * Track A /calendar switch: phones get the compact FieldSchedule
 * stacked-card view. Tablet and desktop keep the full Calendar grid.
 * No routes removed — the underlying URL is identical for both.
 */
function CalendarSwitch() {
  const isPhone = useIsPhone();
  return isPhone ? <FieldSchedule /> : <Calendar />;
}

// ─── Detail-list switches (with mobile detail + adminView bypass) ─────────────
/**
 * Routing policy shared by all list+detail switches:
 *
 *   1. Tablet/desktop → always full desktop page.
 *   2. Phone + ?adminView=1 → bypass mobile, show full desktop page.
 *      This lets mobile users intentionally escalate to the full tool.
 *   3. Phone + detail param (clientId/invoiceId/etc.) → mobile detail page.
 *      Users land on a focused mobile view and can tap "Open Full [Tool]"
 *      to get the desktop experience (appends ?adminView=1).
 *   4. Phone, no params → mobile list page.
 */

function ClientsSwitch() {
  const isPhone = useIsPhone();
  const { search } = useLocation();
  const params    = new URLSearchParams(search);
  const clientId  = params.get("clientId");
  const adminView = params.get("adminView");
  if (!isPhone || adminView) return <Clients />;
  if (clientId)              return <FieldClientDetail />;
  return <FieldClients />;
}

function InvoicesSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const params     = new URLSearchParams(search);
  const invoiceId  = params.get("invoiceId");
  const adminView  = params.get("adminView");
  if (!isPhone || adminView) return <Invoices />;
  if (invoiceId)             return <FieldInvoiceDetail />;
  return <FieldInvoices />;
}

function LeadsSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const params     = new URLSearchParams(search);
  const leadId     = params.get("leadId");
  const adminView  = params.get("adminView");
  if (!isPhone || adminView) return <Leads />;
  if (leadId)                return <FieldLeadDetail />;
  return <FieldLeads />;
}

function QuotesSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const params     = new URLSearchParams(search);
  const quoteId    = params.get("quoteId");
  const hasNew     = params.get("new");
  const adminView  = params.get("adminView");
  if (!isPhone || adminView || hasNew) return <Quotes />;
  if (quoteId)                         return <FieldQuoteDetail />;
  return <FieldQuotes />;
}

// ─── Secondary admin page switches ───────────────────────────────────────────
/**
 * These routes used to drop mobile users directly into complex desktop pages
 * (Settings, Reports, Marketing, Expenses, ProtectedClients, Waitlist).
 * Each now has a mobile landing/bridge page that shows field-relevant
 * information and a clear "Open Full Admin View" CTA (which adds ?adminView=1
 * to bypass the mobile page). Desktop/tablet are unaffected.
 */

function SettingsSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const adminView  = new URLSearchParams(search).get("adminView");
  if (!isPhone || adminView) return <Settings />;
  return <FieldSettings />;
}

function ReportsSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const adminView  = new URLSearchParams(search).get("adminView");
  if (!isPhone || adminView) return <Reports />;
  return <FieldReports />;
}

function MarketingSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const adminView  = new URLSearchParams(search).get("adminView");
  if (!isPhone || adminView) return <Marketing />;
  return <FieldMarketing />;
}

function ExpensesSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const adminView  = new URLSearchParams(search).get("adminView");
  if (!isPhone || adminView) return <Expenses />;
  return <FieldExpenses />;
}

function ProtectedClientsSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const adminView  = new URLSearchParams(search).get("adminView");
  if (!isPhone || adminView) return <ProtectedClients />;
  return <FieldProtectedClients />;
}

function WaitlistSwitch() {
  const isPhone   = useIsPhone();
  const { search } = useLocation();
  const adminView  = new URLSearchParams(search).get("adminView");
  if (!isPhone || adminView) return <Waitlist />;
  return <FieldWaitlist />;
}

// ─── Auth gate ────────────────────────────────────────────────────────────────
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

// ─── Route tree ───────────────────────────────────────────────────────────────
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
            {/* ── Primary field routes ── */}
            <Route index element={<IndexSwitch />} />
            <Route path="leads" element={<LeadsSwitch />} />
            <Route path="leads/engine" element={<AILeadEngine />} />
            <Route path="clients" element={<ClientsSwitch />} />
            {/* Communications is no longer a primary tab — keep the route
                accessible only as a redirect for any old in-app links and
                outside bookmarks. The actual client-scoped history lives
                inside Client Profile → Communications. */}
            <Route path="communications" element={<Navigate to="/clients" replace />} />
            <Route path="calendar" element={<CalendarSwitch />} />
            <Route path="calendar/:id" element={<JobDetail />} />
            <Route path="invoices" element={<InvoicesSwitch />} />
            <Route path="quotes" element={<QuotesSwitch />} />
            {/* ── Phone Field Mode — dedicated screens ── */}
            {/* Active job screen: sized for phones; tablet/desktop users hit /calendar/:id */}
            <Route path="field/job/:id" element={<ActiveJob />} />
            {/* Mobile booking wizard (replaces /book-appointment for phones) */}
            <Route path="field/book-job" element={<FieldBookJob />} />
            {/* Service timing intelligence (deterministic; links to full AI in desktop) */}
            <Route path="field/intelligence/:id" element={<FieldBookingIntelligence />} />
            {/* ── Secondary / admin routes (all have mobile bridge on phones) ── */}
            {/* Each Switch shows a mobile landing page on phones and appends ?adminView=1
                to bypass it when the user intentionally escalates to the full view. */}
            <Route path="protected-clients" element={<ProtectedClientsSwitch />} />
            <Route path="waitlist" element={<WaitlistSwitch />} />
            <Route path="book-appointment" element={<BookAppointment />} />
            <Route path="reports" element={<ReportsSwitch />} />
            <Route path="help" element={<Help />} />
            <Route path="marketing" element={<MarketingSwitch />} />
            <Route path="expenses" element={<ExpensesSwitch />} />
            <Route path="forms" element={<Navigate to="/settings?tab=forms" replace />} />
            <Route path="settings" element={<SettingsSwitch />} />
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
