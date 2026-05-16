import { useCallback, useRef, useState } from "react";
import { geocodeAddress } from "../services/geocodingService";

/**
 * usePublicBookingAddress — single source of truth for the customer's
 * service address on the public /book page.
 *
 * Why this exists:
 *   The address used to live in three places (parent state, AddressInput's
 *   internal `usePlacesAutocomplete` state, and the geocoder result), which
 *   meant a customer could type a new address, never trigger a blur or
 *   suggestion, and submit the OLD geocoded value because the parent state
 *   was never updated. The hook owns one record (`AddressState`) and exposes
 *   the only three operations a caller needs:
 *     - setText(value)            — every keystroke
 *     - setSelection({...})       — autocomplete pick / geocoded blur
 *     - ensureGeocoded()          — call before submit; resolves coords for
 *                                   typed-only addresses, returns the final
 *                                   AddressState (also reflected in `state`)
 *
 * Status transitions:
 *   empty            (no address typed yet)
 *     → typed        (setText)
 *     → selected     (setSelection with coords)
 *     → geocoded     (setSelection with coords OR ensureGeocoded success)
 *     → geocoding    (ensureGeocoded in flight)
 *     → geocode_failed (ensureGeocoded threw / returned no coords)
 *
 * The hook never blocks the user from advancing — `ensureGeocoded()` is a
 * best-effort resolution. Callers decide what to do on `geocode_failed`
 * (the gate will surface a generic message if the booking still proceeds).
 */

export type AddressStatus =
  | "empty"
  | "typed"
  | "selected"
  | "geocoding"
  | "geocoded"
  | "geocode_failed";

export interface AddressState {
  address: string;
  lat: number;
  lng: number;
  placeId: string | null;
  status: AddressStatus;
}

export interface AddressSelection {
  address: string;
  lat: number;
  lng: number;
  placeId?: string | null;
}

export interface UsePublicBookingAddressApi {
  state: AddressState;
  setText: (value: string) => void;
  setSelection: (sel: AddressSelection) => void;
  /**
   * Resolve coordinates for a typed-only address. Safe to call at any time;
   * returns the final state. If already geocoded or empty, returns immediately
   * without making a network call.
   */
  ensureGeocoded: () => Promise<AddressState>;
  reset: () => void;
}

const EMPTY: AddressState = {
  address: "",
  lat: 0,
  lng: 0,
  placeId: null,
  status: "empty",
};

const hasUsableCoords = (s: AddressState): boolean =>
  typeof s.lat === "number" &&
  typeof s.lng === "number" &&
  isFinite(s.lat) &&
  isFinite(s.lng) &&
  !(s.lat === 0 && s.lng === 0);

export function usePublicBookingAddress(
  initial?: Partial<AddressState>,
): UsePublicBookingAddressApi {
  const [state, setState] = useState<AddressState>(() => ({
    ...EMPTY,
    ...initial,
    status:
      initial?.lat && initial?.lng
        ? "geocoded"
        : initial?.address
          ? "typed"
          : "empty",
  }));

  // Track the latest state so async work (ensureGeocoded) can stale-check
  // before committing a result.
  const stateRef = useRef(state);
  stateRef.current = state;

  const setText = useCallback((value: string) => {
    setState((prev) => {
      const next = value ?? "";
      if (next === prev.address) return prev;
      return {
        address: next,
        // Typing always invalidates coords — the user may be retyping a new
        // address on top of a previously geocoded one.
        lat: 0,
        lng: 0,
        placeId: null,
        status: next.length === 0 ? "empty" : "typed",
      };
    });
  }, []);

  const setSelection = useCallback((sel: AddressSelection) => {
    setState({
      address: sel.address ?? "",
      lat: typeof sel.lat === "number" && isFinite(sel.lat) ? sel.lat : 0,
      lng: typeof sel.lng === "number" && isFinite(sel.lng) ? sel.lng : 0,
      placeId: sel.placeId ?? null,
      status:
        sel.address && sel.lat && sel.lng ? "selected" : sel.address ? "typed" : "empty",
    });
  }, []);

  const ensureGeocoded = useCallback(async (): Promise<AddressState> => {
    const current = stateRef.current;
    if (!current.address) return current;
    if (hasUsableCoords(current)) return current;

    setState((prev) => ({ ...prev, status: "geocoding" }));
    const addressAtCall = current.address;

    try {
      const { lat, lng } = await geocodeAddress(addressAtCall);

      // Stale guard — user may have kept typing while we were in flight.
      if (stateRef.current.address !== addressAtCall) {
        return stateRef.current;
      }

      if (lat && lng) {
        const next: AddressState = {
          address: addressAtCall,
          lat,
          lng,
          placeId: stateRef.current.placeId,
          status: "geocoded",
        };
        setState(next);
        return next;
      }

      const failed: AddressState = {
        ...stateRef.current,
        status: "geocode_failed",
      };
      setState(failed);
      return failed;
    } catch {
      if (stateRef.current.address !== addressAtCall) {
        return stateRef.current;
      }
      const failed: AddressState = {
        ...stateRef.current,
        status: "geocode_failed",
      };
      setState(failed);
      return failed;
    }
  }, []);

  const reset = useCallback(() => setState(EMPTY), []);

  return { state, setText, setSelection, ensureGeocoded, reset };
}
