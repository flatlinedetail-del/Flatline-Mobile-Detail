import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MapPin, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";
import { cn, cleanAddress } from "@/lib/utils";
import { StructuredAddress } from "../types";

interface AddressInputProps {
  /**
   * Controlled mode. When provided, this string is the source of truth for
   * the visible input value and `defaultValue` is ignored. Required for the
   * public booking flow where the parent (via usePublicBookingAddress) owns
   * the address state.
   */
  value?: string;
  /**
   * Uncontrolled-mode initial value. Used only when `value` is not provided.
   * Preserved for existing callers (BookAppointment) that still rely on the
   * uncontrolled pattern.
   */
  defaultValue?: string;
  /** Called on every keystroke so the parent can sync the raw typed value. */
  onChange?: (value: string) => void;
  onAddressSelect: (address: string, lat: number, lng: number, structured?: StructuredAddress) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressInput({
  value: controlledValue,
  defaultValue = "",
  onChange,
  onAddressSelect,
  placeholder = "Search address...",
  className = "",
}: AddressInputProps) {
  const isControlled = controlledValue !== undefined;
  const { isLoaded, loadError: loaderError } = useGoogleMaps();

  const [loadError, setLoadError] = useState<Error | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingSuccess, setGeocodingSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocused = useRef(false);
  const selectionMadeRef = useRef(false);

  // Dropdown position state — the suggestions are portaled to document.body
  // so they escape any parent `overflow-hidden` (e.g. the Card on /book step 6).
  // We track the input's bounding rect via a layout effect + scroll/resize
  // listeners so the floating dropdown stays glued to the input.
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (loaderError) {
      setLoadError(loaderError);
    }
  }, [loaderError]);

  useEffect(() => {
    if (isLoaded && !window.google?.maps?.places) {
      setLoadError(new Error("ApiTargetBlockedMapError: Places library failed to load."));
    }
  }, [isLoaded]);

  const {
    ready,
    value,
    suggestions: { status, data, loading: suggestionsLoading },
    setValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: "us" },
    },
    debounce: 300,
    defaultValue,
    cache: 86400,
    initOnMount: false,
  });

  useEffect(() => {
    if (isLoaded && window.google?.maps?.places) {
      init();
    }
  }, [isLoaded, init]);

  // Sync defaultValue carefully — ONLY in uncontrolled mode. When the parent
  // passes `value`, the controlled-sync effect below owns the input.
  const lastDefaultValue = useRef(defaultValue);
  useEffect(() => {
    if (isControlled) return;
    if (defaultValue !== lastDefaultValue.current && !isFocused.current) {
      setValue(cleanAddress(defaultValue), false);
      lastDefaultValue.current = defaultValue;
    }
  }, [defaultValue, setValue, isControlled]);

  // Controlled-mode sync — keep the usePlacesAutocomplete internal value
  // aligned with the parent's `value` so suggestion queries stay in sync.
  // Tracks `controlledValue` only (not `value`) so we don't fire on every
  // hook-internal state change; typing is already handled in handleInputChange
  // which calls `setValue(val)` (with fetch). Only external parent-driven
  // changes (programmatic resets, autocomplete selection from outside)
  // need this sync.
  const lastSyncedControlledValue = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!isControlled) return;
    const next = controlledValue ?? "";
    if (lastSyncedControlledValue.current === next) return;
    lastSyncedControlledValue.current = next;
    // `false` suppresses fetching suggestions — external parent updates
    // shouldn't trigger a Places API call. User typing keeps fetching via
    // handleInputChange.
    setValue(next, false);
  }, [isControlled, controlledValue, setValue]);

  // Track the input's position so the portaled dropdown can follow it.
  useLayoutEffect(() => {
    if (!showSuggestions) return;
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setDropdownRect({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [showSuggestions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const extractAddressComponents = (results: google.maps.GeocoderResult): StructuredAddress => {
    const components = results.address_components;
    const getComponent = (types: string[]) => 
      components.find(c => types.some(t => c.types.includes(t)))?.long_name;

    const { lat, lng } = results.geometry.location;

    return {
      formattedAddress: cleanAddress(results.formatted_address),
      streetNumber: getComponent(["street_number"]),
      route: getComponent(["route"]),
      city: getComponent(["locality"]) || getComponent(["sublocality"]),
      state: getComponent(["administrative_area_level_1"]),
      zipCode: getComponent(["postal_code"]),
      country: getComponent(["country"]),
      latitude: typeof lat === "function" ? lat() : lat,
      longitude: typeof lng === "function" ? lng() : lng,
      placeId: results.place_id
    };
  };

  const handleSelect = async (address: string) => {
    selectionMadeRef.current = true;
    setValue(cleanAddress(address), false);
    clearSuggestions();
    setShowSuggestions(false);
    setIsGeocoding(true);
    setGeocodingSuccess(false);

    try {
      const results = await getGeocode({ address });
      if (results && results.length > 0) {
        const structured = extractAddressComponents(results[0]);
        onAddressSelect(cleanAddress(structured.formattedAddress), structured.latitude, structured.longitude, structured);
        setGeocodingSuccess(true);
      }
    } catch (error: any) {
      console.error("Geocoding error: ", error);
      onAddressSelect(cleanAddress(address), 0, 0);
    } finally {
      setIsGeocoding(false);
      setTimeout(() => {
        selectionMadeRef.current = false;
      }, 200);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // In uncontrolled mode we own the internal state; in controlled mode the
    // parent's `value` will flow back through the sync effect on the next
    // render. Either way we still call setValue so suggestions stay live.
    setValue(val);
    onChange?.(val);
    setShowSuggestions(val.length > 0);
    setGeocodingSuccess(false);
  };

  const handleBlur = () => {
    isFocused.current = false;
    // Delay to allow handleSelect to run first if a suggestion was clicked
    setTimeout(async () => {
      // Compare against the appropriate "baseline" — in controlled mode the
      // parent's `value` is the baseline; in uncontrolled mode it's the
      // original defaultValue.
      const baseline = isControlled ? (controlledValue ?? "") : defaultValue;
      if (!selectionMadeRef.current && value && value !== baseline) {
        setShowSuggestions(false);
        // Background geocode manual entry
        setIsGeocoding(true);
        try {
          const results = await getGeocode({ address: value });
          if (results && results.length > 0) {
            const structured = extractAddressComponents(results[0]);
            onAddressSelect(structured.formattedAddress, structured.latitude, structured.longitude, structured);
            setGeocodingSuccess(true);
          } else {
            onAddressSelect(value, 0, 0);
          }
        } catch (error) {
          console.error("Manual geocode error:", error);
          onAddressSelect(value, 0, 0);
        } finally {
          setIsGeocoding(false);
        }
      } else if (!selectionMadeRef.current) {
        setShowSuggestions(false);
      }
    }, 200);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700 z-10" />
        <input
          ref={inputRef}
          type="text"
          value={isControlled ? (controlledValue ?? "") : value}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={() => {
            isFocused.current = true;
            const current = isControlled ? (controlledValue ?? "") : value;
            if (current.length > 0) setShowSuggestions(true);
          }}
          placeholder={!isLoaded ? "Loading maps..." : placeholder}
          className={cn(
            "h-12 w-full rounded-xl border-2 border-gray-300 bg-white pl-10 pr-10 text-sm font-bold text-black transition-all outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-gray-500",
            !isLoaded && !loadError && "opacity-50 cursor-not-allowed",
            loadError && "border-amber-200 ring-amber-100"
          )}
          disabled={!isLoaded && !loadError}
        />
        {(isGeocoding || suggestionsLoading) && !loadError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
          </div>
        )}
        {geocodingSuccess && !isGeocoding && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </div>
        )}
        {loadError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
        )}
      </div>

      {loadError && (
        <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
          <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-1">Maps Configuration Note</p>
          <p className="text-xs text-amber-800 font-medium">
            {loadError.message.includes("ApiTargetBlockedMapError") 
              ? "The Places API is not authorized for this API key. Autocomplete is disabled, but you can still type the address manually."
              : "Maps could not load. Autocomplete is disabled, but you can still type the address manually."}
          </p>
        </div>
      )}

      {/* Suggestions dropdown — portaled to <body> so it escapes any parent
          `overflow-hidden` (e.g. the rounded Card on PublicBooking step 6
          previously clipped this list, which is why suggestions appeared to
          never show up). `position: fixed` keeps it pinned to the viewport;
          the layout effect above updates its rect on scroll/resize. */}
      {showSuggestions && status === "OK" && dropdownRect && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: dropdownRect.top + 8,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 9999,
            }}
            className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            // The dropdown is portaled to <body>, OUTSIDE containerRef, so
            // the document-level click-outside listener would close it on
            // mousedown unless we stop propagation. preventDefault keeps the
            // input focused so handleSelect can run cleanly without handleBlur
            // racing it.
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="max-h-[300px] overflow-y-auto py-2">
              {data.map(({ place_id, description, structured_formatting }) => (
                <button
                  key={place_id}
                  type="button"
                  onClick={() => handleSelect(description)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-none"
                >
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-gray-700" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-gray-900 truncate">
                      {structured_formatting?.main_text || cleanAddress(description)}
                    </span>
                    <span className="text-[10px] text-gray-700 truncate font-bold">
                      {cleanAddress(structured_formatting?.secondary_text || "")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
