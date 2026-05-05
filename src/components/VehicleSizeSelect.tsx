import { useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehicleSize } from "../types";
import { detectVehicleSize, isVehicleSize, VehicleSizeDetectionInput } from "../lib/vehicleSize";

type VehicleSizeLabels = Partial<Record<VehicleSize, string>>;

interface VehicleSizeSelectProps {
  name?: string;
  vehicle?: VehicleSizeDetectionInput;
  value?: VehicleSize;
  defaultValue?: VehicleSize;
  onValueChange?: (value: VehicleSize) => void;
  triggerClassName?: string;
  contentClassName?: string;
  labels?: VehicleSizeLabels;
  placeholder?: string;
  autoDetectFromDefault?: boolean;
  noteClassName?: string;
}

const DEFAULT_LABELS: Record<VehicleSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  extra_large: "Extra Large",
};

export default function VehicleSizeSelect({
  name = "size",
  vehicle,
  value,
  defaultValue = "medium",
  onValueChange,
  triggerClassName,
  contentClassName,
  labels,
  placeholder = "Vehicle Size",
  autoDetectFromDefault = true,
  noteClassName = "text-[10px] font-bold text-primary/70 uppercase tracking-widest",
}: VehicleSizeSelectProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<VehicleSize>(defaultValue);
  const [wasManuallyChanged, setWasManuallyChanged] = useState(false);
  const [isAutoDetected, setIsAutoDetected] = useState(false);
  const lastAutoValue = useRef<VehicleSize | null>(null);
  const currentValue = isControlled ? value : internalValue;
  const mergedLabels = { ...DEFAULT_LABELS, ...labels };

  const setSelectedValue = (nextValue: VehicleSize) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  };

  useEffect(() => {
    if (wasManuallyChanged) return;

    const detectedSize = detectVehicleSize(vehicle || {});
    if (!detectedSize) return;

    const canReplaceCurrent =
      !currentValue ||
      currentValue === lastAutoValue.current ||
      (autoDetectFromDefault && currentValue === defaultValue);

    if (canReplaceCurrent && detectedSize !== currentValue) {
      lastAutoValue.current = detectedSize;
      setIsAutoDetected(true);
      setSelectedValue(detectedSize);
    } else if (detectedSize === currentValue) {
      lastAutoValue.current = detectedSize;
      setIsAutoDetected(true);
    }
  }, [vehicle?.make, vehicle?.model, vehicle?.type, vehicle?.bodyStyle, vehicle?.vehicleInfo, currentValue, defaultValue, autoDetectFromDefault, wasManuallyChanged]);

  return (
    <div className="space-y-1.5">
      <Select
        name={name}
        value={currentValue}
        onValueChange={(nextValue) => {
          if (!isVehicleSize(nextValue)) return;
          setWasManuallyChanged(true);
          setIsAutoDetected(false);
          setSelectedValue(nextValue);
        }}
      >
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          <SelectItem value="small">{mergedLabels.small}</SelectItem>
          <SelectItem value="medium">{mergedLabels.medium}</SelectItem>
          <SelectItem value="large">{mergedLabels.large}</SelectItem>
          <SelectItem value="extra_large">{mergedLabels.extra_large}</SelectItem>
        </SelectContent>
      </Select>
      {isAutoDetected && !wasManuallyChanged && (
        <p className={noteClassName}>Auto-detected — you can change this.</p>
      )}
    </div>
  );
}
