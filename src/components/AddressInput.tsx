import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";
import { Input } from "./ui/input";
import { MapPin } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      /* Define search scope here */
    },
    debounce: 300,
    defaultValue,
  });

  const handleSelect = async (address: string) => {
    setValue(address, false);
    clearSuggestions();
    setOpen(false);

    try {
      const results = await getGeocode({ address });
      const { lat, lng } = await getLatLng(results[0]);
      onAddressSelect(address, lat, lng);
    } catch (error) {
      console.error("Error: ", error);
    }
  };

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={
          <div className="relative cursor-pointer">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!ready}
              placeholder={placeholder}
              className="pl-10 bg-gray-50 border-none font-medium"
            />
          </div>
        } />
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
          <Command>
            <CommandList>
              {status === "OK" ? (
                <CommandGroup>
                  {data.map(({ place_id, description }) => (
                    <CommandItem
                      key={place_id}
                      value={description}
                      onSelect={() => handleSelect(description)}
                    >
                      {description}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                value && status !== "" && <CommandEmpty>No results found.</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
