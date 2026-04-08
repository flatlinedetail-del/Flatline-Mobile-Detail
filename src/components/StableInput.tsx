import React, { useState, useEffect, useRef } from "react";
import { Input } from "./ui/input";

interface StableInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: string) => void;
  formatOnBlur?: (value: string) => string;
}

export function StableInput({ value, onValueChange, formatOnBlur, ...props }: StableInputProps) {
  const [localValue, setLocalValue] = useState(value?.toString() || "");
  const isFocused = useRef(false);
  const lastExternalValue = useRef(value);

  useEffect(() => {
    // Only update local value from props if the external value actually changed
    // and we are not currently focused.
    if (!isFocused.current && value !== undefined && value !== lastExternalValue.current) {
      setLocalValue(value.toString());
      lastExternalValue.current = value;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    // We do NOT call onValueChange here to prevent parent re-renders while typing
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = false;
    let finalValue = localValue;
    if (formatOnBlur) {
      finalValue = formatOnBlur(localValue);
      setLocalValue(finalValue);
    }
    if (onValueChange) {
      onValueChange(finalValue);
    }
    if (props.onBlur) {
      props.onBlur(e);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = true;
    if (props.onFocus) {
      props.onFocus(e);
    }
  };

  return (
    <Input
      {...props}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
    />
  );
}
