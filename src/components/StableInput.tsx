import React, { useState, useEffect, useRef } from "react";
import { Input } from "./ui/input";

interface StableInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: string) => void;
  formatOnBlur?: (value: string) => string;
}

export function StableInput({ value, onValueChange, formatOnBlur, ...props }: StableInputProps) {
  const [localValue, setLocalValue] = useState(value?.toString() || "");
  const isFocused = useRef(false);

  useEffect(() => {
    // Only update local value from props if not focused to prevent cursor jumping
    if (!isFocused.current && value !== undefined) {
      setLocalValue(value.toString());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
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
