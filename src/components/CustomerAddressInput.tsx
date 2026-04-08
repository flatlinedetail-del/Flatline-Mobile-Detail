/// <reference types="vite/client" />
import React, { useState, useEffect, useRef, useCallback } from "react";
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import { useJsApiLoader, Libraries } from "@react-google-maps/api";
import { MapPin, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomerAddressInputProps {
  onAddressSelect?: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}

const LIBRARIES: Libraries = ["places"];

/**
 * IsolatedAddressInput
 * 
 * This component is designed to be completely isolated from parent re-renders.
 * It manages its own internal state and only notifies the parent when a 
 * definitive selection is made or when the input is blurred.
 */
export interface CustomerAddressInputRef {
  getAddressData: () => { address: string; lat: number; lng: number };
}

const CustomerAddressInput = React.forwardRef<CustomerAddressInputRef, CustomerAddressInputProps>(({
  onAddressSelect,
  placeholder = "Search address...",
  className = "",
  defaultValue = "",
}, ref) => {
  const { isLoaded, loadError: loaderError } = useJsApiLoader({
    googleMapsApiKey: (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES,
  });

  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    if (loaderError) {
      setLoadError(loaderError);
    }
  }, [loaderError]);

  // Check if places library actually loaded (handles ApiTargetBlockedMapError)
  useEffect(() => {
    if (isLoaded && !window.google?.maps?.places) {
      setLoadError(new Error("ApiTargetBlockedMapError: Places library failed to load. Check API restrictions in Google Cloud Console."));
    }
  }, [isLoaded]);

  const [inputValue, setInputValue] = useState(defaultValue);
  const [addressData, setAddressData] = useState({ address: defaultValue, lat: 0, lng: 0 });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionMadeRef = useRef(false);

  const {
    ready,
    suggestions: { status, data },
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

  // Initialize autocomplete only when Google Maps script is loaded
  useEffect(() => {
    if (isLoaded) {
      init();
    }
  }, [isLoaded, init]);

  // Expose the current data to the parent via ref
  React.useImperativeHandle(ref, () => ({
    getAddressData: () => {
      // If a selection was made, return that data
      // Otherwise return the current input value as a manual entry
      return selectionMadeRef.current ? addressData : { address: inputValue, lat: 0, lng: 0 };
    }
  }));

  const lastDefaultValue = useRef(defaultValue);
  useEffect(() => {
    if (defaultValue !== lastDefaultValue.current) {
      setInputValue(defaultValue);
      setAddressData({ address: defaultValue, lat: 0, lng: 0 });
      setValue(defaultValue, false);
      lastDefaultValue.current = defaultValue;
    }
  }, [defaultValue, setValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setValue(val);
    selectionMadeRef.current = false;
    setShowSuggestions(val.length > 0);
  };

  const handleSelect = async (description: string) => {
    selectionMadeRef.current = true;
    setInputValue(description);
    setValue(description, false);
    clearSuggestions();
    setShowSuggestions(false);

    try {
      const results = await getGeocode({ address: description });
      const { lat, lng } = await getLatLng(results[0]);
      const newData = { address: description, lat, lng };
      setAddressData(newData);
      if (onAddressSelect) onAddressSelect(description, lat, lng);
    } catch (error) {
      console.error("Geocoding error:", error);
      const newData = { address: description, lat: 0, lng: 0 };
      setAddressData(newData);
      if (onAddressSelect) onAddressSelect(description, 0, 0);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (inputValue.length > 0 && status === "OK") setShowSuggestions(true);
          }}
          placeholder={!isLoaded && !loadError ? "Loading..." : placeholder}
          disabled={!isLoaded && !loadError}
          className={cn(
            "h-10 w-full rounded-xl border-none bg-gray-50 pl-10 pr-10 text-sm font-medium transition-all outline-none focus:ring-2 focus:ring-primary/20",
            !isLoaded && !loadError && "opacity-50 cursor-not-allowed"
          )}
        />
        {!isLoaded && !loadError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
          </div>
        )}
      </div>

      {/* Error Message Hint */}
      {loadError && (
        <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-[10px] leading-tight shadow-sm animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-1.5 font-bold mb-1">
            <AlertCircle className="w-3 h-3" />
            <span>Google Maps API Error</span>
          </div>
          <p className="mb-1">
            {loadError.message?.includes("ApiTargetBlockedMapError") || loadError.toString().includes("ApiTargetBlockedMapError")
              ? "The 'Places API' or 'Geocoding API' is not enabled for this API key. You must enable BOTH in the Google Cloud Console."
              : "Failed to load address suggestions. Manual entry is enabled."}
          </p>
          {(loadError.message?.includes("ApiTargetBlockedMapError") || loadError.toString().includes("ApiTargetBlockedMapError")) && (
            <div className="flex flex-col gap-1.5 mt-2">
              <a 
                href="https://console.cloud.google.com/google/maps-apis/api/places-backend.googleapis.com/overview" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline font-bold flex items-center gap-1"
              >
                1. Enable Places API →
              </a>
              <a 
                href="https://console.cloud.google.com/google/maps-apis/api/geocoding-backend.googleapis.com/overview" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline font-bold flex items-center gap-1"
              >
                2. Enable Geocoding API →
              </a>
              <a 
                href="https://console.cloud.google.com/google/maps-apis/credentials" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline font-bold flex items-center gap-1"
              >
                3. Check API Key Restrictions →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Custom Suggestions Dropdown */}
      {showSuggestions && status === "OK" && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-[300px] overflow-y-auto py-2">
            {data.map(({ place_id, description, structured_formatting }) => (
              <button
                key={place_id}
                type="button"
                onClick={() => handleSelect(description)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-none"
              >
                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-gray-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-gray-900 truncate">
                    {structured_formatting?.main_text || description}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate">
                    {structured_formatting?.secondary_text || ""}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showSuggestions && status === "ZERO_RESULTS" && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 text-center text-sm text-gray-500">
          No results found
        </div>
      )}
    </div>
  );
});

CustomerAddressInput.displayName = "CustomerAddressInput";

export default CustomerAddressInput;
