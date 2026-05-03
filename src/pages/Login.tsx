import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navigate } from "react-router-dom";
import Logo from "../components/Logo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { user, signIn, signInWithEmail, signUp, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-black gap-4">
      <Logo variant="icon" color="white" className="w-24 h-24 animate-pulse" />
      <p className="text-white/30 font-black tracking-[0.5em] animate-pulse text-xs">INITIALIZING DETAILFLOW...</p>
    </div>
  );
  if (user) return <Navigate to="/" />;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter both email and password.");
      return;
    }

    setAuthLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        toast.success("Account created successfully!");
      } else {
        await signInWithEmail(email, password);
        toast.success("Welcome back!");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast.error(error.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthLoading(true);
    try {
      await signIn();
      toast.success("Welcome back!");
    } catch (error: any) {
      console.error("Google Auth error:", error);
      toast.error(error.message || "Google authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

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

      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] p-10 text-center relative z-10 border border-white/20">
        <Logo variant="full" className="justify-center mb-8 scale-125 transform transition-transform" />
        <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tighter uppercase italic">DASHBOARD</h1>
        <p className="text-slate-500 mb-8 font-bold uppercase tracking-widest text-[10px]">Business Operations Platform</p>
        
        <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
          <div className="space-y-2">
            <Label className="text-slate-500 ml-1">Email Address</Label>
            <Input 
              type="email" 
              placeholder="name@company.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-14 rounded-2xl focus:ring-[#0A4DFF]/10 focus:border-[#0A4DFF]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-500 ml-1">Password</Label>
            <Input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-14 rounded-2xl focus:ring-[#0A4DFF]/10 focus:border-[#0A4DFF]"
            />
          </div>
          
          <Button 
            type="submit"
            disabled={authLoading}
            className="w-full bg-[#0A4DFF] text-white hover:bg-slate-900 h-14 text-sm font-black shadow-xl flex items-center justify-center gap-2 rounded-2xl transition-all active:scale-[0.98] uppercase tracking-wider"
          >
            {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isSignUp ? "Create Account" : "Log In")}
          </Button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-100"></span>
          </div>
          <div className="relative flex justify-center text-xs uppercase font-black text-slate-300">
            <span className="bg-white px-4">OR</span>
          </div>
        </div>

        <Button 
          onClick={handleGoogleAuth} 
          disabled={authLoading}
          className="w-full bg-slate-900 text-white hover:bg-slate-800 h-14 text-sm font-black shadow-lg flex items-center justify-center gap-3 rounded-2xl transition-all active:scale-[0.98] uppercase tracking-wider"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 grayscale brightness-200" />
          Login with Google
        </Button>

        <button 
          onClick={() => setIsSignUp(!isSignUp)}
          className="mt-6 text-xs font-black text-slate-400 hover:text-[#0A4DFF] uppercase tracking-widest transition-colors"
        >
          {isSignUp ? "Already have an account? Log In" : "Need an account? Sign Up"}
        </button>
        
        <div className="mt-10 pt-6 border-t border-slate-50">
          <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.3em]">
            DETAILFLOW PLATFORM © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
