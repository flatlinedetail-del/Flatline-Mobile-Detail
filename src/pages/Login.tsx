import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Navigate } from "react-router-dom";
import { LogIn } from "lucide-react";

export default function Login() {
  const { user, signIn, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (user) return <Navigate to="/" />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-6 shadow-lg shadow-blue-200">F</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Flatline Mobile Detail</h1>
        <p className="text-gray-500 mb-8">Business Management & AI Automation</p>
        
        <Button 
          onClick={signIn} 
          className="w-full bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 h-12 text-lg font-medium shadow-sm flex items-center justify-center gap-3"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          Sign in with Google
        </Button>
        
        <p className="mt-8 text-xs text-gray-400">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
