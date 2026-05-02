import React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  accentWord?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, accentWord, subtitle, actions, className }: PageHeaderProps) {
  const parts = title.split(accentWord || "");
  
  return (
    <div className={cn("flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-2 border-b border-white/5", className)}>
      <div className="space-y-3">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter uppercase leading-tight text-white font-heading header-glow">
          {accentWord ? (
            <>
              {parts[0]}
              <span className="text-primary italic inline-block transform -skew-x-6">{accentWord}</span>
              {parts[1]}
            </>
          ) : (
            title
          )}
        </h1>
        {subtitle && (
          <p className="text-[11px] md:text-xs font-black text-white/50 uppercase tracking-[0.25em] flex items-center gap-2.5 ml-1">
            <span className="flex h-1.5 w-1.5 rounded-full bg-primary shadow-glow-blue animate-pulse"></span>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
