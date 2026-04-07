import React from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "full" | "icon";
  color?: "default" | "white";
}

export default function Logo({ className, variant = "full", color = "default" }: LogoProps) {
  const primaryColor = color === "white" ? "white" : "black";
  const accentColor = "#E11D48"; // Heartbeat Red

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 100 100"
        className={cn(variant === "full" ? "w-10 h-10" : "w-full h-full")}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* FMD Initials */}
        <text
          x="50%"
          y="55%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill={primaryColor}
          fontSize="40"
          fontWeight="900"
          fontFamily="Inter, sans-serif"
          letterSpacing="-2"
        >
          FMD
        </text>

        {/* Heartbeat Line */}
        <path
          d="M10 70 L30 70 L35 60 L40 80 L45 40 L50 90 L55 70 L90 70"
          stroke={accentColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {variant === "full" && (
        <div className="flex flex-col leading-none">
          <span className={cn("font-black tracking-tighter text-xl", color === "white" ? "text-white" : "text-black")}>
            FLATLINE
          </span>
          <span className={cn("font-bold text-[10px] uppercase tracking-[0.2em]", color === "white" ? "text-white/70" : "text-red-600")}>
            Mobile Detail
          </span>
        </div>
      )}
    </div>
  );
}
