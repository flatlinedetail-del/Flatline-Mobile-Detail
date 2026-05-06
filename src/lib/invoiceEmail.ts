import { BusinessSettings, Invoice } from "../types";
import { cleanAddress, formatCurrency } from "./utils";

type InvoiceLike = Partial<Invoice> & Record<string, any>;

interface InvoiceEmailOptions {
  invoice: InvoiceLike;
  settings: BusinessSettings | null;
  paymentUrl?: string | null;
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const plainText = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const formatDate = (value: any) => {
  const date = value?.toDate?.() || value || new Date();
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime())
    ? new Date().toLocaleDateString()
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export const buildInvoicePaymentUrl = (invoiceId: string | undefined | null, origin: string) => {
  if (!invoiceId) return null;
  return `${origin.replace(/\/$/, "")}/pay/invoice/${encodeURIComponent(invoiceId)}`;
};

const cleanDescription = (rawContent: unknown) => {
  if (!rawContent || typeof rawContent !== "string") {
    return "Services were selected based on the vehicle condition, service needs, and requested work.";
  }

  if (rawContent.includes("[object Object]")) {
    return "Services were selected based on the vehicle condition, service needs, and requested work.";
  }

  const badPhrases = [
    "optimized at",
    "revenue generation",
    "tactical routing",
    "internal log",
    "system id",
    "revenue protocol",
    "client strategy",
    "strategic opportunity"
  ];

  const cleaned = rawContent
    .replace(/\[[A-Z\s_]+\]/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !badPhrases.some(phrase => line.toLowerCase().includes(phrase)))
    .join(" ");

  return cleaned.length >= 5 ? cleaned : "Service details were selected based on standard service procedures.";
};

const vehicleLabel = (vehicle: any) =>
  [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || "Vehicle";

const row = (label: string, amount: number, color = "#111827") => {
  if (!Number.isFinite(amount) || amount === 0) return "";
  return `
    <tr>
      <td style="padding:6px 0;color:#4b5563;font-size:13px;font-weight:700;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;color:${color};font-size:13px;font-weight:800;text-align:right;">${formatCurrency(amount)}</td>
    </tr>
  `;
};

export function buildInvoiceEmail({ invoice, settings, paymentUrl }: InvoiceEmailOptions) {
  const invoiceNumber = invoice.invoiceNumber || (invoice.id ? invoice.id.slice(-6).toUpperCase() : "PREVIEW");
  const businessName = settings?.businessName || "Flatline Mobile Detail";
  const businessAddress = cleanAddress((settings as any)?.invoiceAddress || (settings as any)?.baseAddress || "");
  const serviceAddress = cleanAddress(invoice.serviceAddress || invoice.clientAddress || "Service address not recorded");
  const subtotal = Number(invoice.subtotal ?? invoice.lineItems?.reduce((sum: number, item: any) => sum + Number(item.total ?? (item.price || 0) * (item.quantity || 1)), 0) ?? 0);
  const discountAmount = Number(invoice.discountAmount || 0);
  const travelFeeAmount = Number(invoice.travelFeeAmount || 0);
  const customFees = Array.isArray(invoice.customFees) ? invoice.customFees : [];
  const customFeesTotal = customFees.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);
  const afterHoursFeeAmount = Number(invoice.afterHoursFeeAmount || 0);
  const taxAmount = ((subtotal - discountAmount) * Number(settings?.taxRate || 0)) / 100;
  const total = Number(invoice.total ?? (subtotal - discountAmount + travelFeeAmount + customFeesTotal + afterHoursFeeAmount + taxAmount));
  const amountPaid = Number(invoice.amountPaid || 0);
  const balanceDue = Math.max(total - amountPaid, 0);
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const vehicles = Array.isArray(invoice.vehicles) ? invoice.vehicles : [];
  const status = String(invoice.paymentStatus || invoice.status || "pending").toUpperCase();
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : null;
  const paymentTerms = plainText(invoice.paymentTerms || invoice.terms || (dueDate ? "Due by due date" : "Due on receipt"));
  const logoHtml = settings?.logoUrl && settings.showLogoOnDocuments !== false
    ? `<img src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(businessName)}" style="max-height:58px;max-width:220px;display:block;">`
    : `<div style="font-size:25px;line-height:1;font-weight:900;letter-spacing:-1px;color:#0A4DFF;text-transform:uppercase;font-style:italic;">${escapeHtml(businessName)}</div>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 18px 45px rgba(15,23,42,0.10);">
            <tr>
              <td style="padding:34px 34px 26px;border-bottom:1px solid #eef2f7;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;padding-bottom:18px;">
                      ${logoHtml}
                      <div style="margin-top:16px;color:#111827;font-size:13px;line-height:1.6;font-weight:600;">
                        <div style="font-weight:800;">${escapeHtml(businessName)}</div>
                        ${businessAddress ? `<div>${escapeHtml(businessAddress)}</div>` : ""}
                        ${settings?.businessPhone ? `<div>${escapeHtml(settings.businessPhone)}</div>` : ""}
                        ${settings?.businessEmail ? `<div>${escapeHtml(settings.businessEmail)}</div>` : ""}
                      </div>
                    </td>
                    <td style="vertical-align:top;text-align:right;padding-bottom:18px;">
                      <div style="font-size:38px;line-height:1;font-weight:900;letter-spacing:-1px;text-transform:uppercase;color:#111827;">Invoice</div>
                      <div style="margin-top:12px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#111827;">Invoice # <span style="color:#0A4DFF;">${escapeHtml(invoiceNumber)}</span></div>
                      <div style="margin-top:6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#4b5563;">Date ${escapeHtml(formatDate(invoice.createdAt))}</div>
                      <div style="margin-top:6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#4b5563;">Terms ${escapeHtml(paymentTerms)}</div>
                      <div style="margin-top:6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#4b5563;">Due ${escapeHtml(dueDate || "On receipt")}</div>
                      <div style="display:inline-block;margin-top:14px;padding:7px 12px;border-radius:999px;background:${status === "PAID" ? "#dcfce7" : "#fef3c7"};color:${status === "PAID" ? "#15803d" : "#92400e"};font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(status)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:30px 34px;background:#fbfdff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="vertical-align:top;padding-right:18px;">
                      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.8px;color:#111827;border-bottom:2px solid #dbeafe;padding-bottom:8px;">Bill To</div>
                      <div style="padding-top:14px;font-size:14px;line-height:1.6;color:#111827;">
                        <div style="font-size:20px;font-weight:900;">${escapeHtml(invoice.clientName || "Customer")}</div>
                        ${invoice.businessName && invoice.businessName !== invoice.clientName ? `<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(invoice.businessName)}</div>` : ""}
                        ${invoice.clientEmail ? `<div>${escapeHtml(invoice.clientEmail)}</div>` : ""}
                        ${invoice.clientPhone ? `<div>${escapeHtml(invoice.clientPhone)}</div>` : ""}
                      </div>
                    </td>
                    <td width="50%" style="vertical-align:top;padding-left:18px;">
                      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.8px;color:#111827;border-bottom:2px solid #dbeafe;padding-bottom:8px;">Service Location</div>
                      <div style="margin-top:14px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;font-size:13px;line-height:1.5;font-weight:700;color:#111827;">${escapeHtml(serviceAddress)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 30px;background:#fbfdff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="vertical-align:top;padding-right:18px;">
                      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.8px;color:#111827;border-bottom:2px solid #dbeafe;padding-bottom:8px;">Vehicle Info</div>
                      <div style="padding-top:12px;">
                        ${vehicles.length ? vehicles.map((vehicle: any) => `
                          <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;margin-bottom:8px;">
                            <div style="font-size:14px;font-weight:900;color:#111827;">${escapeHtml(vehicleLabel(vehicle))}</div>
                            ${vehicle.roNumber ? `<div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#0A4DFF;margin-top:4px;">RO: ${escapeHtml(vehicle.roNumber)}</div>` : ""}
                          </div>
                        `).join("") : `<div style="font-size:13px;color:#6b7280;padding-top:12px;">${escapeHtml(invoice.vehicleInfo || "Vehicle information not recorded")}</div>`}
                      </div>
                    </td>
                    <td width="50%" style="vertical-align:top;padding-left:18px;">
                      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.8px;color:#111827;border-bottom:2px solid #dbeafe;padding-bottom:8px;">Service Description</div>
                      <div style="margin-top:14px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;font-size:13px;line-height:1.6;color:#111827;">${escapeHtml(cleanDescription(invoice.description))}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 30px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
                  <thead>
                    <tr style="background:#f3f4f6;">
                      <th align="left" style="padding:14px 16px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#111827;">Description</th>
                      <th align="center" style="padding:14px 16px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#111827;">Qty</th>
                      <th align="right" style="padding:14px 16px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#111827;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lineItems.length ? lineItems.map((item: any) => `
                      <tr>
                        <td style="padding:16px;border-top:1px solid #f3f4f6;">
                          <div style="font-size:14px;font-weight:900;color:#111827;">${escapeHtml(item.serviceName || "Service")}</div>
                          ${item.description ? `<div style="font-size:11px;line-height:1.5;color:#4b5563;margin-top:5px;">${escapeHtml(cleanDescription(item.description))}</div>` : ""}
                        </td>
                        <td align="center" style="padding:16px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:800;color:#111827;">${escapeHtml(item.quantity || 1)}</td>
                        <td align="right" style="padding:16px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:900;color:#111827;">${formatCurrency(Number(item.total ?? (item.price || 0) * (item.quantity || 1)))}</td>
                      </tr>
                    `).join("") : `<tr><td colspan="3" style="padding:16px;font-size:13px;color:#6b7280;">No line items recorded.</td></tr>`}
                  </tbody>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 34px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;font-size:12px;line-height:1.6;color:#6b7280;padding-right:24px;">
                      Payment terms: <strong style="color:#111827;">${escapeHtml(paymentTerms)}</strong>${dueDate ? `, due ${escapeHtml(dueDate)}` : ""}. Thank you for choosing ${escapeHtml(businessName)}.
                    </td>
                    <td width="310" style="vertical-align:top;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:18px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${row("Subtotal", subtotal)}
                        ${discountAmount > 0 ? row("Discount", -discountAmount, "#16a34a") : ""}
                        ${row(settings?.serviceFeeLabel || "Travel Fee", travelFeeAmount)}
                        ${customFees.map((fee: any) => row(fee.label || "Custom Fee", Number(fee.amount || 0))).join("")}
                        ${row("After-Hours Fee", afterHoursFeeAmount, "#d97706")}
                        ${row(`Tax${settings?.taxRate ? ` (${settings.taxRate}%)` : ""}`, taxAmount)}
                        ${amountPaid > 0 ? row("Amount Paid", -amountPaid, "#16a34a") : ""}
                        <tr><td colspan="2" style="border-top:1px solid #d1d5db;padding-top:12px;"></td></tr>
                        <tr>
                          <td style="font-size:17px;font-weight:900;text-transform:uppercase;color:#111827;">Total</td>
                          <td style="font-size:24px;font-weight:900;text-align:right;color:#0A4DFF;">${formatCurrency(total)}</td>
                        </tr>
                        <tr>
                          <td style="padding-top:10px;font-size:15px;font-weight:900;text-transform:uppercase;color:#111827;">Balance Due</td>
                          <td style="padding-top:10px;font-size:20px;font-weight:900;text-align:right;color:#111827;">${formatCurrency(balanceDue)}</td>
                        </tr>
                      </table>
                      ${paymentUrl ? `<a href="${escapeHtml(paymentUrl)}" style="display:block;margin-top:18px;padding:14px 16px;border-radius:12px;background:#0A4DFF;color:#ffffff;text-align:center;text-decoration:none;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;">Pay Invoice</a>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    `Invoice ${invoiceNumber} from ${businessName}`,
    `Date: ${formatDate(invoice.createdAt)}`,
    `Status: ${status}`,
    `Payment Terms: ${paymentTerms}`,
    `Due Date: ${dueDate || "Due on receipt"}`,
    "",
    `Bill To: ${plainText(invoice.clientName || "Customer")}`,
    invoice.clientEmail ? `Email: ${plainText(invoice.clientEmail)}` : "",
    invoice.clientPhone ? `Phone: ${plainText(invoice.clientPhone)}` : "",
    `Service Location: ${plainText(serviceAddress)}`,
    vehicles.length ? `Vehicle: ${vehicles.map(vehicleLabel).join(", ")}` : `Vehicle: ${plainText(invoice.vehicleInfo || "Not recorded")}`,
    `Description: ${plainText(cleanDescription(invoice.description))}`,
    "",
    "Line Items:",
    ...(lineItems.length ? lineItems.map((item: any) => `- ${plainText(item.serviceName || "Service")} x${item.quantity || 1}: ${formatCurrency(Number(item.total ?? (item.price || 0) * (item.quantity || 1)))}`) : ["- No line items recorded"]),
    "",
    `Subtotal: ${formatCurrency(subtotal)}`,
    discountAmount > 0 ? `Discount: -${formatCurrency(discountAmount)}` : "",
    travelFeeAmount > 0 ? `${settings?.serviceFeeLabel || "Travel Fee"}: ${formatCurrency(travelFeeAmount)}` : "",
    afterHoursFeeAmount > 0 ? `After-Hours Fee: ${formatCurrency(afterHoursFeeAmount)}` : "",
    taxAmount > 0 ? `Tax: ${formatCurrency(taxAmount)}` : "",
    amountPaid > 0 ? `Amount Paid: -${formatCurrency(amountPaid)}` : "",
    `Total: ${formatCurrency(total)}`,
    `Balance Due: ${formatCurrency(balanceDue)}`,
    paymentUrl ? `Pay Invoice: ${paymentUrl}` : "",
    "",
    "Thank you for your business."
  ].filter(Boolean).join("\n");

  return { html, text: textLines };
}
