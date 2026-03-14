"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      // Store user info in localStorage for client-side access
      localStorage.setItem("user", JSON.stringify(data.user));

      // Redirect based on role
      if (data.user.role === "admin" || data.user.role === "professor") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const fillDemo = (type: "student" | "admin" | "professor") => {
    const creds = {
      student: { email: "jane.cooper@stanford.edu", password: "demo123" },
      admin: { email: "admin@stanford.edu", password: "admin123" },
      professor: { email: "prof.williams@stanford.edu", password: "demo123" },
    };
    setEmail(creds[type].email);
    setPassword(creds[type].password);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 to-brand-800 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIvPjwvc3ZnPg==')] opacity-50" />
        <div className="relative">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </div>
            <span className="text-2xl font-bold text-white">Thesisfy.edu</span>
          </Link>
        </div>

        <div className="relative">
          <h2 className="text-4xl font-bold text-white mb-4">
            Write with integrity.<br />Graduate with confidence.
          </h2>
          <p className="text-brand-100 text-lg">
            The platform that proves your work is genuinely yours, while letting you use AI responsibly.
          </p>
        </div>

        <div className="relative text-brand-200 text-sm">
          Trusted by 50+ universities worldwide
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <span className="text-xl font-bold">Thesisfy<span className="text-brand-600">.edu</span></span>
            </Link>
          </div>

          <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
          <p className="text-gray-500 mb-8">Sign in to continue to your dashboard</p>

          {/* Demo Account Buttons */}
          <div className="mb-6 p-4 bg-brand-50 rounded-xl">
            <p className="text-xs font-medium text-brand-700 mb-3">Quick Demo Access:</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => fillDemo("student")} className="px-3 py-1.5 text-xs font-medium bg-white rounded-lg text-brand-700 hover:bg-brand-100 transition-colors border border-brand-200">
                Student Demo
              </button>
              <button onClick={() => fillDemo("professor")} className="px-3 py-1.5 text-xs font-medium bg-white rounded-lg text-brand-700 hover:bg-brand-100 transition-colors border border-brand-200">
                Professor Demo
              </button>
              <button onClick={() => fillDemo("admin")} className="px-3 py-1.5 text-xs font-medium bg-white rounded-lg text-brand-700 hover:bg-brand-100 transition-colors border border-brand-200">
                Admin Demo
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@university.edu"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter your password"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-sm text-brand-600 hover:text-brand-700 font-medium">Forgot password?</a>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <a href="#" className="text-brand-600 hover:text-brand-700 font-medium">Contact your university</a>
          </p>
        </div>
      </div>
    </div>
  );
}
