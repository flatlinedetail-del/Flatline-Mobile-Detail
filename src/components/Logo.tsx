import React from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "../hooks/useSettings";

interface LogoProps {
  className?: string;
  variant?: "full" | "icon";
  color?: "default" | "white";
}

export default function Logo({ className, variant = "full", color = "default" }: LogoProps) {
  const { settings } = useSettings();
  const primaryColor = color === "white" ? "white" : "black";
  const accentColor = "#E11D48"; // Heartbeat Red

  const businessName = settings?.businessName || "FLATLINE";
  const firstWord = businessName.split(" ")[0];
  const restOfName = businessName.split(" ").slice(1).join(" ") || "Mobile Detail";

  if (settings?.logoUrl && settings?.showLogoOnDocuments) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <img 
          src={settings.logoUrl} 
          alt={settings.businessName || "Logo"} 
          className={cn(variant === "full" ? "h-12" : "h-10", "w-auto object-contain")}
          referrerPolicy="no-referrer"
        />
        {variant === "full" && (
          <div className="flex flex-col leading-none">
            <span className={cn("font-black tracking-tighter text-2xl font-heading", color === "white" ? "text-white" : "text-black")}>
              {firstWord}
            </span>
            <span className={cn("font-bold text-[10px] uppercase tracking-[0.3em] font-sans", color === "white" ? "text-primary" : "text-primary")}>
              {restOfName}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn(variant === "full" ? "w-12 h-12" : "w-full h-full", "relative")}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Heartbeat Line Background */}
          <path
            d="M5 75 L25 75 L30 65 L35 85 L40 45 L45 95 L50 75 L95 75"
            stroke={accentColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-20"
          />
          {/* FMD Initials */}
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            fill={primaryColor}
            fontSize="36"
            fontWeight="900"
            fontFamily="Outfit, sans-serif"
            letterSpacing="-2"
          >
            FMD
          </text>
          {/* Main Heartbeat Line */}
          <path
            d="M10 70 L30 70 L35 60 L40 80 L45 40 L50 90 L55 70 L90 70"
            stroke={accentColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {variant === "full" && (
        <div className="flex flex-col leading-none">
          <span className={cn("font-black tracking-tighter text-2xl font-heading", color === "white" ? "text-white" : "text-black")}>
            {firstWord}
          </span>
          <span className={cn("font-bold text-[10px] uppercase tracking-[0.3em] font-sans text-primary")}>
            {restOfName}
          </span>
        </div>
      )}
    </div>
  );
}
