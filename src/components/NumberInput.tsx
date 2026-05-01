import React from "react";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";

interface NumberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: number | string;
  onValueChange: (value: number) => void;
}

export function NumberInput({ value, onValueChange, className, ...props }: NumberInputProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [localValue, setLocalValue] = React.useState(value.toString());

  React.useEffect(() => {
    if (!isFocused) {
      setLocalValue(value.toString());
    }
  }, [value, isFocused]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (parseFloat(e.target.value) === 0) {
      setLocalValue("");
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    if (e.target.value === "") {
      onValueChange(0);
      setLocalValue("0");
    } else {
      const num = parseFloat(e.target.value);
      onValueChange(isNaN(num) ? 0 : num);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    const num = parseFloat(e.target.value);
    if (!isNaN(num)) {
      onValueChange(num);
    } else if (e.target.value === "") {
      onValueChange(0);
    }
  };

  return (
    <Input
      {...props}
      type="number"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cn(className)}
    />
  );
}
