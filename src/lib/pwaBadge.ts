/**
 * PWA App Badge utility.
 *
 * Wraps the experimental Badging API (navigator.setAppBadge / clearAppBadge).
 * When the app is installed as a PWA on a supported platform, the OS app icon
 * shows a numeric badge — same UX as Messages, Mail, etc.
 *
 * Browser/OS support is partial today:
 *   - Chrome/Edge desktop: supported
 *   - Android Chrome (PWA installed): supported
 *   - iOS Safari PWA: NOT supported as of iOS 17 (badge ignored)
 *   - Firefox: not supported
 *
 * This utility is safe to call in any environment — it no-ops when the API
 * is unavailable. Future work to enable badging when the app is *closed*
 * requires:
 *   - a service worker
 *   - Web Push subscription
 *   - server-driven push payloads that call setAppBadge from the SW
 *
 * For now this powers the in-tab badge while the app is open, mirroring the
 * unresolved Action Center count.
 */

const isSupported = (): boolean =>
  typeof navigator !== "undefined" &&
  typeof (navigator as any).setAppBadge === "function";

export function setAppBadge(count: number): void {
  if (!isSupported()) return;
  try {
    if (count > 0) {
      (navigator as any).setAppBadge(count);
    } else {
      (navigator as any).clearAppBadge?.();
    }
  } catch {
    // ignore — badge API can throw in restricted contexts (e.g. cross-origin)
  }
}

export function clearAppBadge(): void {
  if (!isSupported()) return;
  try {
    (navigator as any).clearAppBadge();
  } catch {
    /* ignore */
  }
}

export const pwaBadgeSupported = isSupported;
