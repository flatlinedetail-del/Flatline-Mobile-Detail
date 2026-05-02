import React, { useState, useEffect, useRef } from "react";
import { Input } from "./ui/input";
import { cn, validateEmail, validateVIN, formatVIN, formatLicensePlate, formatPhoneNumber } from "@/lib/utils";

interface StandardInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange: (value: any) => void;
  variant?: "text" | "number" | "currency" | "phone" | "email" | "vin" | "plate" | "percentage" | "mileage";
  error?: string;
  showError?: boolean;
}

export function StandardInput({ 
  value, 
  defaultValue,
  onValueChange, 
  variant = "text", 
  error, 
  showError = true,
  className,
  onBlur,
  onFocus,
  ...props 
}: StandardInputProps) {
  const [localValue, setLocalValue] = useState((value ?? defaultValue ?? "")?.toString());
  const [internalError, setInternalError] = useState<string | null>(null);
  const isFocused = useRef(false);
  const lastPropsValue = useRef(value);

  useEffect(() => {
    if (!isFocused.current && value !== lastPropsValue.current) {
      setLocalValue(value?.toString() || "");
      lastPropsValue.current = value;
    }
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = true;
    
    // Clear zero for numeric types
    if (["number", "currency", "percentage", "mileage"].includes(variant)) {
      if (parseFloat(localValue) === 0) {
        setLocalValue("");
      }
    }
    
    if (onFocus) onFocus(e);
  };

  const validateAndFormat = (val: string) => {
    let finalVal = val;
    let err = null;

    switch (variant) {
      case "email":
        if (finalVal && !validateEmail(finalVal)) {
          err = "Invalid email format";
        }
        break;
      case "vin":
        finalVal = formatVIN(finalVal);
        if (finalVal && finalVal.length > 0 && finalVal.length < 17) {
          err = "VIN must be 17 characters";
        }
        break;
      case "plate":
        finalVal = formatLicensePlate(finalVal);
        break;
      case "phone":
        finalVal = formatPhoneNumber(finalVal);
        break;
      case "number":
      case "currency":
      case "percentage":
      case "mileage":
        if (finalVal === "") {
          finalVal = "0";
        }
        break;
    }

    return { finalVal, err };
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = false;
    const { finalVal, err } = validateAndFormat(localValue);
    
    setLocalValue(finalVal);
    setInternalError(err);
    
    // Convert to number if appropriate
    if (["number", "currency", "percentage", "mileage"].includes(variant)) {
      const num = parseFloat(finalVal);
      onValueChange(isNaN(num) ? 0 : num);
    } else {
      onValueChange(finalVal);
    }

    if (onBlur) onBlur(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Some real-time transformations
    if (variant === "vin") {
      val = val.toUpperCase().replace(/[IOQ]/g, "").slice(0, 17);
    } else if (variant === "plate") {
      val = val.toUpperCase();
    }
    
    setLocalValue(val);
  };

  const displayError = error || internalError;

  return (
    <div className="w-full space-y-1">
      <Input
        {...props}
        className={cn(
          className,
          displayError && showError && "border-red-500 focus-visible:ring-red-500"
        )}
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        type={variant === "number" ? "number" : "text"}
      />
      {displayError && showError && (
        <p className="text-[10px] font-medium text-red-500 animate-in fade-in slide-in-from-top-1">
          {displayError}
        </p>
      )}
    </div>
  );
}
