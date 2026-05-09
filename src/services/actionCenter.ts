/**
 * Shared Action Center / "Needs Attention" architecture.
 *
 * This module is the single source of truth for unresolved actionable items
 * across DetailFlow. The Dashboard "Needs Attention" card, the top-bar
 * notification bell unread count, and the future PWA badge count all read
 * from the same selectors so counts can never disagree.
 *
 * Item types are the union of:
 *   - communication failures and unread/needs-reply messages
 *   - unsigned forms / waivers blocking job start
 *   - unpaid deposits / overdue invoices
 *   - quote follow-ups due
 *   - booking confirmations missing / customer approvals pending
 *   - risk-based job blockers
 *
 * Resolution rules: an item is removed from the list when its underlying
 * record changes state (failed→sent, pending→signed, unpaid→paid, etc.).
 *
 * Consumers should use the `useActionCenter` hook (see ../hooks/useActionCenter)
 * — selectors here are exported so server-side / non-React code can also
 * compose them.
 */

import type { Timestamp } from "firebase/firestore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionItemType =
  | "unread_message"
  | "needs_reply"
  | "failed_send"
  | "unsigned_form"
  | "unpaid_deposit"
  | "overdue_invoice"
  | "quote_followup_due"
  | "booking_confirmation_missing"
  | "customer_approval_pending"
  | "job_blocked"
  | "risk_review_required"
  // Confirmation/readiness events — surfaced for "Today's Confirmations".
  // These do NOT count toward unresolvedCount.
  | "form_signed_confirmation"
  | "deposit_paid_confirmation";

export type ActionItemPriority = "low" | "normal" | "high" | "urgent";

export type ActionItemStatus = "open" | "resolved" | "dismissed";

export type ActionCategory =
  | "communications"
  | "forms"
  | "payments"
  | "jobs"
  | "quotes"
  | "risk"
  | "confirmations";

export interface ActionItem {
  id: string;
  type: ActionItemType;
  category: ActionCategory;
  status: ActionItemStatus;
  priority: ActionItemPriority;

  // Human-readable label shown in dashboard / bell list.
  label: string;
  // Optional secondary line, e.g. "John D. — quote sent 3 days ago".
  detail?: string;

  // Linked records (any may be undefined).
  clientId?: string;
  clientName?: string;
  quoteId?: string;
  bookingId?: string;
  jobId?: string;
  invoiceId?: string;
  formId?: string;
  formInstanceId?: string;
  messageId?: string;

  // App-internal route the user should be sent to when the item is clicked.
  // Built by `routeForItem` so navigation logic is centralized.
  route: string;

  // Timestamps for ordering / resolution diffing.
  createdAt?: Timestamp | Date | null;
  resolvedAt?: Timestamp | Date | null;

  // Optional inline quick actions (rendered as buttons on the dashboard).
  // Keep them safe — destructive ops should require confirmation in the UI.
  quickActions?: ActionQuickAction[];
}

export type ActionQuickActionKind =
  | "open_client"
  | "open_job"
  | "open_invoice"
  | "open_quote"
  | "open_form"
  | "ai_reply"
  | "retry_send"
  | "resend_link"
  | "send_reminder"
  | "mark_handled";

