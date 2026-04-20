import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import { useState, useEffect, useRef } from "react";
import { MapPin, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsProvider";
import { cn, cleanAddress } from "@/lib/utils";
import { StructuredAddress } from "../types";

interface AddressInputProps {
  defaultValue?: string;
  onAddressSelect: (address: string, lat: number, lng: number, structured?: StructuredAddress) => void;
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
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingSuccess, setGeocodingSuccess] = useState(false);
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
      setValue(cleanAddress(defaultValue), false);
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
    setValue(val);
    setShowSuggestions(val.length > 0);
    setGeocodingSuccess(false);
  };

  const handleBlur = () => {
    isFocused.current = false;
    // Delay to allow handleSelect to run first if a suggestion was clicked
    setTimeout(async () => {
      if (!selectionMadeRef.current && value && value !== defaultValue) {
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
            "h-10 w-full rounded-xl border-none bg-gray-50 pl-10 pr-10 text-sm font-bold text-black transition-all outline-none focus:ring-2 focus:ring-primary/20",
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
                    {structured_formatting?.main_text || cleanAddress(description)}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate">
                    {cleanAddress(structured_formatting?.secondary_text || "")}
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
