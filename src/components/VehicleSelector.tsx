import { useState, useEffect } from "react";
import { getMakesForYear, getModelsForMakeYear, VehicleMake, VehicleModel } from "../services/vehicleService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface VehicleSelectorProps {
  onSelect: (vehicle: { year: string; make: string; model: string }) => void;
  initialValues?: { year: string; make: string; model: string };
}

export default function VehicleSelector({ onSelect, initialValues }: VehicleSelectorProps) {
  const [year, setYear] = useState(initialValues?.year || "");
  const [make, setMake] = useState(initialValues?.make || "");
  const [model, setModel] = useState(initialValues?.model || "");
  
  const [makes, setMakes] = useState<VehicleMake[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [openMake, setOpenMake] = useState(false);
  const [openModel, setOpenModel] = useState(false);

  const years = Array.from({ length: 30 }, (_, i) => (new Date().getFullYear() + 1 - i).toString());

  useEffect(() => {
    if (year) {
      const fetchMakes = async () => {
        setLoadingMakes(true);
        const data = await getMakesForYear(year);
        setMakes(data);
        setLoadingMakes(false);
      };
      fetchMakes();
    } else {
      setMakes([]);
    }
  }, [year]);

  useEffect(() => {
    if (make && year) {
      const fetchModels = async () => {
        setLoadingModels(true);
        const data = await getModelsForMakeYear(make, year);
        setModels(data);
        setLoadingModels(false);
      };
      fetchModels();
    } else {
      setModels([]);
    }
  }, [make, year]);

  const handleYearChange = (val: string) => {
    setYear(val);
    setMake("");
    setModel("");
    onSelect({ year: val, make: "", model: "" });
  };

  const handleMakeSelect = (val: string) => {
    setMake(val);
    setModel("");
    setOpenMake(false);
    onSelect({ year, make: val, model: "" });
  };

  const handleModelSelect = (val: string) => {
    setModel(val);
    setOpenModel(false);
    onSelect({ year, make, model: val });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label>Year</Label>
        <Select value={year} onValueChange={handleYearChange}>
          <SelectTrigger className="bg-white border-gray-200">
            <SelectValue placeholder="Select Year" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {years.map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Make</Label>
        <Popover open={openMake} onOpenChange={setOpenMake}>
          <PopoverTrigger render={
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openMake}
              className="w-full justify-between bg-white border-gray-200 h-10 font-medium"
              disabled={!year || loadingMakes}
            >
              {make ? make : loadingMakes ? "Loading..." : "Select Make"}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          } />
          <PopoverContent className="w-[200px] p-0 bg-white">
            <Command>
              <CommandInput placeholder="Search make..." />
              <CommandList>
                <CommandEmpty>No make found.</CommandEmpty>
                <CommandGroup>
                  {makes.map((m) => (
                    <CommandItem
                      key={m.Make_ID}
                      value={m.Make_Name}
                      onSelect={() => handleMakeSelect(m.Make_Name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          make === m.Make_Name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {m.Make_Name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label>Model</Label>
        <Popover open={openModel} onOpenChange={setOpenModel}>
          <PopoverTrigger render={
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openModel}
              className="w-full justify-between bg-white border-gray-200 h-10 font-medium"
              disabled={!make || loadingModels}
            >
              {model ? model : loadingModels ? "Loading..." : "Select Model"}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          } />
          <PopoverContent className="w-[200px] p-0 bg-white">
            <Command>
              <CommandInput placeholder="Search model..." />
              <CommandList>
                <CommandEmpty>No model found.</CommandEmpty>
                <CommandGroup>
                  {models.map((m) => (
                    <CommandItem
                      key={m.Model_ID}
                      value={m.Model_Name}
                      onSelect={() => handleModelSelect(m.Model_Name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          model === m.Model_Name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {m.Model_Name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
