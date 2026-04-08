import React, { useState, useEffect, useRef } from "react";
import { Textarea } from "./ui/textarea";

interface StableTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onValueChange?: (value: string) => void;
}

export function StableTextarea({ value, onValueChange, ...props }: StableTextareaProps) {
  const [localValue, setLocalValue] = useState(value?.toString() || "");
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current && value !== undefined) {
      setLocalValue(value.toString());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    isFocused.current = false;
    if (onValueChange) {
      onValueChange(localValue);
    }
    if (props.onBlur) {
      props.onBlur(e);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    isFocused.current = true;
    if (props.onFocus) {
      props.onFocus(e);
    }
  };

  return (
    <Textarea
      {...props}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
    />
  );
}
