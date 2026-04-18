import { useState, useEffect, useRef } from "react";
import { getMakesForYear, getModelsForMakeYear, saveCustomVehicle, VehicleMake, VehicleModel } from "../services/vehicleService";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface VehicleSelectorProps {
  onSelect: (vehicle: { year: string; make: string; model: string }) => void;
  initialValues?: { year: string; make: string; model: string };
}

function DropdownSelector({
  value,
  placeholder,
  options,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  onSelect,
  showCustomAdd,
  onCustomAdd,
  disabled,
  loading
}: {
  value: string;
  placeholder: string;
  options: { label: string; value: string }[];
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (val: string) => void;
  onSelect: (val: string) => void;
  showCustomAdd?: boolean;
  onCustomAdd?: (val: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white hover:bg-white/10 hover:text-white"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="truncate">{value ? value : loading ? "Loading..." : placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-white/10 rounded-xl shadow-xl max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-white/10">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white/5 text-white placeholder-gray-400"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1 custom-scrollbar bg-gray-900">
            {options.length === 0 && !showCustomAdd && (
              <div className="p-3 text-sm text-gray-400 text-center">No results found.</div>
            )}
            {options.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                className="w-full text-left px-2 py-2 text-sm hover:bg-white/10 rounded-lg flex items-center transition-colors text-white"
                onClick={() => {
                  onSelect(opt.value);
                  setIsOpen(false);
                  onSearchChange("");
                }}
              >
                <Check className={cn("mr-2 h-4 w-4 shrink-0", value === opt.value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
            {showCustomAdd && onCustomAdd && (
              <button
                type="button"
                className="w-full text-left px-2 py-2 text-sm text-primary hover:bg-white/5 rounded-lg flex items-center font-bold border-t border-white/10 mt-1 pt-2 transition-colors"
                onClick={() => {
                  onCustomAdd(searchValue);
                  setIsOpen(false);
                  onSearchChange("");
                }}
              >
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">Add "{searchValue}"</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VehicleSelector({ onSelect, initialValues }: VehicleSelectorProps) {
  const [year, setYear] = useState(initialValues?.year || "");
  const [make, setMake] = useState(initialValues?.make || "");
  const [model, setModel] = useState(initialValues?.model || "");
  
  const [makes, setMakes] = useState<VehicleMake[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  
  const [yearSearch, setYearSearch] = useState("");
  const [makeSearch, setMakeSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");

  const currentYear = new Date().getFullYear();
  const allYears = Array.from({ length: currentYear - 1950 + 2 }, (_, i) => (currentYear + 1 - i).toString());

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

  const handleMakeSelect = async (val: string, isCustom: boolean = false) => {
    const upperVal = val.toUpperCase();
    setMake(upperVal);
    setModel("");
    onSelect({ year, make: upperVal, model: "" });
    
    if (isCustom) {
      await saveCustomVehicle(upperVal, "");
      const data = await getMakesForYear(year);
      setMakes(data);
    }
  };

  const handleModelSelect = async (val: string, isCustom: boolean = false) => {
    const upperVal = val.toUpperCase();
    setModel(upperVal);
    onSelect({ year, make, model: upperVal });

    if (isCustom) {
      await saveCustomVehicle(make, upperVal);
      const data = await getModelsForMakeYear(make, year);
      setModels(data);
    }
  };

  const filteredYears = allYears.filter(y => y.includes(yearSearch));
  const filteredMakes = makes.filter(m => m.Make_Name.toLowerCase().includes(makeSearch.toLowerCase()));
  const filteredModels = models.filter(m => m.Model_Name.toLowerCase().includes(modelSearch.toLowerCase()));

  const showCustomMake = makeSearch.length > 1 && !makes.some(m => m.Make_Name.toLowerCase() === makeSearch.toLowerCase());
  const showCustomModel = modelSearch.length > 1 && !models.some(m => m.Model_Name.toLowerCase() === modelSearch.toLowerCase());

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Year</Label>
        <DropdownSelector
          value={year}
          placeholder="Select Year"
          searchPlaceholder="Search year..."
          searchValue={yearSearch}
          onSearchChange={setYearSearch}
          options={filteredYears.map(y => ({ label: y, value: y }))}
          onSelect={handleYearChange}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Make</Label>
        <DropdownSelector
          value={make}
          placeholder="Select Make"
          searchPlaceholder="Search make..."
          searchValue={makeSearch}
          onSearchChange={setMakeSearch}
          options={filteredMakes.map(m => ({ label: m.Make_Name, value: m.Make_Name }))}
          onSelect={(val) => handleMakeSelect(val)}
          disabled={!year || loadingMakes}
          loading={loadingMakes}
          showCustomAdd={showCustomMake}
          onCustomAdd={(val) => handleMakeSelect(val, true)}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Model</Label>
        <DropdownSelector
          value={model}
          placeholder="Select Model"
          searchPlaceholder="Search model..."
          searchValue={modelSearch}
          onSearchChange={setModelSearch}
          options={filteredModels.map(m => ({ label: m.Model_Name, value: m.Model_Name }))}
          onSelect={(val) => handleModelSelect(val)}
          disabled={!make || loadingModels}
          loading={loadingModels}
          showCustomAdd={showCustomModel}
          onCustomAdd={(val) => handleModelSelect(val, true)}
        />
      </div>
    </div>
  );
}