export interface ActionQuickAction {
  kind: ActionQuickActionKind;
  label: string;
  // Routing target if the action is just a navigation. Mutating actions
  // (retry_send, mark_handled) are handled by the consuming component
  // since they need DB credentials.
  route?: string;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Centralized item → route mapping. Keeps section-1 navigation rules in one
 * place: communication alerts always route to Client Profile → Communications,
 * form alerts to the job's Required Forms tab, payment alerts to the invoice
 * detail, etc.
 */
export function routeForItem(item: Omit<ActionItem, "route">): string {
  switch (item.type) {
    case "unread_message":
    case "needs_reply":
    case "failed_send":
      // All comms route to Client Profile → Communications.
      // The clients list page reads ?clientId=…&tab=communications and opens
      // the matching client profile dialog on that tab.
      if (item.clientId) {
        return `/clients?clientId=${encodeURIComponent(item.clientId)}&tab=communications`;
      }
      return "/clients";

    case "unsigned_form":
      // Form-signing alerts route to the job/booking detail with the
      // Required Forms tab focused. JobDetail reads ?tab=forms.
      if (item.jobId) return `/calendar/${encodeURIComponent(item.jobId)}?tab=forms`;
      if (item.bookingId) return `/calendar/${encodeURIComponent(item.bookingId)}?tab=forms`;
      if (item.clientId) return `/clients?clientId=${encodeURIComponent(item.clientId)}&tab=forms`;
      return "/clients";

    case "unpaid_deposit":
    case "overdue_invoice":
      if (item.invoiceId) return `/invoices?invoiceId=${encodeURIComponent(item.invoiceId)}`;
      if (item.bookingId) return `/calendar/${encodeURIComponent(item.bookingId)}`;
      return "/invoices";

    case "quote_followup_due":
      if (item.quoteId) return `/quotes?quoteId=${encodeURIComponent(item.quoteId)}`;
      if (item.clientId) return `/clients?clientId=${encodeURIComponent(item.clientId)}&tab=communications`;
      return "/quotes";

    case "booking_confirmation_missing":
      if (item.bookingId) return `/calendar/${encodeURIComponent(item.bookingId)}`;
      return "/calendar";

    case "customer_approval_pending":
      if (item.jobId) return `/calendar/${encodeURIComponent(item.jobId)}`;
      if (item.clientId) return `/clients?clientId=${encodeURIComponent(item.clientId)}`;
      return "/calendar";

    case "job_blocked":
      if (item.jobId) return `/calendar/${encodeURIComponent(item.jobId)}`;
      return "/calendar";

    case "risk_review_required":
      if (item.clientId) return `/clients?clientId=${encodeURIComponent(item.clientId)}`;
      return "/protected-clients";

    case "form_signed_confirmation":
      if (item.jobId) return `/calendar/${encodeURIComponent(item.jobId)}?tab=forms`;
      if (item.clientId) return `/clients?clientId=${encodeURIComponent(item.clientId)}&tab=forms`;
      return "/clients";

    case "deposit_paid_confirmation":
      if (item.invoiceId) return `/invoices?invoiceId=${encodeURIComponent(item.invoiceId)}`;
      if (item.bookingId) return `/calendar/${encodeURIComponent(item.bookingId)}`;
      return "/invoices";

    default:
      return "/";
  }
}

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

export function categoryFor(type: ActionItemType): ActionCategory {
  switch (type) {
    case "unread_message":
    case "needs_reply":
    case "failed_send":
      return "communications";
    case "unsigned_form":
    case "form_signed_confirmation":
      return "forms";
    case "unpaid_deposit":
    case "overdue_invoice":
    case "deposit_paid_confirmation":
      return "payments";
    case "quote_followup_due":
      return "quotes";
    case "booking_confirmation_missing":
    case "customer_approval_pending":
    case "job_blocked":
      return "jobs";
    case "risk_review_required":
      return "risk";
    default:
      return "jobs";
  }
}

const PRIORITY_RANK: Record<ActionItemPriority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Items that count toward "unresolved" — drives bell count and PWA badge. */
const UNRESOLVED_TYPES: readonly ActionItemType[] = [
  "unread_message",
  "needs_reply",
  "failed_send",
  "unsigned_form",
  "unpaid_deposit",
  "overdue_invoice",
  "quote_followup_due",
  "booking_confirmation_missing",
  "customer_approval_pending",
  "job_blocked",
  "risk_review_required",
];

/** Confirmation/readiness types — shown on the dashboard but not counted. */
const CONFIRMATION_TYPES: readonly ActionItemType[] = [
  "form_signed_confirmation",
  "deposit_paid_confirmation",
];

export function isUnresolvedType(type: ActionItemType): boolean {
  return UNRESOLVED_TYPES.includes(type);
}

export function isConfirmationType(type: ActionItemType): boolean {
  return CONFIRMATION_TYPES.includes(type);
}

export function selectUnresolved(items: ActionItem[]): ActionItem[] {
  return items.filter(
    (i) => i.status === "open" && isUnresolvedType(i.type)
  );
}

export function selectConfirmations(items: ActionItem[]): ActionItem[] {
  return items.filter((i) => isConfirmationType(i.type));
}

export function selectByCategory(
  items: ActionItem[]
): Record<ActionCategory, ActionItem[]> {
  const out: Record<ActionCategory, ActionItem[]> = {
    communications: [],
    forms: [],
    payments: [],
    jobs: [],
    quotes: [],
    risk: [],
    confirmations: [],
  };
  for (const item of items) {
    if (item.status !== "open" && !isConfirmationType(item.type)) continue;
    out[item.category].push(item);
  }
  return out;
}

export function unresolvedCount(items: ActionItem[]): number {
  return selectUnresolved(items).length;
}

/**
 * Sort by priority desc, then by createdAt desc. Used by the dashboard list.
 */
export function sortItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 0;
    const pb = PRIORITY_RANK[b.priority] ?? 0;
    if (pa !== pb) return pb - pa;
    const ta = toMillis(a.createdAt);
    const tb = toMillis(b.createdAt);
    return tb - ta;
  });
}

