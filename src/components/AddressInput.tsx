/// <reference types="vite/client" />
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState, useEffect, useRef } from "react";
import { Input } from "./ui/input";
import { MapPin, AlertCircle, Loader2 } from "lucide-react";
import { useJsApiLoader, Libraries } from "@react-google-maps/api";

interface AddressInputProps {
  defaultValue?: string;
  onAddressSelect: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
}

const LIBRARIES: Libraries = ["places"];

export default function AddressInput({
  defaultValue = "",
  onAddressSelect,
  placeholder = "Search address...",
  className = "",
}: AddressInputProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES,
  });

  const [open, setOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionMadeRef = useRef(false);
  
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: "us" },
    },
    debounce: 200,
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

  // Only sync defaultValue if we aren't currently typing and value is empty
  useEffect(() => {
    if (defaultValue && value === "" && !isTyping) {
      setValue(defaultValue, false);
    }
  }, [defaultValue, setValue, value, isTyping]);

  const handleSelect = async (address: string) => {
    selectionMadeRef.current = true;
    setValue(address, false);
    clearSuggestions();
    setOpen(false);
    setIsTyping(false);

    try {
      const results = await getGeocode({ address });
      const { lat, lng } = await getLatLng(results[0]);
      onAddressSelect(address, lat, lng);
    } catch (error) {
      console.error("Geocoding error: ", error);
      onAddressSelect(address, 0, 0);
    } finally {
      // Reset the ref after a short delay to allow blur events to be ignored
      setTimeout(() => {
        selectionMadeRef.current = false;
      }, 100);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    setIsTyping(true);
    
    if (val.length > 0) {
      setOpen(true);
    } else {
      setOpen(false);
    }
    
    // We NO LONGER call onAddressSelect here to prevent parent re-render loops
    // which cause the component to remount and lose focus.
  };

  const handleBlur = () => {
    // Small delay to allow handleSelect to set selectionMadeRef
    setTimeout(() => {
      if (!selectionMadeRef.current) {
        setIsTyping(false);
        // Pass the current value as a manual entry if no selection was made
        onAddressSelect(value, 0, 0);
      }
    }, 150);
  };

  // Ensure popover opens when results arrive
  useEffect(() => {
    if (status === "OK" && value.length > 0 && !open && isTyping) {
      setOpen(true);
    }
  }, [status, value, open, isTyping]);

  if (loadError) {
    const isAuthError = loadError.message?.includes("ApiTargetBlockedMapError") || 
                        loadError.toString().includes("ApiTargetBlockedMapError");
    
    return (
      <div className="flex flex-col gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs">
        <div className="flex items-center gap-2 font-bold">
          <AlertCircle className="w-4 h-4" />
          <span>Google Maps Error</span>
        </div>
        <p className="font-medium">
          {isAuthError 
            ? "API Key Restriction Error: Please enable 'Places API' in your Google Cloud Console for this API key."
            : "Google address autocomplete failed to load. Please check your API key settings."}
        </p>
        {isAuthError && (
          <a 
            href="https://console.cloud.google.com/google/maps-apis/credentials" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline font-bold mt-1"
          >
            Go to Google Cloud Console →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger render={
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              ref={inputRef}
              value={value}
              onChange={handleInputChange}
              onBlur={handleBlur}
              onFocus={() => {
                if (value.length > 0 && status === "OK") setOpen(true);
              }}
              placeholder={!isLoaded ? "Loading Google Maps..." : placeholder}
              disabled={!isLoaded}
              className="pl-10 bg-gray-50 border-none font-medium w-full focus-visible:ring-1 focus-visible:ring-primary"
            />
            {!isLoaded && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
              </div>
            )}
          </div>
        } />
        <PopoverContent 
          className="p-0 w-[var(--radix-popover-trigger-width)] overflow-hidden border-none shadow-2xl rounded-xl z-[100]" 
          align="start"
          sideOffset={8}
        >
          <Command className="rounded-xl border-none" shouldFilter={false}>
            <CommandList className="max-h-[300px] overflow-y-auto">
              {status === "OK" ? (
                <CommandGroup>
                  {data.map(({ place_id, description, structured_formatting }) => (
                    <CommandItem
                      key={place_id}
                      value={description}
                      onSelect={() => handleSelect(description)}
                      className="px-4 py-3 cursor-pointer hover:bg-accent transition-colors border-b border-gray-50 last:border-none"
                    >
                      <div className="flex items-center gap-3">
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
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                value && status !== "" && status !== "ZERO_RESULTS" && (
                  <CommandEmpty className="py-6 text-center text-sm text-gray-500">
                    No results found.
                  </CommandEmpty>
                )
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
