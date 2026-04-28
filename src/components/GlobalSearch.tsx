import { useState, useEffect, useRef } from "react";
import { Search, X, User, Calendar, Building2, UserPlus, Loader2 } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { globalSearch, SearchResult } from "../services/search";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

import { useAuth } from "../hooks/useAuth";

export default function GlobalSearch() {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.length >= 2 && profile?.businessId) {
        setLoading(true);
        try {
          const res = await globalSearch(profile.businessId, query);
          setResults(res);
        } catch (error) {
          console.error("Search error:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    setIsOpen(false);
    setQuery("");
    switch (result.type) {
      case "appointment":
        navigate(`/calendar/${result.id}`);
        break;
      case "customer":
        navigate(`/customers/${result.id}`);
        break;
      case "vendor":
        navigate(`/vendors/${result.id}`);
        break;
      case "lead":
        navigate(`/leads`);
        break;
    }
  };

  return (
    <div className="relative w-full max-w-md" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search VIN, RO, Name, Phone..."
          className="pl-10 bg-gray-100 border-none focus-visible:ring-blue-500 rounded-full h-10"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-transparent"
            onClick={() => setQuery("")}
          >
            <X className="w-4 h-4 text-gray-400" />
          </Button>
        )}
      </div>

      {isOpen && (query.length >= 2 || results.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-[400px] overflow-y-auto p-2">
            {loading ? (
              <div className="p-8 flex flex-col items-center justify-center text-gray-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-xs font-medium">Searching database...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p className="text-sm font-medium">No results found for "{query}"</p>
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 transition-colors text-left group"
                    onClick={() => handleSelect(result)}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      result.type === "appointment" ? "bg-blue-100 text-blue-600" :
                      result.type === "customer" ? "bg-green-100 text-green-600" :
                      result.type === "vendor" ? "bg-purple-100 text-purple-600" :
                      "bg-orange-100 text-orange-600"
                    )}>
                      {result.type === "appointment" && <Calendar className="w-5 h-5" />}
                      {result.type === "customer" && <User className="w-5 h-5" />}
                      {result.type === "vendor" && <Building2 className="w-5 h-5" />}
                      {result.type === "lead" && <UserPlus className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-gray-900 truncate">{result.title}</p>
                        {result.status && (
                          <span className="text-[10px] font-black uppercase text-gray-400 group-hover:text-blue-600">
                            {result.status.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{result.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
