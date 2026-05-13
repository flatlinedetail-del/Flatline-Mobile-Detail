import { useEffect, useState } from "react";

/**
 * Responsive breakpoint hook for Track A device-mode foundation.
 *
 * Matches the existing Tailwind `md:` boundary so the desktop/tablet
 * sidebar layout in src/components/Layout.tsx continues to apply at
 * 768px+ without any layout changes. Phones (<768px) get the simplified
 * Field Mode shell.
 *
 *   phone   :  <  768px
 *   tablet  : >= 768px  and  < 1024px
 *   desktop : >= 1024px
 *
 * SSR-safe: defaults to "desktop" until the first effect runs in the
 * browser. We listen to `matchMedia` change events instead of resize,
 * so rotation and window-resize on iPadOS both work correctly without
 * spamming re-renders.
 */
export type DeviceKind = "phone" | "tablet" | "desktop";

const PHONE_QUERY = "(max-width: 767px)";
const TABLET_QUERY = "(min-width: 768px) and (max-width: 1023px)";

function readDevice(): DeviceKind {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "desktop";
  }
  if (window.matchMedia(PHONE_QUERY).matches) return "phone";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "desktop";
}

export function useDevice(): DeviceKind {
  const [device, setDevice] = useState<DeviceKind>(() => readDevice());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const phoneMql = window.matchMedia(PHONE_QUERY);
    const tabletMql = window.matchMedia(TABLET_QUERY);

    const update = () => setDevice(readDevice());

    // Run once on mount in case the SSR/initial value disagrees with
    // the real viewport (e.g., during hydration).
    update();

    // Safari < 14 only supports addListener/removeListener.
    const add = (mql: MediaQueryList, fn: (e: MediaQueryListEvent) => void) => {
      if (typeof mql.addEventListener === "function") mql.addEventListener("change", fn);
      else mql.addListener(fn);
    };
    const remove = (mql: MediaQueryList, fn: (e: MediaQueryListEvent) => void) => {
      if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", fn);
      else mql.removeListener(fn);
    };

    add(phoneMql, update);
    add(tabletMql, update);

    return () => {
      remove(phoneMql, update);
      remove(tabletMql, update);
    };
  }, []);

  return device;
}

export function useIsPhone(): boolean {
  return useDevice() === "phone";
}