function toMillis(t: ActionItem["createdAt"]): number {
  if (!t) return 0;
  if (t instanceof Date) return t.getTime();
  if (typeof (t as any).toDate === "function") {
    try {
      return (t as Timestamp).toDate().getTime();
    } catch {
      return 0;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Builders — used by the hook to convert raw Firestore docs into ActionItem
// records. These are pure so they can be unit-tested without Firestore.
// ---------------------------------------------------------------------------

/**
 * Build an ActionItem from a `communication_logs` document.
 * Returns null if the doc is in a state that does not need attention
 * (e.g. successfully sent and either outbound or already read).
 */
export function buildItemFromCommunicationLog(
  id: string,
  log: any,
  clientName?: string
): ActionItem | null {
  const status = (log?.status || "").toLowerCase();
  const direction = (log?.direction || "").toLowerCase(); // "inbound" | "outbound"
  const read = !!log?.read;
  const handled = !!log?.handled;

  let type: ActionItemType | null = null;
  let priority: ActionItemPriority = "normal";

  if (status === "failed") {
    type = "failed_send";
    priority = "high";
  } else if (direction === "inbound" && !read) {
    type = "unread_message";
    priority = "high";
  } else if (direction === "inbound" && read && !handled) {
    // Inbound message that was opened but not replied to / marked handled
    // is treated as needs_reply.
    type = "needs_reply";
    priority = "normal";
  }

  if (!type) return null;

  const partial: Omit<ActionItem, "route"> = {
    id: `comm:${id}`,
    type,
    category: categoryFor(type),
    status: "open",
    priority,
    label:
      type === "failed_send"
        ? `Message failed${clientName ? ` to ${clientName}` : ""}`
        : type === "unread_message"
        ? `Unread message${clientName ? ` from ${clientName}` : ""}`
        : `Reply needed${clientName ? ` for ${clientName}` : ""}`,
    detail: typeof log?.content === "string" ? truncate(log.content, 80) : undefined,
    clientId: log?.clientId,
    clientName,
    messageId: id,
    createdAt: log?.createdAt ?? null,
    quickActions: buildCommQuickActions(type),
  };
  return { ...partial, route: routeForItem(partial) };
}

/**
 * Build an ActionItem from a `formInstances` doc.
 * pending/sent (required, unsigned, not waived) → unsigned_form.
 * signed → form_signed_confirmation (today only — caller filters).
 */
export function buildItemFromFormInstance(
  id: string,
  fi: any,
  clientName?: string
): ActionItem | null {
  const status = (fi?.status || "").toLowerCase();
  const required = fi?.required !== false;

  let type: ActionItemType | null = null;
  let priority: ActionItemPriority = "high";

  if (required && (status === "pending" || status === "sent")) {
    type = "unsigned_form";
    priority = "high";
  } else if (status === "signed") {
    type = "form_signed_confirmation";
    priority = "low";
  }

  if (!type) return null;

  const partial: Omit<ActionItem, "route"> = {
    id: `form:${id}`,
    type,
    category: categoryFor(type),
    status: type === "form_signed_confirmation" ? "resolved" : "open",
    priority,
    label:
      type === "unsigned_form"
        ? `Unsigned form: ${fi?.templateTitle || "Required form"}`
        : `Form signed: ${fi?.templateTitle || "Form"}`,
    detail: clientName
      ? `${clientName}${fi?.appointmentId ? " — job #" + String(fi.appointmentId).slice(-4) : ""}`
      : undefined,
    clientId: fi?.clientId,
    clientName,
    bookingId: fi?.appointmentId,
    jobId: fi?.appointmentId,
    formId: fi?.templateId,
    formInstanceId: id,
    createdAt: fi?.createdAt ?? null,
    resolvedAt: fi?.signedAt ?? null,
    quickActions:
      type === "unsigned_form"
        ? [
            { kind: "resend_link", label: "Resend Link" },
            { kind: "open_form", label: "Open" },
          ]
        : [{ kind: "open_form", label: "View" }],
  };
  return { ...partial, route: routeForItem(partial) };
}

function buildCommQuickActions(type: ActionItemType): ActionQuickAction[] {
  switch (type) {
    case "failed_send":
      return [
        { kind: "retry_send", label: "Retry" },
        { kind: "open_client", label: "Open" },
      ];
    case "unread_message":
    case "needs_reply":
      return [
        { kind: "ai_reply", label: "AI Reply" },
        { kind: "open_client", label: "Open" },
        { kind: "mark_handled", label: "Mark Handled" },
      ];
    default:
      return [];
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

// ---------------------------------------------------------------------------
// Public summary type — used by the hook.
// ---------------------------------------------------------------------------

export interface ActionCenterSummary {
  items: ActionItem[];
  unresolved: ActionItem[];
  confirmations: ActionItem[];
  byCategory: Record<ActionCategory, ActionItem[]>;
  unresolvedCount: number;
  /**
   * Notification-bell count. For now this equals unresolvedCount, but is
   * kept as a separate selector so future per-user filtering (e.g. only
   * items assigned to me) can diverge without touching the dashboard.
   */
  bellCount: number;
}

export function summarize(items: ActionItem[]): ActionCenterSummary {
  const unresolved = sortItems(selectUnresolved(items));
  const confirmations = sortItems(selectConfirmations(items));
  const byCategory = selectByCategory(items);
  return {
    items,
    unresolved,
    confirmations,
    byCategory,
    unresolvedCount: unresolved.length,
    bellCount: unresolved.length,
  };
}
