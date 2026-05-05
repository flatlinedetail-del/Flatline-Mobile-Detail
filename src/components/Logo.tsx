import React from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "../hooks/useSettings";
import type { BusinessSettings } from "../types";

interface LogoProps {
  className?: string;
  variant?: "full" | "icon";
  color?: "default" | "white";
  brand?: "platform" | "business";
  settingsOverride?: BusinessSettings | null;
  scaleOverride?: number;
  xOverride?: number;
  yOverride?: number;
}

export default function Logo({ 
  className, 
  variant = "full", 
  color = "default",
  brand = "platform",
  settingsOverride,
  scaleOverride,
  xOverride,
  yOverride
}: LogoProps) {
  const { settings: authSettings } = useSettings();
  const settings = settingsOverride ?? authSettings;
  const primaryColor = color === "white" ? "#FFFFFF" : "#0F172A"; // Slate 900
  const accentColor = "#0A4DFF"; // DetailFlow Blue

  const isBusinessBrand = brand === "business";
  const businessName = isBusinessBrand ? (settings?.businessName || "DETAILFLOW") : "DETAILFLOW";
  const firstWord = businessName.split(" ")[0];
  const restOfName = isBusinessBrand ? (businessName.split(" ").slice(1).join(" ") || "BUSINESS BRAND") : "OPERATIONS OS";

  const scale = scaleOverride ?? settings?.logoSettings?.scale ?? 1;
  const x = xOverride ?? settings?.logoSettings?.x ?? 0;
  const y = yOverride ?? settings?.logoSettings?.y ?? 0;

  if (isBusinessBrand && settings?.logoUrl) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className={cn(variant === "full" ? "h-12 w-12" : "h-10 w-10", "flex-shrink-0 relative overflow-hidden")}>
           <img 
            src={settings.logoUrl} 
            alt={settings.businessName || "Logo"} 
            className="w-full h-full object-contain transition-transform duration-75"
            style={{ 
              transform: `scale(${scale}) translate(${x}px, ${y}px)`
            }}
            referrerPolicy="no-referrer"
          />
        </div>
        {variant === "full" && (
          <div className="flex flex-col leading-none">
            <span className={cn("font-black tracking-tighter text-2xl font-heading", color === "white" ? "text-white" : "text-slate-900")}>
              {firstWord}
            </span>
            <span className={cn("font-bold text-[10px] uppercase tracking-[0.3em] font-sans text-[#0A4DFF]")}>
              {restOfName}
            </span>
          </div>
        )}
      </div>
    );
  }

  // DEFAULT DETAILFLOW LOGO
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn(variant === "full" ? "w-12 h-12" : "w-full h-full", "relative group transition-all duration-500 group-hover:shadow-glow-blue/20 rounded-xl")}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Hexagon Background */}
          <path
            d="M50 5 L89 27.5 L89 72.5 L50 95 L11 72.5 L11 27.5 Z"
            fill={accentColor}
            className="opacity-10 group-hover:opacity-20 transition-opacity"
          />
          {/* DetailFlow "DF" Monogram */}
          <path
            d="M35 30 L55 30 C65 30 70 35 70 45 C70 55 65 60 55 60 L35 60 Z"
            stroke={primaryColor}
            strokeWidth="8"
            strokeLinejoin="round"
          />
          <path
            d="M35 30 L35 75"
            stroke={primaryColor}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M55 45 L70 45 L70 75"
            stroke={accentColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Modern Accent */}
          <circle cx="70" cy="75" r="4" fill={accentColor} />
        </svg>
      </div>

      {variant === "full" && (
        <div className="flex flex-col leading-none">
          <span className={cn("font-black tracking-tighter text-2xl font-heading uppercase italic", color === "white" ? "text-white" : "text-slate-900")}>
            DETAIL<span className="text-[#0A4DFF]">FLOW</span>
          </span>
          <span className={cn("font-bold text-[9px] uppercase tracking-[0.4em] font-sans mt-0.5", color === "white" ? "text-white" : "text-slate-500")}>
            OPERATIONS OS
          </span>
        </div>
      )}
    </div>
  );
}
