import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Navigate } from "react-router-dom";
import Logo from "../components/Logo";

export default function Login() {
  const { user, signIn, loading } = useAuth();

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-black gap-4">
      <Logo variant="icon" color="white" className="w-24 h-24 animate-pulse" />
      <p className="text-white/30 font-black tracking-[0.5em] animate-pulse text-xs">INITIALIZING DETAILFLOW...</p>
    </div>
  );
  if (user) return <Navigate to="/" />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Background Flow Effect */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <svg width="100%" height="100%" className="text-[#0A4DFF]">
          <path d="M0 100 Q 250 50 500 100 T 1000 100 T 1500 100 T 2000 100" fill="none" stroke="currentColor" strokeWidth="1" className="animate-[dash_10s_linear_infinite]" />
          <path d="M0 200 Q 250 150 500 200 T 1000 200 T 1500 200 T 2000 200" fill="none" stroke="currentColor" strokeWidth="1" className="animate-[dash_15s_linear_infinite]" />
          <path d="M0 300 Q 250 250 500 300 T 1000 300 T 1500 300 T 2000 300" fill="none" stroke="currentColor" strokeWidth="1" className="animate-[dash_12s_linear_infinite]" />
        </svg>
      </div>

      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] p-12 text-center relative z-10 border border-white/20">
        <Logo variant="full" className="justify-center mb-10 scale-150 transform transition-transform" />
        <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter uppercase italic">COMMAND <span className="text-blue-500">CENTER</span></h1>
        <p className="text-slate-500 mb-12 font-bold uppercase tracking-widest text-[10px]">Operations OS & Intelligence Platform</p>
        
        <Button 
          onClick={signIn} 
          className="w-full bg-slate-900 text-white hover:bg-[#0A4DFF] h-16 text-lg font-black shadow-2xl flex items-center justify-center gap-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] uppercase tracking-tighter"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6 grayscale brightness-200" />
          Authenticate with SSO
        </Button>
        
        <div className="mt-12 pt-8 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
            DETAILFLOW PLATFORM © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
