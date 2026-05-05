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

  // Permanent DetailFlow platform logo. Tenant uploads never replace this mark.
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn(variant === "full" ? "w-12 h-12" : "w-full h-full", "relative group transition-all duration-500 group-hover:shadow-glow-blue/20 rounded-2xl overflow-hidden shadow-lg shadow-black/30")}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="df-platform-bg" x1="12" y1="10" x2="92" y2="92" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0B1220" />
              <stop offset="1" stopColor="#030712" />
            </linearGradient>
            <linearGradient id="df-platform-swoosh" x1="28" y1="72" x2="86" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0A4DFF" />
              <stop offset="0.55" stopColor="#2DD4FF" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
          </defs>
          <rect x="6" y="6" width="88" height="88" rx="22" fill="url(#df-platform-bg)" />
          <path
            d="M25 27H48C62 27 72 36 72 50C72 64 62 73 48 73H25V27Z"
            stroke="white"
            strokeWidth="9"
            strokeLinejoin="round"
          />
          <path d="M25 27V73" stroke="white" strokeWidth="9" strokeLinecap="round" />
          <path
            d="M50 50H75C82 50 87 45 87 38"
            stroke="url(#df-platform-swoosh)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M51 50V73"
            stroke="url(#df-platform-swoosh)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M22 76C42 86 68 81 84 61"
            stroke="url(#df-platform-swoosh)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.95"
          />
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
