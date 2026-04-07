import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Navigate } from "react-router-dom";
import Logo from "../components/Logo";

export default function Login() {
  const { user, signIn, loading } = useAuth();

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-black gap-4">
      <Logo variant="icon" color="white" className="w-20 h-20 animate-pulse" />
      <p className="text-white/50 font-bold tracking-widest animate-pulse">LOADING...</p>
    </div>
  );
  if (user) return <Navigate to="/" />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4 relative overflow-hidden">
      {/* Background Heartbeat Effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <svg width="100%" height="100%" className="text-red-600">
          <path d="M0 500 L400 500 L450 400 L500 600 L550 200 L600 800 L650 500 L2000 500" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>

      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center relative z-10">
        <Logo variant="full" className="justify-center mb-8 scale-125" />
        <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tighter">COMMAND CENTER</h1>
        <p className="text-gray-500 mb-10 font-medium">Business Management & AI Automation</p>
        
        <Button 
          onClick={signIn} 
          className="w-full bg-black text-white hover:bg-gray-900 h-14 text-lg font-bold shadow-xl flex items-center justify-center gap-3 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          Sign in with Google
        </Button>
        
        <p className="mt-10 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
          Flatline Mobile Detail © 2026
        </p>
      </div>
    </div>
  );
}
