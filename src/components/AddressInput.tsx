import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import { useState, useEffect, useRef } from "react";
import { MapPin, AlertCircle, Loader2 } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";
import { cn } from "@/lib/utils";

interface AddressInputProps {
  defaultValue?: string;
  onAddressSelect: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressInput({
  defaultValue = "",
  onAddressSelect,
  placeholder = "Search address...",
  className = "",
}: AddressInputProps) {
  const { isLoaded, loadError: loaderError } = useGoogleMaps();

  const [loadError, setLoadError] = useState<Error | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);
  const selectionMadeRef = useRef(false);

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

  // Sync defaultValue carefully
  const lastDefaultValue = useRef(defaultValue);
  useEffect(() => {
    if (defaultValue !== lastDefaultValue.current && !isFocused.current) {
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

  const handleSelect = async (address: string) => {
    selectionMadeRef.current = true;
    setValue(address, false);
    clearSuggestions();
    setShowSuggestions(false);

    try {
      const results = await getGeocode({ address });
      const { lat, lng } = await getLatLng(results[0]);
      onAddressSelect(address, lat, lng);
    } catch (error: any) {
      console.error("Geocoding error: ", error);
      onAddressSelect(address, 0, 0);
    } finally {
      setTimeout(() => {
        selectionMadeRef.current = false;
      }, 200);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    setShowSuggestions(val.length > 0);
  };

  const handleBlur = () => {
    isFocused.current = false;
    // Delay to allow handleSelect to run first if a suggestion was clicked
    setTimeout(() => {
      if (!selectionMadeRef.current) {
        setShowSuggestions(false);
        onAddressSelect(value, 0, 0);
      }
    }, 200);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={() => {
            isFocused.current = true;
            if (value.length > 0) setShowSuggestions(true);
          }}
          placeholder={!isLoaded ? "Loading maps..." : placeholder}
          className={cn(
            "h-10 w-full rounded-xl border-none bg-gray-50 pl-10 pr-10 text-sm font-medium transition-all outline-none focus:ring-2 focus:ring-primary/20",
            (!isLoaded || loadError) && "opacity-50 cursor-not-allowed",
            loadError && "border-red-200 ring-red-100"
          )}
          disabled={!isLoaded || !!loadError}
        />
        {(!isLoaded || suggestionsLoading) && !loadError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
          </div>
        )}
        {loadError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AlertCircle className="w-4 h-4 text-red-500" />
          </div>
        )}
      </div>

      {loadError && (
        <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl">
          <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider mb-1">Maps Configuration Error</p>
          <p className="text-xs text-red-800 font-medium">
            {loadError.message.includes("ApiTargetBlockedMapError") 
              ? "The Places API is not enabled for this API key. Please enable 'Places API' in your Google Cloud Console."
              : loadError.message}
          </p>
        </div>
      )}

      {showSuggestions && status === "OK" && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[9999] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
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
    </div>
  );
}
